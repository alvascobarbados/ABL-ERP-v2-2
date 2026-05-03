import { useRef, useState, useEffect } from "react";
import { MoreVertical, Factory, Flag, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { PipelineCard, formatShippingLabel, getShipment, PIPELINES } from "@/data/pipelines";
import { getNextStage, getPrevStage, getStageTitle, usePipelineStore } from "@/hooks/usePipelineStore";
import { useJiggle } from "@/hooks/useJiggle";
import { useEditMode } from "@/hooks/useEditMode";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { useExpandedCards } from "@/hooks/useExpandedCards";
import { useMasterData } from "@/hooks/useMasterData";
import { CardActionsPopover } from "./CardActionsPopover";


interface ProjectCardProps {
  card: PipelineCard;
  onOpen: () => void;
  onSwipeForward: () => void;
  onSwipeBack: () => void;
  onOpenPicker: () => void;
  /** When true, renders a quiet "Pipeline · Stage" label in the bottom row.
      Used by the flat All view where there are no section headers. */
  showStageLabel?: boolean;
}

const DAY = 86400000;

function getUrgency(date: Date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((d.getTime() - today.getTime()) / DAY);
  if (diff === 0) return { label: "due today", tone: "soon" as const };
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, tone: "urgent" as const };
  if (diff <= 7) return { label: `in ${diff}d`, tone: "urgent" as const };
  if (diff <= 14) return { label: `in ${diff}d`, tone: "soon" as const };
  return { label: `in ${diff}d`, tone: "neutral" as const };
}

const COMMIT_THRESHOLD_PX = 110;
const PULSE_THRESHOLD_PX = 180;
const RESISTANCE = 0.85;

const urgencyHex = (tone: "urgent" | "soon" | "neutral") =>
  tone === "urgent" ? "hsl(var(--urgent))"
  : tone === "soon" ? "hsl(var(--brand-orange))"
  : "hsl(var(--muted-foreground))";

function pipelineTitle(id: PipelineCard["pipeline"]) {
  return PIPELINES.find((p) => p.id === id)?.title ?? id;
}

export const ProjectCard = ({
  card, onOpen, onSwipeForward, onSwipeBack, onOpenPicker, showStageLabel = false,
}: ProjectCardProps) => {
  const jiggle = useJiggle();
  const editMode = useEditMode();
  const store = usePipelineStore();
  const md = useMasterData();
  // SINGLE SOURCE OF TRUTH: always read the live project record from the
  // central store. The `card.project` snapshot held by the parent list can
  // be one render behind after edits — going through the store guarantees
  // edits propagate immediately to the card surface.
  const liveProject = store.projects.find((p) => p.id === card.project.id) ?? card.project;
  const jiggleActive = jiggle.activeId === card.id;
  const jiggleDimmed = jiggle.activeId !== null && !jiggleActive;
  const isEditing = editMode.activeId === card.id;
  const isEditDimmed = editMode.activeId !== null && !isEditing;
  const proj = liveProject;
  const pipelineHex = PIPELINE_ACCENT[card.pipeline].hex;

  const [menuOpen, setMenuOpen] = useState(false);
  const expandCtx = useExpandedCards();
  const expanded = expandCtx.isExpanded(card.id);
  const lineItems = proj.lineItems ?? [];
  const hasLineItems = lineItems.length > 0;

  const next = getNextStage(card.pipeline, card.stage);
  const prev = getPrevStage(card.pipeline, card.stage);
  const canForward = !!next;
  const canBack = !!prev;


  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [burst, setBurst] = useState(false);
  const [snapTransition, setSnapTransition] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isHorizontal = useRef<null | boolean>(null);
  const longPressTimer = useRef<number | null>(null);
  const moved = useRef(false);
  const passedThreshold = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => { if (longPressTimer.current) window.clearTimeout(longPressTimer.current); }, []);

  useEffect(() => {
    const onScroll = () => cancelLongPress();
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", onScroll, true as unknown as EventListenerOptions);
  }, []);

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (jiggleDimmed || jiggleActive) return;
    if (isEditing || isEditDimmed) return;
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
      const rect = (innerRef.current ?? (e.currentTarget as HTMLElement)).getBoundingClientRect();
      haptics.pickup();
      jiggle.activate(card, rect);
    }, 400);
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
      haptics.threshold();
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
      const willCommit = (dir > 0 && canForward) || (dir < 0 && canBack);
      if (willCommit) haptics.commit();
      else haptics.nope();
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

  const lastTapRef = useRef<number>(0);
  const tapTimerRef = useRef<number | null>(null);
  const handleOpen = () => {
    if (moved.current) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      if (tapTimerRef.current) {
        window.clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      handleToggleFlag({ burst: true });
      return;
    }
    lastTapRef.current = now;
    if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    tapTimerRef.current = window.setTimeout(() => {
      tapTimerRef.current = null;
      onOpen();
    }, 300);
  };

  const showForward = dx > 12 && canForward;
  const showBack = dx < -12 && canBack;
  const showResist = (dx > 12 && !canForward) || (dx < -12 && !canBack);
  const intensity = Math.min(1, Math.abs(dx) / COMMIT_THRESHOLD_PX);

  // ─── Unified card content ───
  // Resolve supplier from the LIVE master-data + project (not the cached
  // card.supplier from buildCard, which uses a static seed list and won't
  // reflect newly assigned suppliers from the Supabase suppliers table).
  const supplierName =
    md.getSupplierByAnyId(proj.supplierId)?.name ?? card.supplier?.name;
  const supplierHint = proj.supplierLabel;
  const supplierIsEmpty = !supplierName && !supplierHint;
  const supplierDisplay = supplierName ?? supplierHint ?? "Unassigned";

  const poText = proj.poNumber;
  const qText = proj.quoteNumber;
  const invText = proj.invoiceNumber;

  const ship = getShipment(proj.shipmentId);
  const shippingLabel = formatShippingLabel(
    proj.shippingMode,
    proj.trackingRef ?? ship?.code,
  );
  const u = getUrgency(card.deadlineDate);

  // Shipping has one user-facing stage. Display "Shipping · Shipping"
  // collapses to just "Shipping". "paid" is forced to Title Case "Paid".
  const stageLabel = card.pipeline === "shipping"
    ? "Shipping"
    : `${pipelineTitle(card.pipeline)} · ${card.stage === "paid" ? "Paid" : getStageTitle(card.pipeline, card.stage)}`;

  // Action menu handlers
  const handleEdit = () => { haptics.pickup(); editMode.enter(card); };
  const handleOpenProject = () => onOpen();
  const handleMoveStage = () => onOpenPicker();
  const handleDuplicate = () => {
    const dup = store.duplicateProject(proj.id);
    if (dup) toast.success(`Duplicated · ${dup.customer} · ${dup.projectName}`, { duration: 4000 });
  };
  const handleArchive = () => {
    const fromPipeline = card.pipeline;
    const fromStage = card.stage;
    store.moveCard(card.id, { pipeline: "sales", stage: "archive" });
    toast.success(`${proj.customer} · ${proj.projectName} archived`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          store.moveCard(card.id, { pipeline: fromPipeline, stage: fromStage });
          toast("Archive undone", { duration: 1800 });
        },
      },
    });
  };
  const handleDelete = () => {
    const result = store.softDeleteProject(proj.id);
    if (!result) return;
    const label = `${proj.customer} · ${proj.projectName}`;
    toast.success(`${label} moved to Trash`, {
      duration: 8000,
      description: "Restorable for 30 days from the Trash.",
      action: {
        label: "Undo",
        onClick: () => {
          store.restoreProject(proj.id);
          toast(`${label} restored`, { duration: 2000 });
        },
      },
    });
  };
  const handleToggleFlag = (opts?: { burst?: boolean }) => {
    const wasFlagged = !!proj.flagged;
    store.toggleFlag(proj.id);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(wasFlagged ? 10 : 20); } catch { /* noop */ }
    } else {
      haptics.threshold();
    }
    if (opts?.burst && !wasFlagged) {
      setBurst(true);
      window.setTimeout(() => setBurst(false), 420);
    }
    const label = `${proj.customer} · ${proj.projectName}`;
    toast(wasFlagged ? `Unflagged · ${label}` : `Flagged · ${label}`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => store.toggleFlag(proj.id),
      },
    });
  };
  const flagged = !!proj.flagged;

  return (
    <div
      ref={rootRef}
      className={cn(
        "no-select relative transition-all duration-200",
        jiggleDimmed && "opacity-40 pointer-events-none",
        jiggleActive && "opacity-0 pointer-events-none",
        isEditDimmed && "opacity-40 pointer-events-none",
        isEditing && "invisible",
      )}
    >
      {!isEditing && (
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
      )}

      <div
        ref={innerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={handleOpen}
        style={{
          transform: `translateX(${dx}px)`,
          transition: snapTransition ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)" : dragging ? "none" : "transform 200ms ease-out",
          touchAction: "pan-y",
          ...(flagged ? {
            borderColor: "hsl(var(--brand-orange))",
            backgroundColor: "hsl(var(--brand-orange) / 0.05)",
          } : {}),
        }}
        className={cn(
          "group w-full text-left relative overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-section)]",
          flagged ? "border-[1.5px]" : "border border-border/70",
          !dragging && "hover:-translate-y-0.5",
          pulse && "scale-[1.015]",
        )}
      >
        {flagged && (
          <span
            className="absolute left-0 right-0 top-0 h-[8px] z-[1]"
            style={{ backgroundColor: "hsl(var(--brand-orange))" }}
          />
        )}
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
        {/* Pipeline accent stripe — slightly thicker (4px) so it registers as a pipeline indicator */}
        <span
          className="absolute left-0 top-0 bottom-0 w-[4px] z-[2]"
          style={{ backgroundColor: pipelineHex, opacity: 0.85 }}
        />

        {/* Double-tap flag burst */}
        {burst && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <Flag
              className="flag-burst"
              style={{
                color: "hsl(var(--brand-orange))",
                fill: "hsl(var(--brand-orange))",
                width: 72,
                height: 72,
                filter: "drop-shadow(0 4px 12px hsl(var(--brand-orange) / 0.5))",
              }}
            />
          </div>
        )}

        <CardActionsPopover
          open={menuOpen}
          onOpenChange={(o) => {
            setMenuOpen(o);
            if (o && typeof navigator !== "undefined" && "vibrate" in navigator) {
              try { navigator.vibrate(10); } catch { /* noop */ }
            }
          }}
          flagged={flagged}
          onToggleFlag={handleToggleFlag}
          trigger={
            <button
              data-no-drag
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-3 right-2 z-10 p-2 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label="Project actions"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          }
          onEdit={handleEdit}
          onOpenProject={handleOpenProject}
          onMoveStage={handleMoveStage}
          onDuplicate={handleDuplicate}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onMarkAsPaid={
            card.pipeline === "finance" && card.stage === "invoiced"
              ? () => onSwipeForward()
              : undefined
          }
        />

        <div
          className="w-full text-left pl-[18px] pr-[16px] pt-[16px] pb-[16px] cursor-pointer"
        >
            {/* ─── TOP ZONE: identity (left) + supplier+PO (right) ─── */}
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0 pr-9">
                {/* Tier 1: Customer (loudest) */}
                <h3
                  className="clamp-1 text-[18px] font-bold tracking-tight leading-tight"
                  style={{ color: "hsl(var(--brand-navy))" }}
                  title={proj.customer}
                >
                  {proj.customer}
                </h3>
                {/* Tier 1: Project name (slightly quieter than customer, tight to it) */}
                <p
                  className="clamp-2 text-[15px] font-medium leading-snug mt-0.5"
                  style={{ color: "hsl(var(--brand-navy))" }}
                  title={proj.projectName}
                >
                  {proj.projectName}
                </p>
                {/* Tier 2: Detail summary (mt-3 = bigger gap to mark a tier break) */}
                <p
                  className={cn(
                    "clamp-2 text-[13px] leading-snug mt-3",
                    proj.detailSummary?.trim()
                      ? "italic"
                      : "italic",
                  )}
                  style={{
                    color: proj.detailSummary?.trim()
                      ? "hsl(var(--brand-navy) / 0.70)"
                      : "hsl(var(--brand-navy) / 0.35)",
                  }}
                  title={proj.detailSummary?.trim() ? proj.detailSummary : undefined}
                >
                  {proj.detailSummary?.trim() ? proj.detailSummary : "—"}
                </p>
              </div>

              {/* Right block — Tier 2 supplier + Tier 3 PO */}
              <div className="shrink-0 max-w-[45%] mt-0.5 mr-7 flex flex-col items-end text-right">
                <span className="inline-flex items-center gap-1.5">
                  <Factory
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: "hsl(var(--brand-navy) / 0.55)" }}
                  />
                  <span
                    className={cn(
                      "text-[13px] truncate",
                      supplierIsEmpty
                        ? "italic font-normal"
                        : supplierName ? "font-normal" : "italic font-normal",
                    )}
                    style={{
                      color: supplierName
                        ? "hsl(var(--brand-navy))"
                        : supplierIsEmpty
                          ? "hsl(var(--brand-navy) / 0.40)"
                          : "hsl(var(--brand-navy) / 0.65)",
                    }}
                    title={supplierName ?? supplierDisplay}
                  >
                    {supplierDisplay}
                  </span>
                </span>
                {/* Tier 3: PO */}
                <span
                  className={cn(
                    "text-[12px] tabular leading-none mt-1.5",
                    poText ? "" : "italic",
                  )}
                  style={{
                    color: poText
                      ? "hsl(var(--brand-navy) / 0.60)"
                      : "hsl(var(--brand-navy) / 0.40)",
                  }}
                >
                  {poText ?? "PO-"}
                </span>
              </div>
            </div>

            {/* ─── FOLD LINE: divider with centered chevron ─── */}
            <div className="relative mt-5 mb-3 h-[18px] flex items-center">
              {/* Left segment of divider */}
              <div
                className="h-px flex-1"
                style={{ backgroundColor: "hsl(var(--brand-navy) / 0.10)" }}
              />
              {/* Chevron — sits ON the divider, breaks it visually */}
              <button
                type="button"
                data-no-drag
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!hasLineItems) return;
                  expandCtx.toggleOverride(card.id);
                  haptics.threshold();
                }}
                disabled={!hasLineItems}
                aria-label={expanded ? "Collapse line items" : "Expand line items"}
                aria-expanded={expanded}
                className={cn(
                  "relative shrink-0 h-11 w-11 mx-2 flex items-center justify-center -my-[14px]",
                  hasLineItems ? "" : "cursor-default",
                )}
                style={!hasLineItems ? { pointerEvents: "none" } : undefined}
              >
                <ChevronDown
                  className="transition-transform duration-[250ms] ease-out"
                  style={{
                    width: 18,
                    height: 18,
                    color: "hsl(var(--brand-navy))",
                    opacity: hasLineItems ? 0.6 : 0.3,
                    transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </button>
              {/* Right segment of divider */}
              <div
                className="h-px flex-1"
                style={{ backgroundColor: "hsl(var(--brand-navy) / 0.10)" }}
              />
            </div>

            {/* ─── EXPANDABLE LINE ITEMS (between fold line and bottom zone) ─── */}
            <div
              className="overflow-hidden transition-[max-height,opacity] duration-[250ms] ease-out"
              style={{
                maxHeight: expanded && hasLineItems ? 1200 : 0,
                opacity: expanded && hasLineItems ? 1 : 0,
              }}
            >
              {hasLineItems && (
                <div className="pb-3">
                  <div
                    className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-2"
                    style={{ color: "hsl(var(--brand-navy) / 0.50)" }}
                  >
                    Line Items
                  </div>
                  <ul className="flex flex-col gap-2">
                    {lineItems.map((li, idx) => {
                      const anyLi = li as unknown as { unitPrice?: number; total?: number };
                      const unit = typeof anyLi.unitPrice === "number"
                        ? `$${anyLi.unitPrice.toFixed(2)}`
                        : "—";
                      const total = typeof anyLi.total === "number"
                        ? `$${anyLi.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "—";
                      return (
                        <li
                          key={idx}
                          className="flex items-baseline gap-2 text-[13px] leading-snug"
                          style={{ color: "hsl(var(--brand-navy))" }}
                        >
                          <span className="tabular shrink-0 font-medium" style={{ minWidth: 28 }}>
                            {li.qty}
                          </span>
                          <span style={{ color: "hsl(var(--brand-navy) / 0.40)" }}>×</span>
                          <span className="flex-1 min-w-0 break-words">{li.description}</span>
                          <span className="tabular shrink-0 text-right" style={{ minWidth: 56, color: "hsl(var(--brand-navy) / 0.70)" }}>
                            {unit}
                          </span>
                          <span className="tabular shrink-0 text-right font-semibold" style={{ minWidth: 72 }}>
                            {total}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {(() => {
                    const anyItems = lineItems as unknown as Array<{ total?: number }>;
                    const sum = anyItems.reduce((n, li) => n + (typeof li.total === "number" ? li.total : 0), 0);
                    const showSum = sum > 0;
                    return (
                      <div
                        className="mt-3 text-right text-[11px] tabular"
                        style={{ color: "hsl(var(--brand-navy) / 0.60)" }}
                      >
                        {lineItems.length} {lineItems.length === 1 ? "item" : "items"}
                        {showSum && ` · $${sum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </div>
                    );
                  })()}
                  {/* Subtle divider separating line items from bottom zone */}
                  <div
                    className="mt-3 h-px w-full"
                    style={{ backgroundColor: "hsl(var(--brand-navy) / 0.10)" }}
                  />
                </div>
              )}
            </div>

            {/* ─── BOTTOM ZONE: Q-, INV- ─── */}
            <div className="flex items-center gap-4 min-h-[16px] mb-2">
              <span
                className={cn(
                  "text-[12px] tabular leading-none",
                  qText ? "" : "italic",
                )}
                style={{
                  color: qText
                    ? "hsl(var(--brand-navy) / 0.60)"
                    : "hsl(var(--brand-navy) / 0.40)",
                }}
              >
                {qText ?? "Q-"}
              </span>
              <span
                className={cn(
                  "text-[12px] tabular leading-none",
                  invText ? "" : "italic",
                )}
                style={{
                  color: invText
                    ? "hsl(var(--brand-navy) / 0.60)"
                    : "hsl(var(--brand-navy) / 0.40)",
                }}
              >
                {invText ?? "INV-"}
              </span>
            </div>

            {/* ─── BOTTOM ROW: mode/tracking · stage label (All view) · deadline ─── */}
            <div className="flex items-center gap-3 min-h-[18px] pr-7">
              <span
                className={cn(
                  "text-[12px] tabular leading-none truncate min-w-0",
                  shippingLabel.placeholder ? "italic" : "",
                )}
                style={{
                  color: shippingLabel.placeholder
                    ? "hsl(var(--brand-navy) / 0.40)"
                    : "hsl(var(--brand-navy) / 0.60)",
                }}
              >
                {shippingLabel.text}
              </span>

              {showStageLabel && (
                <span
                  className="text-[12.5px] leading-none truncate flex-1 text-center font-normal"
                  style={{ color: "hsl(var(--brand-navy) / 0.65)" }}
                  title={stageLabel}
                >
                  {stageLabel}
                </span>
              )}

              <span className="inline-flex items-center gap-2 leading-none shrink-0 ml-auto">
                <span
                  className="text-[12px] font-medium tabular"
                  style={{ color: "hsl(var(--brand-navy) / 0.65)" }}
                >
                  {card.deadline}
                </span>
                <span style={{ color: "hsl(var(--brand-navy) / 0.30)" }}>·</span>
                <span className="text-[12px] font-semibold tabular" style={{ color: urgencyHex(u.tone) }}>
                  {u.label}
                </span>
              </span>
            </div>
          </div>


      </div>

    </div>
  );
};
