import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PIPELINES, PipelineId, StageId, PipelineCard } from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { getNextStage, getPrevStage, validateMove } from "@/hooks/usePipelineStore";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export interface JiggleAnchor {
  /** Bounding rect of the source card at activation time (viewport coords). */
  rect: DOMRect;
  card: PipelineCard;
}

interface JiggleOverlayProps {
  anchor: JiggleAnchor | null;
  onClose: () => void;
  onPick: (target: { pipeline: PipelineId; stage: StageId }) => void;
}

interface ChipDef {
  pipeline: PipelineId;
  stage: StageId;
  title: string;
  isCurrent: boolean;
  isNext: boolean;
  isPrev: boolean;
  isArchive: boolean;
  isInvalid: boolean;
}

export const JiggleOverlay = ({ anchor, onClose, onPick }: JiggleOverlayProps) => {
  const [mounted, setMounted] = useState(false);
  const [shaking, setShaking] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchor) {
      setMounted(false);
      return;
    }
    // Fire the visual lift + haptic together on the next frame so the
    // browser has painted the un-lifted clone first (otherwise the CSS
    // transition has nothing to interpolate from). Both fire in the same
    // rAF callback to keep buzz and lift perceptually simultaneous.
    const id = requestAnimationFrame(() => {
      haptics.pickup();
      setMounted(true);
    });
    return () => cancelAnimationFrame(id);
  }, [anchor]);

  // ESC to dismiss
  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchor, onClose]);

  if (!anchor) return null;

  const { rect, card } = anchor;
  const proj = card.project;
  const pipelineHex = PIPELINE_ACCENT[card.pipeline].hex;

  const next = getNextStage(card.pipeline, card.stage);
  const prev = getPrevStage(card.pipeline, card.stage);

  // Build the chip list. For shipping cards (tied to a shipment) only allow
  // moves within shipping. For everything else show all stages across all
  // pipelines so users can jump back/forward freely.
  const chips: ChipDef[] = [];
  for (const p of PIPELINES) {
    if (card.pipeline === "shipping" && p.id !== "shipping") continue;
    for (const s of p.stages) {
      const isCurrent = card.pipeline === p.id && card.stage === s.id;
      const isNext = !!next && next.pipeline === p.id && next.stage === s.id;
      const isPrev = !!prev && prev.pipeline === p.id && prev.stage === s.id;
      const isArchive = s.id === "archive";
      const v = validateMove(proj, { pipeline: p.id, stage: s.id });
      chips.push({
        pipeline: p.id,
        stage: s.id,
        title: s.title,
        isCurrent,
        isNext,
        isPrev,
        isArchive,
        isInvalid: !v.ok,
      });
    }
  }

  // Position: lifted card sits at the anchor rect (with translation for the
  // 1.03 scale handled via CSS transform). The chip strip floats 12px below
  // the lifted card. If there isn't room below, place it above instead.
  const liftScale = 1.03;
  const cardWidth = rect.width;
  const liftedTop = rect.top;
  const liftedLeft = rect.left;
  const stripGap = 12;
  const stripEstimatedHeight = 56;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const placeBelow = liftedTop + rect.height + stripGap + stripEstimatedHeight < viewportH - 16;

  const handleChipTap = (chip: ChipDef) => {
    if (chip.isCurrent) {
      haptics.nope();
      setShaking(true);
      window.setTimeout(() => setShaking(false), 360);
      return;
    }
    if (chip.isInvalid) {
      // Invalid (missing fields gate). Still let parent handle it — they'll
      // raise the missing-fields dialog. Buzz nope as a soft warning.
      haptics.nope();
      onPick({ pipeline: chip.pipeline, stage: chip.stage });
      return;
    }
    haptics.commit();
    onPick({ pipeline: chip.pipeline, stage: chip.stage });
  };

  // Tap outside the lifted card / chip strip dismisses silently.
  const onBackdropPointerDown = (e: React.PointerEvent) => {
    if (cardRef.current && cardRef.current.contains(e.target as Node)) return;
    const strip = document.getElementById("jiggle-strip");
    if (strip && strip.contains(e.target as Node)) return;
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      onPointerDown={onBackdropPointerDown}
      style={{
        background: mounted ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0)",
        transition: "background 200ms ease-out",
      }}
      aria-modal="true"
      role="dialog"
    >
      {/* ── Lifted card preview ── */}
      <div
        ref={cardRef}
        className={cn(
          "no-select absolute rounded-2xl bg-card border border-border/70 overflow-hidden",
          mounted && !shaking && "animate-jiggle",
          shaking && "animate-nope-shake",
        )}
        style={{
          top: liftedTop,
          left: liftedLeft,
          width: cardWidth,
          transformOrigin: "center center",
          transform: mounted
            ? `scale(${liftScale})`
            : "scale(1)",
          transition: "transform 150ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 150ms ease-out",
          boxShadow: mounted
            ? "0 24px 48px hsl(222 30% 12% / 0.28), 0 8px 16px hsl(222 30% 12% / 0.18)"
            : "var(--shadow-card)",
          willChange: "transform",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ backgroundColor: pipelineHex, opacity: 0.85 }}
        />
        <div className="pl-5 pr-5 py-4">
          <p className="text-[17px] font-semibold tracking-tight text-foreground leading-tight truncate">
            {proj.customer}
          </p>
          <p
            className="text-[14px] leading-snug mt-0.5 truncate"
            style={{ color: "hsl(var(--brand-navy))" }}
          >
            {proj.projectName}
          </p>
          {proj.detailSummary?.trim() && (
            <p className="text-[12px] text-muted-foreground/80 leading-snug mt-1 truncate">
              {proj.detailSummary}
            </p>
          )}
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70 mt-2">
            Pick a stage to move to
          </p>
        </div>
      </div>

      {/* ── Stage chip strip ── */}
      <div
        id="jiggle-strip"
        className="absolute"
        style={{
          left: Math.max(8, liftedLeft - 8),
          width: Math.min(cardWidth + 16, (typeof window !== "undefined" ? window.innerWidth : 1024) - 16),
          top: placeBelow
            ? liftedTop + rect.height * liftScale + stripGap
            : liftedTop - stripGap - stripEstimatedHeight,
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : `translateY(${placeBelow ? -8 : 8}px)`,
          transition: "opacity 200ms ease-out, transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            "flex items-center gap-2 overflow-x-auto no-scrollbar rounded-2xl bg-card/95 backdrop-blur-md border border-border/70 px-2 py-2",
            "shadow-[0_12px_36px_hsl(222_30%_12%_/_0.18)]",
            shaking && "animate-nope-shake",
          )}
        >
          {chips.map((c, idx) => {
            // Insert extra spacing before Archive so it doesn't get accidental taps
            const prevChip = chips[idx - 1];
            const archiveSeparator = c.isArchive && prevChip && !prevChip.isArchive;
            const accent = PIPELINE_ACCENT[c.pipeline].hex;

            const base = "shrink-0 inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium transition-colors select-none";
            const sizing = "h-11 px-4"; // 44px tap target

            let visual = "bg-muted/60 text-foreground hover:bg-muted";
            if (c.isCurrent) {
              visual = "bg-muted/40 text-muted-foreground/70 cursor-default";
            } else if (c.isNext) {
              visual = "text-white";
            } else if (c.isPrev) {
              visual = "text-white";
            } else if (c.isArchive) {
              visual = "bg-muted/50 text-muted-foreground hover:bg-muted/80";
            }

            const inlineStyle: React.CSSProperties = c.isNext
              ? { backgroundColor: accent }
              : c.isPrev
                ? { backgroundColor: "hsl(var(--brand-orange))" }
                : {};

            return (
              <div key={`${c.pipeline}-${c.stage}`} className="flex items-center">
                {archiveSeparator && (
                  <span
                    className="mx-1 h-6 w-px bg-border/80"
                    aria-hidden="true"
                  />
                )}
                <button
                  type="button"
                  disabled={c.isCurrent}
                  onClick={() => handleChipTap(c)}
                  className={cn(base, sizing, visual)}
                  style={inlineStyle}
                  aria-label={`Move to ${c.title}`}
                >
                  <span
                    className="rounded-full"
                    style={{
                      width: 6,
                      height: 6,
                      backgroundColor: c.isNext || c.isPrev ? "rgba(255,255,255,0.85)" : accent,
                    }}
                  />
                  <span>{c.title}</span>
                  {c.isCurrent && (
                    <span className="ml-1 text-[10px] uppercase tracking-wider opacity-80">current</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-center text-[11px] text-white/85 mt-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
          Tap a stage · tap outside to cancel
        </p>
      </div>
    </div>,
    document.body,
  );
};
