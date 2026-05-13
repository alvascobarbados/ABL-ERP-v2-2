import { ArrowLeft, MoreVertical, ChevronRight, Plus, Flag, ArrowRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  PipelineCard, PIPELINES, PipelineId, StageId, ShippingMode,
  SupplierLabelHint, ProjectLogEntry, ProjectLogActionType,
} from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePipelineStore, getStageTitle, getNextStage } from "@/hooks/usePipelineStore";
import { useEditMode } from "@/hooks/useEditMode";
import {
  TextEditor, DateEditor, ListPicker, ListOption, BottomSheet, TrackingEditor, ShipmentNumberEditor,
} from "./EditorSheets";
import { EntityPicker, TeamMultiPicker } from "./EntityPicker";
import { BuyerPicker } from "./BuyerPicker";
import { useMasterData, parseInitials, formatInitials } from "@/hooks/useMasterData";
import { CardActionsPopover } from "./CardActionsPopover";
import { ConfirmDialog } from "./ConfirmDialog";
import { StagePicker } from "./StagePicker";
import { usePresence } from "@/hooks/usePresence";
import { formatAmountFull } from "@/lib/money";
import { LineItemsGrid } from "./LineItemsGrid";
import { canEditNote, canDeleteNote } from "@/lib/permissions";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ProjectNote } from "@/data/pipelines";

interface Props {
  card: PipelineCard | null;
  onClose: () => void;
  onOpenShipment: (id: string) => void;
  onAdvance?: (card: PipelineCard) => void;
  onOpenPicker?: (card: PipelineCard) => void;
}

const DAY = 86400000;

function getUrgency(date: Date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((d.getTime() - today.getTime()) / DAY);
  if (diff === 0) return { label: "due today", color: "hsl(var(--brand-orange))" };
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, color: "hsl(var(--urgent))" };
  if (diff <= 7) return { label: `in ${diff}d`,                color: "hsl(var(--urgent))" };
  if (diff <= 14) return { label: `in ${diff}d`,               color: "hsl(var(--brand-orange))" };
  return { label: `in ${diff}d`, color: "hsl(var(--muted-foreground))" };
}

const fmtLong = (d: Date) =>
  `${d.getDate()} ${d.toLocaleString("en-US", { month: "long" })} ${d.getFullYear()}`;
const fmtNoteTs = (d: Date) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const dd = new Date(d); dd.setHours(0,0,0,0);
  const t = d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
  if (dd.getTime() === today.getTime()) return `Today · ${t}`;
  if (today.getTime() - dd.getTime() === 86400000) return `Yesterday · ${t}`;
  return `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })} · ${t}`;
};

// Display overrides (mirror ProjectTable) so e.g. shipment_required → "Shipping"
const STAGE_DISPLAY: Partial<Record<StageId, string>> = {
  paid: "Paid",
  shipment_required: "Shipping",
  shipment_assigned: "Shipping",
};
function displayStageTitle(pipeline: PipelineId, stage: StageId): string {
  return STAGE_DISPLAY[stage] ?? getStageTitle(pipeline, stage);
}

type EditorKind =
  | { kind: "projectName" }
  | { kind: "detailSummary" }
  | { kind: "buyer" }
  | { kind: "amount" }
  | { kind: "salesRep" }
  | { kind: "deadline" }
  | { kind: "quote" }
  | { kind: "po" }
  | { kind: "invoice" }
  | { kind: "tracking" }
  | { kind: "shipmentNumber" }
  | { kind: "weight" }
  | { kind: "cbm" }
  | { kind: "packages" }
  | { kind: "designBrief" }
  | { kind: "proofNumber" }
  | { kind: "completionDate" }
  | { kind: "outstandingBalance" }
  | { kind: "addNote" }
  | { kind: "supplier" }
  | { kind: "shippingMode" }
  | null;

const SHIPPING_MODE_OPTIONS: ListOption[] = [
  { id: "Air",   label: "Air" },
  { id: "Ocean", label: "Ocean" },
  { id: "Local", label: "Local" },
];

export const ProjectDetail = ({ card, onClose, onOpenShipment }: Props) => {
  const store = usePipelineStore();
  const md = useMasterData();
  const editMode = useEditMode();
  const {
    projects,
    updateProject, addNote, updateNote, removeNote, restoreNote,
    addLineItem, updateLineItem, removeLineItem,
    duplicateProject, softDeleteProject, restoreProject,
    moveCard, toggleFlag,
    triggerPulse,
    isQuoteNumberDuplicate, isPONumberDuplicate, isInvoiceNumberDuplicate,
  } = store;

  const [editor, setEditor] = useState<EditorKind>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [stagePickerOpen, setStagePickerOpen] = useState(false);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [confirm, setConfirm] = useState<null | {
    title: string; description: string; confirmLabel: string; destructive?: boolean; onConfirm: () => void;
  }>(null);

  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, onClose]);

  const live = useMemo(() => card ? projects.find((p) => p.id === card.id) ?? null : null, [card, projects]);
  const presentOthers = usePresence(live?.id);

  const confirmedAt = useMemo(() => {
    const n = live?.notes?.find((x) => x.auto && /→\s*Confirming/i.test(x.text));
    return n?.ts;
  }, [live?.notes]);
  const completedAt = useMemo(() => {
    if (!live) return undefined;
    const isDone =
      live.pipeline === "completed" ||
      (live.pipeline === "finance" && live.stage === "paid");
    if (!isDone) return undefined;
    const n = [...(live.notes ?? [])].reverse().find((x) => x.auto && /→\s*(Paid|Completed)/i.test(x.text));
    return n?.ts ?? live.updatedAt;
  }, [live?.notes, live?.pipeline, live?.stage, live?.updatedAt, live]);

  if (!card || !live) return null;

  const accentHex = PIPELINE_ACCENT[live.pipeline].hex;
  const supplier = md.getSupplierByAnyId(live.supplierId);
  const supplierName = supplier?.name ?? live.supplierLabel ?? undefined;

  const next = getNextStage(live.pipeline, live.stage);
  const canAdvance = !!next;

  // ─── Stage move ─────────────────────────────────────────────────────────
  const handleStagePick = async (target: { pipeline: PipelineId; stage: StageId }) => {
    const fromPipeline = live.pipeline;
    const fromStage = live.stage;
    setStagePickerOpen(false);
    const result = await moveCard(live.id, target);
    if (!result.ok) return;
    if (target.pipeline !== fromPipeline) triggerPulse(target.pipeline);
    addNote(live.id, `Stage moved from ${getStageTitle(fromPipeline, fromStage)} → ${getStageTitle(target.pipeline, target.stage)}`, "Av");
    toast.success(`Moved to ${getStageTitle(target.pipeline, target.stage)}`, {
      description: "Tap Undo to reverse.",
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          moveCard(live.id, { pipeline: fromPipeline, stage: fromStage });
          toast("Move undone", { duration: 2000 });
        },
      },
    });
  };

  const handleMoveForward = async () => {
    if (!next) return;
    await handleStagePick(next);
  };

  // ─── Save handlers ─────────────────────────────────────────────────────
  const saveBuyer = (buyerId: string | null) => { updateProject(live.id, { buyerId }); setEditor(null); };
  const saveProjectName = (v: string) => {
    const t = v.trim();
    if (t) updateProject(live.id, { projectName: t });
    setEditor(null);
  };
  const saveDetail = (v: string) => { updateProject(live.id, { detailSummary: v }); setEditor(null); };
  const saveAmount = (v: string) => {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    if (!Number.isNaN(n)) updateProject(live.id, { value: n });
    setEditor(null);
  };
  const saveSalesRepInitials = (initials: string[]) => {
    updateProject(live.id, { pointPerson: formatInitials(initials) });
    setEditor(null);
  };
  const saveDeadline = (d: Date) => {
    updateProject(live.id, {
      deadlineDate: d,
      deadline: `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })}`,
    });
    setEditor(null);
  };
  const stripNumberPrefix = (raw: string, px: "Q" | "PO" | "INV") => {
    const re = new RegExp(`^\\s*${px}-?`, "i");
    return raw.replace(re, "").replace(/\D/g, "").trim();
  };
  const saveQuote = (v: string) => {
    const t = stripNumberPrefix(v, "Q") || undefined;
    if (t && isQuoteNumberDuplicate(t, live.id)) { toast.error(`Quote ${t} already in use`); return; }
    updateProject(live.id, { quoteNumber: t });
    setEditor(null);
  };
  const savePO = (v: string) => {
    const t = stripNumberPrefix(v, "PO") || undefined;
    if (t && isPONumberDuplicate(t, live.id)) { toast.error(`PO ${t} already in use`); return; }
    updateProject(live.id, { poNumber: t });
    setEditor(null);
  };
  const saveInvoice = (v: string) => {
    const t = stripNumberPrefix(v, "INV") || undefined;
    if (t && isInvoiceNumberDuplicate(t, live.id)) { toast.error(`Invoice ${t} already in use`); return; }
    updateProject(live.id, { invoiceNumber: t });
    setEditor(null);
  };
  const saveTracking = (v: string | null) => {
    updateProject(live.id, { trackingRef: v ?? undefined });
    setEditor(null);
  };
  const saveShipmentNumber = (v: string | null) => {
    updateProject(live.id, { shipmentNumber: v });
    setEditor(null);
  };
  const saveNumeric = (field: "weightKg" | "cbm" | "numPackages", integer: boolean) => (raw: string) => {
    const cleaned = (raw ?? "").replace(integer ? /[^\d]/g : /[^\d.]/g, "");
    if (cleaned === "") {
      updateProject(live.id, { [field]: undefined } as any);
      setEditor(null);
      return;
    }
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0) { setEditor(null); return; }
    const value = integer ? Math.floor(n) : n;
    updateProject(live.id, { [field]: value } as any);
    setEditor(null);
  };
  const saveWeight = saveNumeric("weightKg", false);
  const saveCbm = saveNumeric("cbm", false);
  const savePackages = saveNumeric("numPackages", true);
  const saveDesignBrief = (v: string) => { updateProject(live.id, { designBrief: v.trim() || undefined }); setEditor(null); };
  const saveProofNumber = (v: string) => {
    const t = (v ?? "").replace(/^\s*P-?/i, "").replace(/\D/g, "").trim();
    if (t === "") {
      updateProject(live.id, { proofNumber: undefined });
      setEditor(null);
      return;
    }
    if (t.length !== 4) { toast.error("Proof number must be 4 digits"); return; }
    updateProject(live.id, { proofNumber: t });
    setEditor(null);
  };
  const saveCompletionDate = (d: Date) => { updateProject(live.id, { completionDate: d }); setEditor(null); };
  const saveOutstandingBalance = (v: string) => {
    const cleaned = (v ?? "").replace(/[^\d.]/g, "");
    if (cleaned === "") { updateProject(live.id, { outstandingBalance: undefined }); setEditor(null); return; }
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0) { setEditor(null); return; }
    updateProject(live.id, { outstandingBalance: n });
    setEditor(null);
  };

  const submitNote = (text: string) => { addNote(live.id, text); setEditor(null); };

  const handlePickSupplier = (id: string) => {
    updateProject(live.id, { supplierId: id, supplierLabel: undefined });
    setEditor(null);
  };
  const handlePickSupplierMeta = (meta: string) => {
    const hint = meta === "Unassigned" ? undefined : (meta as SupplierLabelHint);
    updateProject(live.id, { supplierLabel: hint, supplierId: undefined });
    setEditor(null);
  };
  const handlePickShippingMode = (id: string) => {
    const mode = (id === "Air" || id === "Ocean" || id === "Local") ? (id as ShippingMode) : undefined;
    const oldMode = live.shippingMode;
    if (mode === oldMode) { setEditor(null); return; }
    const hasTracking = !!live.trackingRef && live.trackingRef.trim() !== "";
    const apply = (clearTracking: boolean) => {
      const patch: Partial<typeof live> = { shippingMode: mode, salesShippingLabel: undefined };
      if (clearTracking || mode === "Local") patch.trackingRef = undefined;
      updateProject(live.id, patch);
      setEditor(null);
    };
    if (hasTracking) {
      setEditor(null);
      setConfirm({
        title: "Change shipping mode?",
        description: `Changing mode from ${oldMode ?? "—"} to ${mode ?? "—"} will clear the current tracking number (${live.trackingRef}).`,
        confirmLabel: "Confirm and Clear",
        onConfirm: () => { apply(true); setConfirm(null); },
      });
      return;
    }
    apply(false);
  };

  // ─── ⋮ menu actions ────────────────────────────────────────────────────
  const handleEdit = () => { setActionsOpen(false); editMode.enter(card); };
  const handleDuplicate = () => {
    setActionsOpen(false);
    const copy = duplicateProject(live.id);
    if (copy) toast.success("Project duplicated", { description: "New card created in Sales / Proposal." });
  };
  const handleArchive = () => {
    setActionsOpen(false);
    setConfirm({
      title: "Archive this project?",
      description: "Archive holds closed-but-not-deleted projects. You can move it back later.",
      confirmLabel: "Archive",
      onConfirm: () => {
        const fromPipeline = live.pipeline;
        const fromStage = live.stage;
        moveCard(live.id, { pipeline: "sales", stage: "archive" });
        toast.success("Archived", {
          duration: 5000,
          action: {
            label: "Undo",
            onClick: () => {
              moveCard(live.id, { pipeline: fromPipeline, stage: fromStage });
              toast("Archive undone", { duration: 1800 });
            },
          },
        });
        setConfirm(null);
      },
    });
  };
  const handleDelete = () => {
    setActionsOpen(false);
    const result = softDeleteProject(live.id);
    if (!result) return;
    const label = `${live.customer} · ${live.projectName}`;
    onClose();
    toast.success(`${label} moved to Trash`, {
      duration: 8000,
      description: "Restorable for 30 days from the Trash.",
      action: {
        label: "Undo",
        onClick: () => { restoreProject(live.id); toast(`${label} restored`, { duration: 2000 }); },
      },
    });
  };

  const handleFlag = () => {
    toggleFlag(live.id);
  };

  // ─── Derived display helpers ───────────────────────────────────────────
  const u = live.deadlineDate ? getUrgency(live.deadlineDate) : null;
  const deadlineDisplay = live.deadlineDate && u ? `${fmtLong(live.deadlineDate)} (${u.label})` : undefined;
  const repInitials = parseInitials(live.pointPerson);
  const repNames = repInitials.length === 0 ? undefined :
    repInitials.map((i) => md.getTeamByInitials(i)?.full_name ?? i).join(", ");

  const hasShipmentLink = !!live.shipmentId;

  // ─── Render ───
  return (
    <div className="fixed inset-0 z-[200] flex">
      <div className="flex-1 bg-foreground/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <aside
        className="w-full max-w-3xl border-l border-border shadow-2xl overflow-y-auto animate-slide-in-right"
        style={{ backgroundColor: "hsl(var(--background))" }}
      >
        {/* ─── Sticky page header ─── */}
        <div
          className="sticky top-0 z-10 backdrop-blur-md border-b border-border px-6 lg:px-10 py-3.5 flex items-center justify-between gap-3"
          style={{ backgroundColor: "hsl(var(--background) / 0.92)" }}
        >
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2.5 text-[15px] font-medium tracking-tight hover:opacity-80 transition-opacity min-w-0"
            style={{ color: "hsl(var(--brand-navy))" }}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {live.customer}
              <span className="opacity-40 mx-1.5">·</span>
              <span className="font-semibold">{live.projectName}</span>
            </span>
          </button>
          <PresenceAvatars users={presentOthers} />
          <CardActionsPopover
            open={actionsOpen}
            onOpenChange={setActionsOpen}
            trigger={
              <button
                className="p-2 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
                aria-label="Project actions"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
            }
            onEdit={handleEdit}
            onOpenProject={() => setActionsOpen(false)}
            onMoveStage={() => { setActionsOpen(false); setStagePickerOpen(true); }}
            onDuplicate={handleDuplicate}
            onArchive={handleArchive}
            onDelete={handleDelete}
          />
        </div>

        {/* ─── Document body ─── */}
        <div className="px-6 lg:px-10 pt-8 pb-16 space-y-10">

          {/* ── STATUS ── */}
          <section>
            <SectionHeader>Status</SectionHeader>
            <SectionCard>
              <div className="space-y-2">
                <div>
                  <StageStatePill pipeline={live.pipeline} stage={live.stage} accent={accentHex} />
                </div>
                <div className="text-[17px] leading-snug font-medium" style={{ color: "hsl(var(--brand-navy))" }}>
                  {live.customer}
                  <span className="opacity-40 mx-1.5">·</span>
                  {live.projectName}
                </div>
                <div className="text-[14px]" style={{ color: "hsl(var(--brand-navy) / 0.75)" }}>
                  {live.contactPerson || <span className="italic" style={{ color: "hsl(var(--brand-navy) / 0.4)" }}>No contact set</span>}
                </div>
              </div>
              <div className="mt-5 flex items-center gap-2.5">
                <button
                  onClick={handleMoveForward}
                  disabled={!canAdvance}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg text-[14px] font-semibold tracking-tight transition-all",
                    canAdvance
                      ? "text-white hover:opacity-90 active:scale-[0.98]"
                      : "text-muted-foreground/60 cursor-not-allowed",
                  )}
                  style={{
                    height: 38,
                    padding: "0 16px",
                    backgroundColor: canAdvance ? "hsl(var(--brand-navy))" : "hsl(var(--muted))",
                  }}
                >
                  Move Forward <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  onClick={handleFlag}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg text-[14px] font-medium border transition-all active:scale-[0.98]",
                  )}
                  style={{
                    height: 38,
                    padding: "0 14px",
                    borderColor: live.flagged ? "hsl(var(--brand-orange))" : "hsl(var(--brand-navy) / 0.25)",
                    color: live.flagged ? "hsl(var(--brand-orange))" : "hsl(var(--brand-navy))",
                    backgroundColor: live.flagged ? "hsl(var(--brand-orange) / 0.08)" : "transparent",
                  }}
                  aria-pressed={!!live.flagged}
                >
                  <Flag className="h-4 w-4" style={{ fill: live.flagged ? "hsl(var(--brand-orange))" : "transparent" }} />
                  {live.flagged ? "Flagged" : "Flag"}
                </button>
              </div>
            </SectionCard>
          </section>

          {/* ── PROJECT DETAILS ── */}
          <section>
            <SectionHeader>Project Details</SectionHeader>
            <SectionCard>
              <DetailRow label="Customer" value={live.customer} locked />
              <DetailRow
                label="Buyer"
                value={live.buyerId ? (md.buyers.find((b) => b.id === live.buyerId)?.name) : undefined}
                onClick={() => setEditor({ kind: "buyer" })}
              />
              <DetailRow label="Project" value={live.projectName} onClick={() => setEditor({ kind: "projectName" })} />
              <DetailRow label="Detail summary" value={live.detailSummary} onClick={() => setEditor({ kind: "detailSummary" })} />
              <DetailRow label="Supplier" value={supplierName} onClick={() => setEditor({ kind: "supplier" })} />
              <DetailRow
                label="Amount"
                value={live.value ? `${formatAmountFull(live.value)} BBD` : undefined}
                onClick={() => setEditor({ kind: "amount" })}
              />
              <DetailRow
                label="Outstanding Balance"
                value={live.outstandingBalance != null ? `$${live.outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BBD` : undefined}
                onClick={() => setEditor({ kind: "outstandingBalance" })}
              />
              <DetailRow label="Q#" value={live.quoteNumber ? `Q-${live.quoteNumber}` : undefined} placeholder="Q-" onClick={() => setEditor({ kind: "quote" })} />
              <DetailRow label="PO#" value={live.poNumber ? `PO-${live.poNumber}` : undefined} placeholder="PO-" onClick={() => setEditor({ kind: "po" })} />
              <DetailRow label="INV#" value={live.invoiceNumber ? `INV-${live.invoiceNumber}` : undefined} placeholder="INV-" onClick={() => setEditor({ kind: "invoice" })} />
              <DetailRow label="Sales rep" value={repNames} onClick={() => setEditor({ kind: "salesRep" })} />
              <DetailRow
                label="Deadline"
                value={deadlineDisplay}
                onClick={() => setEditor({ kind: "deadline" })}
                valueColor={u?.color}
              />
              <DetailRow
                label="Completion Date"
                value={live.completionDate ? fmtLong(live.completionDate) : undefined}
                onClick={() => setEditor({ kind: "completionDate" })}
              />
            </SectionCard>
          </section>

          {/* ── DESIGN ── */}
          <section>
            <SectionHeader>Design</SectionHeader>
            <SectionCard>
              <DetailRow
                label="Brief"
                value={live.designBrief}
                placeholder="Add design brief…"
                onClick={() => setEditor({ kind: "designBrief" })}
              />
              <DetailRow
                label="Proof No."
                value={live.proofNumber ? `P-${live.proofNumber}` : undefined}
                placeholder="P-"
                onClick={() => setEditor({ kind: "proofNumber" })}
              />
            </SectionCard>
          </section>

          {/* ── SHIPPING DETAILS ── */}
          <section>
            <SectionHeader>Shipping Details</SectionHeader>
            <SectionCard>
              <DetailRow
                label="Weight (kg)"
                value={live.weightKg != null ? String(live.weightKg) : undefined}
                onClick={() => setEditor({ kind: "weight" })}
              />
              <DetailRow
                label="CBM"
                value={live.cbm != null ? String(live.cbm) : undefined}
                onClick={() => setEditor({ kind: "cbm" })}
              />
              <DetailRow
                label="No. of Packages"
                value={live.numPackages != null ? String(live.numPackages) : undefined}
                onClick={() => setEditor({ kind: "packages" })}
              />
              <DetailRow label="Mode of Shipping" value={live.shippingMode} onClick={() => setEditor({ kind: "shippingMode" })} />
              <DetailRow
                label="Shipment Number"
                value={live.shipmentNumber ?? undefined}
                onClick={live.shippingMode && live.shippingMode !== "Local" ? () => setEditor({ kind: "shipmentNumber" }) : undefined}
                locked={!live.shippingMode || live.shippingMode === "Local"}
                lockedHint={!live.shippingMode ? "Set Mode first to enable Shipment Number" : (live.shippingMode === "Local" ? "Shipment Number not yet supported for Local mode" : undefined)}
              />
              <DetailRow
                label="Tracking"
                value={live.trackingRef ? live.trackingRef.toUpperCase() : undefined}
                onClick={live.shippingMode ? () => setEditor({ kind: "tracking" }) : undefined}
                locked={!live.shippingMode}
                lockedHint={!live.shippingMode ? "Set Mode first to enable Tracking" : undefined}
                trailing={hasShipmentLink ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenShipment(live.shipmentId!); }}
                    className="text-[12px] font-medium hover:underline mr-2"
                    style={{ color: "hsl(var(--brand-orange))" }}
                  >
                    View shipment
                  </button>
                ) : null}
              />
            </SectionCard>
          </section>

          {/* ── LINE ITEMS ── */}
          <section>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2
                className="text-[11px] uppercase font-semibold"
                style={{ color: "hsl(var(--brand-navy) / 0.5)", letterSpacing: "0.08em" }}
              >
                Line items
              </h2>
            </div>
            <SectionCard>
              <LineItemsGrid
                projectId={live.id}
                items={live.lineItems ?? []}
                addLineItem={addLineItem}
                updateLineItem={updateLineItem}
                removeLineItem={removeLineItem}
              />
            </SectionCard>
          </section>

          {/* ── NOTES ── */}
          <section>
            <SectionHeaderWithAction onAction={() => setEditor({ kind: "addNote" })}>Notes</SectionHeaderWithAction>
            <SectionCard>
            {(() => {
              const userNotes = (live.notes ?? []).filter((n) => !n.auto);
              if (userNotes.length === 0) {
                return <div className="text-[13px] italic text-muted-foreground/70">No notes yet</div>;
              }
              return (
                <ul className="divide-y" style={{ borderColor: "hsl(var(--brand-navy) / 0.08)" }}>
                  {[...userNotes].reverse().map((n) => (
                    <NoteCard
                      key={n.id}
                      note={n}
                      onSave={(text) => updateNote(live.id, n.id, text)}
                      onDelete={async () => {
                        const snapshot = n;
                        let undone = false;
                        await removeNote(live.id, n.id);
                        toast(`Note deleted`, {
                          duration: 8000,
                          action: {
                            label: "Undo",
                            onClick: () => {
                              if (undone) return;
                              undone = true;
                              restoreNote(live.id, snapshot);
                            },
                          },
                        });
                      }}
                    />
                  ))}
                </ul>
              );
            })()}
            </SectionCard>
          </section>

          {/* ── TIMELINE ── */}
          <section>
            <SectionHeader>Timeline</SectionHeader>
            <SectionCard>
              <DetailRow label="Created" value={fmtLong(live.createdAt)} locked />
              <DetailRow label="Confirmed" value={confirmedAt ? fmtLong(confirmedAt) : undefined} locked />
              <DetailRow label="Completed" value={completedAt ? fmtLong(completedAt) : undefined} locked />
            </SectionCard>
          </section>

          {/* ── ACTIVITY ── */}
          <ActivitySection
            entries={live.log ?? []}
            expanded={activityExpanded}
            onToggle={() => setActivityExpanded((v) => !v)}
          />
        </div>
      </aside>

      {/* ─── Editor sheets ─── */}
      <TextEditor
        open={editor?.kind === "projectName"}
        onClose={() => setEditor(null)}
        title="Project name"
        value={live.projectName}
        onSave={saveProjectName}
      />
      <TextEditor
        open={editor?.kind === "detailSummary"}
        onClose={() => setEditor(null)}
        title="Detail summary"
        value={live.detailSummary ?? ""}
        multiline
        onSave={saveDetail}
      />
      <BuyerPicker
        open={editor?.kind === "buyer"}
        onClose={() => setEditor(null)}
        customerId={md.findCustomerByName(live.customer)?.id ?? null}
        selectedId={live.buyerId ?? null}
        onPick={saveBuyer}
      />
      <TeamMultiPicker
        open={editor?.kind === "salesRep"}
        onClose={() => setEditor(null)}
        selected={parseInitials(live.pointPerson)}
        onConfirm={saveSalesRepInitials}
      />
      <TextEditor
        open={editor?.kind === "amount"}
        onClose={() => setEditor(null)}
        title="Edit amount (BBD)"
        value={live.value ? String(live.value) : ""}
        placeholder="24500"
        onSave={saveAmount}
      />
      <DateEditor
        open={editor?.kind === "deadline"}
        onClose={() => setEditor(null)}
        title="Deadline"
        value={live.deadlineDate ?? undefined}
        onSave={saveDeadline}
      />
      <TextEditor
        open={editor?.kind === "quote"}
        onClose={() => setEditor(null)}
        title="Quote number"
        value={live.quoteNumber ?? ""}
        placeholder="2046"
        prefix="Q-"
        digitsOnly
        onSave={saveQuote}
      />
      <TextEditor
        open={editor?.kind === "po"}
        onClose={() => setEditor(null)}
        title="PO number"
        value={live.poNumber ?? ""}
        placeholder="1095"
        prefix="PO-"
        digitsOnly
        onSave={savePO}
      />
      <TextEditor
        open={editor?.kind === "invoice"}
        onClose={() => setEditor(null)}
        title="Invoice number"
        value={live.invoiceNumber ?? ""}
        placeholder="1050"
        prefix="INV-"
        digitsOnly
        onSave={saveInvoice}
      />
      <TrackingEditor
        open={editor?.kind === "tracking"}
        onClose={() => setEditor(null)}
        shippingMode={live.shippingMode}
        value={live.trackingRef ?? ""}
        onSave={saveTracking}
      />
      <ShipmentNumberEditor
        open={editor?.kind === "shipmentNumber"}
        onClose={() => setEditor(null)}
        shippingMode={live.shippingMode}
        value={live.shipmentNumber ?? ""}
        onSave={saveShipmentNumber}
      />
      <TextEditor
        open={editor?.kind === "weight"}
        onClose={() => setEditor(null)}
        title="Weight (kg)"
        value={live.weightKg != null ? String(live.weightKg) : ""}
        placeholder="0"
        digitsOnly
        allowDecimal
        onSave={saveWeight}
      />
      <TextEditor
        open={editor?.kind === "cbm"}
        onClose={() => setEditor(null)}
        title="CBM"
        value={live.cbm != null ? String(live.cbm) : ""}
        placeholder="0"
        digitsOnly
        allowDecimal
        onSave={saveCbm}
      />
      <TextEditor
        open={editor?.kind === "packages"}
        onClose={() => setEditor(null)}
        title="No. of Packages"
        value={live.numPackages != null ? String(live.numPackages) : ""}
        placeholder="0"
        digitsOnly
        onSave={savePackages}
      />
      <TextEditor
        open={editor?.kind === "designBrief"}
        onClose={() => setEditor(null)}
        title="Design brief"
        value={live.designBrief ?? ""}
        placeholder="Describe the creative brief…"
        multiline
        onSave={saveDesignBrief}
      />
      <TextEditor
        open={editor?.kind === "proofNumber"}
        onClose={() => setEditor(null)}
        title="Proof number"
        value={live.proofNumber ?? ""}
        placeholder="0042"
        prefix="P-"
        digitsOnly
        maxLength={4}
        onSave={saveProofNumber}
      />
      <DateEditor
        open={editor?.kind === "completionDate"}
        onClose={() => setEditor(null)}
        title="Completion date"
        value={live.completionDate ?? undefined}
        onSave={saveCompletionDate}
      />
      <TextEditor
        open={editor?.kind === "outstandingBalance"}
        onClose={() => setEditor(null)}
        title="Outstanding balance (BBD)"
        value={live.outstandingBalance != null ? String(live.outstandingBalance) : ""}
        placeholder="0"
        digitsOnly
        allowDecimal
        onSave={saveOutstandingBalance}
      />
      <TextEditor
        open={editor?.kind === "addNote"}
        onClose={() => setEditor(null)}
        title="Add note"
        value=""
        placeholder="Write a note…"
        multiline
        onSave={submitNote}
      />
      <EntityPicker
        open={editor?.kind === "supplier"}
        onClose={() => setEditor(null)}
        kind="supplier"
        selectedId={live.supplierId}
        selectedMeta={live.supplierLabel}
        onPick={handlePickSupplier}
        onPickMeta={handlePickSupplierMeta}
      />
      <ListPicker
        open={editor?.kind === "shippingMode"}
        onClose={() => setEditor(null)}
        title="Pick shipping mode"
        options={SHIPPING_MODE_OPTIONS}
        selectedId={live.shippingMode}
        onPick={handlePickShippingMode}
      />

      <StagePicker
        open={stagePickerOpen}
        onClose={() => setStagePickerOpen(false)}
        title={live.projectName}
        subtitle={live.customer}
        current={{ pipeline: live.pipeline, stage: live.stage }}
        onPick={handleStagePick}
      />

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        confirmLabel={confirm?.confirmLabel ?? "Confirm"}
        cancelLabel="Cancel"
        destructive={confirm?.destructive}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.onConfirm()}
      />
    </div>
  );
};

// ───────────────────── Layout primitives ─────────────────────

export const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <h2
    className="text-[11px] uppercase font-semibold mb-3 px-1"
    style={{ color: "hsl(var(--brand-navy) / 0.5)", letterSpacing: "0.08em" }}
  >
    {children}
  </h2>
);

export const SectionCard = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div
    className={cn("rounded-2xl px-5 py-5 lg:px-6 lg:py-6", className)}
    style={{
      backgroundColor: "hsl(var(--card))",
      border: "1px solid hsl(var(--brand-navy) / 0.07)",
      boxShadow: "0 1px 3px hsl(var(--brand-navy) / 0.04)",
    }}
  >
    {children}
  </div>
);

export const SectionHeaderWithAction = ({
  children, onAction,
}: { children: React.ReactNode; onAction: () => void }) => (
  <div className="flex items-center justify-between mb-3 px-1">
    <h2
      className="text-[11px] uppercase font-semibold"
      style={{ color: "hsl(var(--brand-navy) / 0.5)", letterSpacing: "0.08em" }}
    >
      {children}
    </h2>
    <button
      onClick={onAction}
      className="inline-flex items-center gap-1 text-[12px] font-medium hover:underline"
      style={{ color: "hsl(var(--brand-orange))" }}
    >
      <Plus className="h-3.5 w-3.5" /> Add
    </button>
  </div>
);

// Single label/value row used by DETAILS and TIMELINE.
export const DetailRow = ({
  label, value, placeholder, onClick, locked, lockedHint, trailing, valueColor,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  onClick?: () => void;
  locked?: boolean;
  lockedHint?: string;
  trailing?: React.ReactNode;
  valueColor?: string;
}) => {
  const isEmpty = !value;
  const display = value ?? placeholder ?? "—";
  const interactive = !!onClick && !locked;

  const content = (
    <>
      <span
        className="text-[13px] shrink-0"
        style={{ color: "hsl(var(--brand-navy) / 0.6)", width: 168 }}
      >
        {label}
      </span>
      <span
        className={cn(
          "text-[14px] flex-1 min-w-0 truncate",
          isEmpty ? "italic" : "font-semibold",
        )}
        style={{
          color: isEmpty
            ? "hsl(var(--brand-navy) / 0.3)"
            : valueColor ?? "hsl(var(--brand-navy))",
        }}
      >
        {display}
      </span>
      {trailing}
      {locked ? (
        lockedHint ? (
          <span className="text-[11px] italic shrink-0" style={{ color: "hsl(var(--brand-navy) / 0.35)" }}>
            {lockedHint}
          </span>
        ) : null
      ) : interactive ? (
        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--brand-navy) / 0.35)" }} />
      ) : null}
    </>
  );

  const baseClass = "w-full flex items-center gap-3 px-2 -mx-2 py-2.5 border-b last:border-b-0 text-left";
  const borderStyle = { borderColor: "hsl(var(--brand-navy) / 0.07)" };

  if (!interactive) {
    return (
      <div className={baseClass} style={{ ...borderStyle, minHeight: 40 }}>
        {content}
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      className={cn(baseClass, "rounded-md hover:bg-muted/40 transition-colors")}
      style={{ ...borderStyle, minHeight: 40 }}
    >
      {content}
    </button>
  );
};

// ───────────── Stage·State pill (matches table view) ─────────────
function stageShade(_pipeline: PipelineId, _stage: StageId): number {
  return 0.5;
}
const StageStatePill = ({
  pipeline, stage, accent,
}: { pipeline: PipelineId; stage: StageId; accent: string }) => {
  const pipelineTitle = PIPELINES.find((p) => p.id === pipeline)?.title ?? pipeline;
  const stageTitle = displayStageTitle(pipeline, stage);
  const shade = stageShade(pipeline, stage);
  const bgPct = Math.round(12 + shade * 3);
  return (
    <span
      className="inline-flex items-center max-w-full truncate rounded-[6px] tabular"
      style={{
        minHeight: 28,
        padding: "5px 10px",
        fontSize: 14,
        fontWeight: 600,
        backgroundColor: `color-mix(in srgb, ${accent} ${bgPct}%, transparent)`,
        color: accent,
        letterSpacing: "0.005em",
      }}
    >
      <span className="truncate">{pipelineTitle} · {stageTitle}</span>
    </span>
  );
};

// ───────────── Activity section ─────────────
const LOG_DOT: Record<ProjectLogActionType, string> = {
  stage_change: "hsl(var(--brand-orange))",
  field_edit: "hsl(var(--muted-foreground))",
  flag_toggle: "hsl(var(--brand-orange))",
  note_added: "hsl(var(--brand-teal))",
  note_edited: "hsl(var(--brand-teal))",
  note_deleted: "hsl(var(--destructive))",
  project_created: "hsl(var(--brand-navy))",
  archive: "hsl(var(--muted-foreground))",
  unarchive: "hsl(var(--muted-foreground))",
  trash: "hsl(var(--destructive))",
  restore: "hsl(var(--muted-foreground))",
  mark_paid: "hsl(var(--brand-gold, var(--brand-orange)))",
  line_item_change: "hsl(var(--muted-foreground))",
};
const fmtLogTs = (d: Date) => {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getDate()} ${dt.toLocaleString("en-US", { month: "short" })} · ${dt
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
};
const ActivitySection = ({
  entries, expanded, onToggle,
}: { entries: ProjectLogEntry[]; expanded: boolean; onToggle: () => void }) => {
  if (!entries.length) {
    return (
      <section>
        <SectionHeader>Activity</SectionHeader>
        <SectionCard><div className="text-[13px] italic text-muted-foreground/70">No activity yet</div></SectionCard>
      </section>
    );
  }
  const sorted = [...entries].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const visible = expanded ? sorted : sorted.slice(0, 5);
  const hasMore = sorted.length > 5;
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2
          className="text-[11px] uppercase font-semibold"
          style={{ color: "hsl(var(--brand-navy) / 0.5)", letterSpacing: "0.08em" }}
        >
          Activity
        </h2>
        {hasMore && (
          <button
            onClick={onToggle}
            className="inline-flex items-center gap-1 text-[12px] font-medium hover:underline"
            style={{ color: "hsl(var(--brand-orange))" }}
          >
            {expanded ? "Show less" : `View all (${sorted.length})`} <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
      <SectionCard>
        <ul className="space-y-2.5">
          {visible.map((e) => (
            <li key={e.id} className="flex gap-2.5 text-[13px] leading-snug">
              <span
                className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: LOG_DOT[e.actionType] ?? "hsl(var(--muted-foreground))" }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-foreground">{e.description}</div>
                <div className="text-[11px] text-muted-foreground">{fmtLogTs(e.ts)}</div>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
    </section>
  );
};

// ─────────── NoteCard: per-note row with three-dots edit/delete ───────────
const NOTE_EDITED_THRESHOLD_MS = 5_000;

const fmtNoteTsLocal = (d: Date) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const dd = new Date(d); dd.setHours(0,0,0,0);
  const t = d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
  if (dd.getTime() === today.getTime()) return `Today · ${t}`;
  if (today.getTime() - dd.getTime() === 86400000) return `Yesterday · ${t}`;
  return `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })} · ${t}`;
};

const NoteCard = ({
  note, onSave, onDelete,
}: {
  note: ProjectNote;
  onSave: (text: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) => {
  const user = useCurrentUser();
  const canEdit = canEditNote(note, user);
  const canDelete = canDeleteNote(note, user);
  const showMenu = canEdit || canDelete;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { if (!editing) setDraft(note.text); }, [note.text, editing]);

  const isEdited = !!note.updatedAt && note.updatedAt.getTime() - note.ts.getTime() > NOTE_EDITED_THRESHOLD_MS;

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (trimmed === "") { setError("Note can't be empty"); return; }
    setError(null);
    if (trimmed !== note.text) {
      await onSave(trimmed);
      toast.success("Note updated");
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(note.text);
    setError(null);
    setEditing(false);
  };

  return (
    <li className="py-3 first:pt-0 last:pb-0 group">
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
          <span className="text-[13px] font-semibold" style={{ color: "hsl(var(--brand-navy))" }}>{note.author}</span>
          <span className="text-[11px] text-muted-foreground tabular">{fmtNoteTsLocal(note.ts)}</span>
          {isEdited && (
            <span
              className="text-[11px] text-muted-foreground/70 italic"
              title={note.updatedAt ? `Edited ${fmtNoteTsLocal(note.updatedAt)}` : undefined}
            >
              (edited)
            </span>
          )}
        </div>
        {showMenu && !editing && (
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
                onPointerDown={(e) => e.stopPropagation()}
                className={cn(
                  "p-1 rounded-md hover:bg-muted/60 transition-opacity",
                  menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
                )}
                aria-label="Note actions"
              >
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={4}
              className="w-40 p-1 rounded-lg shadow-lg bg-card z-[60]"
              style={{ borderColor: "hsl(var(--brand-navy) / 0.15)" }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {canEdit && (
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setEditing(true); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left rounded-md hover:bg-muted/60 text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5 opacity-80" />
                  <span className="font-medium">Edit</span>
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onDelete(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left rounded-md hover:bg-muted/60 text-[hsl(var(--urgent))]/85 hover:text-[hsl(var(--urgent))]"
                >
                  <Trash2 className="h-3.5 w-3.5 opacity-80" />
                  <span className="font-medium">Delete</span>
                </button>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => { setDraft(e.target.value); if (error) setError(null); }}
            autoFocus
            rows={Math.max(2, draft.split("\n").length)}
            className="w-full text-[13px] leading-snug rounded-md border bg-card px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
            style={{ borderColor: error ? "hsl(var(--urgent))" : "hsl(var(--brand-navy) / 0.18)" }}
          />
          {error && <div className="text-[11px]" style={{ color: "hsl(var(--urgent))" }}>{error}</div>}
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={handleCancel}
              className="px-3 py-1.5 text-[12px] font-medium rounded-md hover:bg-muted/60 text-muted-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1.5 text-[12px] font-medium rounded-md text-white"
              style={{ backgroundColor: "hsl(var(--brand-navy))" }}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="text-[13px] leading-snug text-foreground whitespace-pre-wrap">{note.text}</div>
      )}
    </li>
  );
};


// ── Presence avatars (top-right of sticky header) ──────────────────────
function PresenceAvatars({ users }: { users: import("@/hooks/usePresence").PresentUser[] }) {
  if (!users || users.length === 0) return null;
  const visible = users.slice(0, 3);
  const overflow = users.length - visible.length;
  return (
    <div className="flex items-center -space-x-1.5 shrink-0" aria-label={`${users.length} other viewer${users.length === 1 ? "" : "s"}`}>
      {visible.map((u) => (
        <span
          key={u.sessionId}
          title={u.fullName}
          className="inline-flex items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-background"
          style={{
            width: 24, height: 24,
            background: "linear-gradient(135deg, hsl(var(--brand-navy)), hsl(var(--brand-orange)))",
          }}
        >
          {u.initials}
        </span>
      ))}
      {overflow > 0 && (
        <span
          title={users.slice(3).map((u) => u.fullName).join(", ")}
          className="inline-flex items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-background"
          style={{
            width: 24, height: 24,
            backgroundColor: "hsl(var(--brand-navy) / 0.12)",
            color: "hsl(var(--brand-navy))",
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
