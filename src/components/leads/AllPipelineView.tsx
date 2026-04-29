import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PIPELINES, PipelineId, PipelineCard, Project, Shipment } from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { StageSection } from "./StageSection";
import { ShippingPipelineView, ShippingFilter } from "./ShippingPipelineView";
import { cn } from "@/lib/utils";
import { useFriendlyMode, FRIENDLY_PIPELINE_SUBTITLES } from "@/hooks/useFriendlyMode";

interface Props {
  projects: Project[];
  shipments: Shipment[];
  cards: PipelineCard[]; // already globally filter-applied
  perPipelineCounts: Record<PipelineId, number>;
  hasActiveFilter: boolean;
  shippingFilter: ShippingFilter;
  onShippingFilterChange: (f: ShippingFilter) => void;
  intakeCount: number;
  onOpenIntake: () => void;
  onOpenShipment: (shipmentId: string) => void;
  onOpenCard: (c: PipelineCard) => void;
  onSwipeForward: (c: PipelineCard) => void;
  onSwipeBack: (c: PipelineCard) => void;
  onOpenPicker: (c: PipelineCard) => void;
  shippingSubs: Project[];
}

interface SectionProps {
  pipelineId: PipelineId;
  forceOpen: boolean;
  defaultOpen: boolean;
  matchCount: number;
  totalCount: number;
  hasActiveFilter: boolean;
  children: React.ReactNode;
}

const PipelineGroup = ({ pipelineId, forceOpen, defaultOpen, matchCount, totalCount, hasActiveFilter, children }: SectionProps) => {
  const [open, setOpen] = useState(defaultOpen);
  const { friendly } = useFriendlyMode();
  useEffect(() => {
    if (forceOpen) setOpen(true);
    else if (hasActiveFilter && matchCount === 0) setOpen(false);
  }, [forceOpen, hasActiveFilter, matchCount]);

  const accent = PIPELINE_ACCENT[pipelineId].hex;
  const config = PIPELINES.find((p) => p.id === pipelineId)!;
  const isEmpty = hasActiveFilter && matchCount === 0;

  return (
    <section className="rounded-2xl border border-border/60 bg-card/70 overflow-hidden shadow-[var(--shadow-card)]">
      <div className="h-[3px] w-full" style={{ backgroundColor: accent }} />
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center justify-between hover:bg-muted/40 transition-colors",
          friendly ? "p-5 sm:p-6" : "p-4 sm:p-5",
        )}
        aria-expanded={open}
        style={friendly ? { minHeight: 64 } : undefined}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="rounded-full shrink-0" style={{ backgroundColor: accent, width: 10, height: 10 }} />
          <h2
            className={cn("font-semibold tracking-tight", friendly ? "text-xl sm:text-2xl" : "text-lg sm:text-xl")}
            style={{ color: "hsl(var(--brand-navy))" }}
          >
            {config.title}
          </h2>
          <span
            className="text-[11px] tabular font-semibold rounded-full inline-flex items-center justify-center min-w-[22px] h-[22px] px-2"
            style={{
              backgroundColor: matchCount > 0 ? accent : "hsl(var(--muted))",
              color: matchCount > 0 ? "#fff" : "hsl(var(--muted-foreground))",
            }}
          >
            {hasActiveFilter ? matchCount : totalCount}
          </span>
          {friendly && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {FRIENDLY_PIPELINE_SUBTITLES[pipelineId]}
            </span>
          )}
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
          <div className={cn("px-3 sm:px-4 pb-4 sm:pb-5 pt-1 space-y-3 sm:space-y-4")}>
            {isEmpty ? (
              <p className="text-sm text-muted-foreground italic px-2 py-3">
                No matches in {config.title}.
              </p>
            ) : (
              children
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export const AllPipelineView = ({
  shipments, cards, perPipelineCounts, hasActiveFilter,
  shippingFilter, onShippingFilterChange, intakeCount, onOpenIntake, onOpenShipment,
  onOpenCard, onSwipeForward, onSwipeBack, onOpenPicker,
  shippingSubs,
}: Props) => {
  const matchCounts: Record<PipelineId, number> = {
    sales: cards.filter((c) => c.pipeline === "sales").length,
    operations: cards.filter((c) => c.pipeline === "operations").length,
    shipping: shippingSubs.length,
    finance: cards.filter((c) => c.pipeline === "finance").length,
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {PIPELINES.map((p) => {
        const pid = p.id;
        const matched = matchCounts[pid];
        const total = perPipelineCounts[pid];
        const forceOpen = hasActiveFilter && matched > 0;

        return (
          <PipelineGroup
            key={pid}
            pipelineId={pid}
            defaultOpen={false}
            forceOpen={forceOpen}
            matchCount={matched}
            totalCount={total}
            hasActiveFilter={hasActiveFilter}
          >
            {pid === "shipping" ? (
              <ShippingPipelineView
                subs={shippingSubs}
                shipments={shipments}
                filter={shippingFilter}
                onFilterChange={onShippingFilterChange}
                intakeCount={intakeCount}
                onOpenIntake={onOpenIntake}
                onOpenShipment={onOpenShipment}
                onOpenCard={onOpenCard}
                onSwipeForward={onSwipeForward}
                onSwipeBack={onSwipeBack}
                onOpenPicker={onOpenPicker}
              />
            ) : (
              p.stages.map((stage) => (
                <StageSection
                  key={stage.id}
                  title={stage.title}
                  stage={stage.id}
                  cards={cards.filter((c) => c.pipeline === pid && c.stage === stage.id)}
                  onOpenCard={onOpenCard}
                  onOpenShipment={onOpenShipment}
                  onSwipeForward={onSwipeForward}
                  onSwipeBack={onSwipeBack}
                  onOpenPicker={onOpenPicker}
                />
              ))
            )}
          </PipelineGroup>
        );
      })}
    </div>
  );
};
