import { Factory, MapPin, User2 } from "lucide-react";
import { Sheet } from "./Sheet";
import { SUPPLIERS, getProjectsForSupplier, STAGES } from "@/data/stages";
import { PIPELINE_ACCENT, supplierColor } from "@/lib/brand";
import { SupplierChip } from "./StatusPill";

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenProject: (projectId: string) => void;
}

export const SuppliersView = ({ open, onClose, onOpenProject }: Props) => {
  if (!open) return null;
  return (
    <Sheet
      open
      onClose={onClose}
      width="max-w-xl"
      eyebrow="Production"
      title="Suppliers"
    >
      <div className="space-y-6">
        {SUPPLIERS.map((sup) => {
          const subs = getProjectsForSupplier(sup.id);
          const active = subs.filter((s) => s.stage !== "finance" || s.state !== "paid");
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
                    const stageInfo = STAGES.flatMap((p) => p.states.map((st) => ({ ...st, pipelineTitle: p.title }))).find((x) => x.id === s.state);
                    return (
                      <button
                        key={s.id}
                        onClick={() => onOpenProject(s.id)}
                        className="w-full text-left rounded-xl border border-border bg-card p-3 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground truncate">{s.customer}</div>
                            <div className="text-[13px] truncate" style={{ color: "hsl(var(--brand-navy))" }}>
                              {s.projectName}
                            </div>
                            {s.detailSummary && (
                              <div className="text-xs text-muted-foreground mt-0.5 truncate">{s.detailSummary}</div>
                            )}
                            <div className="text-xs text-muted-foreground mt-1">Due {s.deadline} · {s.shippingMode ?? "—"}</div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PIPELINE_ACCENT[s.stage].hex }} />
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {stageInfo?.pipelineTitle} · {stageInfo?.title}
                            </span>
                          </div>
                        </div>
                      </button>
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
