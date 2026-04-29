import { Plane, Ship, Container, Factory, CalendarDays, CornerDownRight } from "lucide-react";
import { Sheet } from "./Sheet";
import { Shipment, getSubsForShipment, getSupplier, getMaster, STAGE_ACCENT, PIPELINES } from "@/data/pipelines";
import { cn } from "@/lib/utils";

interface Props {
  shipment: Shipment | null;
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

const fmt = (date: Date) => `${date.getDate()} ${date.toLocaleString("en-US", { month: "short" })}`;

export const ShipmentView = ({ shipment, onClose, onOpenSub, onOpenMaster }: Props) => {
  if (!shipment) return null;
  const supplier = getSupplier(shipment.supplierId);
  const subs = getSubsForShipment(shipment.id);
  const ShipIcon = shipment.mode === "Air" ? Plane : Ship;
  const totalValue = subs.reduce((a, s) => a + s.value, 0);

  return (
    <Sheet
      open
      onClose={onClose}
      width="max-w-xl"
      eyebrow={
        <span className="inline-flex items-center gap-1.5">
          <Container className="h-3 w-3" /> Shipment · {shipment.status}
        </span>
      }
      title={shipment.code}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat icon={ShipIcon} label="Mode" value={shipment.mode} />
          <Stat icon={Factory} label="Supplier" value={supplier?.name ?? "—"} />
          <Stat icon={CalendarDays} label="ETD" value={fmt(shipment.etd)} />
          <Stat icon={CalendarDays} label="ETA" value={fmt(shipment.eta)} />
        </div>

        <div className="rounded-xl bg-muted/40 border border-border p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Carrying</div>
            <div className="text-lg font-semibold">{subs.length} sub-projects</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total value</div>
            <div className="text-lg font-semibold tabular-nums">${totalValue.toLocaleString()}</div>
          </div>
        </div>

        <div className="space-y-2">
          {subs.map((s) => {
            const master = getMaster(s.masterId)!;
            const stageInfo = PIPELINES.flatMap((p) => p.stages).find((x) => x.id === s.stage);
            const accent = STAGE_ACCENT[s.stage];
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
                <button onClick={() => onOpenSub(s.id)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-foreground">{s.itemName}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{s.summary}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn("w-1.5 h-1.5 rounded-full", accentBgClass[accent])} />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{stageInfo?.title}</span>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
};

const Stat = ({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) => (
  <div className="bg-card border border-border/60 rounded-xl p-3">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
      <Icon className="h-3 w-3" />
      {label}
    </div>
    <div className="text-sm font-medium text-foreground">{value}</div>
  </div>
);
