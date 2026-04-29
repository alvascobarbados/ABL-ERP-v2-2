import { CalendarDays, User2, Building2, Plane, Ship, Repeat, Sparkles, Factory, Container } from "lucide-react";
import { PipelineCard, PIPELINES, STAGE_ACCENT } from "@/data/pipelines";
import { Sheet } from "./Sheet";
import { cn } from "@/lib/utils";

interface Props {
  card: PipelineCard | null;
  onClose: () => void;
  onOpenMaster: (id: string) => void;
  onOpenShipment: (id: string) => void;
}

const accentBgClass: Record<string, string> = {
  indigo: "bg-stage-indigo", amber: "bg-stage-amber", emerald: "bg-stage-emerald",
  rose: "bg-stage-rose", slate: "bg-stage-slate", violet: "bg-stage-violet",
  orange: "bg-stage-orange", teal: "bg-stage-teal", sky: "bg-stage-sky",
  cyan: "bg-stage-cyan", fuchsia: "bg-stage-fuchsia",
};

export const ProjectDetail = ({ card, onClose, onOpenMaster, onOpenShipment }: Props) => {
  if (!card) return null;
  const pipeline = PIPELINES.find((p) => p.id === card.pipeline)!;
  const stage = pipeline.stages.find((s) => s.id === card.stage)!;
  const accent = STAGE_ACCENT[card.stage];
  const ShipIcon = card.shippingMode === "Air" ? Plane : Ship;
  const isSub = card.kind === "sub";

  return (
    <Sheet
      open
      onClose={onClose}
      eyebrow={
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("w-1.5 h-1.5 rounded-full", accentBgClass[accent])} />
          {pipeline.title} · {stage.title}
        </span>
      }
      title={isSub ? card.sub!.itemName : card.master.customer}
    >
      <div className="space-y-6">
        {isSub && (
          <button
            onClick={() => onOpenMaster(card.master.id)}
            className="w-full text-left rounded-xl border border-border bg-muted/40 p-3 hover:bg-muted transition-colors"
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Belongs to master project</div>
            <div className="font-medium text-foreground">↳ {card.master.projectName} · {card.master.customer}</div>
          </button>
        )}

        <div>
          <p className="text-base text-foreground/80">
            {isSub ? (
              <span className="text-muted-foreground">{card.sub!.summary}</span>
            ) : (
              <>
                <span className="font-medium">{card.master.projectName}</span>
                <span className="text-muted-foreground"> — {card.master.summary}</span>
              </>
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <DetailRow icon={User2} label="Point person" value={card.master.pointPerson} />
          <DetailRow icon={Building2} label="Customer" value={card.master.customer} />
          <DetailRow icon={CalendarDays} label="Deadline" value={card.deadline} />
          <DetailRow icon={ShipIcon} label="Shipping" value={card.shippingMode} />
          {isSub && card.supplier && (
            <DetailRow icon={Factory} label="Supplier" value={card.supplier.name} />
          )}
          {isSub && card.sub?.value !== undefined && (
            <DetailRow icon={Sparkles} label="Value" value={`$${card.sub.value.toLocaleString()}`} />
          )}
          <DetailRow icon={Repeat} label="Order type" value={card.orderType} />
          <DetailRow icon={Sparkles} label="Priority" value={card.priority} />
        </div>

        {isSub && card.shipment && (
          <button
            onClick={() => onOpenShipment(card.shipment!.id)}
            className="w-full flex items-center justify-between rounded-xl border border-border bg-foreground text-background p-4 hover:opacity-90 transition-opacity"
          >
            <div className="flex items-center gap-2">
              <Container className="h-4 w-4" />
              <div className="text-left">
                <div className="text-[10px] uppercase tracking-wider opacity-70">Shipment</div>
                <div className="font-semibold">{card.shipment.code}</div>
              </div>
            </div>
            <span className="text-xs opacity-80">{card.shipment.status}</span>
          </button>
        )}
      </div>
    </Sheet>
  );
};

const DetailRow = ({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) => (
  <div className="bg-card border border-border/60 rounded-xl p-3">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
      <Icon className="h-3 w-3" />
      {label}
    </div>
    <div className="text-sm font-medium text-foreground">{value}</div>
  </div>
);
