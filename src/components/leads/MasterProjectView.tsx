import { CalendarDays, User2, Building2, Factory, Container, AlertTriangle, Flag } from "lucide-react";
import { Sheet } from "./Sheet";
import {
  MasterProject, PIPELINES, getSubsForMaster, getSupplier, getShipment, SubProject,
} from "@/data/pipelines";
import { PIPELINE_ACCENT, supplierColor } from "@/lib/brand";
import { SupplierChip } from "./StatusPill";
import { cn } from "@/lib/utils";

interface Props {
  master: MasterProject | null;
  onClose: () => void;
  onOpenSub: (subId: string) => void;
  onOpenShipment: (shipmentId: string) => void;
}

const TODAY = new Date(2026, 4, 8);

const ALL_STAGES = PIPELINES.flatMap((p) => p.stages.map((s) => ({ ...s, pipeline: p.id, pipelineTitle: p.title })));

function MiniPipeline({ currentStage }: { currentStage: string }) {
  const idx = ALL_STAGES.findIndex((s) => s.id === currentStage);
  return (
    <div className="flex items-center gap-1">
      {ALL_STAGES.map((s, i) => {
        const accentHex = PIPELINE_ACCENT[s.pipeline].hex;
        const state = i < idx ? "done" : i === idx ? "current" : "future";
        return (
          <div key={s.id} className="flex items-center gap-1">
            <span
              className={cn(
                "h-2 w-2 rounded-full border transition-colors",
                state === "future" && "bg-transparent border-muted-foreground/30",
              )}
              style={
                state === "done"
                  ? { backgroundColor: accentHex, borderColor: accentHex, opacity: 0.55 }
                  : state === "current"
                    ? { backgroundColor: accentHex, borderColor: accentHex, boxShadow: `0 0 0 2px ${accentHex}33` }
                    : undefined
              }
              title={`${s.pipelineTitle} · ${s.title}`}
            />
            {i < ALL_STAGES.length - 1 && (
              <span
                className="h-px w-2"
                style={{
                  backgroundColor: i < idx ? accentHex + "88" : "hsl(var(--muted-foreground) / 0.2)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function getDayDelta(d: Date) { return Math.ceil((d.getTime() - TODAY.getTime()) / 86400000); }

export const MasterProjectView = ({ master, onClose, onOpenSub, onOpenShipment }: Props) => {
  if (!master) return null;
  const subs = getSubsForMaster(master.id);
  const totalValue = subs.length > 0 ? subs.reduce((a, s) => a + s.value, 0) : master.value;
  const slowest = subs.reduce<SubProject | null>(
    (acc, s) => (!acc || getDayDelta(s.deadlineDate) < getDayDelta(acc.deadlineDate) ? s : acc),
    null,
  );
  const slowestDelta = slowest ? getDayDelta(slowest.deadlineDate) : 999;
  const health = slowestDelta < 0 ? "critical" : slowestDelta <= 7 ? "warning" : "healthy";

  return (
    <Sheet
      open
      onClose={onClose}
      width="max-w-xl"
      eyebrow={`Master Project · ${master.customer}`}
      title={master.projectName}
    >
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">{master.summary}</p>

        <div className="grid grid-cols-3 gap-3">
          <Stat icon={User2} label="Point person" value={master.pointPerson} />
          <Stat icon={CalendarDays} label="Master deadline" value={master.deadline} />
          <Stat icon={Building2} label="Total value" value={`$${totalValue.toLocaleString()}`} />
        </div>

        <div className={cn(
          "flex items-center gap-2 rounded-xl px-4 py-3 text-sm border",
          health === "critical" && "bg-urgent/10 text-urgent border-urgent/30",
          health === "healthy" && "bg-muted text-muted-foreground border-border",
        )}
          style={health === "warning"
            ? { backgroundColor: "hsl(var(--brand-orange) / 0.12)", color: "hsl(var(--brand-orange))", borderColor: "hsl(var(--brand-orange) / 0.3)" }
            : undefined}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {health === "critical" && slowest && (
            <span><span className="font-semibold">{slowest.itemName}</span> is overdue by {Math.abs(slowestDelta)}d</span>
          )}
          {health === "warning" && slowest && (
            <span><span className="font-semibold">{slowest.itemName}</span> is the slowest leg — due in {slowestDelta}d</span>
          )}
          {health === "healthy" && <span>All sub-projects on track</span>}
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
            Sub-projects ({subs.length || "—"})
          </div>

          {subs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground italic">
              No sub-projects yet — this master is still in Sales. Sub-projects are created at the handoff to Production.
            </div>
          ) : (
            <div className="space-y-2">
              {subs.map((s) => {
                const supplier = getSupplier(s.supplierId);
                const shipment = getShipment(s.shipmentId);
                const stageInfo = ALL_STAGES.find((x) => x.id === s.stage);
                const isSlowest = slowest?.id === s.id && health !== "healthy";
                return (
                  <button
                    key={s.id}
                    onClick={() => onOpenSub(s.id)}
                    className="w-full text-left rounded-xl border border-border bg-card p-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground truncate flex items-center gap-1.5">
                          {isSlowest && <Flag className="h-3.5 w-3.5 shrink-0" style={{ color: "hsl(var(--brand-orange))" }} />}
                          {s.itemName}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <SupplierChip color={supplierColor(s.supplierId)} name={supplier?.name} />
                          <span className="text-muted-foreground/50">·</span>
                          <span>{s.shippingMode}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: PIPELINE_ACCENT[s.pipeline].hex }}
                        />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                          {stageInfo?.pipelineTitle} · {stageInfo?.title}
                        </span>
                      </div>
                    </div>
                    <MiniPipeline currentStage={s.stage} />
                    {shipment && (
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span
                          role="button"
                          onClick={(e) => { e.stopPropagation(); onOpenShipment(shipment.id); }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white font-semibold"
                          style={{ backgroundColor: "hsl(var(--brand-navy))" }}
                        >
                          <Container className="h-2.5 w-2.5" /> {shipment.code}
                        </span>
                        <span className="text-muted-foreground">{s.deadline}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
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
