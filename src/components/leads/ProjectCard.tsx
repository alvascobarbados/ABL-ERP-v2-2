import { useRef, useState, useEffect } from "react";
import { MoreVertical } from "lucide-react";
import { PipelineCard, getQuoteNumber, getInvoiceNumber, getSupplier } from "@/data/pipelines";
import { getNextStage, getPrevStage, getStageTitle } from "@/hooks/usePipelineStore";
import { PIPELINE_ACCENT } from "@/lib/brand";
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

const COMMIT_THRESHOLD_PX = 110;
const PULSE_THRESHOLD_PX = 180;
const RESISTANCE = 0.85;

export const ProjectCard = ({
  card, onOpen,
  onSwipeForward, onSwipeBack, onOpenPicker,
}: ProjectCardProps) => {
  const u = getUrgency(card.deadlineDate);
  const pipelineHex = PIPELINE_ACCENT[card.pipeline].hex;

  // Customer always at top; project name + summary below
  const customer = card.master.customer;
  const isSub = card.kind === "sub";
  const projectLine = isSub
    ? `${card.master.projectName} — ${card.sub!.itemName}`
    : `${card.master.projectName} — ${card.master.summary}`;

  const next = getNextStage(card.pipeline, card.stage);
  const prev = getPrevStage(card.pipeline, card.stage);
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

    let nx = rawDx * RESISTANCE;
    if (nx > 0 && !canForward) nx = Math.min(nx, 24);
    if (nx < 0 && !canBack) nx = Math.max(nx, -24);

    setDx(nx);

    const past = Math.abs(nx) >= COMMIT_THRESHOLD_PX;
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

  const handleOpen = () => { if (!moved.current) onOpen(); };

  const showForward = dx > 12 && canForward;
  const showBack = dx < -12 && canBack;
  const showResist = (dx > 12 && !canForward) || (dx < -12 && !canBack);
  const intensity = Math.min(1, Math.abs(dx) / COMMIT_THRESHOLD_PX);

  const urgencyColor =
    u.tone === "urgent" ? "hsl(var(--urgent))"
    : u.tone === "soon" ? "hsl(var(--brand-orange))"
    : "hsl(var(--muted-foreground))";

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

        {/* Pipeline accent stripe (left edge — quiet) */}
        <span
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ backgroundColor: pipelineHex, opacity: 0.7 }}
        />

        {/* ⋮ Three-dots menu */}
        <button
          data-no-drag
          onClick={(e) => { e.stopPropagation(); onOpenPicker(); }}
          className="absolute top-3 right-2 z-10 p-2 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
          aria-label="Project actions"
        >
          <MoreVertical className="h-5 w-5" />
        </button>

        <button
          onClick={handleOpen}
          className="w-full text-left pl-5 pr-12 pt-5 pb-5"
        >
          {/* 1. Customer — top, weighty */}
          <h3 className="text-[17px] font-semibold tracking-tight text-foreground leading-tight mb-1.5">
            {customer}
          </h3>

          {/* 2. Project name + summary — middle, lighter */}
          <p className="text-[14px] text-muted-foreground leading-snug font-normal mb-2 line-clamp-2">
            {projectLine}
          </p>

          {/* Reference numbers — small, secondary */}
          {(() => {
            const lines: string[] = [];
            if (card.pipeline === "sales" && (card.stage === "quote" || card.stage === "confirming")) {
              const q = getQuoteNumber(card.master.id);
              if (q) lines.push(q);
            }
            if (card.pipeline === "operations" && card.kind === "sub" && card.sub) {
              const sup = getSupplier(card.sub.supplierId);
              if (sup) lines.push(sup.name);
              if (card.sub.poNumber) lines.push(card.sub.poNumber);
            }
            if (card.pipeline === "finance") {
              const inv = getInvoiceNumber(card.master.id);
              if (inv) lines.push(inv);
            }
            if (lines.length === 0) return null;
            return (
              <p className="text-[12px] text-muted-foreground/75 leading-snug mb-3 tabular">
                {lines.join("  ·  ")}
              </p>
            );
          })()}

          {/* 3. Deadline + urgency — bottom right */}
          <div className="flex items-center justify-end gap-2 mt-2">
            <span className="text-[13px] text-muted-foreground/80 tabular">
              {card.deadline}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span
              className="text-[13px] font-semibold tabular"
              style={{ color: urgencyColor }}
            >
              {u.label}
            </span>
          </div>
        </button>
      </div>
    </div>
  );
};
