import { useState } from "react";
import { ChevronDown, Plane, Ship, MoreVertical } from "lucide-react";
import { Shipment, Project, PipelineCard, formatShipmentTitle } from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { cn } from "@/lib/utils";

export type ShippingFilter = "in_transit" | "delivered" | "delayed";

interface Props {
  subs: Project[];
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

const STATUS_TONE: Record<Shipment["status"], { bg: string; fg: string; label: string }> = {
  "Booked":     { bg: "hsl(var(--brand-navy) / 0.08)",  fg: "hsl(var(--brand-navy))",   label: "Booked" },
  "In Transit": { bg: "hsl(var(--brand-teal) / 0.12)",  fg: "hsl(var(--brand-teal))",   label: "In Transit" },
  "Delayed":    { bg: "hsl(var(--brand-orange) / 0.12)",fg: "hsl(var(--brand-orange))", label: "Delayed" },
  "Customs":    { bg: "hsl(var(--brand-orange) / 0.12)",fg: "hsl(var(--brand-orange))", label: "Customs" },
  "Delivered":  { bg: "hsl(142 30% 35% / 0.12)",        fg: "hsl(142 30% 35%)",         label: "Delivered" },
};

interface ShipmentCardProps {
  shipment: Shipment;
  subs: Project[];
  onOpenShipment: (id: string) => void;
}

/**
 * Shipment card that follows the universal ProjectCard skeleton:
 *   identity block (left) + optional right block (mode icon)
 *   ⋮ top-right
 *   divider
 *   bottom-left metadata + bottom-right deadline/status
 */
const ShipmentCard = ({ shipment, subs, onOpenShipment }: ShipmentCardProps) => {
  const tone = STATUS_TONE[shipment.status];
  const projectLabels = uniqueProjectLabels(subs);
  const visibleLabels = projectLabels.slice(0, 3);
  const more = projectLabels.length - visibleLabels.length;
  const pipelineHex = PIPELINE_ACCENT.shipping.hex;
  const ModeIcon = shipment.mode === "Air" ? Plane : Ship;

  return (
    <div className="relative">
      <div
        className={cn(
          "group w-full text-left relative overflow-hidden rounded-2xl bg-card border border-border/70",
          "shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-section)] hover:-translate-y-0.5",
          "transition-all",
        )}
      >
        {/* Pipeline accent stripe */}
        <span
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ backgroundColor: pipelineHex, opacity: 0.7 }}
        />

        {/* ⋮ top-right */}
        <button
          onClick={(e) => { e.stopPropagation(); onOpenShipment(shipment.id); }}
          className="absolute top-3 right-2 z-10 p-2 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
          aria-label="Shipment actions"
        >
          <MoreVertical className="h-5 w-5" />
        </button>

        <button
          onClick={() => onOpenShipment(shipment.id)}
          className="w-full text-left pl-5 pr-5 pt-5 pb-5"
        >
          {/* TOP: identity (left) + mode icon (right) */}
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0 pr-9">
              <h3 className="text-[17px] font-semibold tracking-tight text-foreground leading-tight">
                {formatShipmentTitle(shipment)}
              </h3>
              <div className="mt-1 space-y-0.5">
                {projectLabels.length === 0 ? (
                  <p
                    className="text-[14px] leading-snug italic text-muted-foreground/70"
                  >
                    No projects assigned
                  </p>
                ) : (
                  <>
                    {visibleLabels.map((l, i) => (
                      <p
                        key={i}
                        className="text-[14px] leading-snug truncate"
                        style={{ color: "hsl(var(--brand-navy))" }}
                      >
                        {l}
                      </p>
                    ))}
                    {more > 0 && (
                      <p className="text-[13px] text-muted-foreground/70 leading-snug">
                        +{more} more
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Right block: mode icon */}
            <div className="shrink-0 mt-0.5 mr-7 inline-flex items-center gap-1.5">
              <ModeIcon
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: "hsl(var(--brand-navy) / 0.55)" }}
              />
              <span
                className="text-[13px] font-medium"
                style={{ color: "hsl(var(--brand-navy))" }}
              >
                {shipment.mode === "Air" ? (shipment.carrier ?? "Air") : shipment.mode}
              </span>
            </div>
          </div>

          {/* DIVIDER */}
          <div
            className="mt-4 mb-3 h-px w-full"
            style={{ backgroundColor: "hsl(var(--brand-navy) / 0.08)" }}
          />

          {/* BOTTOM: ETD→ETA (left) + status pill (right) */}
          <div className="flex items-center justify-between gap-3 min-h-[18px]">
            <span className="text-[12px] text-muted-foreground/85 tabular leading-none">
              {formatDate(shipment.etd)} → {formatDate(shipment.eta)}
            </span>
            <span
              className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full leading-none"
              style={{ backgroundColor: tone.bg, color: tone.fg }}
            >
              {tone.label}
            </span>
          </div>
        </button>
      </div>
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
        className="w-full flex items-center justify-between p-5 sm:p-6 hover:bg-muted/40 transition-[var(--transition-smooth)]"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Match StageSection: small accent dot, then icon inline with title */}
          <span
            className="rounded-full shrink-0"
            style={{ backgroundColor: accent, opacity: 0.7, width: 8, height: 8 }}
          />
          <Icon className="h-4 w-4 shrink-0" style={{ color: accent }} />
          <h2
            className="font-semibold tracking-tight truncate text-lg sm:text-xl"
            style={{ color: "hsl(var(--brand-navy))" }}
          >
            {title}
          </h2>
          <span
            className="text-[11px] tabular font-semibold rounded-full inline-flex items-center justify-center min-w-[22px] h-[22px] px-2"
            style={{ backgroundColor: "hsl(var(--brand-navy) / 0.08)", color: "hsl(var(--brand-navy))" }}
          >
            {shipments.length}
          </span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            · {totalProjects} project{totalProjects === 1 ? "" : "s"}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-muted-foreground transition-transform duration-300 shrink-0",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 px-5 pb-6 sm:px-6 sm:pb-7 gap-5 sm:gap-6">
            {shipments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic col-span-full py-3">
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
  const accent = "hsl(var(--brand-orange))";

  return (
    <section className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-[var(--shadow-card)] border border-border/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-5 sm:p-6 hover:bg-muted/40 transition-[var(--transition-smooth)]"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="rounded-full shrink-0"
            style={{ backgroundColor: accent, opacity: 0.85, width: 8, height: 8 }}
          />
          <h2
            className="font-semibold tracking-tight truncate text-lg sm:text-xl"
            style={{ color: "hsl(var(--brand-navy))" }}
          >
            Awaiting shipment
          </h2>
          <span
            className="text-[11px] tabular font-semibold rounded-full inline-flex items-center justify-center min-w-[22px] h-[22px] px-2"
            style={{ backgroundColor: "hsl(var(--brand-orange) / 0.12)", color: "hsl(var(--brand-orange))" }}
          >
            {count}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-muted-foreground transition-transform duration-300 shrink-0",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="px-5 pb-6 sm:px-6 sm:pb-7 space-y-3">
            {labels.map((l, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-[var(--shadow-card)]"
              >
                <span className="text-sm truncate" style={{ color: "hsl(var(--brand-navy))" }}>{l}</span>
                <button
                  onClick={onOpenIntake}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full text-white shrink-0"
                  style={{ backgroundColor: "hsl(var(--brand-navy))" }}
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
