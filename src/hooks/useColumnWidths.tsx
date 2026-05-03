/**
 * Global, session-persistent column-width store. Shared by the desktop
 * table view (ProjectTable) and the Spreadsheet view so widths follow the
 * column id (e.g. "supplier", "detail") wherever that column appears.
 *
 * Storage: single flat localStorage map keyed by column id → pixel width.
 * Min 80 / max 600 px enforced at write time.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";

const STORAGE_KEY = "alvasco.colWidths.v1";
export const COL_MIN = 80;
export const COL_MAX = 600;

type WidthMap = Record<string, number>;

interface Ctx {
  widthFor: (colId: string, defaultPx: number) => number;
  setWidth: (colId: string, px: number) => void;
  reset: () => void;
  /** monotonically increases on reset, used to force grid recalcs */
  version: number;
}

const ColumnWidthsContext = createContext<Ctx | null>(null);

function load(): WidthMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export const ColumnWidthsProvider = ({ children }: { children: ReactNode }) => {
  const [widths, setWidths] = useState<WidthMap>(load);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(widths)); } catch { /* noop */ }
  }, [widths]);

  const widthFor = useCallback(
    (colId: string, defaultPx: number) => widths[colId] ?? defaultPx,
    [widths],
  );
  const setWidth = useCallback((colId: string, px: number) => {
    const clamped = Math.max(COL_MIN, Math.min(COL_MAX, Math.round(px)));
    setWidths((m) => ({ ...m, [colId]: clamped }));
  }, []);
  const reset = useCallback(() => {
    setWidths({});
    setVersion((v) => v + 1);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  }, []);

  const value = useMemo<Ctx>(() => ({ widthFor, setWidth, reset, version }), [widthFor, setWidth, reset, version]);
  return <ColumnWidthsContext.Provider value={value}>{children}</ColumnWidthsContext.Provider>;
};

export function useColumnWidths(): Ctx {
  const ctx = useContext(ColumnWidthsContext);
  if (!ctx) {
    // Fallback for stories/tests outside provider — purely in-memory.
    return {
      widthFor: (_id, def) => def,
      setWidth: () => {},
      reset: () => {},
      version: 0,
    };
  }
  return ctx;
}
