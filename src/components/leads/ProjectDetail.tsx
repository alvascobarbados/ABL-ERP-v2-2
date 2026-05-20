import { ArrowLeft, MoreVertical, ChevronRight, Plus, Flag, ArrowRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  PipelineCard, PIPELINES, PipelineId, StageId, ShippingMode,
  SupplierLabelHint, ProjectLogEntry, ProjectLogActionType,
  PaymentMethod, WeightUnit, VolumeUnit,
  Currency, CURRENCY_CODES, CURRENCY_SYMBOLS, currencyForSupplierCountry, formatPoAmount,
} from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
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
import { ApprovalsSubsection } from "./ApprovalsSubsection";
import { StagePicker } from "./StagePicker";
import { usePresence } from "@/hooks/usePresence";
import { formatAmountFull } from "@/lib/money";
import { LineItemsGrid } from "./LineItemsGrid";
import { canEditNote, canDeleteNote } from "@/lib/permissions";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { ProjectNote } from "@/data/pipelines";

interface Props {
  card: PipelineCard | null;
  onClose: () => void;
  onOpenShipment: (id: string) => void;
  onOpenProject?: (id: string) => void;
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

// Display overrides — surface legacy ids under their new label so historical rows still read sensibly.
const STAGE_DISPLAY: Partial<Record<StageId, string>> = {
  paid: "Paid",
  shipment_required: "Ready to Ship",
  shipment_assigned: "In Transit",
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
  | { kind: "poAmount" }
  | { kind: "customerPo" }
  | { kind: "invoice" }
  | { kind: "tracking" }
  | { kind: "shipmentNumber" }
  | { kind: "weight" }
  | { kind: "weightUnit" }
  | { kind: "volume" }
  | { kind: "volumeUnit" }
  | { kind: "packages" }
  | { kind: "designBrief" }
  | { kind: "proofNumber" }
  | { kind: "completionDate" }
  | { kind: "addNote" }
  | { kind: "supplier" }
  | { kind: "shippingMode" }
  // Finance — deposit
  | { kind: "depositInvoice" }
  | { kind: "depositAmount" }
  | { kind: "depositPaidDate" }
  | { kind: "depositPaidMethod" }
  | { kind: "depositPaymentRef" }
  // Finance — final
  | { kind: "paidDate" }
  | { kind: "paidMethod" }
  | { kind: "paymentRef" }
  | null;

const SHIPPING_MODE_OPTIONS: ListOption[] = [
  { id: "Air",   label: "Air" },
  { id: "Ocean", label: "Ocean" },
  { id: "Local", label: "Local" },
];
const PAYMENT_METHOD_OPTIONS: ListOption[] = [
  { id: "Transfer", label: "Transfer" },
  { id: "Cheque",   label: "Cheque" },
  { id: "Cash",     label: "Cash" },
];
const WEIGHT_UNIT_OPTIONS: ListOption[] = [
  { id: "kg",  label: "kg" },
  { id: "lbs", label: "lbs" },
];
const VOLUME_UNIT_OPTIONS: ListOption[] = [
  { id: "CBM",  label: "CBM" },
  { id: "CuFt", label: "CuFt" },
];

function refLabelFor(method?: PaymentMethod | null): string | null {
  if (method === "Transfer") return "Bank Ref No.";
  if (method === "Cheque") return "Cheque No.";
  return null;
}

function defaultsForCountry(country?: string | null): { weight: WeightUnit; volume: VolumeUnit } {
  if (country === "USA") return { weight: "lbs", volume: "CuFt" };
  return { weight: "kg", volume: "CBM" };
}

const fmtCreated = (d: Date) =>
  `${d.getDate()} ${d.toLocaleString("en-US", { month: "long" })} ${d.getFullYear()} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

// ── Soft duplicate notice ─────────────────────────────────────────────
// Document number fields (Q/PO/INV/Proof/Deposit#) intentionally allow
// duplicates — one PO can cover several projects. This inline notice lists
// other live projects sharing the same value. Updates live as the store does.
type DocField = "quoteNumber" | "poNumber" | "invoiceNumber" | "proofNumber" | "depositInvoiceNumber";
const DuplicateNotice = ({
  field, value, currentId, onOpenProject,
}: {
  field: DocField;
  value: string | null | undefined;
  currentId: string;
  onOpenProject?: (id: string) => void;
}) => {
  const { findProjectsByDocField } = usePipelineStore();
  const [expanded, setExpanded] = useState(false);
  const matches = findProjectsByDocField(field, value, currentId);
  if (matches.length === 0) return null;

  const showAll = expanded || matches.length <= 3;
  const visible = showAll ? matches : matches.slice(0, 3);
  const overflow = matches.length - visible.length;

  const renderLink = (id: string, name: string) => (
    <button
      key={id}
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpenProject?.(id); }}
      className="underline underline-offset-2 hover:opacity-80"
      style={{ color: "hsl(var(--brand-navy) / 0.85)" }}
    >
      {name}
    </button>
  );

  return (
    <div
      className="px-2 -mx-2 pt-1.5 pb-2 text-[11px] leading-snug border-b last:border-b-0"
      style={{ color: "hsl(var(--brand-navy) / 0.55)", borderColor: "hsl(var(--brand-navy) / 0.07)" }}
    >
      <span className="mr-1">Also used on:</span>
      {visible.map((p, i) => (
        <span key={p.id}>
          {i > 0 && <span>, </span>}
          {renderLink(p.id, p.projectName)}
        </span>
      ))}
      {overflow > 0 && (
        <>
          <span>, and </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
            className="underline underline-offset-2 hover:opacity-80"
            style={{ color: "hsl(var(--brand-navy) / 0.85)" }}
          >
            {overflow} {overflow === 1 ? "other" : "others"}
          </button>
        </>
      )}
    </div>
  );
};

export const ProjectDetail = ({ card, onClose, onOpenShipment, onOpenProject }: Props) => {
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
    findProjectsByDocField,
  } = store;

  const [editor, setEditor] = useState<EditorKind>(null);
  const [depositAmountError, setDepositAmountError] = useState<string | null>(null);
  useEffect(() => { if (editor?.kind !== "depositAmount") setDepositAmountError(null); }, [editor]);
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
    if (!t) { toast.error("Project name is required"); return; }
    updateProject(live.id, { projectName: t });
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
  // Document numbers (Q/PO/INV/Proof/Deposit#) allow duplicates intentionally —
  // one PO/invoice/quote can legitimately cover multiple projects. The soft
  // "Also used on:" notice surfaces in the DetailRow below each field.
  const saveQuote = (v: string) => {
    const t = stripNumberPrefix(v, "Q") || undefined;
    updateProject(live.id, { quoteNumber: t });
    setEditor(null);
  };
  const savePO = (v: string) => {
    const t = stripNumberPrefix(v, "PO") || undefined;
    updateProject(live.id, { poNumber: t });
    setEditor(null);
  };
  const saveCustomerPo = (v: string) => {
    const t = v.trim() || undefined;
    updateProject(live.id, { customerPoNumber: t });
    setEditor(null);
  };
  const saveInvoice = (v: string) => {
    const t = stripNumberPrefix(v, "INV") || undefined;
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
  const saveNumericField = (field: "weightKg" | "volumeValue" | "numPackages" | "depositAmount", integer: boolean) => (raw: string) => {
    const cleaned = (raw ?? "").replace(integer ? /[^\d]/g : /[^\d.]/g, "");
    if (cleaned === "") {
      if (field === "depositAmount") setDepositAmountError(null);
      updateProject(live.id, { [field]: null } as any);
      setEditor(null);
      return;
    }
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0) { setEditor(null); return; }
    const value = integer ? Math.floor(n) : n;
    if (field === "depositAmount") {
      if (live.value == null || live.value === 0) {
        setDepositAmountError("Set the order value first before recording a deposit. Deposit amount must be less than or equal to the project value.");
        return;
      }
      if (value > live.value) {
        const fmt = (x: number) => `$${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        setDepositAmountError(`Deposit amount (${fmt(value)}) can't exceed the order value (${fmt(live.value)}). Adjust the order value first if needed.`);
        return;
      }
      setDepositAmountError(null);
    }
    updateProject(live.id, { [field]: value } as any);
    setEditor(null);
  };
  const saveWeight = saveNumericField("weightKg", false);
  const saveVolume = saveNumericField("volumeValue", false);
  const savePackages = saveNumericField("numPackages", true);
  const savePoAmount = (raw: string, currency: Currency) => {
    const cleaned = (raw ?? "").replace(/[^\d.]/g, "");
    const patch: any = { poAmountCurrency: currency };
    if (cleaned === "") {
      patch.poAmount = null;
    } else {
      const n = Number(cleaned);
      if (!Number.isFinite(n) || n < 0) { setEditor(null); return; }
      patch.poAmount = n;
    }
    updateProject(live.id, patch);
    setEditor(null);
  };
  const saveDepositAmount = saveNumericField("depositAmount", false);
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

  // Finance — deposit
  const toggleDepositRequired = (next: boolean) => {
    updateProject(live.id, { depositRequired: next });
  };
  const saveDepositInvoice = (v: string) => {
    const t = v.trim() || null;
    updateProject(live.id, { depositInvoiceNumber: t });
    setEditor(null);
  };
  const saveDepositPaidDate = (d: Date) => { updateProject(live.id, { depositPaidDate: d }); setEditor(null); };
  const saveDepositPaidMethod = (id: string) => {
    const m = (id === "Transfer" || id === "Cheque" || id === "Cash") ? (id as PaymentMethod) : null;
    const patch: any = { depositPaidMethod: m };
    if (m === "Cash" || m == null) patch.depositPaymentReference = null;
    updateProject(live.id, patch);
    setEditor(null);
  };
  const saveDepositPaymentRef = (v: string) => {
    updateProject(live.id, { depositPaymentReference: v.trim() || null });
    setEditor(null);
  };
  // Finance — final invoice
  const savePaidDate = (d: Date) => { updateProject(live.id, { paidOnDate: d }); setEditor(null); };
  const savePaidMethod = (id: string) => {
    const m = (id === "Transfer" || id === "Cheque" || id === "Cash") ? (id as PaymentMethod) : null;
    const patch: any = { paymentMethod: m };
    if (m === "Cash" || m == null) patch.paymentReference = null;
    updateProject(live.id, patch);
    setEditor(null);
  };
  const savePaymentRef = (v: string) => {
    updateProject(live.id, { paymentReference: v.trim() || null });
    setEditor(null);
  };
  const saveWeightUnit = (id: string) => {
    if (id === "kg" || id === "lbs") updateProject(live.id, { weightUnit: id as WeightUnit });
    setEditor(null);
  };
  const saveVolumeUnit = (id: string) => {
    if (id === "CBM" || id === "CuFt") updateProject(live.id, { volumeUnit: id as VolumeUnit });
    setEditor(null);
  };


  // ─── Clear handlers (set field to null) ────────────────────────────────
  const clearDeadline = () => { updateProject(live.id, { deadlineDate: null, deadline: undefined } as any); setEditor(null); };
  const clearCompletionDate = () => { updateProject(live.id, { completionDate: null } as any); setEditor(null); };
  const clearPaidDate = () => { updateProject(live.id, { paidOnDate: null } as any); setEditor(null); };
  const clearDepositPaidDate = () => { updateProject(live.id, { depositPaidDate: null } as any); setEditor(null); };
  const clearPaidMethod = () => { updateProject(live.id, { paymentMethod: null, paymentReference: null } as any); setEditor(null); };
  const clearDepositPaidMethod = () => { updateProject(live.id, { depositPaidMethod: null, depositPaymentReference: null } as any); setEditor(null); };
  const clearShippingMode = () => {
    if (!live.shippingMode) { setEditor(null); return; }
    const hasTracking = !!live.trackingRef && live.trackingRef.trim() !== "";
    const apply = () => { updateProject(live.id, { shippingMode: undefined, salesShippingLabel: undefined, trackingRef: undefined }); setEditor(null); };
    if (hasTracking) {
      setEditor(null);
      setConfirm({
        title: "Clear shipping mode?",
        description: `Clearing the shipping mode will also clear the current tracking number (${live.trackingRef}).`,
        confirmLabel: "Clear",
        onConfirm: () => { apply(); setConfirm(null); },
      });
      return;
    }
    apply();
  };

  const submitNote = (text: string) => { addNote(live.id, text); setEditor(null); };

  const handlePickSupplier = (id: string) => {
    const prior = md.getSupplierByAnyId(live.supplierId);
    const next = md.suppliers.find((s) => s.id === id);
    const priorD = defaultsForCountry(prior?.country);
    const nextD = defaultsForCountry(next?.country);
    const priorCur = currencyForSupplierCountry(prior?.country);
    const nextCur = currencyForSupplierCountry(next?.country);
    const patch: any = { supplierId: id, supplierLabel: undefined };
    if ((live.weightUnit ?? "kg") === priorD.weight && nextD.weight !== priorD.weight) patch.weightUnit = nextD.weight;
    if ((live.volumeUnit ?? "CBM") === priorD.volume && nextD.volume !== priorD.volume) patch.volumeUnit = nextD.volume;
    if ((live.poAmountCurrency ?? "USD") === priorCur && nextCur !== priorCur) patch.poAmountCurrency = nextCur;
    updateProject(live.id, patch);
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
              <ApprovalsSubsection project={live} />
            </SectionCard>

          </section>

          {/* ── OVERVIEW ── */}
          <section>
            <SectionHeader>Overview</SectionHeader>
            <SectionCard>
              <DetailRow label="Created" value={fmtCreated(live.createdAt)} locked />
              <DetailRow label="Customer" value={live.customer} locked />
              <DetailRow
                label="Buyer"
                value={live.buyerId ? (md.buyers.find((b) => b.id === live.buyerId)?.name) : undefined}
                onClick={() => setEditor({ kind: "buyer" })}
              />
              <DetailRow label="Project" value={live.projectName} onClick={() => setEditor({ kind: "projectName" })} />
              <DetailRow label="Detail summary" value={live.detailSummary} onClick={() => setEditor({ kind: "detailSummary" })} />
              <DetailRow label="Supplier" value={supplierName} onClick={() => setEditor({ kind: "supplier" })} />
              <DetailRow label="Shipping Mode" value={live.shippingMode} onClick={() => setEditor({ kind: "shippingMode" })} />
              <DetailRow label="Q#" value={live.quoteNumber ? `Q-${live.quoteNumber}` : undefined} placeholder="Q-" onClick={() => setEditor({ kind: "quote" })} />
              <DuplicateNotice field="quoteNumber" value={live.quoteNumber} currentId={live.id} onOpenProject={onOpenProject} />
              <DetailRow
                label="Q Amount"
                value={live.value ? `${formatAmountFull(live.value)} BBD` : undefined}
                onClick={() => setEditor({ kind: "amount" })}
              />
              <DetailRow
                label="Customer PO #"
                value={live.customerPoNumber}
                onClick={() => setEditor({ kind: "customerPo" })}
              />
              <DetailRow label="Sales rep" value={repNames} onClick={() => setEditor({ kind: "salesRep" })} />
              <DetailRow
                label="Deadline"
                value={deadlineDisplay}
                onClick={() => setEditor({ kind: "deadline" })}
                valueColor={u?.color}
              />
              <DetailRow label="Outstanding Balance" value={undefined} locked />
            </SectionCard>
          </section>

          {/* ── LINE ITEMS ── */}
          <section>
            <SectionHeader>Line Items</SectionHeader>
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
              <DuplicateNotice field="proofNumber" value={live.proofNumber} currentId={live.id} onOpenProject={onOpenProject} />
            </SectionCard>
          </section>

          {/* ── PURCHASING ── */}
          <section>
            <SectionHeader>Purchasing</SectionHeader>
            <SectionCard>
              <DetailRow label="PO #" value={live.poNumber ? `PO-${live.poNumber}` : undefined} placeholder="PO-" onClick={() => setEditor({ kind: "po" })} />
              <DuplicateNotice field="poNumber" value={live.poNumber} currentId={live.id} onOpenProject={onOpenProject} />
              <DetailRow
                label="PO Amount"
                value={live.poAmount != null ? formatPoAmount(live.poAmount, live.poAmountCurrency ?? "USD") : undefined}
                onClick={() => setEditor({ kind: "poAmount" })}
              />
            </SectionCard>
          </section>

          {/* ── PRODUCTION & SHIPPING ── */}
          <section>
            <SectionHeader>Production & Shipping</SectionHeader>
            <SectionCard>
              <DetailRow
                label="Completion Date"
                value={live.completionDate ? fmtLong(live.completionDate) : undefined}
                onClick={() => setEditor({ kind: "completionDate" })}
              />
              <DetailRow
                label="Weight"
                value={live.weightKg != null ? `${live.weightKg} ${live.weightUnit ?? "kg"}` : undefined}
                onClick={() => setEditor({ kind: "weight" })}
                trailing={
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditor({ kind: "weightUnit" }); }}
                    className="text-[11px] font-medium px-2 py-0.5 rounded-md mr-1.5 hover:bg-muted/60"
                    style={{ color: "hsl(var(--brand-navy) / 0.7)", border: "1px solid hsl(var(--brand-navy) / 0.18)" }}
                  >
                    {live.weightUnit ?? "kg"}
                  </button>
                }
              />
              <DetailRow
                label="Volume"
                value={live.volumeValue != null ? `${live.volumeValue} ${live.volumeUnit ?? "CBM"}` : undefined}
                onClick={() => setEditor({ kind: "volume" })}
                trailing={
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditor({ kind: "volumeUnit" }); }}
                    className="text-[11px] font-medium px-2 py-0.5 rounded-md mr-1.5 hover:bg-muted/60"
                    style={{ color: "hsl(var(--brand-navy) / 0.7)", border: "1px solid hsl(var(--brand-navy) / 0.18)" }}
                  >
                    {live.volumeUnit ?? "CBM"}
                  </button>
                }
              />
              <DetailRow
                label="No. of Packages"
                value={live.numPackages != null ? String(live.numPackages) : undefined}
                onClick={() => setEditor({ kind: "packages" })}
              />
              <DetailRow
                label="Shipment #"
                value={live.shipmentNumber ?? undefined}
                onClick={live.shippingMode && live.shippingMode !== "Local" ? () => setEditor({ kind: "shipmentNumber" }) : undefined}
                locked={!live.shippingMode || live.shippingMode === "Local"}
                lockedHint={!live.shippingMode ? "Set Shipping Mode first" : (live.shippingMode === "Local" ? "Not supported for Local mode" : undefined)}
              />
              <DetailRow
                label="Tracking Number"
                value={live.trackingRef ? live.trackingRef.toUpperCase() : undefined}
                onClick={live.shippingMode ? () => setEditor({ kind: "tracking" }) : undefined}
                locked={!live.shippingMode}
                lockedHint={!live.shippingMode ? "Set Shipping Mode first" : undefined}
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

          {/* ── FINANCE ── */}
          <section data-section="finance">
            <SectionHeader>Finance</SectionHeader>
            <SectionCard>
              <div
                className="w-full flex items-center gap-3 px-2 -mx-2 py-2.5 border-b last:border-b-0"
                style={{ borderColor: "hsl(var(--brand-navy) / 0.07)", minHeight: 40 }}
              >
                <span className="text-[13px] shrink-0" style={{ color: "hsl(var(--brand-navy) / 0.6)", width: 168 }}>
                  Deposit Required
                </span>
                <span className="flex-1 min-w-0 text-[14px] font-semibold" style={{ color: "hsl(var(--brand-navy))" }}>
                  {live.depositRequired ? "Yes" : "No"}
                </span>
                <Switch checked={!!live.depositRequired} onCheckedChange={toggleDepositRequired} />
              </div>

              {!live.depositRequired && (live.depositInvoiceNumber || live.depositAmount != null || live.depositPaidDate) && (
                <div className="px-2 -mx-2 py-2 text-[11px] italic" style={{ color: "hsl(var(--brand-orange))" }}>
                  Deposit data present but toggle off — toggle on to display
                </div>
              )}

              {live.depositRequired && (
                <>
                  <DetailRow label="Deposit #" value={live.depositInvoiceNumber ?? undefined} onClick={() => setEditor({ kind: "depositInvoice" })} />
                  <DuplicateNotice field="depositInvoiceNumber" value={live.depositInvoiceNumber} currentId={live.id} onOpenProject={onOpenProject} />
                  <DetailRow
                    label="Deposit Amount"
                    value={live.depositAmount != null ? `$${live.depositAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BBD` : undefined}
                    onClick={() => setEditor({ kind: "depositAmount" })}
                  />
                  <DetailRow
                    label="Deposit Paid Date"
                    value={live.depositPaidDate ? fmtLong(live.depositPaidDate) : undefined}
                    onClick={() => setEditor({ kind: "depositPaidDate" })}
                  />
                  {live.depositPaidDate && (
                    <DetailRow
                      label="Deposit Paid Method"
                      value={live.depositPaidMethod ?? undefined}
                      onClick={() => setEditor({ kind: "depositPaidMethod" })}
                    />
                  )}
                  {live.depositPaidDate && refLabelFor(live.depositPaidMethod) && (
                    <DetailRow
                      label={`Deposit ${refLabelFor(live.depositPaidMethod)!}`}
                      value={live.depositPaymentReference ?? undefined}
                      onClick={() => setEditor({ kind: "depositPaymentRef" })}
                    />
                  )}
                </>
              )}

              <DetailRow label="INV #" value={live.invoiceNumber ? `INV-${live.invoiceNumber}` : undefined} placeholder="INV-" onClick={() => setEditor({ kind: "invoice" })} />
              <DuplicateNotice field="invoiceNumber" value={live.invoiceNumber} currentId={live.id} onOpenProject={onOpenProject} />
              <DetailRow
                label="Paid Date"
                value={live.paidOnDate ? fmtLong(live.paidOnDate) : undefined}
                onClick={() => setEditor({ kind: "paidDate" })}
              />
              {live.paidOnDate && (
                <DetailRow
                  label="Paid Method"
                  value={live.paymentMethod ?? undefined}
                  onClick={() => setEditor({ kind: "paidMethod" })}
                />
              )}
              {live.paidOnDate && refLabelFor(live.paymentMethod) && (
                <DetailRow
                  label={refLabelFor(live.paymentMethod)!}
                  value={live.paymentReference ?? undefined}
                  onClick={() => setEditor({ kind: "paymentRef" })}
                />
              )}
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
        allowEmpty
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
        title="Edit Q amount (BBD)"
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
        onClear={clearDeadline}
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
        onClear={() => saveQuote("")}
        clearLabel="Clear quote number"
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
        onClear={() => savePO("")}
        clearLabel="Clear PO number"
      />
      <TextEditor
        open={editor?.kind === "customerPo"}
        onClose={() => setEditor(null)}
        title="Customer PO #"
        value={live.customerPoNumber ?? ""}
        placeholder="e.g. 4501234"
        onSave={saveCustomerPo}
        onClear={() => saveCustomerPo("")}
        clearLabel="Clear Customer PO #"
        allowEmpty
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
        onClear={() => saveInvoice("")}
        clearLabel="Clear invoice number"
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
        title={`Weight (${live.weightUnit ?? "kg"})`}
        value={live.weightKg != null ? String(live.weightKg) : ""}
        placeholder="0"
        digitsOnly
        allowDecimal
        onSave={saveWeight}
      />
      <ListPicker
        open={editor?.kind === "weightUnit"}
        onClose={() => setEditor(null)}
        title="Weight unit"
        options={WEIGHT_UNIT_OPTIONS}
        selectedId={live.weightUnit ?? "kg"}
        onPick={saveWeightUnit}
      />
      <TextEditor
        open={editor?.kind === "volume"}
        onClose={() => setEditor(null)}
        title={`Volume (${live.volumeUnit ?? "CBM"})`}
        value={live.volumeValue != null ? String(live.volumeValue) : ""}
        placeholder="0"
        digitsOnly
        allowDecimal
        onSave={saveVolume}
      />
      <ListPicker
        open={editor?.kind === "volumeUnit"}
        onClose={() => setEditor(null)}
        title="Volume unit"
        options={VOLUME_UNIT_OPTIONS}
        selectedId={live.volumeUnit ?? "CBM"}
        onPick={saveVolumeUnit}
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
      <PoAmountEditor
        open={editor?.kind === "poAmount"}
        onClose={() => setEditor(null)}
        amount={live.poAmount ?? null}
        currency={
          live.poAmountCurrency
          ?? (live.poAmount == null
            ? currencyForSupplierCountry(md.getSupplierByAnyId(live.supplierId)?.country)
            : "USD")
        }
        onSave={savePoAmount}
      />
      <TextEditor
        open={editor?.kind === "designBrief"}
        onClose={() => setEditor(null)}
        title="Design brief"
        value={live.designBrief ?? ""}
        placeholder="Describe the creative brief…"
        multiline
        allowEmpty
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
        onClear={() => saveProofNumber("")}
        clearLabel="Clear proof number"
      />
      <DateEditor
        open={editor?.kind === "completionDate"}
        onClose={() => setEditor(null)}
        title="Completion date"
        value={live.completionDate ?? undefined}
        onSave={saveCompletionDate}
        onClear={clearCompletionDate}
      />
      {/* Finance — deposit */}
      <TextEditor
        open={editor?.kind === "depositInvoice"}
        onClose={() => setEditor(null)}
        title="Deposit invoice #"
        value={live.depositInvoiceNumber ?? ""}
        placeholder="DEP-1234"
        allowEmpty
        onSave={saveDepositInvoice}
        onClear={() => saveDepositInvoice("")}
        clearLabel="Clear deposit number"
      />
      <TextEditor
        open={editor?.kind === "depositAmount"}
        onClose={() => setEditor(null)}
        title="Deposit amount (BBD)"
        value={live.depositAmount != null ? String(live.depositAmount) : ""}
        placeholder="0"
        digitsOnly
        allowDecimal
        errorText={depositAmountError}
        onSave={saveDepositAmount}
      />
      <DateEditor
        open={editor?.kind === "depositPaidDate"}
        onClose={() => setEditor(null)}
        title="Deposit paid date"
        value={live.depositPaidDate ?? undefined}
        onSave={saveDepositPaidDate}
        onClear={clearDepositPaidDate}
      />
      <ListPicker
        open={editor?.kind === "depositPaidMethod"}
        onClose={() => setEditor(null)}
        title="Deposit paid method"
        options={PAYMENT_METHOD_OPTIONS}
        selectedId={live.depositPaidMethod ?? undefined}
        onPick={saveDepositPaidMethod}
        onClear={clearDepositPaidMethod}
      />
      <TextEditor
        open={editor?.kind === "depositPaymentRef"}
        onClose={() => setEditor(null)}
        title={`Deposit ${refLabelFor(live.depositPaidMethod) ?? "Reference"}`}
        value={live.depositPaymentReference ?? ""}
        placeholder=""
        allowEmpty
        onSave={saveDepositPaymentRef}
      />
      {/* Finance — final */}
      <DateEditor
        open={editor?.kind === "paidDate"}
        onClose={() => setEditor(null)}
        title="Paid date"
        value={live.paidOnDate ?? undefined}
        onSave={savePaidDate}
        onClear={clearPaidDate}
      />
      <ListPicker
        open={editor?.kind === "paidMethod"}
        onClose={() => setEditor(null)}
        title="Paid method"
        options={PAYMENT_METHOD_OPTIONS}
        selectedId={live.paymentMethod ?? undefined}
        onPick={savePaidMethod}
        onClear={clearPaidMethod}
      />
      <TextEditor
        open={editor?.kind === "paymentRef"}
        onClose={() => setEditor(null)}
        title={refLabelFor(live.paymentMethod) ?? "Reference"}
        value={live.paymentReference ?? ""}
        placeholder=""
        allowEmpty
        onSave={savePaymentRef}
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
        onClear={clearShippingMode}
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
  // Approvals (Phase 4+): use teal for approval lifecycle, muted for config/overrides
  customer_gate_config_change: "hsl(var(--muted-foreground))",
  customer_gate_config_consequence: "hsl(var(--muted-foreground))",
  artwork_approval_create: "hsl(var(--brand-teal))",
  artwork_approval_update: "hsl(var(--brand-teal))",
  artwork_approval_revoke: "hsl(var(--destructive))",
  quotation_approval_create: "hsl(var(--brand-teal))",
  quotation_approval_update: "hsl(var(--brand-teal))",
  quotation_approval_revoke: "hsl(var(--destructive))",
  customer_po_approval_create: "hsl(var(--brand-teal))",
  customer_po_approval_update: "hsl(var(--brand-teal))",
  customer_po_approval_revoke: "hsl(var(--destructive))",
  email_verbal_approval_set: "hsl(var(--brand-teal))",
  email_verbal_approval_unset: "hsl(var(--muted-foreground))",
  gate_override_add: "hsl(var(--muted-foreground))",
  gate_override_remove: "hsl(var(--muted-foreground))",
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
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { if (!editing) setDraft(note.text); }, [note.text, editing]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

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
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
              onPointerDown={(e) => e.stopPropagation()}
              className={cn(
                "p-1 rounded-md hover:bg-muted/60 transition-opacity",
                menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
              )}
              aria-label="Note actions"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full z-[230] mt-1 w-40 rounded-lg border bg-card p-1 shadow-lg"
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
              </div>
            )}
          </div>
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

// ─────────── PO Amount Editor (amount + currency) ───────────
interface PoAmountEditorProps {
  open: boolean;
  onClose: () => void;
  amount: number | null;
  currency: Currency;
  onSave: (raw: string, currency: Currency) => void;
}
function PoAmountEditor({ open, onClose, amount, currency, onSave }: PoAmountEditorProps) {
  const [v, setV] = useState(amount != null ? String(amount) : "");
  const [cur, setCur] = useState<Currency>(currency);
  useEffect(() => {
    if (open) {
      setV(amount != null ? String(amount) : "");
      setCur(currency);
    }
  }, [open, amount, currency]);

  const sanitize = (raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, "");
    const i = cleaned.indexOf(".");
    if (i === -1) return cleaned;
    return cleaned.slice(0, i + 1) + cleaned.slice(i + 1).replace(/\./g, "");
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="PO Amount" onSave={() => onSave(v, cur)}>
      <div className="flex items-stretch gap-2">
        <input
          autoFocus
          inputMode="decimal"
          value={v}
          onChange={(e) => setV(sanitize(e.target.value))}
          placeholder="0"
          className="flex-1 rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
          style={{ minHeight: 48 }}
        />
        <select
          value={cur}
          onChange={(e) => setCur(e.target.value as Currency)}
          className="rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
          style={{ minHeight: 48 }}
        >
          {CURRENCY_CODES.map((c) => (
            <option key={c} value={c}>{c}{CURRENCY_SYMBOLS[c]}</option>
          ))}
        </select>
      </div>
    </BottomSheet>
  );
}
