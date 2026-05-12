/**
 * Per-pipeline column visibility for the desktop ProjectTable.
 *
 * Each pipeline (Sales, Design/Creative, Purchasing, Production, Shipping,
 * Finance, Completed) plus the bookend tabs (all, completed) gets its own
 * default visible column set, optimised for the work that pipeline does.
 * The user can then add or hide columns per tab via a popover; choices
 * persist to localStorage.
 *
 * Column ORDER is fixed (defined in ProjectTable's ALL_COLS); only
 * visibility is user-controlled.
 *
 * Storage key: alvasco.colVis.v1.{userId}.{tabId}
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import type { TabId } from "@/components/leads/PipelineTabs";
import { useCurrentUser } from "./useCurrentUser";

// SortKey-equivalent IDs that ProjectTable uses for columns. Keep this list
// in sync with ProjectTable's ALL_COLS.
export type ColumnId =
  | "flagged" | "stage" | "customer" | "project" | "detail" | "supplier"
  | "quote" | "po" | "invoice" | "amount" | "balance"
  | "designBrief" | "completionDate"
  | "weight" | "cbm" | "pkgs" | "mode" | "shipmentNumber" | "tracking" | "rep" | "deadline";

// Columns that must always be visible (workflow anchors). These cannot
// be unchecked in the popover.
export const ALWAYS_ON: ReadonlySet<ColumnId> = new Set([
  "flagged", "stage", "customer", "project",
]);

// Per-tab default visible columns. Order in the array is irrelevant —
// rendering order comes from ALL_COLS in ProjectTable.
export const DEFAULT_VISIBLE: Record<TabId, ColumnId[]> = {
  all: ["flagged", "stage", "customer", "project", "detail", "supplier", "amount", "mode", "shipmentNumber", "tracking", "rep", "deadline"],
  sales: ["flagged", "stage", "customer", "project", "detail", "quote", "amount", "rep", "deadline"],
  design: ["flagged", "stage", "customer", "project", "designBrief", "supplier", "rep", "deadline"],
  purchasing: ["flagged", "stage", "customer", "project", "supplier", "po", "amount", "mode", "rep", "deadline"],
  production: ["flagged", "stage", "customer", "project", "supplier", "po", "weight", "cbm", "pkgs", "mode", "shipmentNumber", "tracking", "rep", "deadline"],
  shipping: ["flagged", "stage", "customer", "project", "supplier", "mode", "shipmentNumber", "tracking", "weight", "cbm", "pkgs", "deadline"],
  finance: ["flagged", "stage", "customer", "project", "invoice", "amount", "balance", "shipmentNumber", "tracking", "rep", "deadline"],
  completed: ["flagged", "stage", "customer", "project", "invoice", "amount", "completionDate", "shipmentNumber", "tracking", "rep"],
  // legacy alias — same as production
  operations: ["flagged", "stage", "customer", "project", "supplier", "po", "weight", "cbm", "pkgs", "mode", "shipmentNumber", "tracking", "rep", "deadline"],
};

const STORAGE_PREFIX = "alvasco.colVis.v1";

function storageKey(userId: string, tab: TabId) {
  return `${STORAGE_PREFIX}.${userId}.${tab}`;
}

function loadFor(userId: string, tab: TabId): ColumnId[] | null {
  try {
    const raw = localStorage.getItem(storageKey(userId, tab));
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr as ColumnId[];
  } catch { return null; }
}

interface Ctx {
  visibleFor: (tab: TabId) => Set<ColumnId>;
  isVisible: (tab: TabId, col: ColumnId) => boolean;
  setVisible: (tab: TabId, cols: ColumnId[]) => void;
  resetTab: (tab: TabId) => void;
  applyToAllTabs: (cols: ColumnId[]) => void;
}

const Context = createContext<Ctx | null>(null);

export const ColumnVisibilityProvider = ({ children }: { children: ReactNode }) => {
  const { userId } = useCurrentUser();
  // Map keyed by tab → user override (null/undefined = use default).
  const [overrides, setOverrides] = useState<Partial<Record<TabId, ColumnId[]>>>(() => {
    const out: Partial<Record<TabId, ColumnId[]>> = {};
    (Object.keys(DEFAULT_VISIBLE) as TabId[]).forEach((tab) => {
      const stored = loadFor(userId, tab);
      if (stored) out[tab] = stored;
    });
    return out;
  });

  const persist = useCallback((tab: TabId, cols: ColumnId[]) => {
    try { localStorage.setItem(storageKey(userId, tab), JSON.stringify(cols)); } catch { /* noop */ }
  }, [userId]);

  const visibleFor = useCallback((tab: TabId): Set<ColumnId> => {
    const list = overrides[tab] ?? DEFAULT_VISIBLE[tab] ?? DEFAULT_VISIBLE.all;
    const set = new Set<ColumnId>(list);
    // Always-on guarantee: even if storage is corrupted, anchor columns stay.
    ALWAYS_ON.forEach((c) => set.add(c));
    return set;
  }, [overrides]);

  const isVisible = useCallback((tab: TabId, col: ColumnId) => visibleFor(tab).has(col), [visibleFor]);

  const setVisible = useCallback((tab: TabId, cols: ColumnId[]) => {
    const merged = new Set<ColumnId>(cols);
    ALWAYS_ON.forEach((c) => merged.add(c));
    const list = Array.from(merged);
    setOverrides((prev) => ({ ...prev, [tab]: list }));
    persist(tab, list);
  }, [persist]);

  const resetTab = useCallback((tab: TabId) => {
    setOverrides((prev) => {
      const next = { ...prev }; delete next[tab]; return next;
    });
    try { localStorage.removeItem(storageKey(userId, tab)); } catch { /* noop */ }
  }, [userId]);

  const applyToAllTabs = useCallback((cols: ColumnId[]) => {
    const merged = new Set<ColumnId>(cols);
    ALWAYS_ON.forEach((c) => merged.add(c));
    const list = Array.from(merged);
    const next: Partial<Record<TabId, ColumnId[]>> = {};
    (Object.keys(DEFAULT_VISIBLE) as TabId[]).forEach((tab) => {
      next[tab] = list;
      persist(tab, list);
    });
    setOverrides(next);
  }, [persist]);

  const value = useMemo<Ctx>(() => ({ visibleFor, isVisible, setVisible, resetTab, applyToAllTabs }),
    [visibleFor, isVisible, setVisible, resetTab, applyToAllTabs]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
};

export function useColumnVisibility(): Ctx {
  const ctx = useContext(Context);
  if (!ctx) {
    return {
      visibleFor: (tab) => new Set([...(DEFAULT_VISIBLE[tab] ?? []), ...ALWAYS_ON]),
      isVisible: (tab, col) => (DEFAULT_VISIBLE[tab] ?? []).includes(col) || ALWAYS_ON.has(col),
      setVisible: () => {}, resetTab: () => {}, applyToAllTabs: () => {},
    };
  }
  return ctx;
}
