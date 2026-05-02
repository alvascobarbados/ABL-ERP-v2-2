import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PIPELINES, PipelineId, StageId } from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { validateMove } from "@/hooks/usePipelineStore";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export interface JiggleAnchor {
  /** Bounding rect of the source card at activation time (viewport coords). */
  rect: DOMRect;
  card: import("@/data/pipelines").PipelineCard;
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
  isInvalid: boolean;
  /** First chip in its pipeline group — render the group label above it. */
  groupStart: boolean;
  pipelineTitle: string;
}

export const JiggleOverlay = ({ anchor, onClose, onPick }: JiggleOverlayProps) => {
  const [mounted, setMounted] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const stripScrollRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastFocusRef = useRef<number>(-1);

  useEffect(() => {
    if (!anchor) {
      setMounted(false);
      return;
    }
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchor, onClose]);

  const chips: ChipDef[] = useMemo(() => {
    if (!anchor) return [];
    const card = anchor.card;
    const out: ChipDef[] = [];
    for (const p of PIPELINES) {
      if (card.pipeline === "shipping" && p.id !== "shipping") continue;
      let first = true;
      for (const s of p.stages) {
        const isCurrent = card.pipeline === p.id && card.stage === s.id;
        const v = validateMove(card.project, { pipeline: p.id, stage: s.id });
        out.push({
          pipeline: p.id,
          stage: s.id,
          title: s.title,
          isCurrent,
          isInvalid: !v.ok,
          groupStart: first,
          pipelineTitle: p.title,
        });
        first = false;
      }
    }
    return out;
  }, [anchor]);

  // Recompute focus = chip closest to viewport horizontal center.
  const recomputeFocus = () => {
    const scroller = stripScrollRef.current;
    if (!scroller) return;
    const sRect = scroller.getBoundingClientRect();
    const centerX = sRect.left + sRect.width / 2;
    let bestIdx = -1;
    let bestDist = Infinity;
    chipRefs.current.forEach((el, i) => {
      if (!el) return;
      const c = chips[i];
      if (!c || c.isCurrent) return; // skip current — never focusable
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const d = Math.abs(cx - centerX);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    if (bestIdx !== lastFocusRef.current) {
      lastFocusRef.current = bestIdx;
      setFocusedIdx(bestIdx);
      // Light tick on focus change (Netflix/iOS picker feel)
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate(5); } catch { /* no-op */ }
      }
    }
    // Edge fade visibility
    setShowLeftFade(scroller.scrollLeft > 4);
    setShowRightFade(
      scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 4,
    );
  };

  // Initial centering: scroll so the current stage chip sits in the middle,
  // then compute focus from there.
  useLayoutEffect(() => {
    if (!anchor || !mounted) return;
    const scroller = stripScrollRef.current;
    if (!scroller) return;
    const currentIdx = chips.findIndex((c) => c.isCurrent);
    if (currentIdx >= 0) {
      const el = chipRefs.current[currentIdx];
      if (el) {
        const sRect = scroller.getBoundingClientRect();
        const eRect = el.getBoundingClientRect();
        const offset =
          eRect.left - sRect.left - sRect.width / 2 + eRect.width / 2;
        scroller.scrollTo({ left: scroller.scrollLeft + offset, behavior: "auto" });
      }
    }
    recomputeFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, mounted, chips.length]);

  if (!anchor) return null;

  const { rect, card } = anchor;
  const proj = card.project;
  const pipelineHex = PIPELINE_ACCENT[card.pipeline].hex;

  // ── Compact lifted card geometry ──
  const liftScale = 1.02;
  const compactHeight = 72;
  const cardWidth = rect.width;
  const liftedLeft = rect.left;
  // Center the compact card vertically near where the original card sat,
  // but clamp to viewport.
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  let liftedTop = rect.top + rect.height / 2 - compactHeight / 2;
  liftedTop = Math.max(16, Math.min(liftedTop, viewportH - compactHeight - 180));

  const stripGap = 16;
  const stripBlockHeight = 96; // labels + chips + padding
  let stripTop = liftedTop + compactHeight * liftScale + stripGap;
  if (stripTop + stripBlockHeight > viewportH - 16) {
    // Place strip above instead
    stripTop = liftedTop - stripGap - stripBlockHeight;
  }

  const commit = (chip: ChipDef) => {
    if (chip.isCurrent) {
      haptics.nope();
      setShaking(true);
      window.setTimeout(() => setShaking(false), 360);
      return;
    }
    if (chip.isInvalid) {
      haptics.nope();
      onPick({ pipeline: chip.pipeline, stage: chip.stage });
      return;
    }
    haptics.commit();
    onPick({ pipeline: chip.pipeline, stage: chip.stage });
  };

  const onBackdropPointerDown = (e: React.PointerEvent) => {
    if (cardRef.current && cardRef.current.contains(e.target as Node)) return;
    const strip = document.getElementById("jiggle-strip");
    if (strip && strip.contains(e.target as Node)) return;
    onClose();
  };

  const stripLeft = 8;
  const stripWidth =
    (typeof window !== "undefined" ? window.innerWidth : 1024) - 16;

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      onPointerDown={onBackdropPointerDown}
      style={{
        background: mounted ? "rgba(0,0,0,0.22)" : "rgba(0,0,0,0)",
        transition: "background 200ms ease-out",
      }}
      aria-modal="true"
      role="dialog"
    >
      {/* ── Compact lifted card ── */}
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
          height: compactHeight,
          transformOrigin: "center center",
          transform: mounted ? `scale(${liftScale})` : "scale(1)",
          transition:
            "transform 150ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 150ms ease-out, opacity 200ms ease-out",
          boxShadow: mounted
            ? "0 24px 48px hsl(222 30% 12% / 0.28), 0 8px 16px hsl(222 30% 12% / 0.18)"
            : "var(--shadow-card)",
          opacity: mounted ? 1 : 0.6,
          willChange: "transform",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ backgroundColor: pipelineHex, opacity: 0.9 }}
        />
        <div className="pl-5 pr-5 py-3 flex flex-col justify-center h-full">
          <p className="text-[16px] font-semibold tracking-tight text-foreground leading-tight truncate">
            {proj.customer}
          </p>
          <p
            className="text-[13px] leading-snug mt-0.5 truncate"
            style={{ color: "hsl(var(--brand-navy))" }}
          >
            {proj.projectName}
          </p>
        </div>
      </div>

      {/* ── Netflix-style stage strip ── */}
      <div
        id="jiggle-strip"
        className="no-select absolute"
        style={{
          left: stripLeft,
          width: stripWidth,
          top: stripTop,
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(8px)",
          transition:
            "opacity 200ms ease-out, transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            "relative rounded-2xl bg-card/95 backdrop-blur-md border border-border/70",
            "shadow-[0_12px_36px_hsl(222_30%_12%_/_0.18)]",
            shaking && "animate-nope-shake",
          )}
        >
          {/* Edge fades */}
          <div
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 rounded-l-2xl z-10"
            style={{
              background:
                "linear-gradient(to right, hsl(var(--card)) 0%, hsl(var(--card) / 0) 100%)",
              opacity: showLeftFade ? 1 : 0,
              transition: "opacity 180ms ease-out",
            }}
          />
          <div
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 rounded-r-2xl z-10"
            style={{
              background:
                "linear-gradient(to left, hsl(var(--card)) 0%, hsl(var(--card) / 0) 100%)",
              opacity: showRightFade ? 1 : 0,
              transition: "opacity 180ms ease-out",
            }}
          />
          {/* Edge chevrons */}
          <ChevronLeft
            className="absolute left-1 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 z-20 pointer-events-none animate-pulse"
            style={{ opacity: showLeftFade ? 1 : 0, transition: "opacity 180ms ease-out" }}
          />
          <ChevronRight
            className="absolute right-1 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 z-20 pointer-events-none animate-pulse"
            style={{ opacity: showRightFade ? 1 : 0, transition: "opacity 180ms ease-out" }}
          />

          <div
            ref={stripScrollRef}
            onScroll={recomputeFocus}
            className="overflow-x-auto no-scrollbar px-4 pt-2 pb-3"
            style={{ scrollBehavior: "smooth" }}
          >
            <div className="flex items-end gap-2.5" style={{ minWidth: "min-content" }}>
              {chips.map((c, idx) => {
                const accent = PIPELINE_ACCENT[c.pipeline].hex;
                const isFocused = idx === focusedIdx && !c.isCurrent;

                let bg = "hsl(var(--card))";
                let color = "hsl(var(--brand-navy))";
                let border = "1.5px solid hsl(var(--brand-navy) / 0.2)";
                let shadow = "none";
                let scale = 1;
                let opacity = 1;

                if (c.isCurrent) {
                  opacity = 0.5;
                  border = "1.5px solid hsl(var(--brand-navy) / 0.15)";
                  bg = "hsl(var(--muted) / 0.4)";
                } else if (isFocused) {
                  bg = "hsl(var(--brand-orange))";
                  color = "#ffffff";
                  border = "1.5px solid hsl(var(--brand-orange))";
                  shadow = "0 6px 16px hsl(var(--brand-orange) / 0.35)";
                  scale = 1.05;
                }

                return (
                  <div key={`${c.pipeline}-${c.stage}`} className="flex flex-col items-start">
                    {/* Pipeline group label */}
                    <span
                      className="text-[9px] uppercase tracking-[0.22em] font-medium mb-1.5 pl-1 whitespace-nowrap"
                      style={{
                        color: c.groupStart ? accent : "transparent",
                        opacity: c.groupStart ? 0.55 : 0,
                        height: 12,
                      }}
                    >
                      {c.pipelineTitle}
                    </span>
                    <button
                      ref={(el) => (chipRefs.current[idx] = el)}
                      type="button"
                      disabled={c.isCurrent}
                      onClick={() => commit(c)}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium select-none h-11 px-4 whitespace-nowrap"
                      style={{
                        backgroundColor: bg,
                        color,
                        border,
                        boxShadow: shadow,
                        opacity,
                        transform: `scale(${scale})`,
                        transition:
                          "background-color 200ms ease-out, color 200ms ease-out, transform 200ms ease-out, box-shadow 200ms ease-out, border-color 200ms ease-out",
                        cursor: c.isCurrent ? "default" : "pointer",
                      }}
                      aria-label={c.isCurrent ? `${c.title} (current)` : `Move to ${c.title}`}
                    >
                      <span
                        className="rounded-full"
                        style={{
                          width: 6,
                          height: 6,
                          backgroundColor: isFocused ? "rgba(255,255,255,0.9)" : accent,
                          opacity: c.isCurrent ? 0.6 : 1,
                        }}
                      />
                      <span>{c.title}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
