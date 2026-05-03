import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { StageCard, StageId, StateId } from "@/data/states";
import { JiggleOverlay, JiggleAnchor } from "@/components/leads/JiggleOverlay";

interface JiggleCtx {
  /** Card currently lifted in jiggle mode (if any). */
  activeId: string | null;
  /** Activate jiggle for this card at its current bounding rect. */
  activate: (card: StageCard, rect: DOMRect) => void;
  /** Dismiss without committing. */
  dismiss: () => void;
}

const Ctx = createContext<JiggleCtx | null>(null);

interface ProviderProps {
  children: ReactNode;
  /** Called when the user taps a chip to commit a state move. */
  onPick: (card: StageCard, target: { state: StageId; state: StateId }) => void;
}

export const JiggleProvider = ({ children, onPick }: ProviderProps) => {
  const [anchor, setAnchor] = useState<JiggleAnchor | null>(null);

  const activate = useCallback((card: StageCard, rect: DOMRect) => {
    setAnchor({ card, rect });
  }, []);

  const dismiss = useCallback(() => setAnchor(null), []);

  const handlePick = useCallback(
    (target: { state: StageId; state: StateId }) => {
      if (!anchor) return;
      const card = anchor.card;
      setAnchor(null);
      onPick(card, target);
    },
    [anchor, onPick],
  );

  return (
    <Ctx.Provider value={{ activeId: anchor?.card.id ?? null, activate, dismiss }}>
      {children}
      <JiggleOverlay anchor={anchor} onClose={dismiss} onPick={handlePick} />
    </Ctx.Provider>
  );
};

export const useJiggle = (): JiggleCtx => {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Safe fallback when not inside a provider — long-press just falls back
    // to the existing StatePicker (handled in ProjectCard via onLongPress=undefined).
    return { activeId: null, activate: () => {}, dismiss: () => {} };
  }
  return ctx;
};
