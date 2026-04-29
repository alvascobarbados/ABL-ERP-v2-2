import { CalendarDays, User2, Building2, Repeat, Sparkles, Factory, Container } from "lucide-react";
import { PipelineCard, PIPELINES } from "@/data/pipelines";
import { PIPELINE_ACCENT, supplierColor } from "@/lib/brand";
import { ShippingIcon } from "./ShippingIcon";
import { SupplierChip } from "./StatusPill";
import { Sheet } from "./Sheet";

interface Props {
  card: PipelineCard | null;
  onClose: () => void;
  onOpenMaster: (id: string) => void;
  onOpenShipment: (id: string) => void;
}

export const ProjectDetail = ({ card, onClose, onOpenMaster, onOpenShipment }: Props) => {
  if (!card) return null;
  const pipeline = PIPELINES.find((p) => p.id === card.pipeline)!;
  const stage = pipeline.stages.find((s) => s.id === card.stage)!;
  const accentHex = PIPELINE_ACCENT[card.pipeline].hex;
  const isSub = card.kind === "sub";

  return (
    <Sheet
      open
      onClose={onClose}
      eyebrow={
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentHex }} />
          {pipeline.title} · {stage.title}
        </span>
      }
      title={isSub ? card.sub!.itemName : card.master.customer}
    >
      <div className="space-y-6">
        {isSub && (
          <button
            onClick={() => onOpenMaster(card.master.id)}
            className="w-full text-left rounded-xl p-3 transition-colors hover:opacity-90"
            style={{ backgroundColor: "hsl(var(--brand-navy) / 0.08)", color: "hsl(var(--brand-navy))" }}
          >
            <div className="text-[10px] uppercase tracking-wider opacity-70 mb-1">Belongs to master project</div>
            <div className="font-semibold">↳ {card.master.projectName} · {card.master.customer}</div>
          </button>
        )}

        <div>
          <p className="text-base text-foreground/80">
            {isSub ? (
              <span className="text-muted-foreground">{card.sub!.summary}</span>
            ) : (
              <>
                <span className="font-semibold">{card.master.projectName}</span>
                <span className="text-muted-foreground"> — {card.master.summary}</span>
              </>
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <DetailRow icon={User2} label="Point person" value={card.master.pointPerson} />
          <DetailRow icon={Building2} label="Customer" value={card.master.customer} />
          <DetailRow icon={CalendarDays} label="Deadline" value={card.deadline} />
          <div className="bg-card border border-border/60 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
              Shipping
            </div>
            <div className="text-sm font-medium text-foreground"><ShippingIcon mode={card.shippingMode} showLabel /></div>
          </div>
          {isSub && card.supplier && (
            <div className="bg-card border border-border/60 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
                <Factory className="h-3 w-3" /> Supplier
              </div>
              <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <SupplierChip color={supplierColor(card.supplier.id)} /> {card.supplier.name}
              </div>
            </div>
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
            className="w-full flex items-center justify-between rounded-xl p-4 hover:opacity-90 transition-opacity text-white"
            style={{ backgroundColor: "hsl(var(--brand-navy))" }}
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
