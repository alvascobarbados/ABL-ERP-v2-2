import { useEffect, useState } from "react";
import { ChevronDown, AlertTriangle, Plane, Ship } from "lucide-react";
import { Shipment, SubProject, getMaster, getSupplier } from "@/data/pipelines";
import { PIPELINE_ACCENT, supplierColor } from "@/lib/brand";
import { ProjectCard } from "./ProjectCard";
import { PipelineCard } from "@/data/pipelines";
import { SupplierChip } from "./StatusPill";
import { cn } from "@/lib/utils";

export type ShippingFilter = "in_transit" | "delivered" | "delayed";

interface Props {
  subs: SubProject[];          // already filtered by FilterBar
  shipments: Shipment[];
  filter: ShippingFilter;
  onFilterChange: (f: ShippingFilter) => void;
  intakeCount: number;
  onOpenIntake: () => void;
  onOpenShipment: (shipmentId: string) => void;
  onOpenCard: (c: PipelineCard) => void;
  onOpenMaster: (masterId: string) => void;
  onSwipeForward: (c: PipelineCard) => void;
  onSwipeBack: (c: PipelineCard) => void;
  onOpenPicker: (c: PipelineCard) => void;
}

const formatDate = (d: Date) => `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })}`;

const subToCard = (sub: SubProject, shipments: Shipment[]): PipelineCard => {
  const master = getMaster(sub.masterId)!;
  const supplier = getSupplier(sub.supplierId);
  const shipment = sub.shipmentId ? shipments.find((s) => s.id === sub.shipmentId) : undefined;
  return {
    kind: "sub", id: sub.id, master, sub, supplier, shipment,
    pipeline: sub.pipeline, stage: sub.stage,
    deadline: sub.deadline, deadlineDate: sub.deadlineDate,
    shippingMode: sub.shippingMode, orderType: sub.orderType, priority: sub.priority,
    tag: sub.tag,
  };
};

interface ShipmentRowProps {
  shipment: Shipment;
  subs: SubProject[];
  shipments: Shipment[];
  onOpenShipment: (id: string) => void;
  onOpenCard: (c: PipelineCard) => void;
  onOpenMaster: (id: string) => void;
  onSwipeForward: (c: PipelineCard) => void;
  onSwipeBack: (c: PipelineCard) => void;
  onOpenPicker: (c: PipelineCard) => void;
}

const ShipmentRow = ({ shipment, subs, shipments, onOpenShipment, onOpenCard, onOpenMaster, onSwipeForward, onSwipeBack, onOpenPicker }: ShipmentRowProps) => {
  const [open, setOpen] = useState(false);
  const dotColor =
    shipment.status === "Delivered" ? "#3E6B4A"
    : shipment.status === "Delayed" ? "#E97B2C"
    : shipment.status === "Customs" ? "#E97B2C"
    : "#3D7B86";

  return (
    <div className="rounded-xl border bg-card overflow-hidden" style={{ borderColor: "hsl(var(--brand-navy) / 0.12)" }}>
      <div className="flex items-stretch">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex-1 flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
          aria-expanded={open}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} title={shipment.status} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base sm:text-lg font-semibold tracking-tight" style={{ color: "hsl(var(--brand-navy))" }}>
                  {shipment.code}
                </span>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: "hsl(var(--brand-navy) / 0.06)", color: "hsl(var(--brand-navy))" }}>
                  {shipment.status}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                ETD {formatDate(shipment.etd)} · ETA {formatDate(shipment.eta)} · {subs.length} sub-project{subs.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform shrink-0", open ? "rotate-0" : "-rotate-90")} />
        </button>
        <button
          onClick={() => onOpenShipment(shipment.id)}
          className="px-3 sm:px-4 text-xs font-medium border-l hover:bg-muted/40 transition-colors"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.1)", color: "hsl(var(--brand-navy))" }}
        >
          Open
        </button>
      </div>

      <div className={cn("grid transition-[grid-template-rows] duration-200", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-1 grid grid-cols-1 md:grid-cols-2 gap-3">
            {subs.map((s) => {
              const card = subToCard(s, shipments);
              return (
                <ProjectCard
                  key={s.id}
                  card={card}
                  onOpen={() => onOpenCard(card)}
                  onOpenMaster={() => onOpenMaster(card.master.id)}
                  onSwipeForward={() => onSwipeForward(card)}
                  onSwipeBack={() => onSwipeBack(card)}
                  onOpenPicker={() => onOpenPicker(card)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

interface GroupProps {
  title: "Air" | "Ocean";
  shipments: Shipment[];
  subs: SubProject[];
  shipmentsAll: Shipment[];
  onOpenShipment: (id: string) => void;
  onOpenCard: (c: PipelineCard) => void;
  onOpenMaster: (id: string) => void;
  onSwipeForward: (c: PipelineCard) => void;
  onSwipeBack: (c: PipelineCard) => void;
  onOpenPicker: (c: PipelineCard) => void;
}

const Group = ({ title, shipments, subs, shipmentsAll, ...row }: GroupProps) => {
  const [open, setOpen] = useState(true);
  const totalSubs = subs.length;
  const Icon = title === "Air" ? Plane : Ship;
  const accent = PIPELINE_ACCENT.shipping.hex;

  return (
    <section className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-[var(--shadow-card)] border border-border/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-muted/40 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center rounded-full"
            style={{ width: 28, height: 28, backgroundColor: `${accent}1A`, color: accent }}>
            <Icon className="h-4 w-4" />
          </span>
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight" style={{ color: "hsl(var(--brand-navy))" }}>
            {title}
          </h2>
          <span className="text-xs text-muted-foreground">
            {shipments.length} shipment{shipments.length === 1 ? "" : "s"} · {totalSubs} sub-project{totalSubs === 1 ? "" : "s"}
          </span>
        </div>
        <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", open ? "rotate-0" : "-rotate-90")} />
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-300", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="px-4 sm:px-5 pb-5 space-y-2.5">
            {shipments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic px-2 py-3">No {title.toLowerCase()} shipments here.</p>
            ) : shipments.map((s) => (
              <ShipmentRow
                key={s.id}
                shipment={s}
                subs={subs.filter((x) => x.shipmentId === s.id)}
                shipments={shipmentsAll}
                {...row}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export const ShippingPipelineView = ({
  subs, shipments, filter, onFilterChange,
  intakeCount, onOpenIntake, onOpenShipment,
  onOpenCard, onOpenMaster, onSwipeForward, onSwipeBack, onOpenPicker,
}: Props) => {
  // Filter shipments by status filter
  const visibleShipments = shipments.filter((s) => {
    if (filter === "in_transit") return s.status !== "Delivered";
    if (filter === "delivered") return s.status === "Delivered";
    if (filter === "delayed") return s.status === "Delayed" || s.status === "Customs";
    return true;
  });

  // Subs only in shipping pipeline assigned to a shipment that's visible
  const assignedSubs = subs.filter((s) => s.stage === "shipment_assigned" || s.stage === "shipment_delivered");

  const air = visibleShipments.filter((s) => s.mode === "Air");
  const ocean = visibleShipments.filter((s) => s.mode !== "Air");

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Status filter pills */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {([
          { id: "in_transit", label: "In transit" },
          { id: "delivered", label: "Delivered" },
          { id: "delayed", label: "Delayed" },
        ] as const).map((p) => (
          <button
            key={p.id}
            onClick={() => onFilterChange(p.id)}
            className={cn(
              "text-xs font-medium px-3 py-1.5 rounded-full border whitespace-nowrap transition-colors",
              filter === p.id
                ? "bg-foreground text-background border-foreground"
                : "bg-card/60 text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Intake banner */}
      {intakeCount > 0 && (
        <button
          onClick={onOpenIntake}
          className="w-full flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 sm:py-4 text-left hover:opacity-95 transition-opacity"
          style={{
            backgroundColor: "hsl(var(--brand-orange) / 0.08)",
            borderColor: "hsl(var(--brand-orange) / 0.4)",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: "hsl(var(--brand-orange))" }} />
            <div className="min-w-0">
              <div className="font-semibold text-sm sm:text-base" style={{ color: "hsl(var(--brand-navy))" }}>
                {intakeCount} sub-project{intakeCount === 1 ? "" : "s"} awaiting shipment assignment
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Tap to assign to an existing shipment or create a new one.</div>
            </div>
          </div>
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full text-white shrink-0"
            style={{ backgroundColor: "hsl(var(--brand-orange))" }}>
            Assign
          </span>
        </button>
      )}

      <Group
        title="Air"
        shipments={air}
        subs={assignedSubs}
        shipmentsAll={shipments}
        onOpenShipment={onOpenShipment}
        onOpenCard={onOpenCard}
        onOpenMaster={onOpenMaster}
        onSwipeForward={onSwipeForward}
        onSwipeBack={onSwipeBack}
        onOpenPicker={onOpenPicker}
      />

      <Group
        title="Ocean"
        shipments={ocean}
        subs={assignedSubs}
        shipmentsAll={shipments}
        onOpenShipment={onOpenShipment}
        onOpenCard={onOpenCard}
        onOpenMaster={onOpenMaster}
        onSwipeForward={onSwipeForward}
        onSwipeBack={onSwipeBack}
        onOpenPicker={onOpenPicker}
      />
    </div>
  );
};
