import { ArrowLeft, MoreVertical, Factory, ChevronRight, Plus } from "lucide-react";
import {
  PipelineCard, PIPELINES, PipelineId, StageId, ShippingMode,
  SupplierLabelHint, formatShippingLabel, getShipment, ProjectLogEntry, ProjectLogActionType,
} from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePipelineStore, getStageTitle } from "@/hooks/usePipelineStore";
import { useEditMode } from "@/hooks/useEditMode";
import {
  TextEditor, DateEditor, ListPicker, ListOption, BottomSheet,
} from "./EditorSheets";
import { EntityPicker, TeamMultiPicker } from "./EntityPicker";
import { useMasterData, parseInitials, formatInitials } from "@/hooks/useMasterData";
import { CardActionsPopover } from "./CardActionsPopover";
import { ConfirmDialog } from "./ConfirmDialog";
import { StagePicker } from "./StagePicker";

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

const fmtDate = (d: Date) => `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })}`;
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

type EditorKind =
  | { kind: "contact" }
  | { kind: "amount" }
  | { kind: "salesRep" }
  | { kind: "confirmedDate" }
  | { kind: "addNote" }
  | { kind: "addLineItem" }
  | { kind: "editLineItem"; index: number }
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
    updateProject, addNote,
    addLineItem, updateLineItem, removeLineItem,
    duplicateProject, softDeleteProject, restoreProject,
    moveCard,
    triggerPulse,
  } = store;

  const [editor, setEditor] = useState<EditorKind>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [stagePickerOpen, setStagePickerOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | {
    title: string; description: string; confirmLabel: string; destructive?: boolean; onConfirm: () => void;
  }>(null);

  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, onClose]);

  // Re-derive the live project from the store so edits reflect immediately.
  const live = useMemo(() => card ? projects.find((p) => p.id === card.id) ?? null : null, [card, projects]);

  // Derive Confirmed/Completed timestamps from the auto stage-move notes.
  // NOTE: these hooks must run on every render, so they sit above the early
  // return guard below — otherwise React sees a different hook count when
  // the card opens/closes and throws "Rendered more hooks than…".
  const confirmedAt = useMemo(() => {
    const n = live?.notes?.find((x) => x.auto && /→\s*Confirming/i.test(x.text));
    return n?.ts;
  }, [live?.notes]);
  const completedAt = useMemo(() => {
    if (!live || live.pipeline !== "finance" || live.stage !== "paid") return undefined;
    const n = [...(live.notes ?? [])].reverse().find((x) => x.auto && /→\s*Paid/i.test(x.text));
    return n?.ts ?? live.updatedAt;
  }, [live?.notes, live?.pipeline, live?.stage, live?.updatedAt, live]);

  if (!card || !live) return null;

  const pipeline = PIPELINES.find((p) => p.id === live.pipeline)!;
  const accentHex = PIPELINE_ACCENT[live.pipeline].hex;
  const supplier = md.getSupplierByAnyId(live.supplierId);

  // ─── Stage move (used by both action sheet and ⋮ menu) ───
  const openStagePicker = () => setStagePickerOpen(true);
  const handleStagePick = (target: { pipeline: PipelineId; stage: StageId }) => {
    const fromPipeline = live.pipeline;
    const fromStage = live.stage;
    setStagePickerOpen(false);
    const result = moveCard(live.id, target);
    if (!result.ok) {
      toast.error("Can't move yet — fill in the missing details first.");
      return;
    }
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

  // ─── Save handlers (only for things this view directly edits) ───
  const saveContact = (v: string) => { updateProject(live.id, { contactPerson: v }); setEditor(null); };
  const saveAmount = (v: string) => {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    if (!Number.isNaN(n)) updateProject(live.id, { value: n });
    setEditor(null);
  };
  const saveSalesRepInitials = (initials: string[]) => {
    updateProject(live.id, { pointPerson: formatInitials(initials) });
    setEditor(null);
  };
  const saveConfirmedDate = (d: Date) => {
    // Stored as an auto note for now — the project model has no dedicated field.
    addNote(live.id, `Confirmed date set to ${fmtLong(d)}`, "Av");
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
    const patch: Partial<typeof live> = { shippingMode: mode, salesShippingLabel: undefined };
    if (mode === "Local") patch.trackingRef = undefined;
    updateProject(live.id, patch);
    setEditor(null);
  };

  // ─── ⋮ menu actions ───
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
        onClick: () => {
          restoreProject(live.id);
          toast(`${label} restored`, { duration: 2000 });
        },
      },
    });
  };

  // ─── Render ───
  const showShipment = !!live.shippingMode && live.shippingMode !== "Local";

  return (
    <div className="fixed inset-0 z-[200] flex">
      <div className="flex-1 bg-foreground/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <aside className="w-full max-w-2xl bg-background border-l border-border shadow-2xl overflow-y-auto animate-slide-in-right">
        {/* Top bar: back + breadcrumb + ⋮ */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border px-5 py-3 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight hover:opacity-80 transition-opacity min-w-0"
            style={{ color: "hsl(var(--brand-navy))" }}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {live.customer}
              <span className="opacity-40 mx-1.5">·</span>
              <span className="font-medium">{live.projectName}</span>
            </span>
          </button>
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
            onMoveStage={() => { setActionsOpen(false); openStagePicker(); }}
            onDuplicate={handleDuplicate}
            onArchive={handleArchive}
            onDelete={handleDelete}
          />
        </div>

        {/* ─── MINI CARD: replica of pipeline-view card (non-interactive) ─── */}
        <div className="px-4 sm:px-5 pt-5">
          <MiniProjectCard card={card} live={live} supplierName={supplier?.name} accentHex={accentHex} />
        </div>

        {/* ─── LINE ITEMS ─── */}
        <SectionWithAction
          label="Line items"
          actionLabel="Add"
          onAction={() => setEditor({ kind: "addLineItem" })}
        >
          {!live.lineItems || live.lineItems.length === 0 ? (
            <div className="px-3 py-3 text-[13px] text-muted-foreground italic">No line items yet</div>
          ) : (() => {
            const items = live.lineItems;
            const maxDigits = Math.max(...items.map((li) => li.qty.toLocaleString().length), 3);
            const sumTotal = items.reduce(
              (n, li) => n + (typeof li.total === "number" ? li.total : 0),
              0,
            );
            const showSum = sumTotal > 0;
            const fmtMoney = (n: number) =>
              n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return (
              <>
                <ul>
                  {items.map((li, i) => (
                    <li key={i}>
                      <button
                        onClick={() => setEditor({ kind: "editLineItem", index: i })}
                        className="w-full flex items-center gap-3 px-3 py-3 text-left rounded-lg hover:bg-muted/40 transition-colors"
                        style={{ minHeight: 48 }}
                      >
                        <span
                          className="text-right tabular font-semibold text-foreground shrink-0"
                          style={{ width: `${maxDigits + 1}ch` }}
                        >
                          {li.qty.toLocaleString()}
                        </span>
                        <span className="text-muted-foreground/60">×</span>
                        <span className="text-foreground/90 leading-snug flex-1 min-w-0 break-words">
                          {li.description}
                        </span>
                        <span
                          className="tabular shrink-0 text-right text-[13px]"
                          style={{ minWidth: 64, color: "hsl(var(--brand-navy) / 0.65)" }}
                        >
                          {typeof li.unitPrice === "number" ? `$${fmtMoney(li.unitPrice)}` : "—"}
                        </span>
                        <span
                          className="tabular shrink-0 text-right text-[13px] font-semibold"
                          style={{ minWidth: 80, color: "hsl(var(--brand-navy))" }}
                        >
                          {typeof li.total === "number" ? `$${fmtMoney(li.total)}` : "—"}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div
                  className="px-3 py-2 text-right text-[12px] tabular border-t"
                  style={{
                    color: "hsl(var(--brand-navy) / 0.65)",
                    borderColor: "hsl(var(--brand-navy) / 0.10)",
                  }}
                >
                  {items.length} {items.length === 1 ? "item" : "items"}
                  {showSum && ` · $${fmtMoney(sumTotal)} BBD`}
                </div>
              </>
            );
          })()}
        </SectionWithAction>

        {/* ─── NOTES (append-only, auto-attributed) ─── */}
        <SectionWithAction
          label="Notes"
          actionLabel="Add"
          onAction={() => setEditor({ kind: "addNote" })}
        >
          {(() => {
            const userNotes = (live.notes ?? []).filter((n) => !n.auto);
            if (userNotes.length === 0) {
              return <div className="px-3 py-3 text-[13px] text-muted-foreground italic">No notes yet</div>;
            }
            return (
              <ul className="px-3 py-2 divide-y divide-border/40">
                {[...userNotes].reverse().map((n) => (
                  <li key={n.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-[13px] font-semibold" style={{ color: "hsl(var(--brand-navy))" }}>
                        {n.author}
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular">
                        {fmtNoteTs(n.ts)}
                      </span>
                    </div>
                    <div className="text-[13px] leading-snug text-foreground whitespace-pre-wrap">
                      {n.text}
                    </div>
                  </li>
                ))}
              </ul>
            );
          })()}
        </SectionWithAction>

        {/* ─── PROJECT INFO ─── */}
        <Section label="Project info">
          <InfoRow label="Contact" value={live.contactPerson}
            onClick={() => setEditor({ kind: "contact" })} />
          <SalesRepRow
            initials={parseInitials(live.pointPerson)}
            getTeam={md.getTeamByInitials}
            onClick={() => setEditor({ kind: "salesRep" })}
          />
          <InfoRow label="Amount"
            value={live.value ? `$${live.value.toLocaleString()} BBD` : undefined}
            onClick={() => setEditor({ kind: "amount" })} />
          <InfoRow label="Created" value={fmtLong(live.createdAt)} readOnly />
          <InfoRow label="Confirmed"
            value={confirmedAt ? fmtLong(confirmedAt) : undefined}
            onClick={() => setEditor({ kind: "confirmedDate" })} />
          <InfoRow label="Completed"
            value={completedAt ? fmtLong(completedAt) : undefined}
            readOnly />
        </Section>

        {/* ─── SHIPMENT (hidden for Local) ─── */}
        {showShipment && (
          <Section label="Shipment">
            <div className="px-3 py-2.5 text-[15px]" style={{ color: "hsl(var(--brand-navy))" }}>
              {formatShippingLabel(live.shippingMode, live.trackingRef ?? getShipment(live.shipmentId)?.code).text}
            </div>
            {live.shipmentId ? (
              <button
                onClick={() => onOpenShipment(live.shipmentId!)}
                className="mx-3 mt-1 inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
                style={{ color: "hsl(var(--brand-orange))", minHeight: 36 }}
              >
                View shipment <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <div className="px-3 pb-2 text-[12px] text-muted-foreground italic">
                Not yet assigned to a shipment
              </div>
            )}
          </Section>
        )}

        {/* ─── LOG (immutable audit trail — always last) ─── */}
        <LogSection entries={live.log ?? []} />

        <div className="h-10" />
      </aside>

      {/* ─── Editor sheets ─── */}
      <TextEditor
        open={editor?.kind === "contact"}
        onClose={() => setEditor(null)}
        title="Edit contact"
        value={live.contactPerson ?? ""}
        placeholder="Contact name"
        onSave={saveContact}
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
        open={editor?.kind === "confirmedDate"}
        onClose={() => setEditor(null)}
        title="Set confirmed date"
        value={confirmedAt ?? new Date()}
        onSave={saveConfirmedDate}
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
      <ProductLineItemEditor
        open={editor?.kind === "addLineItem"}
        onClose={() => setEditor(null)}
        title="Add line item"
        qty=""
        description=""
        onSave={(q, d, price) => {
          addLineItem(live.id, {
            qty: q,
            description: d,
            unitPrice: price,
            total: price !== undefined ? +(q * price).toFixed(2) : undefined,
          });
          setEditor(null);
        }}
      />
      <ProductLineItemEditor
        open={editor?.kind === "editLineItem"}
        onClose={() => setEditor(null)}
        title="Edit line item"
        qty={editor?.kind === "editLineItem" ? (live.lineItems?.[editor.index]?.qty ?? 0) : 0}
        description={editor?.kind === "editLineItem" ? (live.lineItems?.[editor.index]?.description ?? "") : ""}
        unitPrice={editor?.kind === "editLineItem" ? live.lineItems?.[editor.index]?.unitPrice : undefined}
        onSave={(q, d, price) => {
          if (editor?.kind !== "editLineItem") return;
          const existing = live.lineItems?.[editor.index];
          updateLineItem(live.id, editor.index, {
            ...existing,
            qty: q,
            description: d,
            unitPrice: price,
            total: price !== undefined ? +(q * price).toFixed(2) : undefined,
          });
          setEditor(null);
        }}
        onDelete={() => {
          if (editor?.kind !== "editLineItem") return;
          removeLineItem(live.id, editor.index);
          setEditor(null);
        }}
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

      {/* ─── Stage picker ─── */}
      <StagePicker
        open={stagePickerOpen}
        onClose={() => setStagePickerOpen(false)}
        title={live.projectName}
        subtitle={live.customer}
        current={{ pipeline: live.pipeline, stage: live.stage }}
        onPick={handleStagePick}
      />

      {/* ─── Confirm dialog (archive) ─── */}
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

// ─────────── Mini card (non-interactive replica of ProjectCard) ───────────
// Mirrors src/components/leads/ProjectCard.tsx layout exactly: same paddings,
// font sizes, colors, accent stripe, divider. No gestures, no menu, no taps.
interface MiniProjectCardProps {
  card: PipelineCard;
  live: PipelineCard["project"];
  supplierName?: string;
  accentHex: string;
}

const MiniProjectCard = ({ card, live, supplierName, accentHex }: MiniProjectCardProps) => {
  const supplierHint = live.supplierLabel;
  const supplierIsEmpty = !supplierName && !supplierHint;
  const supplierDisplay = supplierName ?? supplierHint ?? "Unassigned";

  const poText = live.poNumber;
  const qText = live.quoteNumber;
  const invText = live.invoiceNumber;

  const ship = getShipment(live.shipmentId);
  const shippingLabel = formatShippingLabel(
    live.shippingMode,
    live.trackingRef ?? ship?.code,
  );
  const u = getUrgency(card.deadlineDate);
  const urgencyHex =
    u.color === "hsl(var(--urgent))" ? "hsl(var(--urgent))"
    : u.color === "hsl(var(--brand-orange))" ? "hsl(var(--brand-orange))"
    : "hsl(var(--muted-foreground))";

  return (
    <div className="relative overflow-hidden rounded-2xl bg-card border border-border/70 shadow-[var(--shadow-card)]">
      {/* Pipeline accent stripe — matches ProjectCard (4px, 0.85 opacity) */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[4px]"
        style={{ backgroundColor: accentHex, opacity: 0.85 }}
      />

      <div className="pl-[18px] pr-[16px] pt-[16px] pb-[16px]">
        {/* Tier 1 + Tier 2 row */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3
              className="text-[18px] font-bold tracking-tight leading-tight"
              style={{ color: "hsl(var(--brand-navy))" }}
            >
              {live.customer}
            </h3>
            <p
              className="text-[15px] font-medium leading-snug mt-0.5"
              style={{ color: "hsl(var(--brand-navy))" }}
            >
              {live.projectName}
            </p>
            <p
              className="text-[13px] leading-snug mt-3 italic"
              style={{
                color: live.detailSummary?.trim()
                  ? "hsl(var(--brand-navy) / 0.70)"
                  : "hsl(var(--brand-navy) / 0.35)",
              }}
            >
              {live.detailSummary?.trim() ? live.detailSummary : "—"}
            </p>
          </div>

          {/* Right column — supplier + PO */}
          <div className="shrink-0 max-w-[45%] mt-0.5 flex flex-col items-end text-right">
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
              >
                {supplierDisplay}
              </span>
            </span>
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

        {/* Divider */}
        <div
          className="mt-5 mb-3 h-px w-full"
          style={{ backgroundColor: "hsl(var(--brand-navy) / 0.10)" }}
        />

        {/* Tier 3: Q-, INV- */}
        <div className="flex items-center gap-4 min-h-[16px] mb-2">
          <span
            className={cn("text-[12px] tabular leading-none", qText ? "" : "italic")}
            style={{ color: qText ? "hsl(var(--brand-navy) / 0.60)" : "hsl(var(--brand-navy) / 0.40)" }}
          >
            {qText ?? "Q-"}
          </span>
          <span
            className={cn("text-[12px] tabular leading-none", invText ? "" : "italic")}
            style={{ color: invText ? "hsl(var(--brand-navy) / 0.60)" : "hsl(var(--brand-navy) / 0.40)" }}
          >
            {invText ?? "INV-"}
          </span>
        </div>

        {/* Bottom row: shipping label · deadline */}
        <div className="flex items-center gap-3 min-h-[18px]">
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

          <span className="inline-flex items-center gap-2 leading-none shrink-0 ml-auto">
            <span
              className="text-[12px] font-medium tabular"
              style={{ color: "hsl(var(--brand-navy) / 0.65)" }}
            >
              {card.deadline}
            </span>
            <span style={{ color: "hsl(var(--brand-navy) / 0.30)" }}>·</span>
            <span className="text-[12px] font-semibold tabular" style={{ color: urgencyHex }}>
              {u.label}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};

// ─────────── Layout primitives ───────────
const LOG_DOT: Record<ProjectLogActionType, string> = {
  stage_change: "hsl(var(--brand-orange))",
  field_edit: "hsl(var(--muted-foreground))",
  flag_toggle: "hsl(var(--brand-orange))",
  note_added: "hsl(var(--brand-teal))",
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

const LogSection = ({ entries }: { entries: ProjectLogEntry[] }) => {
  const [expanded, setExpanded] = useState(false);
  if (!entries.length) return null;
  const sorted = [...entries].sort(
    (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()
  );
  const visible = expanded ? sorted : sorted.slice(0, 5);
  return (
    <Section label="Log">
      <ul className="px-3 space-y-2">
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
      {sorted.length > 5 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 px-3 text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          {expanded ? "Show less" : `Show ${sorted.length - 5} more`}
        </button>
      )}
    </Section>
  );
};

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <section className="px-3 sm:px-5 pt-6 pb-2 border-b border-border/60">
    <h2 className="px-3 text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium mb-1.5">{label}</h2>
    <div>{children}</div>
  </section>
);

const SectionWithAction = ({
  label, actionLabel, onAction, children,
}: { label: string; actionLabel: string; onAction: () => void; children: React.ReactNode }) => (
  <section className="px-3 sm:px-5 pt-6 pb-2 border-b border-border/60">
    <div className="px-3 mb-1.5 flex items-center justify-between">
      <h2 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">{label}</h2>
      <button
        onClick={onAction}
        className="inline-flex items-center gap-1 text-[12px] font-medium hover:underline"
        style={{ color: "hsl(var(--brand-orange))" }}
      >
        <Plus className="h-3.5 w-3.5" /> {actionLabel}
      </button>
    </div>
    <div>{children}</div>
  </section>
);

// Compact label/value row used by Project Info.
const InfoRow = ({
  label, value, onClick, readOnly,
}: { label: string; value?: string; onClick?: () => void; readOnly?: boolean }) => {
  const content = (
    <>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80 w-28 shrink-0">
        {label}
      </span>
      <span
        className={cn(
          "text-[14px] flex-1 min-w-0 truncate text-right",
          value ? "text-foreground" : "italic text-muted-foreground/50",
        )}
      >
        {value ?? "—"}
      </span>
      {!readOnly && onClick && (
        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--brand-navy) / 0.35)" }} />
      )}
    </>
  );
  if (readOnly || !onClick) {
    return (
      <div
        className="w-full flex items-center gap-3 px-3 py-2.5"
        style={{ minHeight: 40 }}
      >
        {content}
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg hover:bg-muted/40 transition-colors"
      style={{ minHeight: 40 }}
    >
      {content}
    </button>
  );
};

// ─────────── Sales rep row (chips) ───────────
const SalesRepRow = ({
  initials, getTeam, onClick,
}: {
  initials: string[];
  getTeam: (init: string) => { full_name: string } | undefined;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg hover:bg-muted/40 transition-colors"
    style={{ minHeight: 40 }}
  >
    <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80 w-28 shrink-0">
      Sales rep
    </span>
    <span className="flex-1 min-w-0 flex flex-wrap justify-end gap-1.5">
      {initials.length === 0 ? (
        <span className="text-[14px] italic text-muted-foreground/50">—</span>
      ) : (
        initials.map((init) => {
          const t = getTeam(init);
          return (
            <span
              key={init}
              title={t?.full_name ?? init}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-semibold tracking-wide"
              style={{
                background: "hsl(var(--brand-navy) / 0.1)",
                color: "hsl(var(--brand-navy))",
              }}
            >
              {init}
            </span>
          );
        })
      )}
    </span>
    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--brand-navy) / 0.35)" }} />
  </button>
);

// ─────────── Line item editor (free text — qty + description + optional unit price) ───────────
// NOTE: Intentionally NO product picker / autocomplete / master-data lookup
// in this phase. The Products master list will land in a later phase; until
// then, line items are pure free text per project. The data model already
// carries an optional `productId` so future items can reference the master
// list without breaking existing free-text rows.
interface LineItemEditorProps {
  open: boolean;
  onClose: () => void;
  title: string;
  qty: number | "";
  description: string;
  unitPrice?: number;
  onSave: (qty: number, description: string, unitPrice?: number) => void;
  onDelete?: () => void;
}

const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ProductLineItemEditor = ({
  open, onClose, title, qty, description, unitPrice, onSave, onDelete,
}: LineItemEditorProps) => {
  const [q, setQ] = useState<string>(String(qty ?? ""));
  const [d, setD] = useState(description);
  const [price, setPrice] = useState<string>(unitPrice != null ? String(unitPrice) : "");

  useEffect(() => {
    if (open) {
      setQ(String(qty ?? ""));
      setD(description);
      setPrice(unitPrice != null ? String(unitPrice) : "");
    }
  }, [open, qty, description, unitPrice]);

  const qNum = Number(q);
  const priceNum = price.trim() === "" ? undefined : Number(price);
  const priceValid = priceNum === undefined || (!Number.isNaN(priceNum) && priceNum >= 0);
  const valid = qNum > 0 && d.trim().length > 0 && priceValid;

  const computedTotal =
    priceNum !== undefined && qNum > 0 ? qNum * priceNum : undefined;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      onSave={() => valid && onSave(qNum, d.trim(), priceNum)}
      saveDisabled={!valid}
    >
      <div className="space-y-3">
        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">
            Quantity
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            placeholder="0"
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] tabular focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
            style={{ minHeight: 48 }}
            autoFocus
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">
            Description
          </label>
          <input
            value={d}
            onChange={(e) => setD(e.target.value)}
            placeholder="e.g. Branded Coolers 60L"
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
            style={{ minHeight: 48 }}
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">
            Unit price <span className="normal-case tracking-normal text-muted-foreground/70">(BBD, optional)</span>
          </label>
          <div className="relative">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] tabular pointer-events-none"
              style={{ color: "hsl(var(--brand-navy) / 0.55)" }}
            >
              $
            </span>
            <input
              value={price}
              onChange={(e) => {
                // Allow digits + single decimal point
                const v = e.target.value.replace(/[^\d.]/g, "");
                const parts = v.split(".");
                const cleaned = parts.length > 1
                  ? `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`
                  : v;
                setPrice(cleaned);
              }}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full rounded-xl border border-border bg-card pl-7 pr-3 py-2.5 text-[15px] tabular focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
              style={{ minHeight: 48 }}
            />
          </div>
          <div
            className="mt-2 flex items-center justify-between text-[12px]"
            style={{ color: "hsl(var(--brand-navy) / 0.65)" }}
          >
            <span className="uppercase tracking-[0.16em] text-muted-foreground/80">Total</span>
            <span className="tabular font-semibold" style={{ color: "hsl(var(--brand-navy))" }}>
              {computedTotal !== undefined ? `$${fmtMoney(computedTotal)}` : "—"}
            </span>
          </div>
        </div>
        {onDelete && (
          <button
            onClick={onDelete}
            className="w-full mt-2 px-3.5 py-3 rounded-xl border text-sm font-medium hover:bg-muted/40 transition-colors"
            style={{ borderColor: "hsl(var(--urgent) / 0.4)", color: "hsl(var(--urgent))", minHeight: 48 }}
          >
            Delete item
          </button>
        )}
      </div>
    </BottomSheet>
  );
};

