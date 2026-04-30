import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { PipelineCard } from "@/data/pipelines";
import { usePipelineStore } from "./usePipelineStore";
import { CardEditOverlay } from "@/components/leads/CardEditOverlay";

interface EditModeCtx {
  activeId: string | null;
  enter: (card: PipelineCard) => void;
  exit: () => void;
}

const Ctx = createContext<EditModeCtx | null>(null);

export const EditModeProvider = ({ children }: { children: ReactNode }) => {
  const [activeCard, setActiveCard] = useState<PipelineCard | null>(null);
  const store = usePipelineStore();

  const enter = useCallback((card: PipelineCard) => setActiveCard(card), []);
  const exit = useCallback(() => setActiveCard(null), []);

  // If the underlying project changes, refresh the snapshot so the panel reflects edits.
  const liveCard = activeCard
    ? (() => {
        const proj = store.projects.find((p) => p.id === activeCard.project.id);
        if (!proj) return null;
        return { ...activeCard, project: proj };
      })()
    : null;

  // Lock body scroll + Escape to exit.
  useEffect(() => {
    if (!activeCard) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setActiveCard(null); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [activeCard]);

  return (
    <Ctx.Provider value={{ activeId: activeCard?.id ?? null, enter, exit }}>
      {children}
      {liveCard && typeof document !== "undefined" && createPortal(
        <>
          {/* Layer 1: dim background. backdrop-filter applied ONLY here. */}
          <div
            onClick={() => setActiveCard(null)}
            aria-label="Close edit mode"
            className="fixed inset-0 z-[1000] bg-black/55 animate-fade-in"
            style={{ backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
          />
          {/* Layer 2: edit panel. Sibling of the dim, fully opaque, sharp. */}
          <div
            className="fixed inset-0 z-[1001] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto relative w-full max-w-[480px] rounded-2xl overflow-hidden flex flex-col"
              style={{
                maxHeight: "85vh",
                backgroundColor: "hsl(var(--card))",
                border: "2px solid hsl(var(--brand-navy))",
                boxShadow: "0 24px 60px -12px hsl(var(--brand-navy) / 0.55), 0 0 50px -8px hsl(var(--brand-orange) / 0.35)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setActiveCard(null)}
                aria-label="Close edit mode"
                className="absolute top-2.5 right-2.5 z-10 inline-flex items-center justify-center rounded-full hover:bg-muted/60 text-muted-foreground"
                style={{ width: 44, height: 44 }}
              >
                <X className="h-5 w-5" />
              </button>
              <CardEditOverlay card={liveCard} onExit={() => setActiveCard(null)} />
            </div>
          </div>
        </>,
        document.body,
      )}
    </Ctx.Provider>
  );
};

export const useEditMode = (): EditModeCtx => {
  const ctx = useContext(Ctx);
  if (!ctx) return { activeId: null, enter: () => {}, exit: () => {} };
  return ctx;
};
