import { useEffect, useRef, useState } from "react";
import { Lock, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { PipelineCard, ShippingMode } from "@/data/pipelines";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { TextEditor, DateEditor, ListPicker, TrackingEditor, ListOption } from "./EditorSheets";
import { EntityPicker } from "./EntityPicker";
import { ConfirmDialog } from "./ConfirmDialog";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { useMasterData } from "@/hooks/useMasterData";

// ─── Permission scaffolding (future: per-role) ──────────────────────────
// Customer is ALWAYS locked. Other flags are placeholders for role wiring.
const PERMS = {
  canEditCustomer: false,
  canEditQuote: true,
  canEditPO: true,
  canEditInvoice: true,
  canEditDeadline: true,
  canEditProjectName: true,
  canEditDetail: true,
  canEditSupplier: true,
  canEditShipping: true,
  canEditTracking: true,
  canEditEtdEta: true,
};

interface CardEditOverlayProps {
  card: PipelineCard;
  onExit: () => void;
}

type FieldKey =
  | "customer" | "projectName" | "detail" | "quote" | "po" | "invoice"
  | "supplier" | "shipping" | "tracking" | "deadline" | "etd" | "eta";

const fmtDate = (d: Date) => `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })}`;

export const CardEditOverlay = ({ card, onExit }: CardEditOverlayProps) => {
  const store = usePipelineStore();
  const md = useMasterData();
  const proj = card.project;
  const ship = store.shipments.find((s) => s.id === proj.shipmentId);
  const accent = PIPELINE_ACCENT[card.pipeline].hex;

  // Sub-editor state
  const [editing, setEditing] = useState<FieldKey | null>(null);
  const [lockedTip, setLockedTip] = useState<FieldKey | null>(null);
  const [renameConfirm, setRenameConfirm] = useState<{ next: string; count: number } | null>(null);
  const [supplierConfirm, setSupplierConfirm] = useState<{ supplierId: string } | null>(null);
  const pointerTapHandled = useRef(false);

  // Auto-dismiss locked-field tooltip after 2.4s
  useEffect(() => {
    if (!lockedTip) return;
    const t = window.setTimeout(() => setLockedTip(null), 2400);
    return () => window.clearTimeout(t);
  }, [lockedTip]);

  const undoToast = (msg: string, prevPatch: () => void) => {
    toast.success(msg, {
      duration: 5000,
      action: { label: "Undo", onClick: () => { prevPatch(); toast("Reverted", { duration: 1800 }); } },
    });
  };

  // ── Commit helpers ──────────────────────────────────────────────────────
  const commitText = (key: FieldKey, value: string) => {
    if (key === "projectName") {
      const trimmed = value.trim();
      if (!trimmed || trimmed === proj.projectName) { setEditing(null); return; }
      const count = store.projects.filter((p) => p.projectName === proj.projectName).length;
      if (count > 1) {
        setEditing(null);
        setRenameConfirm({ next: trimmed, count });
        return;
      }
      const prevName = proj.projectName;
      store.updateProject(proj.id, { projectName: trimmed });
      setEditing(null);
      undoToast(`Project renamed to "${trimmed}"`, () => store.updateProject(proj.id, { projectName: prevName }));
      return;
    }
    if (key === "detail") {
      const prev = proj.detailSummary ?? "";
      store.updateProject(proj.id, { detailSummary: value });
      setEditing(null);
      undoToast("Detail updated", () => store.updateProject(proj.id, { detailSummary: prev }));
      return;
    }
    if (key === "quote") {
      const v = value.trim() || undefined;
      if (v && store.isQuoteNumberDuplicate(v, proj.id)) {
        toast.error(`Quote ${v} is already in use`);
        return;
      }
      const prev = proj.quoteNumber;
      store.updateProject(proj.id, { quoteNumber: v });
      setEditing(null);
      undoToast(`Quote updated to ${v ?? "—"}`, () => store.updateProject(proj.id, { quoteNumber: prev }));
      return;
    }
    if (key === "po") {
      const v = value.trim() || undefined;
      if (v && store.isPONumberDuplicate(v, proj.id)) {
        toast.error(`PO ${v} is already in use`);
        return;
      }
      const prev = proj.poNumber;
      store.updateProject(proj.id, { poNumber: v });
      setEditing(null);
      undoToast(`PO updated to ${v ?? "—"}`, () => store.updateProject(proj.id, { poNumber: prev }));
      return;
    }
    if (key === "invoice") {
      const v = value.trim() || undefined;
      if (v && store.isInvoiceNumberDuplicate(v, proj.id)) {
        toast.error(`Invoice ${v} is already in use`);
        return;
      }
      const prev = proj.invoiceNumber;
      store.updateProject(proj.id, { invoiceNumber: v });
      setEditing(null);
      undoToast(`Invoice updated to ${v ?? "—"}`, () => store.updateProject(proj.id, { invoiceNumber: prev }));
      return;
    }
    if (key === "tracking") {
      const v = value.trim() || undefined;
      const prev = proj.trackingRef;
      store.updateProject(proj.id, { trackingRef: v });
      setEditing(null);
      undoToast(`Tracking updated`, () => store.updateProject(proj.id, { trackingRef: prev }));
      return;
    }
  };

  const commitDate = (key: FieldKey, d: Date) => {
    if (key === "deadline") {
      const prev = { date: proj.deadlineDate, label: proj.deadline };
      store.updateProject(proj.id, { deadlineDate: d, deadline: fmtDate(d) });
      setEditing(null);
      undoToast(`Deadline → ${fmtDate(d)}`, () =>
        store.updateProject(proj.id, { deadlineDate: prev.date, deadline: prev.label }));
      return;
    }
    if ((key === "etd" || key === "eta") && ship) {
      const prev = key === "etd" ? ship.etd : ship.eta;
      store.updateShipment(ship.id, key === "etd" ? { etd: d } : { eta: d });
      setEditing(null);
      undoToast(`${key.toUpperCase()} → ${fmtDate(d)}`, () =>
        store.updateShipment(ship.id, key === "etd" ? { etd: prev } : { eta: prev }));
    }
  };

  const pickSupplier = (supplierId: string) => {
    const hasItems = (proj.lineItems?.length ?? 0) > 0 || !!proj.poNumber;
    if (hasItems && proj.supplierId && supplierId !== proj.supplierId && (card.pipeline === "purchasing" || card.pipeline === "production" || card.pipeline === "operations")) {
      setEditing(null);
      setSupplierConfirm({ supplierId });
      return;
    }
    const prev = proj.supplierId;
    const sup = md.getSupplierByAnyId(supplierId);
    store.updateProject(proj.id, { supplierId, supplierLabel: undefined });
    setEditing(null);
    undoToast(`Supplier → ${sup?.name ?? supplierId}`, () => store.updateProject(proj.id, { supplierId: prev }));
  };

  const pickSupplierMeta = (meta: string) => {
    const prev = { id: proj.supplierId, hint: proj.supplierLabel };
    // Only TBD / Various are stored as labels; Unassigned clears both.
    const hint = meta === "Unassigned" ? undefined : (meta as "TBD" | "Various");
    store.updateProject(proj.id, { supplierId: undefined, supplierLabel: hint });
    setEditing(null);
    undoToast(`Supplier → ${hint ?? "Unassigned"}`, () =>
      store.updateProject(proj.id, { supplierId: prev.id, supplierLabel: prev.hint }));
  };

  const pickShipping = (mode: ShippingMode) => {
    const prev = { mode: proj.shippingMode, ref: proj.trackingRef };
    const patch: Partial<typeof proj> = { shippingMode: mode };
    if (mode === "Local") patch.trackingRef = undefined;
    store.updateProject(proj.id, patch);
    setEditing(null);
    undoToast(`Shipping → ${mode}`, () => store.updateProject(proj.id, { shippingMode: prev.mode, trackingRef: prev.ref }));
  };

  // ── Field row component ────────────────────────────────────────────────
  const FieldRow = ({
    label, value, placeholder, onTap, locked, fieldKey,
  }: {
    label: string;
    value: React.ReactNode;
    placeholder?: boolean;
    onTap: () => void;
    locked?: boolean;
    fieldKey: FieldKey;
  }) => {
    const showTip = lockedTip === fieldKey;
    return (
      <div className="relative">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => {
            e.stopPropagation();
            pointerTapHandled.current = true;
            onTap();
            window.setTimeout(() => { pointerTapHandled.current = false; }, 0);
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (!pointerTapHandled.current) onTap();
          }}
          className={cn(
            "w-full flex items-start gap-2 px-3 py-2.5 rounded-lg text-left transition-all border-2",
            locked
              ? "bg-muted/40 border-dashed border-border cursor-not-allowed"
              : "bg-white hover:bg-[hsl(41_50%_98%)] hover:border-[hsl(var(--brand-navy)/0.55)] active:scale-[0.99]",
          )}
          style={{
            borderColor: locked ? undefined : "hsl(var(--brand-navy) / 0.35)",
            minHeight: 52,
          }}
        >
          <div className="flex-1 min-w-0">
            <div className={cn(
              "text-[10px] uppercase tracking-[0.18em] font-medium",
              locked ? "text-muted-foreground/70" : "text-[hsl(var(--brand-navy)/0.7)]",
            )}>{label}</div>
            <div className={cn(
              "text-[14px] leading-tight mt-0.5 truncate",
              placeholder ? "italic text-muted-foreground/60" : locked ? "text-muted-foreground" : "text-foreground font-medium",
            )}>
              {value}
            </div>
          </div>
          {locked
            ? <Lock className="h-4 w-4 mt-1 shrink-0 text-muted-foreground/70" />
            : <PencilLine className="h-4 w-4 mt-1.5 shrink-0" style={{ color: "hsl(var(--brand-orange))" }} />}
        </button>
        {showTip && (
          <div
            className="absolute z-10 right-2 -bottom-2 translate-y-full bg-foreground text-background text-[11px] px-2.5 py-1.5 rounded-md shadow-lg max-w-[260px]"
          >
            Customer is selected from your customer list. Use Reassign Customer to change.
          </div>
        )}
      </div>
    );
  };

  // ── Pipeline-specific field set ────────────────────────────────────────
  const renderFields = () => {
    const supplier = md.getSupplierByAnyId(proj.supplierId);
    const supplierLabel: React.ReactNode = supplier?.name ?? proj.supplierLabel ?? "Unassigned";
    const supplierPlaceholder = !supplier && !proj.supplierLabel;

    const customerField = (
      <FieldRow
        fieldKey="customer"
        label="Customer"
        value={proj.customer}
        locked
        onTap={() => { haptics.nope(); setLockedTip("customer"); }}
      />
    );

    const projectNameField = (
      <FieldRow
        fieldKey="projectName"
        label="Project name"
        value={proj.projectName}
        locked={!PERMS.canEditProjectName}
        onTap={() => PERMS.canEditProjectName ? setEditing("projectName") : setLockedTip("projectName")}
      />
    );
    const detailField = (
      <FieldRow
        fieldKey="detail"
        label="Detail"
        value={proj.detailSummary || "Add summary…"}
        placeholder={!proj.detailSummary}
        onTap={() => setEditing("detail")}
      />
    );
    const quoteField = (
      <FieldRow
        fieldKey="quote"
        label="Quote"
        value={proj.quoteNumber || "Q-"}
        placeholder={!proj.quoteNumber}
        onTap={() => setEditing("quote")}
      />
    );
    const poField = (
      <FieldRow
        fieldKey="po"
        label="PO number"
        value={proj.poNumber || "PO-"}
        placeholder={!proj.poNumber}
        onTap={() => setEditing("po")}
      />
    );
    const invoiceField = (
      <FieldRow
        fieldKey="invoice"
        label="Invoice"
        value={proj.invoiceNumber || "INV-"}
        placeholder={!proj.invoiceNumber}
        onTap={() => setEditing("invoice")}
      />
    );
    const supplierField = (
      <FieldRow
        fieldKey="supplier"
        label="Supplier"
        value={supplierLabel}
        placeholder={supplierPlaceholder}
        onTap={() => setEditing("supplier")}
      />
    );
    const shippingField = (
      <FieldRow
        fieldKey="shipping"
        label="Shipping mode"
        value={proj.shippingMode ?? "Not set"}
        placeholder={!proj.shippingMode}
        onTap={() => setEditing("shipping")}
      />
    );
    const trackingField = proj.shippingMode === "Local" ? null : (
      <FieldRow
        fieldKey="tracking"
        label="Tracking ref"
        value={proj.trackingRef ? proj.trackingRef.toUpperCase() : "—"}
        placeholder={!proj.trackingRef}
        onTap={() => setEditing("tracking")}
      />
    );
    const deadlineField = (
      <FieldRow
        fieldKey="deadline"
        label="Deadline"
        value={fmtDate(proj.deadlineDate)}
        onTap={() => setEditing("deadline")}
      />
    );

    const grid = "grid grid-cols-1 sm:grid-cols-2 gap-2";

    if (card.pipeline === "sales") {
      return (
        <div className={grid}>
          {customerField}
          {projectNameField}
          {detailField}
          {quoteField}
          {supplierField}
          {shippingField}
          {deadlineField}
        </div>
      );
    }
    if (card.pipeline === "purchasing" || card.pipeline === "production" || card.pipeline === "operations") {
      return (
        <div className={grid}>
          {customerField}
          {projectNameField}
          {detailField}
          {supplierField}
          {poField}
          {shippingField}
          {trackingField}
          {deadlineField}
        </div>
      );
    }
    if (card.pipeline === "shipping") {
      return (
        <div className={grid}>
          {customerField}
          <FieldRow fieldKey="projectName" label="Project name" value={proj.projectName} locked
            onTap={() => setLockedTip("projectName")} />
          {shippingField}
          {trackingField}
          <FieldRow fieldKey="etd" label="ETD" value={ship ? fmtDate(ship.etd) : "—"} placeholder={!ship}
            onTap={() => ship && setEditing("etd")} />
          <FieldRow fieldKey="eta" label="ETA" value={ship ? fmtDate(ship.eta) : "—"} placeholder={!ship}
            onTap={() => ship && setEditing("eta")} />
        </div>
      );
    }
    // finance
    return (
      <div className={grid}>
        {customerField}
        {projectNameField}
        {invoiceField}
        {deadlineField}
      </div>
    );
  };

  // ── Sub-editor sheets ──────────────────────────────────────────────────
  const shippingModeOptions: ListOption[] = [
    { id: "Air", label: "Air" },
    { id: "Ocean", label: "Ocean" },
    { id: "Local", label: "Local" },
  ];

  return (
    <div
      className="relative flex flex-col min-h-0 flex-1"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top header bar */}
      <div className="shrink-0 flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">Editing</div>
          <div className="text-[15px] font-semibold tracking-tight truncate" style={{ color: "hsl(var(--brand-navy))" }}>
            {proj.customer} · {proj.projectName}
          </div>
        </div>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); haptics.commit(); onExit(); }}
          className="hidden sm:inline-flex items-center justify-center shrink-0 rounded-lg text-white text-[13px] font-semibold tracking-tight transition-transform active:scale-[0.97]"
          style={{
            backgroundColor: "hsl(var(--brand-orange))",
            height: 36, padding: "0 16px",
            boxShadow: "0 2px 8px -2px hsl(var(--brand-orange) / 0.5)",
          }}
        >
          Done
        </button>
      </div>
      <div className="shrink-0 h-px w-full" style={{ backgroundColor: "hsl(var(--brand-navy) / 0.1)" }} />
      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3.5 space-y-2"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {renderFields()}
        <div className="h-2" />
      </div>
      {/* Mobile sticky Done */}
      <div
        className="sm:hidden shrink-0 px-4 pt-2 pb-3 border-t"
        style={{
          borderColor: "hsl(var(--brand-navy) / 0.1)",
          backgroundColor: "hsl(var(--card))",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        }}
      >
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); haptics.commit(); onExit(); }}
          className="w-full inline-flex items-center justify-center rounded-lg text-white text-[15px] font-semibold tracking-tight active:scale-[0.99] transition-transform"
          style={{ backgroundColor: "hsl(var(--brand-orange))", height: 48 }}
        >
          Done
        </button>
      </div>
      {/* accent stripe matching pipeline */}
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: accent, opacity: 0.85 }} />

      {/* ── Editors ── */}
      <TextEditor
        open={editing === "projectName"}
        onClose={() => setEditing(null)}
        title="Project name"
        value={proj.projectName}
        onSave={(v) => commitText("projectName", v)}
        warning={
          store.projects.filter((p) => p.projectName === proj.projectName).length > 1
            ? "This project name is shared with other cards — saving will rename them all."
            : null
        }
      />
      <TextEditor
        open={editing === "detail"}
        onClose={() => setEditing(null)}
        title="Detail summary"
        value={proj.detailSummary ?? ""}
        multiline
        onSave={(v) => commitText("detail", v)}
      />
      <TextEditor
        open={editing === "quote"}
        onClose={() => setEditing(null)}
        title="Quote number"
        value={proj.quoteNumber ?? ""}
        placeholder="2046"
        prefix="Q-"
        digitsOnly
        onSave={(v) => commitText("quote", v)}
      />
      <TextEditor
        open={editing === "po"}
        onClose={() => setEditing(null)}
        title="PO number"
        value={proj.poNumber ?? ""}
        placeholder="1095"
        prefix="PO-"
        digitsOnly
        onSave={(v) => commitText("po", v)}
      />
      <TextEditor
        open={editing === "invoice"}
        onClose={() => setEditing(null)}
        title="Invoice number"
        value={proj.invoiceNumber ?? ""}
        placeholder="1050"
        prefix="INV-"
        digitsOnly
        onSave={(v) => commitText("invoice", v)}
      />
      {proj.shippingMode === "Air" || proj.shippingMode === "Ocean" ? (
        <TrackingEditor
          open={editing === "tracking"}
          onClose={() => setEditing(null)}
          shippingMode={proj.shippingMode}
          value={proj.trackingRef}
          onSave={(v) => {
            const prev = proj.trackingRef;
            store.updateProject(proj.id, { trackingRef: v });
            setEditing(null);
            undoToast(`Tracking → ${v ?? "—"}`, () => store.updateProject(proj.id, { trackingRef: prev }));
          }}
        />
      ) : (
        <TextEditor
          open={editing === "tracking"}
          onClose={() => setEditing(null)}
          title="Tracking reference"
          value={proj.trackingRef ?? ""}
          placeholder="—"
          onSave={(v) => commitText("tracking", v)}
        />
      )}
      <DateEditor
        open={editing === "deadline"}
        onClose={() => setEditing(null)}
        title="Deadline"
        value={proj.deadlineDate}
        onSave={(d) => commitDate("deadline", d)}
      />
      <DateEditor
        open={editing === "etd"}
        onClose={() => setEditing(null)}
        title="ETD"
        value={ship?.etd ?? new Date()}
        onSave={(d) => commitDate("etd", d)}
      />
      <DateEditor
        open={editing === "eta"}
        onClose={() => setEditing(null)}
        title="ETA"
        value={ship?.eta ?? new Date()}
        onSave={(d) => commitDate("eta", d)}
      />
      <ListPicker
        open={editing === "shipping"}
        onClose={() => setEditing(null)}
        title="Shipping mode"
        options={shippingModeOptions}
        selectedId={proj.shippingMode}
        onPick={(id) => pickShipping(id as ShippingMode)}
      />
      <EntityPicker
        open={editing === "supplier"}
        onClose={() => setEditing(null)}
        kind="supplier"
        selectedId={proj.supplierId}
        selectedMeta={proj.supplierLabel}
        onPick={pickSupplier}
        onPickMeta={pickSupplierMeta}
      />

      {/* Project name propagation confirmation */}
      <ConfirmDialog
        open={!!renameConfirm}
        title="Rename across all cards?"
        description={renameConfirm
          ? `This will rename the project across all cards that share this name. ${renameConfirm.count} cards will be updated.`
          : ""}
        confirmLabel="Rename"
        cancelLabel="Cancel"
        onCancel={() => setRenameConfirm(null)}
        onConfirm={() => {
          if (!renameConfirm) return;
          const prevName = proj.projectName;
          const { next, count } = renameConfirm;
          store.renameProject(prevName, next);
          setRenameConfirm(null);
          undoToast(`Renamed ${count} cards to "${next}"`, () => store.renameProject(next, prevName));
        }}
      />

      {/* Supplier change confirmation when PO/items exist */}
      <ConfirmDialog
        open={!!supplierConfirm}
        title="Change supplier?"
        description="Changing supplier will reset the PO number for this card. Continue?"
        confirmLabel="Change supplier"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setSupplierConfirm(null)}
        onConfirm={() => {
          if (!supplierConfirm) return;
          const prev = { sup: proj.supplierId, po: proj.poNumber };
          const sup = md.getSupplierByAnyId(supplierConfirm.supplierId);
          store.updateProject(proj.id, {
            supplierId: supplierConfirm.supplierId, supplierLabel: undefined, poNumber: undefined,
          });
          setSupplierConfirm(null);
          undoToast(`Supplier → ${sup?.name ?? "?"} (PO reset)`, () =>
            store.updateProject(proj.id, { supplierId: prev.sup, poNumber: prev.po }));
        }}
      />
    </div>
  );
};
