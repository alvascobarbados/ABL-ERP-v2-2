import { Factory, MapPin, User2, CornerDownRight } from "lucide-react";
import { Sheet } from "./Sheet";
import { SUPPLIERS, getSubsForSupplier, getMaster, STAGE_ACCENT, PIPELINES } from "@/data/pipelines";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenSub: (subId: string) => void;
  onOpenMaster: (masterId: string) => void;
}

const accentBgClass: Record<string, string> = {
  indigo: "bg-stage-indigo", amber: "bg-stage-amber", emerald: "bg-stage-emerald",
  rose: "bg-stage-rose", slate: "bg-stage-slate", violet: "bg-stage-violet",
  orange: "bg-stage-orange", teal: "bg-stage-teal", sky: "bg-stage-sky",
  cyan: "bg-stage-cyan", fuchsia: "bg-stage-fuchsia",
};

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
                  <div className="font-serif-display text-lg font-semibold flex items-center gap-2">
                    <Factory className="h-4 w-4 text-muted-foreground" />
                    {sup.name}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{sup.country}</span>
                    <span className="inline-flex items-center gap-1"><User2 className="h-3 w-3" />{sup.contact}</span>
                    <span>· Default {sup.defaultShippingMode}</span>
                  </div>
                </div>
                <span className="text-xs tabular-nums px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
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
                    const accent = STAGE_ACCENT[s.stage];
                    const stageInfo = PIPELINES.flatMap((p) => p.stages.map((st) => ({ ...st, pipeline: p.title }))).find((x) => x.id === s.stage);
                    return (
                      <div key={s.id} className="rounded-xl border border-border bg-card p-3">
                        <button
                          onClick={() => onOpenMaster(master.id)}
                          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-1"
                        >
                          <CornerDownRight className="h-3 w-3 opacity-70" />
                          <span className="font-medium">{master.projectName}</span>
                          <span className="text-muted-foreground/60">·</span>
                          <span>{master.customer}</span>
                        </button>
                        <button onClick={() => onOpenSub(s.id)} className="w-full text-left flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-foreground">{s.itemName}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">Due {s.deadline} · {s.shippingMode}</div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={cn("w-1.5 h-1.5 rounded-full", accentBgClass[accent])} />
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {stageInfo?.pipeline} · {stageInfo?.title}
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
