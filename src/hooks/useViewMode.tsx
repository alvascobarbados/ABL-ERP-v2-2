/**
 * Global view-mode (Board vs Table) for the desktop layout.
 * Selection is sticky across all pipeline tabs — switching tabs does not
 * change the mode. Mobile (<1024px) ignores this entirely.
 */
import { useCallback, useEffect, useState } from "react";

export type ViewMode = "board" | "table";

const STORAGE_KEY = "alvasco.viewMode.global.v1";
const DEFAULT: ViewMode = "board";

function load(): ViewMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "board" || raw === "table") return raw;
  } catch { /* noop */ }
  return DEFAULT;
}

export function useViewMode(_activeTab?: unknown) {
  const [view, setViewState] = useState<ViewMode>(load);

  const setView = useCallback((next: ViewMode) => {
    setViewState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* noop */ }
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setViewState(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { view, setView };
}
