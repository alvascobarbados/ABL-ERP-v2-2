import { useRef, useState, useEffect } from "react";
import { CalendarDays, User2, Plane, Ship, Repeat, Sparkles, CornerDownRight, Container, MoreVertical } from "lucide-react";
import { PipelineCard, STAGE_ACCENT } from "@/data/pipelines";
import { getNextStage, getPrevStage, getStageTitle } from "@/hooks/usePipelineStore";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  card: PipelineCard;
  onOpen: () => void;
  onOpenMaster: () => void;
  onOpenShipment?: () => void;
  onSwipeForward: () => void;
  onSwipeBack: () => void;
  onOpenPicker: () => void;
}

const TODAY = new Date(2026, 4, 8);

function getUrgency(date: Date) {
  const diff = Math.ceil((date.getTime() - TODAY.getTime()) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, tone: "urgent" as const };
  if (diff <= 7) return { label: `in ${diff}d`, tone: "urgent" as const };
  if (diff <= 14) return { label: `in ${diff}d`, tone: "soon" as const };
  return { label: `in ${diff}d`, tone: "neutral" as const };
}

const accentBgClass: Record<string, string> = {
  indigo: "bg-stage-indigo", amber: "bg-stage-amber", emerald: "bg-stage-emerald",
  rose: "bg-stage-rose", slate: "bg-stage-slate", violet: "bg-stage-violet",
  orange: "bg-stage-orange", teal: "bg-stage-teal", sky: "bg-stage-sky",
  cyan: "bg-stage-cyan", fuchsia: "bg-stage-fuchsia",
};

const COMMIT_THRESHOLD_PX = 110;
const PULSE_THRESHOLD_PX = 180;
const RESISTANCE = 0.85;

export const ProjectCard = ({
  card, onOpen, onOpenMaster, onOpenShipment,
  onSwipeForward, onSwipeBack, onOpenPicker,
}: ProjectCardProps) => {
  const u = getUrgency(card.deadlineDate);
  const accent = STAGE_ACCENT[card.stage];
  const ShipIcon = card.shippingMode === "Air" ? Plane : Ship;

  const isSub = card.kind === "sub";
  const titleLine = isSub ? `${card.sub!.itemName}` : card.master.customer;
  const subline = isSub ? card.supplier?.name : card.master.pointPerson;

  const next = getNextStage(card.pipeline, card.stage);
  const prev = getPrevStage(card.pipeline, card.stage);
  // Sales: right-swipe must never push to Lost / Cold (already excluded by getNextStage)
  const canForward = !!next;
  const canBack = !!prev;

  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [snapTransition, setSnapTransition] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isHorizontal = useRef<null | boolean>(null);
  const longPressTimer = useRef<number | null>(null);
  const moved = useRef(false);
  const passedThreshold = useRef(false);

  useEffect(() => () => { if (longPressTimer.current) window.clearTimeout(longPressTimer.current); }, []);

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // ignore right-clicks and clicks on interactive children
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-no-drag]")) return;

    startX.current = e.clientX;
    startY.current = e.clientY;
    isHorizontal.current = null;
    moved.current = false;
    passedThreshold.current = false;
    setSnapTransition(false);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    longPressTimer.current = window.setTimeout(() => {
      cancelLongPress();
      onOpenPicker();
    }, 550);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const rawDx = e.clientX - startX.current;
    const rawDy = e.clientY - startY.current;

    if (isHorizontal.current === null) {
      if (Math.abs(rawDx) < 6 && Math.abs(rawDy) < 6) return;
      isHorizontal.current = Math.abs(rawDx) > Math.abs(rawDy);
      if (!isHorizontal.current) return;
    }
    if (!isHorizontal.current) return;

    cancelLongPress();
    moved.current = true;
    setDragging(true);

    let next = rawDx * RESISTANCE;
    if (next > 0 && !canForward) next = Math.min(next, 24);
    if (next < 0 && !canBack) next = Math.max(next, -24);

    setDx(next);

    const past = Math.abs(next) >= COMMIT_THRESHOLD_PX;
    if (past && !passedThreshold.current) {
      passedThreshold.current = true;
      setPulse(true);
      window.setTimeout(() => setPulse(false), 180);
    } else if (!past && passedThreshold.current) {
      passedThreshold.current = false;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    cancelLongPress();
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}

    const distance = dx;
    setSnapTransition(true);

    if (Math.abs(distance) >= COMMIT_THRESHOLD_PX) {
      // animate off
      const dir = distance > 0 ? 1 : -1;
      setDx(dir * PULSE_THRESHOLD_PX * 1.6);
      window.setTimeout(() => {
        if (dir > 0 && canForward) onSwipeForward();
        else if (dir < 0 && canBack) onSwipeBack();
        setDx(0);
        setSnapTransition(false);
      }, 180);
    } else {
      setDx(0);
      window.setTimeout(() => setSnapTransition(false), 240);
    }

    setDragging(false);
    isHorizontal.current = null;
  };

  // Click handler suppresses if we dragged
  const handleOpen = () => { if (!moved.current) onOpen(); };

  const showForward = dx > 12 && canForward;
  const showBack = dx < -12 && canBack;
  const showResist = (dx > 12 && !canForward) || (dx < -12 && !canBack);
  const intensity = Math.min(1, Math.abs(dx) / COMMIT_THRESHOLD_PX);

  return (
    <div className="relative">
      {/* Action label underneath */}
      <div className="absolute inset-0 flex items-center justify-between px-5 pointer-events-none select-none">
        <span
          className={cn(
            "text-xs font-semibold tracking-wide transition-opacity",
            showBack ? "opacity-100" : "opacity-0",
          )}
          style={{ color: "hsl(var(--swipe-back))" }}
        >
          ← {prev ? getStageTitle(prev.pipeline, prev.stage) : ""}
        </span>
        <span
          className={cn(
            "text-xs font-semibold tracking-wide transition-opacity ml-auto",
            showForward ? "opacity-100" : "opacity-0",
          )}
          style={{ color: "hsl(var(--swipe-forward))" }}
        >
          {next ? getStageTitle(next.pipeline, next.stage) : ""} →
        </span>
        {showResist && (
          <span className="absolute left-1/2 -translate-x-1/2 text-[11px] uppercase tracking-wider text-muted-foreground/80 italic">
            {dx > 0 ? "Already at last stage" : "Already at first stage"}
          </span>
        )}
      </div>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          transform: `translateX(${dx}px)`,
          transition: snapTransition ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)" : dragging ? "none" : "transform 200ms ease-out",
          touchAction: "pan-y",
        }}
        className={cn(
          "group w-full text-left relative overflow-hidden rounded-2xl bg-card border border-border/70",
          "shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-section)]",
          !dragging && "hover:-translate-y-0.5",
          pulse && "scale-[1.015]",
        )}
      >
        {/* Edge glow overlays */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-1/2 transition-opacity"
          style={{
            background: "linear-gradient(to left, hsl(var(--swipe-forward) / 0.28), transparent)",
            opacity: showForward ? intensity : 0,
          }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-1/2 transition-opacity"
          style={{
            background: "linear-gradient(to right, hsl(var(--swipe-back) / 0.28), transparent)",
            opacity: showBack ? intensity : 0,
          }}
        />

        <span className={cn("absolute left-0 top-0 bottom-0 w-1", accentBgClass[accent])} />

        {/* ⋮ Picker button */}
        <button
          data-no-drag
          onClick={(e) => { e.stopPropagation(); onOpenPicker(); }}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          aria-label="Move project"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {/* Master badge — only on sub cards */}
        {isSub && (
          <button
            data-no-drag
            onClick={(e) => { e.stopPropagation(); onOpenMaster(); }}
            className="w-full text-left pl-5 pr-10 pt-3 pb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <CornerDownRight className="h-3 w-3 opacity-70" />
            <span className="font-medium tracking-tight truncate">{card.master.projectName}</span>
            <span className="text-muted-foreground/60">·</span>
            <span className="truncate">{card.master.customer}</span>
          </button>
        )}

        <button onClick={handleOpen} className="w-full text-left px-5 pt-2 pb-5">
          <div className={cn("flex items-start justify-between gap-3 mb-1.5 pr-6", !isSub && "pt-3")}>
            <h3 className="font-semibold text-foreground leading-tight tracking-tight">{titleLine}</h3>
            {card.priority === "Rush" && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-urgent/10 text-urgent shrink-0 inline-flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5" /> Rush
              </span>
            )}
          </div>

          {subline && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
              <User2 className="h-3 w-3" />
              <span>{subline}</span>
            </div>
          )}

          <p className="text-sm text-foreground/80 leading-snug mb-4">
            {isSub ? (
              <span className="text-muted-foreground">{card.sub!.summary}</span>
            ) : (
              <>
                <span className="font-medium">{card.master.projectName}</span>
                <span className="text-muted-foreground"> — {card.master.summary}</span>
              </>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              <ShipIcon className="h-2.5 w-2.5" /> {card.shippingMode}
            </span>
            {card.orderType === "Re-order" && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                <Repeat className="h-2.5 w-2.5" /> Re-order
              </span>
            )}
            {card.shipment && (
              <span
                data-no-drag
                role="button"
                onClick={(e) => { e.stopPropagation(); onOpenShipment?.(); }}
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-foreground/90 text-background hover:bg-foreground transition-colors"
              >
                <Container className="h-2.5 w-2.5" /> {card.shipment.code}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border/60">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground/80">{card.deadline}</span>
            </div>
            <span
              className={cn(
                "text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full",
                u.tone === "urgent" && "bg-urgent/10 text-urgent",
                u.tone === "soon" && "bg-soon/10 text-soon",
                u.tone === "neutral" && "text-muted-foreground",
              )}
            >
              {u.label}
            </span>
          </div>
        </button>
      </div>
    </div>
  );
};
