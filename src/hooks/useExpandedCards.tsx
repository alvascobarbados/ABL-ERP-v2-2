import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface ExpandedCardsCtx {
  /** Global default: when true, cards render expanded by default. */
  expandAll: boolean;
  setExpandAll: (v: boolean) => void;
  /** Per-card overrides applied on top of the global default. */
  isOverridden: (cardId: string) => boolean;
  toggleOverride: (cardId: string) => void;
  /** Effective expanded state for a single card. */
  isExpanded: (cardId: string) => boolean;
}

const Ctx = createContext<ExpandedCardsCtx | null>(null);

export const ExpandedCardsProvider = ({ children }: { children: ReactNode }) => {
  const [expandAll, setExpandAllState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("alvasco.expandAll") === "1";
  });
  // Set of card IDs whose state is flipped relative to the global default.
  const [overrides, setOverrides] = useState<Set<string>>(new Set());

  const setExpandAll = useCallback((v: boolean) => {
    setExpandAllState(v);
    // Changing the global default clears any per-card overrides so the
    // toggle is the source of truth at flip time.
    setOverrides(new Set());
    try { window.localStorage.setItem("alvasco.expandAll", v ? "1" : "0"); } catch { /* noop */ }
  }, []);

  const toggleOverride = useCallback((cardId: string) => {
    setOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  const isOverridden = useCallback((cardId: string) => overrides.has(cardId), [overrides]);
  const isExpanded = useCallback(
    (cardId: string) => (expandAll ? !overrides.has(cardId) : overrides.has(cardId)),
    [expandAll, overrides],
  );

  return (
    <Ctx.Provider value={{ expandAll, setExpandAll, isOverridden, toggleOverride, isExpanded }}>
      {children}
    </Ctx.Provider>
  );
};

export const useExpandedCards = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useExpandedCards must be used inside ExpandedCardsProvider");
  return ctx;
};
