import { useState } from "react";
import { ChevronDown, Plane, Ship, MoreVertical } from "lucide-react";
import { Shipment, Project, getProject, PipelineCard } from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { cn } from "@/lib/utils";

export type ShippingFilter = "in_transit" | "delivered" | "delayed";

interface Props {
  subs: Project[];          // already filtered by FilterBar
  shipments: Shipment[];
  filter: ShippingFilter;
  onFilterChange: (f: ShippingFilter) => void;
  intakeCount: number;
  onOpenIntake: () => void;
  onOpenShipment: (shipmentId: string) => void;
  onOpenCard: (c: PipelineCard) => void;
  onSwipeForward: (c: PipelineCard) => void;
  onSwipeBack: (c: PipelineCard) => void;
  onOpenPicker: (c: PipelineCard) => void;
}

const formatDate = (d: Date) => `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })}`;

// Build distinct project labels from a list of projects.
function uniqueProjectLabels(projs: Project[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const s of projs) {
    const key = `${s.customer}::${s.projectName}::${s.detailSummary ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const tail = s.detailSummary ? ` · ${s.detailSummary}` : "";
    labels.push(`${s.customer} · ${s.projectName}${tail}`);
  }
  return labels;
}

interface ShipmentCardProps {
  shipment: Shipment;
  subs: Project[];
  onOpenShipment: (id: string) => void;
}

const STATUS_TONE: Record<Shipment["status"], { bg: string; fg: string; label: string }> = {
  "Booked":     { bg: "hsl(var(--brand-navy) / 0.08)", fg: "hsl(var(--brand-navy))",   label: "Booked" },
  "In Transit": { bg: "hsl(var(--brand-teal) / 0.12)", fg: "hsl(var(--brand-teal))",   label: "In Transit" },
  "Delayed":    { bg: "hsl(var(--brand-orange) / 0.12)", fg: "hsl(var(--brand-orange))", label: "Delayed" },
  "Customs":    { bg: "hsl(var(--brand-orange) / 0.12)", fg: "hsl(var(--brand-orange))", label: "Customs" },
  "Delivered":  { bg: "hsl(142 30% 35% / 0.12)",       fg: "hsl(142 30% 35%)",         label: "Delivered" },
};

const ShipmentCard = ({ shipment, subs, onOpenShipment }: ShipmentCardProps) => {
  const tone = STATUS_TONE[shipment.status];
  const projectLabels = uniqueProjectLabels(subs);
  const visibleLabels = projectLabels.slice(0, 3);
  const more = projectLabels.length - visibleLabels.length;

  return (
    <div className="relative">
      <button
        onClick={() => onOpenShipment(shipment.id)}
        className={cn(
          "w-full text-left rounded-2xl bg-card border border-border/70 overflow-hidden",
          "shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-section)] hover:-translate-y-0.5",
          "transition-all",
        )}
      >
        <span
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ backgroundColor: PIPELINE_ACCENT.shipping.hex, opacity: 0.7 }}
        />

        <div className="pl-5 pr-12 pt-5 pb-5">
          <h3 className="text-[17px] font-semibold tracking-tight leading-tight mb-2"
            style={{ color: "hsl(var(--brand-navy))" }}>
            {shipment.code}
          </h3>

          <div className="text-[14px] text-muted-foreground leading-relaxed mb-5">
            {projectLabels.length === 0 ? (
              <span className="italic">No projects assigned</span>
            ) : (
              <>
                {visibleLabels.map((l, i) => (
                  <div key={i} className="truncate">{l}</div>
                ))}
                {more > 0 && (
                  <div className="text-muted-foreground/70">+{more} more</div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-muted-foreground/80 tabular">
              {formatDate(shipment.etd)} → {formatDate(shipment.eta)}
            </span>
            <span
              className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full"
              style={{ backgroundColor: tone.bg, color: tone.fg }}
            >
              {tone.label}
            </span>
          </div>
        </div>
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onOpenShipment(shipment.id); }}
        className="absolute top-3 right-2 z-10 p-2 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
        aria-label="Shipment actions"
      >
        <MoreVertical className="h-5 w-5" />
      </button>
    </div>
  );
};

interface GroupProps {
  title: "Air" | "Ocean";
  shipments: Shipment[];
  subs: Project[];
  onOpenShipment: (id: string) => void;
}

const Group = ({ title, shipments, subs, onOpenShipment }: GroupProps) => {
  const [open, setOpen] = useState(true);
  const Icon = title === "Air" ? Plane : Ship;
  const accent = PIPELINE_ACCENT.shipping.hex;
  const totalProjects = uniqueProjectLabels(
    subs.filter((s) => shipments.some((sh) => sh.id === s.shipmentId)),
  ).length;

  return (
    <section className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-[var(--shadow-card)] border border-border/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-5 sm:p-6 hover:bg-muted/40 transition-colors"
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
            {shipments.length} shipment{shipments.length === 1 ? "" : "s"} · {totalProjects} project{totalProjects === 1 ? "" : "s"}
          </span>
        </div>
        <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", open ? "rotate-0" : "-rotate-90")} />
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-300", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="px-5 sm:px-6 pb-6 sm:pb-7 grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            {shipments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic px-2 py-3 col-span-full">
                No {title.toLowerCase()} shipments here.
              </p>
            ) : shipments.map((s) => (
              <ShipmentCard
                key={s.id}
                shipment={s}
                subs={subs.filter((x) => x.shipmentId === s.id)}
                onOpenShipment={onOpenShipment}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

interface IntakeProps {
  count: number;
  intakeSubs: Project[];
  onOpenIntake: () => void;
}

const IntakeCollapsible = ({ count, intakeSubs, onOpenIntake }: IntakeProps) => {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  const labels = uniqueProjectLabels(intakeSubs);

  return (
    <section className="bg-card/60 rounded-2xl border border-border/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-muted/40 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-[15px] font-medium text-foreground/90">
            Awaiting shipment assignment
          </h3>
          <span className="text-[11px] tabular font-medium rounded-full inline-flex items-center justify-center min-w-[22px] h-[22px] px-2 bg-muted text-muted-foreground">
            {count}
          </span>
        </div>
        <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform shrink-0", open ? "rotate-0" : "-rotate-90")} />
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-300", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="px-4 sm:px-5 pb-5 space-y-2">
            {labels.map((l, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/50 px-4 py-3"
              >
                <span className="text-sm text-foreground/90 truncate">{l}</span>
                <button
                  onClick={onOpenIntake}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full border hover:bg-muted/40 transition-colors shrink-0"
                  style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))" }}
                >
                  Assign
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export const ShippingPipelineView = ({
  subs, shipments,
  intakeCount, onOpenIntake, onOpenShipment,
}: Props) => {
  const visibleShipments = shipments.filter((s) => s.status !== "Delivered");
  const assignedSubs = subs.filter((s) => s.stage === "shipment_assigned");
  const intakeSubs = subs.filter((s) => s.stage === "shipment_required");

  const air = visibleShipments.filter((s) => s.mode === "Air");
  const ocean = visibleShipments.filter((s) => s.mode !== "Air");

  return (
    <div className="space-y-5 sm:space-y-6">
      <IntakeCollapsible count={intakeCount} intakeSubs={intakeSubs} onOpenIntake={onOpenIntake} />

      <Group title="Air" shipments={air} subs={assignedSubs} onOpenShipment={onOpenShipment} />
      <Group title="Ocean" shipments={ocean} subs={assignedSubs} onOpenShipment={onOpenShipment} />
    </div>
  );
};
