import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { STATES, StageId, StateId } from "@/data/states";
import { STAGE_ACCENT } from "@/lib/brand";
import { validateMove } from "@/hooks/useStageStore";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export interface JiggleAnchor {
  /** Bounding rect of the source card at activation time (viewport coords). */
  rect: DOMRect;
  card: import("@/data/states").StageCard;
}

interface JiggleOverlayProps {
  anchor: JiggleAnchor | null;
  onClose: () => void;
  onPick: (target: { stage: StageId; state: StateId }) => void;
}

interface ChipDef {
  stage: StageId;
  state: StateId;
  title: string;
  isCurrent: boolean;
  isInvalid: boolean;
  isSamePipeline: boolean;
  /** First chip in its state group — render the group label above it. */
  groupStart: boolean;
  stageTitle: string;
}

export const JiggleOverlay = ({ anchor, onClose, onPick }: JiggleOverlayProps) => {
  const [mounted, setMounted] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  /** Per-chip 0..1 proximity to scroller center (1 = at center). */
  const [proximities, setProximities] = useState<number[]>([]);

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
    for (const p of STATES) {
      if (card.state === "shipping" && p.id !== "shipping") continue;
      let first = true;
      for (const s of p.states) {
        const isCurrent = card.state === p.id && card.state === s.id;
        const v = validateMove(card.project, { stage: p.id, state: s.id });
        out.push({
          stage: p.id,
          state: s.id,
          title: s.title,
          isCurrent,
          isInvalid: !v.ok,
          isSamePipeline: p.id === card.state,
          groupStart: first,
          stageTitle: p.title,
        });
        first = false;
      }
    }
    return out;
  }, [anchor]);

  // Recompute focus + proximities = chip closest to viewport horizontal center.
  const recomputeFocus = () => {
    const scroller = stripScrollRef.current;
    if (!scroller) return;
    const sRect = scroller.getBoundingClientRect();
    const centerX = sRect.left + sRect.width / 2;
    // Falloff distance: ~half the scroller width — chips within this range
    // brighten toward 1.0 the closer they get to center.
    const falloff = sRect.width * 0.45;

    let bestIdx = -1;
    let bestDist = Infinity;
    const prox: number[] = new Array(chips.length).fill(0);

    chipRefs.current.forEach((el, i) => {
      if (!el) return;
      const c = chips[i];
      if (!c) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const d = Math.abs(cx - centerX);
      // Smooth proximity 0..1
      prox[i] = Math.max(0, 1 - d / falloff);
      if (!c.isCurrent && d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });

    setProximities(prox);

    if (bestIdx !== lastFocusRef.current) {
      lastFocusRef.current = bestIdx;
      setFocusedIdx(bestIdx);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate(5); } catch { /* no-op */ }
      }
    }
    setShowLeftFade(scroller.scrollLeft > 4);
    setShowRightFade(
      scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 4,
    );
  };

  // Initial centering: scroll so the current state chip sits in the middle.
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
  const stageHex = STAGE_ACCENT[card.state].hex;

  // ── Fixed picker geometry ──
  // Picker zone always sits at ~42% of viewport height regardless of where the
  // user long-pressed. This gives reliable muscle memory.
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1024;
  const compactHeight = 72;
  const stripBlockHeight = 110;
  const stripGap = 16;

  // Lifted card width: match original card width but cap to viewport.
  const cardWidth = Math.min(rect.width, viewportW - 32);
  const liftedLeft = (viewportW - cardWidth) / 2;
  const totalBlockHeight = compactHeight + stripGap + stripBlockHeight;
  const zoneTop = Math.round(viewportH * 0.42 - totalBlockHeight / 2);
  const liftedTop = Math.max(24, zoneTop);
  const stripTop = liftedTop + compactHeight + stripGap;

  const stripLeft = 8;
  const stripWidth = viewportW - 16;

  // Highlight pulse on the original card location (spatial context).
  const originHighlight = (
    <div
      className="absolute pointer-events-none rounded-2xl"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        boxShadow: mounted
          ? `0 0 0 2px hsl(var(--brand-orange) / 0.55), 0 0 24px hsl(var(--brand-orange) / 0.35)`
          : `0 0 0 0 hsl(var(--brand-orange) / 0)`,
        opacity: mounted ? 1 : 0,
        transition: "box-shadow 240ms ease-out, opacity 200ms ease-out",
        animation: mounted ? "origin-pulse 1.6s ease-in-out infinite" : undefined,
      }}
    />
  );

  const commit = (chip: ChipDef) => {
    if (chip.isCurrent) {
      haptics.nope();
      setShaking(true);
      window.setTimeout(() => setShaking(false), 360);
      return;
    }
    if (chip.isInvalid) {
      haptics.nope();
      onPick({ stage: chip.state, state: chip.state });
      return;
    }
    haptics.commit();
    onPick({ stage: chip.state, state: chip.state });
  };

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
        background: mounted ? "rgba(0,0,0,0.28)" : "rgba(0,0,0,0)",
        transition: "background 220ms ease-out",
      }}
      aria-modal="true"
      role="dialog"
    >
      {/* Origin pulse — preserves spatial context */}
      {originHighlight}

      {/* ── Compact lifted card (fixed position) ── */}
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
          transform: mounted ? `scale(1.02)` : "scale(0.96)",
          transition:
            "transform 200ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 200ms ease-out, opacity 220ms ease-out",
          boxShadow: mounted
            ? "0 24px 48px hsl(222 30% 12% / 0.32), 0 8px 16px hsl(222 30% 12% / 0.18)"
            : "var(--shadow-card)",
          opacity: mounted ? 1 : 0,
          willChange: "transform",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ backgroundColor: stageHex, opacity: 0.9 }}
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

      {/* ── Netflix-style state strip (fixed position) ── */}
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
            "opacity 220ms ease-out, transform 240ms cubic-bezier(0.22, 1, 0.36, 1)",
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
          {/* Stronger edge fades (~30px) */}
          <div
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-[30px] rounded-l-2xl z-10"
            style={{
              background:
                "linear-gradient(to right, hsl(var(--card)) 0%, hsl(var(--card) / 0.85) 50%, hsl(var(--card) / 0) 100%)",
              opacity: showLeftFade ? 1 : 0,
              transition: "opacity 200ms ease-out",
            }}
          />
          <div
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-[30px] rounded-r-2xl z-10"
            style={{
              background:
                "linear-gradient(to left, hsl(var(--card)) 0%, hsl(var(--card) / 0.85) 50%, hsl(var(--card) / 0) 100%)",
              opacity: showRightFade ? 1 : 0,
              transition: "opacity 200ms ease-out",
            }}
          />
          {/* Chevrons */}
          <div
            className="absolute left-1.5 top-1/2 -translate-y-1/2 z-20 pointer-events-none"
            style={{
              opacity: showLeftFade ? 0.6 : 0,
              transition: "opacity 200ms ease-out",
              animation: showLeftFade ? "chev-pulse 2s ease-in-out infinite" : undefined,
            }}
          >
            <ChevronLeft className="h-5 w-5" style={{ color: "hsl(var(--brand-navy))" }} />
          </div>
          <div
            className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 pointer-events-none"
            style={{
              opacity: showRightFade ? 0.6 : 0,
              transition: "opacity 200ms ease-out",
              animation: showRightFade ? "chev-pulse 2s ease-in-out infinite" : undefined,
            }}
          >
            <ChevronRight className="h-5 w-5" style={{ color: "hsl(var(--brand-navy))" }} />
          </div>

          <div
            ref={stripScrollRef}
            onScroll={recomputeFocus}
            className="overflow-x-auto no-scrollbar px-5 pt-2 pb-3"
            style={{ scrollBehavior: "smooth" }}
          >
            <div className="flex items-end gap-2.5" style={{ minWidth: "min-content" }}>
              {chips.map((c, idx) => {
                const accent = STAGE_ACCENT[c.state].hex;
                const isFocused = idx === focusedIdx && !c.isCurrent;
                const prox = proximities[idx] ?? 0;

                // State emphasis:
                // - same-state chips: full opacity baseline (1.0)
                // - other-state chips: 0.55 baseline, brighten toward 1.0 by proximity
                const baseOpacity = c.isSamePipeline
                  ? 1
                  : Math.min(1, 0.55 + prox * 0.45);

                let bg = "hsl(var(--card))";
                let color = "hsl(var(--brand-navy))";
                let border = c.isSamePipeline
                  ? "1.5px solid hsl(var(--brand-navy) / 0.22)"
                  : "1.5px solid hsl(var(--brand-navy) / 0.14)";
                let shadow = "none";
                let scale = 1;
                let opacity = baseOpacity;

                if (c.isCurrent) {
                  opacity = 0.5;
                  border = "1.5px dashed hsl(var(--brand-navy) / 0.3)";
                  bg = "hsl(var(--muted) / 0.4)";
                } else if (isFocused) {
                  bg = "hsl(var(--brand-orange))";
                  color = "#ffffff";
                  border = "1.5px solid hsl(var(--brand-orange))";
                  shadow = "0 6px 16px hsl(var(--brand-orange) / 0.35)";
                  scale = 1.05;
                  opacity = 1;
                }

                // Group label emphasis:
                // - current state label: 0.85 opacity navy
                // - other labels: 0.4 baseline, brightening to 0.85 by proximity
                const labelOpacity = c.isSamePipeline
                  ? 0.85
                  : Math.min(0.85, 0.4 + prox * 0.45);

                return (
                  <div key={`${c.state}-${c.state}`} className="flex flex-col items-start">
                    {/* State group label */}
                    <span
                      className="text-[9px] uppercase tracking-[0.22em] font-semibold mb-1.5 pl-1 whitespace-nowrap"
                      style={{
                        color: c.groupStart ? "hsl(var(--brand-navy))" : "transparent",
                        opacity: c.groupStart ? labelOpacity : 0,
                        height: 12,
                        transition: "opacity 220ms ease-out",
                      }}
                    >
                      {c.stageTitle}
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
                          "background-color 220ms ease-out, color 220ms ease-out, transform 220ms ease-out, box-shadow 220ms ease-out, border-color 220ms ease-out, opacity 220ms ease-out",
                        cursor: c.isCurrent ? "default" : "pointer",
                      }}
                      aria-label={c.isCurrent ? `${c.title} (current)` : `Move to ${c.title}`}
                    >
                      {c.isCurrent ? (
                        <Check
                          className="h-3 w-3"
                          style={{ color: "hsl(var(--brand-navy))", opacity: 0.7 }}
                        />
                      ) : (
                        <span
                          className="rounded-full"
                          style={{
                            width: 6,
                            height: 6,
                            backgroundColor: isFocused ? "rgba(255,255,255,0.9)" : accent,
                          }}
                        />
                      )}
                      <span>{c.title}</span>
                    </button>
                    {/* "current" sublabel under the current chip */}
                    <span
                      className="text-[9px] mt-1 pl-1 italic whitespace-nowrap"
                      style={{
                        color: "hsl(var(--brand-navy))",
                        opacity: c.isCurrent ? 0.55 : 0,
                        height: 10,
                        letterSpacing: "0.05em",
                      }}
                    >
                      current
                    </span>
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
