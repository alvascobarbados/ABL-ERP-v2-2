import { useState } from "react";
import { Sheet } from "./Sheet";
import { MasterProject, ShippingMode, Supplier } from "@/data/pipelines";
import { SplitDraftItem } from "@/hooks/usePipelineStore";
import { Plus, Trash2 } from "lucide-react";

interface Props {
  master: MasterProject | null;
  suppliers: Supplier[];
  open: boolean;
  onClose: () => void;
  onConfirm: (items: SplitDraftItem[]) => void;
}

const SHIPPING_MODES: ShippingMode[] = ["Air", "Ocean LCL", "Ocean FCL"];

export const SplitToProductionSheet = ({ master, suppliers, open, onClose, onConfirm }: Props) => {
  const [items, setItems] = useState<SplitDraftItem[]>([
    { itemName: "", supplierId: suppliers[0]?.id ?? "", shippingMode: "Air" },
  ]);

  const reset = () => setItems([{ itemName: "", supplierId: suppliers[0]?.id ?? "", shippingMode: "Air" }]);

  const handleClose = () => { reset(); onClose(); };

  const update = (i: number, patch: Partial<SplitDraftItem>) =>
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  const addRow = () =>
    setItems((prev) => [...prev, { itemName: "", supplierId: suppliers[0]?.id ?? "", shippingMode: "Air" }]);

  const removeRow = (i: number) =>
    setItems((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);

  const ready = items.length > 0 && items.every((it) => it.itemName.trim() && it.supplierId);

  if (!master) return null;

  return (
    <Sheet open={open} onClose={handleClose} title="Split to Production">
      <div className="space-y-1 pb-4 border-b border-border/60">
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">Master Project</p>
        <p className="text-xl font-semibold tracking-tight" style={{ color: "hsl(var(--brand-navy))" }}>{master.projectName}</p>
        <p className="text-sm text-muted-foreground">{master.customer} · {master.summary}</p>
      </div>

      <div className="space-y-3 mt-4">
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">Sub-projects</p>
        {items.map((it, i) => (
          <div key={i} className="rounded-2xl border border-border/70 bg-card p-3 space-y-2">
            <div className="flex items-start gap-2">
              <input
                value={it.itemName}
                onChange={(e) => update(i, { itemName: e.target.value })}
                placeholder="Item description (e.g. Cotton Tote Bags)"
                className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground/70 border-b border-border/50 focus:border-foreground/60 outline-none py-1.5"
              />
              {items.length > 1 && (
                <button
                  onClick={() => removeRow(i)}
                  className="text-muted-foreground hover:text-urgent transition-colors p-1"
                  aria-label="Remove row"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Supplier
                <select
                  value={it.supplierId}
                  onChange={(e) => update(i, { supplierId: e.target.value })}
                  className="mt-1 w-full bg-muted/50 border border-border/60 rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-foreground/50"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Shipping
                <select
                  value={it.shippingMode}
                  onChange={(e) => update(i, { shippingMode: e.target.value as ShippingMode })}
                  className="mt-1 w-full bg-muted/50 border border-border/60 rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-foreground/50"
                >
                  {SHIPPING_MODES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ))}

        <button
          onClick={addRow}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add sub-project
        </button>
      </div>

      <div className="pt-4 mt-4 border-t border-border/60 flex gap-2">
        <button
          onClick={handleClose}
          className="flex-1 px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/70 text-foreground text-sm font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => { if (ready) { onConfirm(items); reset(); } }}
          disabled={!ready}
          className="flex-1 px-4 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold transition-opacity disabled:opacity-40 hover:opacity-90"
        >
          Confirm Handoff
        </button>
      </div>
    </Sheet>
  );
};
