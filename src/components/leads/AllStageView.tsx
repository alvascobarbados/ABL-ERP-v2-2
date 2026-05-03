import { StageCard, Project, Shipment } from "@/data/states";
import { ProjectCard } from "./ProjectCard";

interface Props {
  projects: Project[];
  shipments: Shipment[];
  /** Already globally filter-applied AND sorted. */
  cards: StageCard[];
  perPipelineCounts: Record<string, number>;
  hasActiveFilter: boolean;
  // Shipping-specific props are accepted for API back-compat but unused
  // in the flat All view. Kept so Index.tsx doesn't need to branch.
  shippingFilter: unknown;
  onShippingFilterChange: (f: unknown) => void;
  intakeCount: number;
  onOpenIntake: () => void;
  onOpenShipment: (shipmentId: string) => void;
  onOpenCard: (c: StageCard) => void;
  onSwipeForward: (c: StageCard) => void;
  onSwipeBack: (c: StageCard) => void;
  onOpenPicker: (c: StageCard) => void;
  shippingSubs: Project[];
}

/**
 * Flat All view. No state section headers, no collapsible groups.
 * Cards render as one continuous list in active-sort order.
 * Each card carries a quiet "State · State" label so the user
 * always knows what state a card is in, even without a header.
 */
export const AllPipelineView = ({
  cards, hasActiveFilter, onOpenCard, onSwipeForward, onSwipeBack, onOpenPicker,
}: Props) => {
  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/70 px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground italic">
          {hasActiveFilter ? "No projects match the current filter." : "No projects."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6">
      {cards.map((c) => (
        <ProjectCard
          key={c.id}
          card={c}
          showStageLabel
          onOpen={() => onOpenCard(c)}
          onSwipeForward={() => onSwipeForward(c)}
          onSwipeBack={() => onSwipeBack(c)}
          onOpenPicker={() => onOpenPicker(c)}
        />
      ))}
    </div>
  );
};
