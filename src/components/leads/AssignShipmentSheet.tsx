import { useState } from "react";
import { Sheet } from "./Sheet";
import { Project, Shipment, ShippingMode, getSupplier, formatShipmentTitle } from "@/data/pipelines";
import { usePipelineStore, NewShipmentInput } from "@/hooks/usePipelineStore";
import { Plus, ArrowRight, Plane, Ship } from "lucide-react";
import { supplierColor } from "@/lib/brand";
import { SupplierChip } from "./StatusPill";

interface Props {
  open: boolean;
  onClose: () => void;
  intakeSubs: Project[];
  shipments: Shipment[];
  onAssigned?: () => void;
}

const SHIPPING_MODES: ShippingMode[] = ["Air", "Ocean", "Local"];

export const AssignShipmentSheet = ({ open, onClose, intakeSubs, shipments }: Props) => {
  const { assignToShipment, createShipment } = usePipelineStore();
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewShipmentInput>({
    mode: "Air",
    code: "",
    etd: new Date(),
    eta: new Date(),
    supplierId: "",
  });

  if (!open) return null;
  const activeShipments = shipments.filter((s) => s.status !== "Delivered");

  return (
    <Sheet open={open} onClose={onClose} width="max-w-xl" eyebrow="Shipping" title="Assign projects to shipments">
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          {intakeSubs.length === 0
            ? "Nothing waiting — everything has been assigned."
            : `${intakeSubs.length} project${intakeSubs.length === 1 ? "" : "s"} ready for shipment assignment.`}
        </p>

        {intakeSubs.map((sub) => {
          const supplier = getSupplier(sub.supplierId);
          const matchingShipments = activeShipments.filter(
            (s) => s.mode === sub.shippingMode || s.supplierId === sub.supplierId,
          );
          return (
            <div key={sub.id} className="rounded-2xl border border-border/70 bg-card p-4 space-y-3">
              <div>
                <div className="text-[11px] font-medium px-2 py-0.5 rounded-md inline-flex items-center gap-1.5 mb-1"
                  style={{ backgroundColor: "hsl(var(--brand-navy) / 0.08)", color: "hsl(var(--brand-navy))" }}>
                  {sub.customer} · {sub.projectName}
                </div>
                <div className="font-semibold text-foreground">{sub.detailSummary ?? sub.projectName}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                  <SupplierChip color={supplierColor(sub.supplierId ?? "")} name={supplier?.name} />
                  <span>·</span>
                  <span>Default {sub.shippingMode ?? "—"}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Add to existing shipment</p>
                {matchingShipments.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No matching active shipments.</p>
                )}
                <div className="flex flex-col gap-1.5">
                  {matchingShipments.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => assignToShipment(sub.id, s.id)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors text-left"
                      style={{ minHeight: 48 }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {s.mode === "Air"
                          ? <Plane className="h-4 w-4" style={{ color: "hsl(var(--brand-orange))" }} />
                          : <Ship className="h-4 w-4" style={{ color: "hsl(var(--brand-teal))" }} />}
                        <span className="font-semibold tracking-tight" style={{ color: "hsl(var(--brand-navy))" }}>{formatShipmentTitle(s)}</span>
                        <span className="text-xs text-muted-foreground truncate">· ETA {s.eta.getDate()}/{s.eta.getMonth() + 1}</span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              </div>

              {creatingFor === sub.id ? (
                <div className="rounded-xl border border-dashed p-3 space-y-2"
                  style={{ borderColor: "hsl(var(--brand-teal) / 0.4)" }}>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Create new shipment</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Mode
                      <select
                        value={draft.mode}
                        onChange={(e) => setDraft((d) => ({ ...d, mode: e.target.value as ShippingMode }))}
                        className="mt-1 w-full bg-muted/50 border border-border/60 rounded-lg px-2 py-1.5 text-sm"
                      >
                        {SHIPPING_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </label>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Code
                      <input
                        value={draft.code}
                        onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
                        placeholder="e.g. DHL-2459"
                        className="mt-1 w-full bg-muted/50 border border-border/60 rounded-lg px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      ETD
                      <input type="date" onChange={(e) => setDraft((d) => ({ ...d, etd: new Date(e.target.value) }))}
                        className="mt-1 w-full bg-muted/50 border border-border/60 rounded-lg px-2 py-1.5 text-sm" />
                    </label>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      ETA
                      <input type="date" onChange={(e) => setDraft((d) => ({ ...d, eta: new Date(e.target.value) }))}
                        className="mt-1 w-full bg-muted/50 border border-border/60 rounded-lg px-2 py-1.5 text-sm" />
                    </label>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setCreatingFor(null); }}
                      className="flex-1 px-3 py-2 rounded-lg border text-sm hover:bg-muted/40"
                      style={{ borderColor: "hsl(var(--brand-navy) / 0.25)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (!draft.code) return;
                        const ship = createShipment({ ...draft, supplierId: sub.supplierId ?? "" });
                        assignToShipment(sub.id, ship.id);
                        setCreatingFor(null);
                        setDraft({ mode: "Air", code: "", etd: new Date(), eta: new Date(), supplierId: "" });
                      }}
                      disabled={!draft.code}
                      className="flex-1 px-3 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-40"
                      style={{ backgroundColor: "hsl(var(--brand-teal))" }}
                    >
                      Create &amp; assign
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setCreatingFor(sub.id)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-dashed text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                  style={{ borderColor: "hsl(var(--brand-navy) / 0.2)" }}
                >
                  <Plus className="h-4 w-4" /> Create new shipment
                </button>
              )}
            </div>
          );
        })}

        {intakeSubs.length === 0 && (
          <button
            onClick={onClose}
            className="w-full px-4 py-3 rounded-xl text-white font-semibold"
            style={{ backgroundColor: "hsl(var(--brand-navy))" }}
          >
            Done
          </button>
        )}
      </div>
    </Sheet>
  );
};
