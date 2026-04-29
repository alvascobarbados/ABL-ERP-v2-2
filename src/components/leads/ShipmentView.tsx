import { useState } from "react";
import { toast } from "sonner";
import { Container, Factory, CalendarDays, CornerDownRight, CheckCircle2 } from "lucide-react";
import { Sheet } from "./Sheet";
import { Shipment, getSubsForShipment, getSupplier, getMaster, PIPELINES } from "@/data/pipelines";
import { PIPELINE_ACCENT, supplierColor } from "@/lib/brand";
import { ShippingIcon } from "./ShippingIcon";
import { SupplierChip } from "./StatusPill";
import { ConfirmDialog } from "./ConfirmDialog";
import { usePipelineStore } from "@/hooks/usePipelineStore";

interface Props {
  shipment: Shipment | null;
  onClose: () => void;
  onOpenSub: (subId: string) => void;
  onOpenMaster: (masterId: string) => void;
}

const fmt = (date: Date) => `${date.getDate()} ${date.toLocaleString("en-US", { month: "short" })}`;

export const ShipmentView = ({ shipment, onClose, onOpenSub, onOpenMaster }: Props) => {
  const { subs: liveSubs, markShipmentDelivered } = usePipelineStore();
  const [confirmDeliver, setConfirmDeliver] = useState(false);

  if (!shipment) return null;
  const supplier = getSupplier(shipment.supplierId);
  const subs = liveSubs.filter((s) => s.shipmentId === shipment.id);
  const totalValue = subs.reduce((a, s) => a + s.value, 0);
  const isDelivered = shipment.status === "Delivered";
  const inShippingCount = subs.filter((s) => s.pipeline === "shipping").length;

  const onConfirmDeliver = () => {
    const { count } = markShipmentDelivered(shipment.id);
    setConfirmDeliver(false);
    toast.success(`${shipment.code} delivered. ${count} sub-project${count === 1 ? "" : "s"} sent to Finance.`, {
      duration: 6000,
    });
    onClose();
  };

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
          <div className="bg-card border border-border/60 rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Mode</div>
            <ShippingIcon mode={shipment.mode} showLabel />
          </div>
          <Stat icon={Factory} label="Supplier" value={supplier?.name ?? "—"} chipColor={supplierColor(shipment.supplierId)} />
          <Stat icon={CalendarDays} label="ETD" value={fmt(shipment.etd)} />
          <Stat icon={CalendarDays} label="ETA" value={fmt(shipment.eta)} />
        </div>

        <div className="rounded-xl border border-border p-4 flex items-center justify-between"
          style={{ backgroundColor: "hsl(var(--brand-navy) / 0.05)" }}>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Carrying</div>
            <div className="text-lg font-semibold" style={{ color: "hsl(var(--brand-navy))" }}>{subs.length} sub-projects</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total value</div>
            <div className="text-lg font-semibold tabular" style={{ color: "hsl(var(--brand-navy))" }}>${totalValue.toLocaleString()}</div>
          </div>
        </div>

        <div className="space-y-2">
          {subs.map((s) => {
            const master = getMaster(s.masterId)!;
            const stageInfo = PIPELINES.flatMap((p) => p.stages).find((x) => x.id === s.stage);
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
                <button onClick={() => onOpenSub(s.id)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-foreground">{s.itemName}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        <SupplierChip color={supplierColor(s.supplierId)} />
                        {s.summary}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PIPELINE_ACCENT[s.pipeline].hex }} />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{stageInfo?.title}</span>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        {!isDelivered && inShippingCount > 0 && (
          <button
            onClick={() => setConfirmDeliver(true)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl text-white font-semibold py-4"
            style={{ backgroundColor: "hsl(var(--brand-teal))", minHeight: 56 }}
          >
            <CheckCircle2 className="h-5 w-5" />
            Mark {shipment.code} as Delivered
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeliver}
        title={`Mark ${shipment.code} as delivered?`}
        description={`All ${inShippingCount} sub-project${inShippingCount === 1 ? "" : "s"} on this shipment will move to Finance / Invoice Required.`}
        confirmLabel="Yes, mark delivered"
        cancelLabel="Cancel"
        onCancel={() => setConfirmDeliver(false)}
        onConfirm={onConfirmDeliver}
      />
    </Sheet>
  );
};

const Stat = ({ icon: Icon, label, value, chipColor }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; chipColor?: string }) => (
  <div className="bg-card border border-border/60 rounded-xl p-3">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
      <Icon className="h-3 w-3" />
      {label}
    </div>
    <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
      {chipColor && <SupplierChip color={chipColor} />}
      {value}
    </div>
  </div>
);
