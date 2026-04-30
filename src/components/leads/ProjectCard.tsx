import { useRef, useState, useEffect } from "react";
import { MoreVertical, Factory, X } from "lucide-react";
import { toast } from "sonner";
import { PipelineCard, formatShippingLabel, getShipment } from "@/data/pipelines";
import { getNextStage, getPrevStage, getStageTitle, usePipelineStore } from "@/hooks/usePipelineStore";
import { useJiggle } from "@/hooks/useJiggle";
import { useEditMode } from "@/hooks/useEditMode";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { CardActionsPopover } from "./CardActionsPopover";
import { CardEditOverlay } from "./CardEditOverlay";


interface ProjectCardProps {
  card: PipelineCard;
  onOpen: () => void;
  onSwipeForward: () => void;
  onSwipeBack: () => void;
  onOpenPicker: () => void;
}

const TODAY = new Date(2026, 4, 8);
const DAY = 86400000;

function getUrgency(date: Date) {
  const diff = Math.ceil((date.getTime() - TODAY.getTime()) / DAY);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, tone: "urgent" as const };
  if (diff <= 7) return { label: `in ${diff}d`, tone: "urgent" as const };
  if (diff <= 14) return { label: `in ${diff}d`, tone: "soon" as const };
  return { label: `in ${diff}d`, tone: "neutral" as const };
}

const fmtDate = (d: Date) => `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })}`;

const COMMIT_THRESHOLD_PX = 110;
const PULSE_THRESHOLD_PX = 180;
const RESISTANCE = 0.85;

const urgencyHex = (tone: "urgent" | "soon" | "neutral") =>
  tone === "urgent" ? "hsl(var(--urgent))"
  : tone === "soon" ? "hsl(var(--brand-orange))"
  : "hsl(var(--muted-foreground))";

export const ProjectCard = ({
  card, onOpen, onSwipeForward, onSwipeBack, onOpenPicker,
}: ProjectCardProps) => {
  const jiggle = useJiggle();
  const editMode = useEditMode();
  const store = usePipelineStore();
  const jiggleActive = jiggle.activeId === card.id;
  const jiggleDimmed = jiggle.activeId !== null && !jiggleActive;
  const isEditing = editMode.activeId === card.id;
  const isEditDimmed = editMode.activeId !== null && !isEditing;
  const proj = card.project;
  const pipelineHex = PIPELINE_ACCENT[card.pipeline].hex;

  const [menuOpen, setMenuOpen] = useState(false);
  

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
  const rootRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => { if (longPressTimer.current) window.clearTimeout(longPressTimer.current); }, []);

  // Cancel any pending long-press if the user starts scrolling.
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
      // Fire haptic + activate jiggle in the same synchronous tick so the
      // buzz lands the moment the visual lift starts. Vibration must be
      // called from within a user-gesture-derived handler — the long-press
      // setTimeout still qualifies because the pointer is still down.
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

  const handleOpen = () => { if (!moved.current) onOpen(); };

  const showForward = dx > 12 && canForward;
  const showBack = dx < -12 && canBack;
  const showResist = (dx > 12 && !canForward) || (dx < -12 && !canBack);
  const intensity = Math.min(1, Math.abs(dx) / COMMIT_THRESHOLD_PX);

  // ─── Pipeline-specific content for the right block & bottom row ───
  // Right block visibility: shown for non-sales pipelines AND for Sales whenever
  // a supplier signal exists (real id, TBD, or Various). Proposal stays bare.
  const salesSupplierKnown = !!card.supplier || !!proj.supplierLabel;
  const showRightBlock = card.pipeline !== "sales" || salesSupplierKnown;
  const supplierName = card.supplier?.name;
  const supplierHint = proj.supplierLabel; // "TBD" | "Various" | undefined
  const supplierIsHint = !supplierName && !!supplierHint;
  // Sales hides PO line entirely when supplier is only TBD/Various (no PO without supplier)
  const showPoLine = card.pipeline !== "sales" || !!card.supplier;
  const poText = proj.poNumber;

  // Shipping line (used on Production / Shipping / Finance bottom row)
  const ship = getShipment(proj.shipmentId);
  const shippingLabel = formatShippingLabel(
    proj.shippingMode,
    ship?.code,
    ship?.carrier,
  );

  const u = getUrgency(card.deadlineDate);

  // Build the bottom row by pipeline
  let topRefLine: React.ReactNode = null;        // optional first row of bottom area
  let bottomLeft: React.ReactNode = null;        // left of last row
  let bottomRight: React.ReactNode = null;       // right of last row

  if (card.pipeline === "sales") {
    // Sales shipping label is a free-form display string set in mock/data
    // ("Ocean FCL" / "Ocean LCL" / "DHL" / "FedEx" / "Courier" / "Mixed").
    // For Confirming-stage projects with a real shippingMode, fall back to the
    // canonical mode string (no shipment code yet — that comes in Shipping).
    const salesShipText =
      proj.salesShippingLabel ??
      (proj.shippingMode === "Air" ? undefined : proj.shippingMode);
    const showShipLine = !!salesShipText;
    const showQLine =
      card.stage !== "proposal" && card.stage !== "archive";

    // Top reference line: Q-XXXX (or dim "Q-" placeholder)
    if (showQLine) {
      const placeholder = !proj.quoteNumber;
      topRefLine = (
        <span
          className={cn(
            "text-[12px] tabular leading-none",
            placeholder ? "text-muted-foreground/45 italic" : "text-muted-foreground/85",
          )}
        >
          {proj.quoteNumber ?? "Q-"}
        </span>
      );
    }

    // Bottom-left: shipping mode (or empty if not yet known)
    bottomLeft = showShipLine ? (
      <span className="text-[12px] tabular leading-none truncate text-muted-foreground/85">
        {salesShipText}
      </span>
    ) : (
      <span />
    );

    // Bottom-right: deadline + urgency
    bottomRight = (
      <span className="inline-flex items-center gap-2 leading-none shrink-0">
        <span className="text-[12px] text-muted-foreground/75 tabular">{card.deadline}</span>
        <span className="text-muted-foreground/35">·</span>
        <span className="text-[12px] font-semibold tabular" style={{ color: urgencyHex(u.tone) }}>
          {u.label}
        </span>
      </span>
    );

    // If neither Q-line nor a ship line exists (Proposal), collapse to single
    // bottom row by leaving topRefLine null — handled by the JSX below.
  } else if (card.pipeline === "operations") {
    // Top: Q-XXXX (full width)
    // Bottom: shipping label · customer deadline + urgency
    topRefLine = (
      <span
        className={cn(
          "text-[12px] tabular leading-none",
          !proj.quoteNumber ? "text-muted-foreground/45 italic" : "text-muted-foreground/85",
        )}
      >
        {proj.quoteNumber ?? "Q-"}
      </span>
    );
    bottomLeft = (
      <span
        className={cn(
          "text-[12px] tabular leading-none truncate",
          shippingLabel.placeholder ? "text-muted-foreground/45 italic" : "text-muted-foreground/85",
        )}
      >
        {shippingLabel.text}
      </span>
    );
    bottomRight = (
      <span className="inline-flex items-center gap-2 leading-none shrink-0">
        <span className="text-[12px] text-muted-foreground/75 tabular">{card.deadline}</span>
        <span className="text-muted-foreground/35">·</span>
        <span className="text-[12px] font-semibold tabular" style={{ color: urgencyHex(u.tone) }}>
          {u.label}
        </span>
      </span>
    );
  } else if (card.pipeline === "shipping") {
    // Top: Q-XXXX
    // Bottom: shipping label · ETD → ETA (urgency on ETA)
    topRefLine = (
      <span
        className={cn(
          "text-[12px] tabular leading-none",
          !proj.quoteNumber ? "text-muted-foreground/45 italic" : "text-muted-foreground/85",
        )}
      >
        {proj.quoteNumber ?? "Q-"}
      </span>
    );
    bottomLeft = (
      <span
        className={cn(
          "text-[12px] tabular leading-none truncate",
          shippingLabel.placeholder ? "text-muted-foreground/45 italic" : "text-muted-foreground/85",
        )}
      >
        {shippingLabel.text}
      </span>
    );
    if (ship) {
      const etaUrgency = getUrgency(ship.eta);
      bottomRight = (
        <span className="inline-flex items-center gap-1.5 leading-none shrink-0 tabular">
          <span className="text-[12px] text-muted-foreground/75">{fmtDate(ship.etd)}</span>
          <span className="text-muted-foreground/55">→</span>
          <span className="text-[12px] font-semibold" style={{ color: urgencyHex(etaUrgency.tone) }}>
            {fmtDate(ship.eta)}
          </span>
        </span>
      );
    } else {
      bottomRight = (
        <span className="text-[12px] text-muted-foreground/45 italic leading-none shrink-0">
          ETD → ETA
        </span>
      );
    }
  } else if (card.pipeline === "finance") {
    // Top: Q-XXXX · INV-XXXX
    // Bottom: shipping label · invoice due + urgency
    topRefLine = (
      <span className="text-[12px] tabular leading-none inline-flex items-center gap-1.5">
        <span className={cn(!proj.quoteNumber && "text-muted-foreground/45 italic", proj.quoteNumber && "text-muted-foreground/85")}>
          {proj.quoteNumber ?? "Q-"}
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span className={cn(!proj.invoiceNumber && "text-muted-foreground/45 italic", proj.invoiceNumber && "text-muted-foreground/85")}>
          {proj.invoiceNumber ?? "INV-"}
        </span>
      </span>
    );
    bottomLeft = (
      <span
        className={cn(
          "text-[12px] tabular leading-none truncate",
          shippingLabel.placeholder ? "text-muted-foreground/45 italic" : "text-muted-foreground/85",
        )}
      >
        {shippingLabel.text}
      </span>
    );
    bottomRight = (
      <span className="inline-flex items-center gap-2 leading-none shrink-0">
        <span className="text-[12px] text-muted-foreground/75 tabular">{card.deadline}</span>
        <span className="text-muted-foreground/35">·</span>
        <span className="text-[12px] font-semibold tabular" style={{ color: urgencyHex(u.tone) }}>
          {u.label}
        </span>
      </span>
    );
  }

  // ── Action menu handlers ───────────────────────────────────────────────
  const handleEdit = () => {
    haptics.pickup();
    editMode.enter(card);
  };
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
    const { restoredFrom } = result;
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
      {/* Swipe action labels underneath */}
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
        style={{
          transform: `translateX(${dx}px)`,
          transition: snapTransition ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)" : dragging ? "none" : "transform 200ms ease-out",
          touchAction: "pan-y",
        }}
        className={cn(
          "group w-full text-left relative overflow-hidden rounded-2xl bg-card border border-border/70 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-section)]",
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
        {/* Pipeline accent stripe */}
        <span
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ backgroundColor: pipelineHex, opacity: 0.7 }}
        />


        {/* Three-dots menu */}
        <CardActionsPopover
          open={menuOpen}
          onOpenChange={(o) => {
            setMenuOpen(o);
            if (o && typeof navigator !== "undefined" && "vibrate" in navigator) {
              try { navigator.vibrate(10); } catch { /* noop */ }
            }
          }}
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
        />

        <button
          onClick={handleOpen}
          className="w-full text-left pl-5 pr-5 pt-5 pb-5"
        >
            {/* ─── TOP: identity (left) + supplier+PO block (right) ─── */}
            <div className="flex items-start gap-3">
              {/* Identity block */}
              <div className="flex-1 min-w-0 pr-9">
                <h3 className="text-[17px] font-semibold tracking-tight text-foreground leading-tight">
                  {proj.customer}
                </h3>
                <p
                  className="text-[14px] leading-snug mt-1"
                  style={{ color: "hsl(var(--brand-navy))" }}
                >
                  {proj.projectName}
                </p>
                {proj.detailSummary?.trim() && (
                  <p className="text-[13px] text-muted-foreground/85 leading-snug mt-1">
                    {proj.detailSummary}
                  </p>
                )}
              </div>

              {/* Right block — supplier + PO (Production / Shipping / Finance) */}
              {showRightBlock && (
                <div className="shrink-0 max-w-[45%] mt-0.5 mr-7 flex flex-col items-end text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <Factory
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: "hsl(var(--brand-navy) / 0.55)" }}
                    />
                    <span
                      className={cn(
                        "text-[13px] truncate",
                        supplierIsHint
                          ? "italic font-normal text-muted-foreground/65"
                          : "font-medium",
                      )}
                      style={
                        supplierIsHint ? undefined : { color: "hsl(var(--brand-navy))" }
                      }
                    >
                      {supplierName ?? supplierHint ?? "Unassigned"}
                    </span>
                  </span>
                  {showPoLine && (
                    <span
                      className={cn(
                        "text-[12px] tabular leading-none mt-1",
                        poText ? "text-muted-foreground/75" : "text-muted-foreground/45 italic",
                      )}
                    >
                      {poText ?? "PO-"}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* ─── DIVIDER ─── */}
            <div
              className="mt-4 mb-3 h-px w-full"
              style={{ backgroundColor: "hsl(var(--brand-navy) / 0.08)" }}
            />

            {/* ─── BOTTOM AREA ─── */}
            {topRefLine && (
              <div className="flex items-center min-h-[16px] mb-1.5">
                {topRefLine}
              </div>
            )}
            <div className="flex items-center justify-between gap-3 min-h-[18px]">
              {bottomLeft}
              {bottomRight}
            </div>
          </button>

      </div>

    </div>
  );
};


