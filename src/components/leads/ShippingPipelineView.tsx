import { useState } from "react";
import { ChevronDown, Plane, Ship } from "lucide-react";
import { Shipment, Project, PipelineCard, buildCard, getShipment } from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { ProjectCard } from "./ProjectCard";

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

interface GroupProps {
  title: "Air" | "Ocean";
  shipments: Shipment[];
  subs: Project[];
  onOpenCard: (c: PipelineCard) => void;
  onSwipeForward: (c: PipelineCard) => void;
  onSwipeBack: (c: PipelineCard) => void;
  onOpenPicker: (c: PipelineCard) => void;
}

const Group = ({ title, shipments, subs, onOpenCard, onSwipeForward, onSwipeBack, onOpenPicker }: GroupProps) => {
  const [open, setOpen] = useState(true);
  const Icon = title === "Air" ? Plane : Ship;
  const accent = PIPELINE_ACCENT.shipping.hex;

  // Subs that belong to one of these shipments (clustered & ordered by shipment list order)
  const groupSubs: Project[] = shipments.flatMap((sh) =>
    subs.filter((s) => s.shipmentId === sh.id),
  );
  // Tail: subs whose shipping mode matches but whose shipment isn't in the
  // current visible list (rare — keeps things lossless)
  const groupSubIds = new Set(groupSubs.map((s) => s.id));
  const tail = subs.filter((s) => {
    if (groupSubIds.has(s.id)) return false;
    if (title === "Air") return s.shippingMode === "Air";
    return s.shippingMode === "Ocean";
  });
  const allSubs = [...groupSubs, ...tail];
  const totalProjects = uniqueProjectLabels(allSubs).length;

  return (
    <section className="no-select bg-card/80 backdrop-blur-sm rounded-2xl shadow-[var(--shadow-card)] border border-border/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-5 sm:p-6 hover:bg-muted/40 transition-[var(--transition-smooth)]"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
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
            {allSubs.length}
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
          <div className="px-5 pb-6 sm:px-6 sm:pb-7 space-y-4">
            {allSubs.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-3">
                No {title.toLowerCase()} shipments here.
              </p>
            ) : allSubs.map((s) => {
              const card = buildCard(s);
              return (
                <ProjectCard
                  key={s.id}
                  card={card}
                  onOpen={() => onOpenCard(card)}
                  onSwipeForward={() => onSwipeForward(card)}
                  onSwipeBack={() => onSwipeBack(card)}
                  onOpenPicker={() => onOpenPicker(card)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

interface IntakeProps {
  count: number;
  intakeSubs: Project[];
  onOpenCard: (c: PipelineCard) => void;
  onSwipeForward: (c: PipelineCard) => void;
  onSwipeBack: (c: PipelineCard) => void;
  onOpenPicker: (c: PipelineCard) => void;
  onOpenIntake: () => void;
}

const IntakeCollapsible = ({ count, intakeSubs, onOpenCard, onSwipeForward, onSwipeBack, onOpenPicker, onOpenIntake }: IntakeProps) => {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  const accent = "hsl(var(--brand-orange))";

  return (
    <section className="no-select bg-card/80 backdrop-blur-sm rounded-2xl shadow-[var(--shadow-card)] border border-border/60 overflow-hidden">
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
          <div className="px-5 pb-6 sm:px-6 sm:pb-7 space-y-4">
            {intakeSubs.map((s) => {
              const card = buildCard(s);
              return (
                <ProjectCard
                  key={s.id}
                  card={card}
                  onOpen={() => onOpenCard(card)}
                  onSwipeForward={() => onSwipeForward(card)}
                  onSwipeBack={() => onSwipeBack(card)}
                  onOpenPicker={() => onOpenPicker(card)}
                />
              );
            })}
            <button
              onClick={onOpenIntake}
              className="w-full text-xs font-semibold px-4 py-2.5 rounded-full text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "hsl(var(--brand-navy))" }}
            >
              Assign to shipment…
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export const ShippingPipelineView = ({
  subs, shipments,
  intakeCount, onOpenIntake,
  onOpenCard, onSwipeForward, onSwipeBack, onOpenPicker,
}: Props) => {
  const visibleShipments = shipments.filter((s) => s.status !== "Delivered");
  const assignedSubs = subs.filter((s) => s.stage === "shipment_assigned");
  const intakeSubs = subs.filter((s) => s.stage === "shipment_required");

  const air = visibleShipments.filter((s) => s.mode === "Air");
  const ocean = visibleShipments.filter((s) => s.mode !== "Air");

  // Air subs = subs whose shipment is air OR whose shipping mode is Air
  const airSubs = assignedSubs.filter((s) => {
    const sh = getShipment(s.shipmentId);
    return sh ? sh.mode === "Air" : s.shippingMode === "Air";
  });
  const oceanSubs = assignedSubs.filter((s) => {
    const sh = getShipment(s.shipmentId);
    return sh ? sh.mode !== "Air" : s.shippingMode === "Ocean";
  });

  return (
    <div className="space-y-5 sm:space-y-6">
      <IntakeCollapsible
        count={intakeCount}
        intakeSubs={intakeSubs}
        onOpenCard={onOpenCard}
        onSwipeForward={onSwipeForward}
        onSwipeBack={onSwipeBack}
        onOpenPicker={onOpenPicker}
        onOpenIntake={onOpenIntake}
      />
      <Group
        title="Air"
        shipments={air}
        subs={airSubs}
        onOpenCard={onOpenCard}
        onSwipeForward={onSwipeForward}
        onSwipeBack={onSwipeBack}
        onOpenPicker={onOpenPicker}
      />
      <Group
        title="Ocean"
        shipments={ocean}
        subs={oceanSubs}
        onOpenCard={onOpenCard}
        onSwipeForward={onSwipeForward}
        onSwipeBack={onSwipeBack}
        onOpenPicker={onOpenPicker}
      />
    </div>
  );
};
