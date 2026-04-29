import { useRef, useState, useEffect } from "react";
import { CalendarDays, User2, CornerDownRight, Container, MoreVertical, ArrowLeft, ArrowRight } from "lucide-react";
import { PipelineCard } from "@/data/pipelines";
import { getNextStage, getPrevStage, getStageTitle } from "@/hooks/usePipelineStore";
import { PIPELINE_ACCENT, supplierColor } from "@/lib/brand";
import { StatusPill, SupplierChip } from "./StatusPill";
import { ShippingIcon } from "./ShippingIcon";
import { MiniJourneyBar } from "./MiniJourneyBar";
import { useFriendlyMode } from "@/hooks/useFriendlyMode";
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
  card, onOpen, onOpenMaster, onOpenShipment,
  onSwipeForward, onSwipeBack, onOpenPicker,
}: ProjectCardProps) => {
  const u = getUrgency(card.deadlineDate);
  const pipelineHex = PIPELINE_ACCENT[card.pipeline].hex;
  const { friendly } = useFriendlyMode();

  const isSub = card.kind === "sub";
  const titleLine = isSub ? `${card.sub!.itemName}` : card.master.customer;
  const subline = isSub ? card.supplier?.name : card.master.pointPerson;

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

        {/* Pipeline accent stripe (left edge) */}
        <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: pipelineHex }} />

        {/* ⋮ Picker button */}
        <button
          data-no-drag
          onClick={(e) => { e.stopPropagation(); onOpenPicker(); }}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          aria-label="Move project"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {/* Master badge — only on sub cards (faint navy tint) */}
        {isSub && (
          <button
            data-no-drag
            onClick={(e) => { e.stopPropagation(); onOpenMaster(); }}
            className="ml-3 mt-2.5 mr-12 inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md transition-colors hover:opacity-80 max-w-[calc(100%-3.75rem)]"
            style={{ backgroundColor: "hsl(var(--brand-navy) / 0.08)", color: "hsl(var(--brand-navy))" }}
          >
            <CornerDownRight className="h-3 w-3 opacity-70" />
            <span className="tracking-tight truncate">{card.master.projectName}</span>
            <span className="opacity-60">·</span>
            <span className="truncate">{card.master.customer}</span>
          </button>
        )}

        <button onClick={handleOpen} className={cn("w-full text-left", friendly ? "px-5 pt-2 pb-5" : "px-5 pt-2 pb-4")}>
          <div className={cn("flex items-start justify-between gap-3 mb-1.5 pr-6", !isSub && "pt-3")}>
            <h3
              className={cn(
                "text-foreground leading-tight tracking-tight",
                friendly ? "text-base sm:text-[17px] font-semibold" : "font-semibold text-[15px]",
              )}
            >
              {titleLine}
            </h3>
            {card.priority === "Rush" && <StatusPill variant="rush" className="shrink-0" />}
          </div>

          {subline && (
            <div className={cn("flex items-center gap-1.5 text-muted-foreground mb-3", friendly ? "text-sm" : "text-xs")}>
              {isSub && card.supplier ? (
                <SupplierChip color={supplierColor(card.supplier.id)} name={card.supplier.name} />
              ) : (
                <>
                  <User2 className={friendly ? "h-3.5 w-3.5" : "h-3 w-3"} />
                  <span>{subline}</span>
                </>
              )}
            </div>
          )}

          <p className={cn("text-foreground/80 leading-snug font-normal mb-4", friendly ? "text-[15px]" : "text-sm")}>
            {isSub ? (
              <span className="text-muted-foreground">{card.sub!.summary}</span>
            ) : (
              <>
                <span className="font-semibold">{card.master.projectName}</span>
                <span className="text-muted-foreground"> — {card.master.summary}</span>
              </>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <ShippingIcon mode={card.shippingMode} />
            {card.orderType === "Re-order" && <StatusPill variant="reorder" />}
            {card.shipment && (
              <span
                data-no-drag
                role="button"
                onClick={(e) => { e.stopPropagation(); onOpenShipment?.(); }}
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "hsl(var(--brand-navy))" }}
              >
                <Container className="h-2.5 w-2.5" /> {card.shipment.code}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border/60">
            <MiniJourneyBar pipeline={card.pipeline} />
            <div className="flex items-center gap-2">
              <div className={cn("flex items-center gap-1 text-muted-foreground", friendly ? "text-sm" : "text-xs")}>
                <CalendarDays className={friendly ? "h-3.5 w-3.5" : "h-3 w-3"} />
                <span className="font-medium text-foreground/70 tabular">{card.deadline}</span>
              </div>
              <span
                className={cn(
                  "font-semibold tabular px-2 py-0.5 rounded-full",
                  friendly ? "text-sm" : "text-xs",
                  u.tone === "urgent" && "bg-urgent/10 text-urgent",
                  u.tone === "neutral" && "text-muted-foreground",
                )}
                style={u.tone === "soon" ? { backgroundColor: "hsl(var(--brand-orange) / 0.12)", color: "hsl(var(--brand-orange))" } : undefined}
              >
                {u.label}
              </span>
            </div>
          </div>
        </button>

        {/* Friendly-mode action bar — visible buttons */}
        {friendly && (
          <div
            data-no-drag
            className="px-4 pb-4 pt-1 flex items-center gap-2 border-t border-border/60"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              data-no-drag
              type="button"
              disabled={!canBack}
              onClick={(e) => { e.stopPropagation(); if (canBack) onSwipeBack(); }}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border text-sm font-medium transition-colors",
                canBack ? "hover:bg-muted/40" : "opacity-40 cursor-not-allowed",
              )}
              style={{
                borderColor: "hsl(var(--brand-navy) / 0.35)",
                color: "hsl(var(--brand-navy))",
                minHeight: 56, padding: "10px 12px",
              }}
              title={prev ? `Move back to ${getStageTitle(prev.pipeline, prev.stage)}` : ""}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="truncate">{prev ? `Back · ${getStageTitle(prev.pipeline, prev.stage)}` : "Back"}</span>
            </button>
            <button
              data-no-drag
              type="button"
              disabled={!canForward}
              onClick={(e) => { e.stopPropagation(); if (canForward) onSwipeForward(); }}
              className={cn(
                "flex-[1.4] inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-white transition-opacity",
                canForward ? "hover:opacity-90" : "opacity-40 cursor-not-allowed",
              )}
              style={{
                backgroundColor: "hsl(var(--brand-orange))",
                minHeight: 56, padding: "10px 12px",
              }}
              title={next ? `Move forward to ${getStageTitle(next.pipeline, next.stage)}` : ""}
            >
              <span className="truncate">{next ? `Move forward · ${getStageTitle(next.pipeline, next.stage)}` : "At final stage"}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              data-no-drag
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenPicker(); }}
              className="inline-flex items-center justify-center rounded-xl border text-xs font-medium hover:bg-muted/40 transition-colors px-3"
              style={{
                borderColor: "hsl(var(--brand-navy) / 0.25)",
                color: "hsl(var(--brand-navy))",
                minHeight: 56,
              }}
              aria-label="More options"
            >
              More
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
