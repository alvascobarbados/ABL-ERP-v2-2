import { Factory, MapPin, User2, CornerDownRight } from "lucide-react";
import { Sheet } from "./Sheet";
import { SUPPLIERS, getSubsForSupplier, getMaster, PIPELINES } from "@/data/pipelines";
import { PIPELINE_ACCENT, supplierColor } from "@/lib/brand";
import { SupplierChip } from "./StatusPill";

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenSub: (subId: string) => void;
  onOpenMaster: (masterId: string) => void;
}

export const SuppliersView = ({ open, onClose, onOpenSub, onOpenMaster }: Props) => {
  if (!open) return null;
  return (
    <Sheet
      open
      onClose={onClose}
      width="max-w-xl"
      eyebrow="Operations"
      title="Suppliers"
    >
      <div className="space-y-6">
        {SUPPLIERS.map((sup) => {
          const subs = getSubsForSupplier(sup.id);
          const active = subs.filter((s) => s.pipeline !== "finance" || s.stage !== "paid");
          return (
            <section key={sup.id}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="text-base font-semibold flex items-center gap-2" style={{ color: "hsl(var(--brand-navy))" }}>
                    <SupplierChip color={supplierColor(sup.id)} />
                    <Factory className="h-4 w-4 text-muted-foreground" />
                    {sup.name}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{sup.country}</span>
                    <span className="inline-flex items-center gap-1"><User2 className="h-3 w-3" />{sup.contact}</span>
                    <span>· Default {sup.defaultShippingMode}</span>
                  </div>
                </div>
                <span
                  className="text-xs tabular px-2 py-0.5 rounded-full text-white shrink-0 font-semibold"
                  style={{ backgroundColor: active.length > 0 ? "hsl(var(--brand-orange))" : "hsl(var(--muted))", color: active.length > 0 ? "#fff" : "hsl(var(--muted-foreground))" }}
                >
                  {active.length} active
                </span>
              </div>

              {sup.notes && <p className="text-xs text-muted-foreground italic mb-2">{sup.notes}</p>}

              {active.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-2">No active orders.</p>
              ) : (
                <div className="space-y-2">
                  {active.map((s) => {
                    const master = getMaster(s.masterId)!;
                    const stageInfo = PIPELINES.flatMap((p) => p.stages.map((st) => ({ ...st, pipelineTitle: p.title }))).find((x) => x.id === s.stage);
                    return (
                      <div key={s.id} className="rounded-xl border border-border bg-card p-3">
                        <button
                          onClick={() => onOpenMaster(master.id)}
                          className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md mb-1 transition-colors hover:opacity-80"
                          style={{ backgroundColor: "hsl(var(--brand-navy) / 0.08)", color: "hsl(var(--brand-navy))" }}
                        >
                          <CornerDownRight className="h-3 w-3 opacity-70" />
                          <span>{master.projectName}</span>
                          <span className="opacity-60">·</span>
                          <span>{master.customer}</span>
                        </button>
                        <button onClick={() => onOpenSub(s.id)} className="w-full text-left flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-foreground">{s.itemName}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">Due {s.deadline} · {s.shippingMode}</div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PIPELINE_ACCENT[s.pipeline].hex }} />
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {stageInfo?.pipelineTitle} · {stageInfo?.title}
                            </span>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </Sheet>
  );
};
