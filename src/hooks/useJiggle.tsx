import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { PipelineCard, PipelineId, StageId } from "@/data/pipelines";
import { JiggleOverlay, JiggleAnchor } from "@/components/leads/JiggleOverlay";

interface JiggleCtx {
  /** Card currently lifted in jiggle mode (if any). */
  activeId: string | null;
  /** Activate jiggle for this card at its current bounding rect. */
  activate: (card: PipelineCard, rect: DOMRect) => void;
  /** Dismiss without committing. */
  dismiss: () => void;
}

const Ctx = createContext<JiggleCtx | null>(null);

interface ProviderProps {
  children: ReactNode;
  /** Called when the user taps a chip to commit a stage move. */
  onPick: (card: PipelineCard, target: { pipeline: PipelineId; stage: StageId }) => void;
}

export const JiggleProvider = ({ children, onPick }: ProviderProps) => {
  const [anchor, setAnchor] = useState<JiggleAnchor | null>(null);

  const activate = useCallback((card: PipelineCard, rect: DOMRect) => {
    setAnchor({ card, rect });
  }, []);

  const dismiss = useCallback(() => setAnchor(null), []);

  const handlePick = useCallback(
    (target: { pipeline: PipelineId; stage: StageId }) => {
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
    // to the existing StagePicker (handled in ProjectCard via onLongPress=undefined).
    return { activeId: null, activate: () => {}, dismiss: () => {} };
  }
  return ctx;
};
