import { ArrowLeft, MoreVertical, Factory, ChevronRight, Plus, Move, UserCog, Copy, Archive, Trash2 } from "lucide-react";
import {
  PipelineCard, PIPELINES, PipelineId, StageId, ShippingMode, SalesShippingLabel,
  SupplierLabelHint,
} from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePipelineStore, getStageTitle } from "@/hooks/usePipelineStore";
import {
  TextEditor, DateEditor, ListPicker, SupplierPicker, LineItemEditor, ListOption,
} from "./EditorSheets";
import { ActionSheet } from "./ActionSheet";
import { ConfirmDialog } from "./ConfirmDialog";
import { StagePicker } from "./StagePicker";

interface Props {
  card: PipelineCard | null;
  onClose: () => void;
  onOpenShipment: (id: string) => void;
  onAdvance?: (card: PipelineCard) => void;
  onOpenPicker?: (card: PipelineCard) => void;
}

const TODAY = new Date(2026, 4, 8);
function getUrgency(date: Date) {
  const diff = Math.ceil((date.getTime() - TODAY.getTime()) / 86400000);
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, color: "hsl(var(--urgent))" };
  if (diff <= 7) return { label: `in ${diff}d`,                color: "hsl(var(--urgent))" };
  if (diff <= 14) return { label: `in ${diff}d`,               color: "hsl(var(--brand-orange))" };
  return { label: `in ${diff}d`, color: "hsl(var(--muted-foreground))" };
}

const fmtDate = (d: Date) => `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })}`;

type EditorKind =
  | { kind: "contact" }
  | { kind: "projectName" }
  | { kind: "detailSummary" }
  | { kind: "deadline" }
  | { kind: "quote" }
  | { kind: "po" }
  | { kind: "invoice" }
  | { kind: "supplier" }
  | { kind: "shippingMode" }
  | { kind: "trackingRef" }
  | { kind: "addNote" }
  | { kind: "addLineItem" }
  | { kind: "editLineItem"; index: number }
  | null;

const SHIPPING_MODE_OPTIONS: ListOption[] = [
  { id: "Air",   label: "Air" },
  { id: "Ocean", label: "Ocean" },
  { id: "Local", label: "Local" },
];

// Canonical shipping display: "Air · DHL-373747" / "Ocean · FCL-125" / "Local"
function shippingDisplay(p: { shippingMode?: ShippingMode; salesShippingLabel?: SalesShippingLabel; trackingRef?: string }) {
  if (!p.shippingMode) return { label: p.salesShippingLabel, ref: p.trackingRef };
  if (p.shippingMode === "Local") return { label: "Local" as string, ref: undefined };
  const ref = p.trackingRef?.trim();
  return { label: ref ? `${p.shippingMode} · ${ref.toUpperCase()}` : `${p.shippingMode} · —`, ref };
}

export const ProjectDetail = ({ card, onClose, onOpenShipment }: Props) => {
  const store = usePipelineStore();
  const {
    projects, suppliers,
    updateProject, renameProject, addNote,
    addLineItem, updateLineItem, removeLineItem,
    duplicateProject, deleteProject, addSupplier, moveCard,
    isQuoteNumberDuplicate, isPONumberDuplicate, isInvoiceNumberDuplicate,
    triggerPulse,
  } = store;

  const [editor, setEditor] = useState<EditorKind>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [stagePickerOpen, setStagePickerOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | {
    title: string; description: string; confirmLabel: string; destructive?: boolean; onConfirm: () => void;
  }>(null);
  const [deleteText, setDeleteText] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [refWarning, setRefWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, onClose]);

  // Re-derive the live project from the store so edits reflect immediately.
  const live = useMemo(() => card ? projects.find((p) => p.id === card.id) ?? null : null, [card, projects]);

  if (!card || !live) return null;

  const pipeline = PIPELINES.find((p) => p.id === live.pipeline)!;
  const stageTitle = pipeline.stages.find((s) => s.id === live.stage)?.title ?? live.stage;
  const accentHex = PIPELINE_ACCENT[live.pipeline].hex;
  const u = getUrgency(live.deadlineDate);
  const supplier = suppliers.find((s) => s.id === live.supplierId);
  const shipping = shippingDisplay(live);

  // ─── Stage open ───
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

  // ─── Save handlers ───
  const saveContact = (v: string) => { updateProject(live.id, { contactPerson: v }); setEditor(null); };

  const saveProjectName = (v: string) => {
    if (v === live.projectName) { setEditor(null); return; }
    const peers = projects.filter((p) => p.projectName === live.projectName).length;
    setEditor(null);
    if (peers > 1) {
      setConfirm({
        title: "Rename across all cards?",
        description: `This will rename the project on ${peers} cards that share "${live.projectName}". Continue?`,
        confirmLabel: "Rename",
        onConfirm: () => {
          const { count } = renameProject(live.projectName, v);
          toast.success(`Renamed on ${count} card${count === 1 ? "" : "s"}`);
          setConfirm(null);
        },
      });
    } else {
      renameProject(live.projectName, v);
      toast.success("Project renamed");
    }
  };

  const saveDetailSummary = (v: string) => { updateProject(live.id, { detailSummary: v }); setEditor(null); };
  const saveDeadline = (d: Date) => { updateProject(live.id, { deadlineDate: d, deadline: fmtDate(d) }); setEditor(null); };

  const saveReference = (kind: "quote" | "po" | "invoice", raw: string) => {
    const prefix = kind === "quote" ? "Q-" : kind === "po" ? "PO-" : "INV-";
    const stripped = raw.replace(/^Q-|^PO-|^INV-/i, "");
    const formatted = `${prefix}${stripped}`;
    const dup =
      kind === "quote" ? isQuoteNumberDuplicate(formatted, live.id)
      : kind === "po" ? isPONumberDuplicate(formatted, live.id)
      : isInvoiceNumberDuplicate(formatted, live.id);
    if (dup && !refWarning) {
      setRefWarning(`This ${prefix.replace("-", "")}-number already exists on another project. Tap Done again to use it anyway.`);
      return;
    }
    setRefWarning(null);
    if (kind === "quote") updateProject(live.id, { quoteNumber: formatted });
    if (kind === "po") updateProject(live.id, { poNumber: formatted });
    if (kind === "invoice") updateProject(live.id, { invoiceNumber: formatted });
    setEditor(null);
  };

  const saveTrackingRef = (v: string) => { updateProject(live.id, { trackingRef: v }); setEditor(null); };

  const handlePickSupplier = (id: string) => {
    updateProject(live.id, { supplierId: id, supplierLabel: undefined });
    setEditor(null);
  };
  const handlePickHint = (h: SupplierLabelHint) => {
    updateProject(live.id, { supplierLabel: h, supplierId: undefined });
    setEditor(null);
  };

  const handlePickShippingMode = (id: string) => {
    // Map the picker id to either ShippingMode or SalesShippingLabel + canonical mode
    const patch: Partial<typeof live> = {};
    if (id === "Ocean FCL") { patch.shippingMode = "Ocean FCL"; patch.salesShippingLabel = "Ocean FCL"; }
    else if (id === "Ocean LCL") { patch.shippingMode = "Ocean LCL"; patch.salesShippingLabel = "Ocean LCL"; }
    else if (id === "DHL") { patch.shippingMode = "Air"; patch.salesShippingLabel = "DHL"; }
    else if (id === "FedEx") { patch.shippingMode = "Air"; patch.salesShippingLabel = "FedEx"; }
    else { patch.salesShippingLabel = id as SalesShippingLabel; patch.shippingMode = undefined; }
    updateProject(live.id, patch);
    setEditor(null);
  };

  const submitNote = (text: string) => { addNote(live.id, text); setEditor(null); };

  // ─── Render ───
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-foreground/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <aside className="w-full max-w-2xl bg-background border-l border-border shadow-2xl overflow-y-auto animate-slide-in-right">
        {/* Top bar: back + customer + ⋮ */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border px-5 py-3 flex items-center justify-between">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight hover:opacity-80 transition-opacity"
            style={{ color: "hsl(var(--brand-navy))" }}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="truncate max-w-[60vw]">{live.customer}</span>
          </button>
          <button
            onClick={() => setActionsOpen(true)}
            className="p-2 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
            aria-label="Project actions"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>

        {/* Pipeline accent stripe */}
        <div className="h-[3px] w-full" style={{ backgroundColor: accentHex }} />

        {/* Identity header — display only */}
        <header className="px-6 sm:px-8 pt-6 pb-7 border-b border-border/60">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-2">
            {live.pointPerson}
          </div>
          <h1
            className="font-display text-3xl sm:text-4xl tracking-tight leading-tight mb-1.5"
            style={{ color: "hsl(var(--brand-navy))", letterSpacing: "-0.01em" }}
          >
            {live.customer}
          </h1>
          <p className="text-[18px] sm:text-[19px] font-medium leading-snug" style={{ color: "hsl(var(--brand-navy))" }}>
            {live.projectName}
          </p>
          {live.detailSummary && (
            <p className="text-[15px] text-muted-foreground leading-relaxed mt-1.5">{live.detailSummary}</p>
          )}
        </header>

        {/* CUSTOMER */}
        <Section label="Customer">
          <RowDisabled
            value={live.customer}
            hint="Customer comes from the master list — use Reassign customer to change."
          />
          <RowEditable
            label="Contact"
            value={live.contactPerson}
            placeholder="Add contact"
            onClick={() => setEditor({ kind: "contact" })}
          />
        </Section>

        {/* PROJECT */}
        <Section label="Project">
          <RowEditable value={live.projectName} onClick={() => setEditor({ kind: "projectName" })} />
          <RowEditable
            value={live.detailSummary}
            placeholder="Add detail summary"
            onClick={() => setEditor({ kind: "detailSummary" })}
          />
        </Section>

        {/* STAGE & DEADLINE */}
        <Section label="Stage">
          <RowClickable onClick={openStagePicker}>
            <span className="inline-flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentHex }} />
              <span>{pipeline.title} · {stageTitle}</span>
            </span>
          </RowClickable>
        </Section>
        <Section label="Deadline">
          <RowClickable onClick={() => setEditor({ kind: "deadline" })}>
            <span className="tabular">
              {live.deadline}
              <span className="text-muted-foreground/40 mx-2">·</span>
              <span className="font-semibold" style={{ color: u.color }}>{u.label}</span>
            </span>
          </RowClickable>
        </Section>

        {/* REFERENCES */}
        <Section label="References">
          <RefRow label="Quote"   value={live.quoteNumber}   placeholder="Q-"   onClick={() => { setRefWarning(null); setEditor({ kind: "quote" }); }} />
          <RefRow label="PO"      value={live.poNumber}      placeholder="PO-"  onClick={() => { setRefWarning(null); setEditor({ kind: "po" }); }} />
          <RefRow label="Invoice" value={live.invoiceNumber} placeholder="INV-" onClick={() => { setRefWarning(null); setEditor({ kind: "invoice" }); }} />
        </Section>

        {/* SUPPLIER */}
        <Section label="Supplier">
          <RowClickable onClick={() => setEditor({ kind: "supplier" })}>
            <span className="inline-flex items-center gap-2">
              <Factory className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--brand-navy) / 0.6)" }} />
              {supplier ? (
                <span>{supplier.name}</span>
              ) : live.supplierLabel ? (
                <span className="italic text-muted-foreground">{live.supplierLabel}</span>
              ) : (
                <span className="italic text-muted-foreground">Not yet assigned</span>
              )}
            </span>
          </RowClickable>
        </Section>

        {/* SHIPPING */}
        <Section label="Shipping">
          <RowClickable onClick={() => setEditor({ kind: "shippingMode" })}>
            {shipping.label ? (
              <span>{shipping.label}</span>
            ) : (
              <span className="italic text-muted-foreground">Not yet decided</span>
            )}
          </RowClickable>
          <RowClickable onClick={() => setEditor({ kind: "trackingRef" })}>
            <span className="text-[13px]">
              <span className="text-muted-foreground/70 mr-2">Tracking ref:</span>
              {live.trackingRef ? <span className="tabular">{live.trackingRef}</span> : <span className="text-muted-foreground/50">—</span>}
            </span>
          </RowClickable>
          {live.shipmentId && (
            <button
              onClick={() => onOpenShipment(live.shipmentId!)}
              className="ml-3 mt-1 text-xs underline text-muted-foreground hover:text-foreground"
            >
              Open shipment
            </button>
          )}
        </Section>

        {/* LINE ITEMS */}
        <SectionWithAction
          label="Line items"
          actionLabel="Add"
          onAction={() => setEditor({ kind: "addLineItem" })}
        >
          {!live.lineItems || live.lineItems.length === 0 ? (
            <div className="px-3 py-3 text-[13px] text-muted-foreground italic">No items yet</div>
          ) : (() => {
            const maxDigits = Math.max(...live.lineItems.map((li) => li.qty.toLocaleString().length), 3);
            return (
              <ul>
                {live.lineItems.map((li, i) => (
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
                      <span className="text-foreground/90 leading-snug flex-1">{li.description}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            );
          })()}
        </SectionWithAction>

        {/* NOTES & HISTORY */}
        <SectionWithAction
          label="Notes & history"
          actionLabel="Add"
          onAction={() => setEditor({ kind: "addNote" })}
        >
          {!live.notes || live.notes.length === 0 ? (
            <div className="px-3 py-3 text-[13px] text-muted-foreground italic">No notes yet</div>
          ) : (
            <ul className="space-y-2 px-3 py-2">
              {[...live.notes].reverse().map((n) => (
                <li key={n.id} className="text-[13px] leading-snug">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">
                    {n.author} · {fmtDate(n.ts)}
                  </div>
                  <div className={cn("text-foreground", n.auto && "italic text-muted-foreground")}>{n.text}</div>
                </li>
              ))}
            </ul>
          )}
        </SectionWithAction>

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
      <TextEditor
        open={editor?.kind === "projectName"}
        onClose={() => setEditor(null)}
        title="Edit project name"
        value={live.projectName}
        onSave={saveProjectName}
      />
      <TextEditor
        open={editor?.kind === "detailSummary"}
        onClose={() => setEditor(null)}
        title="Edit detail summary"
        value={live.detailSummary ?? ""}
        placeholder="Short description of this card"
        multiline
        onSave={saveDetailSummary}
      />
      <DateEditor
        open={editor?.kind === "deadline"}
        onClose={() => setEditor(null)}
        title="Pick deadline"
        value={live.deadlineDate}
        onSave={saveDeadline}
      />
      <TextEditor
        open={editor?.kind === "quote"}
        onClose={() => { setEditor(null); setRefWarning(null); }}
        title="Edit Quote number"
        value={(live.quoteNumber ?? "Q-").replace(/^Q-/, "")}
        placeholder="2046"
        warning={refWarning}
        onSave={(v) => saveReference("quote", v)}
      />
      <TextEditor
        open={editor?.kind === "po"}
        onClose={() => { setEditor(null); setRefWarning(null); }}
        title="Edit PO number"
        value={(live.poNumber ?? "PO-").replace(/^PO-/, "")}
        placeholder="1082"
        warning={refWarning}
        onSave={(v) => saveReference("po", v)}
      />
      <TextEditor
        open={editor?.kind === "invoice"}
        onClose={() => { setEditor(null); setRefWarning(null); }}
        title="Edit Invoice number"
        value={(live.invoiceNumber ?? "INV-").replace(/^INV-/, "")}
        placeholder="1047"
        warning={refWarning}
        onSave={(v) => saveReference("invoice", v)}
      />
      <SupplierPicker
        open={editor?.kind === "supplier"}
        onClose={() => setEditor(null)}
        suppliers={suppliers}
        selectedId={live.supplierId}
        selectedHint={live.supplierLabel}
        onPickSupplier={handlePickSupplier}
        onPickHint={handlePickHint}
        onAddSupplier={addSupplier}
      />
      <ListPicker
        open={editor?.kind === "shippingMode"}
        onClose={() => setEditor(null)}
        title="Pick shipping mode"
        options={SHIPPING_MODE_OPTIONS}
        selectedId={live.salesShippingLabel}
        onPick={handlePickShippingMode}
      />
      <TextEditor
        open={editor?.kind === "trackingRef"}
        onClose={() => setEditor(null)}
        title="Edit tracking ref"
        value={live.trackingRef ?? (live.shippingMode === "Ocean FCL" ? "FCL-" : live.shippingMode === "Ocean LCL" ? "LCL-" : "")}
        placeholder="FCL-125 / 4523891076"
        onSave={saveTrackingRef}
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
      <LineItemEditor
        open={editor?.kind === "addLineItem"}
        onClose={() => setEditor(null)}
        title="Add line item"
        qty=""
        description=""
        onSave={(q, d) => { addLineItem(live.id, { qty: q, description: d }); setEditor(null); }}
      />
      <LineItemEditor
        open={editor?.kind === "editLineItem"}
        onClose={() => setEditor(null)}
        title="Edit line item"
        qty={editor?.kind === "editLineItem" ? (live.lineItems?.[editor.index]?.qty ?? 0) : 0}
        description={editor?.kind === "editLineItem" ? (live.lineItems?.[editor.index]?.description ?? "") : ""}
        onSave={(q, d) => {
          if (editor?.kind !== "editLineItem") return;
          updateLineItem(live.id, editor.index, { qty: q, description: d });
          setEditor(null);
        }}
        onDelete={() => {
          if (editor?.kind !== "editLineItem") return;
          removeLineItem(live.id, editor.index);
          setEditor(null);
        }}
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

      {/* ─── Three-dots action sheet ─── */}
      <ActionSheet
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        title={live.projectName}
        items={[
          { id: "move", label: "Move to stage…", icon: Move, onClick: () => { setActionsOpen(false); setStagePickerOpen(true); } },
          { id: "reassign", label: "Reassign customer", icon: UserCog, disabled: true, hint: "Coming soon" },
          {
            id: "duplicate", label: "Duplicate project", icon: Copy,
            onClick: () => {
              setActionsOpen(false);
              const copy = duplicateProject(live.id);
              if (copy) toast.success("Project duplicated", { description: "New card created in Sales / Proposal." });
            },
          },
          {
            id: "archive", label: "Archive", icon: Archive,
            onClick: () => {
              setActionsOpen(false);
              setConfirm({
                title: "Archive this project?",
                description: "Archive holds closed-but-not-deleted projects. You can move it back later.",
                confirmLabel: "Archive",
                onConfirm: () => {
                  moveCard(live.id, { pipeline: "sales", stage: "archive" });
                  toast.success("Archived");
                  setConfirm(null);
                },
              });
            },
          },
          {
            id: "delete", label: "Delete project", icon: Trash2, destructive: true,
            onClick: () => { setActionsOpen(false); setDeleteText(""); setDeleteOpen(true); },
          },
        ]}
      />

      {/* ─── Confirm dialog (rename, archive) ─── */}
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

      {/* ─── Delete project (typed confirmation) ─── */}
      {deleteOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setDeleteOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-card shadow-[var(--shadow-section)] border p-5 sm:p-6 animate-fade-in"
               style={{ borderColor: "hsl(var(--urgent) / 0.3)" }}>
            <h3 className="text-lg font-semibold tracking-tight" style={{ color: "hsl(var(--brand-navy))" }}>Delete this project?</h3>
            <p className="mt-1 text-sm text-foreground/80 leading-snug">
              This permanently removes "{live.customer} · {live.projectName}". To confirm, type <span className="font-semibold">DELETE</span> below.
            </p>
            <input
              autoFocus
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              className="mt-4 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--urgent)/0.4)]"
              style={{ minHeight: 48 }}
            />
            <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button onClick={() => setDeleteOpen(false)}
                className="px-4 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted/40 transition-colors"
                style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: 48 }}>
                Cancel
              </button>
              <button
                disabled={deleteText !== "DELETE"}
                onClick={() => {
                  deleteProject(live.id);
                  setDeleteOpen(false);
                  onClose();
                  toast.success("Project deleted");
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40"
                style={{ backgroundColor: "hsl(var(--urgent))", minHeight: 48 }}
              >
                Delete forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────── Layout primitives ───────────
const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <section className="px-3 sm:px-5 pt-5 pb-2 border-b border-border/60">
    <h2 className="px-3 text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium mb-1.5">{label}</h2>
    <div>{children}</div>
  </section>
);

const SectionWithAction = ({
  label, actionLabel, onAction, children,
}: { label: string; actionLabel: string; onAction: () => void; children: React.ReactNode }) => (
  <section className="px-3 sm:px-5 pt-5 pb-2 border-b border-border/60">
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

const RowClickable = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left rounded-lg hover:bg-muted/40 transition-colors"
    style={{ minHeight: 48 }}
  >
    <div className="text-[15px] text-foreground min-w-0 flex-1">{children}</div>
    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--brand-navy) / 0.45)" }} />
  </button>
);

const RowEditable = ({
  label, value, placeholder, onClick,
}: { label?: string; value?: string; placeholder?: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left rounded-lg hover:bg-muted/40 transition-colors"
    style={{ minHeight: 48 }}
  >
    <div className="min-w-0 flex-1">
      {label && <div className="text-[11px] text-muted-foreground/70 mb-0.5">{label}</div>}
      {value ? (
        <div className="text-[15px] text-foreground truncate">{value}</div>
      ) : (
        <div className="text-[15px] text-muted-foreground/55 italic truncate">{placeholder ?? "—"}</div>
      )}
    </div>
    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--brand-navy) / 0.45)" }} />
  </button>
);

const RowDisabled = ({ value, hint }: { value: string; hint?: string }) => {
  const [showHint, setShowHint] = useState(false);
  return (
    <div
      className="px-3 py-3 cursor-not-allowed select-none"
      onClick={() => { setShowHint(true); setTimeout(() => setShowHint(false), 2200); }}
      style={{ minHeight: 48 }}
    >
      <div className="text-[15px] text-foreground">{value}</div>
      {showHint && hint && (
        <div className="mt-1 text-[11px] text-muted-foreground italic">{hint}</div>
      )}
    </div>
  );
};

const RefRow = ({
  label, value, placeholder, onClick,
}: { label: string; value?: string; placeholder: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left rounded-lg hover:bg-muted/40 transition-colors"
    style={{ minHeight: 48 }}
  >
    <div className="flex items-center gap-4 min-w-0 flex-1">
      <span className="text-[12px] uppercase tracking-wider text-muted-foreground/70 w-16 shrink-0">{label}</span>
      <span className={cn("text-[15px] tabular truncate", !value && "text-muted-foreground/45 italic")}>
        {value ?? placeholder}
      </span>
    </div>
    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--brand-navy) / 0.45)" }} />
  </button>
);
