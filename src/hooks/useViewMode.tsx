/**
 * Per-tab view-mode memory (Board vs Table) for the desktop layout.
 * Mobile (<1024px) ignores this entirely and always renders the existing
 * vertical list. State persists in localStorage so a refresh keeps the
 * user's last-used view per tab.
 */
import { useCallback, useEffect, useState } from "react";
import type { TabId } from "@/components/leads/PipelineTabs";

export type ViewMode = "board" | "table";

const STORAGE_KEY = "alvasco.viewMode.v1";

const DEFAULTS: Record<TabId, ViewMode> = {
  all: "board",
  sales: "board",
  operations: "board",
  shipping: "board",
  finance: "board",
};

function load(): Record<TabId, ViewMode> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function useViewMode(activeTab: TabId) {
  const [byTab, setByTab] = useState<Record<TabId, ViewMode>>(load);

  const view = byTab[activeTab] ?? "board";

  const setView = useCallback(
    (next: ViewMode) => {
      setByTab((prev) => {
        const updated = { ...prev, [activeTab]: next };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch { /* noop */ }
        return updated;
      });
    },
    [activeTab],
  );

  // Re-sync if another tab/window mutates storage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setByTab(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { view, setView };
}
