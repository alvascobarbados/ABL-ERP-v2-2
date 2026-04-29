import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { PipelineCard, StageId, PIPELINES } from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { ProjectCard } from "./ProjectCard";
import { cn } from "@/lib/utils";

interface StageSectionProps {
  title: string;
  stage: StageId;
  cards: PipelineCard[];
  onOpenCard: (c: PipelineCard) => void;
  onOpenMaster: (masterId: string) => void;
  onOpenShipment: (shipmentId: string) => void;
  onSwipeForward: (c: PipelineCard) => void;
  onSwipeBack: (c: PipelineCard) => void;
  onOpenPicker: (c: PipelineCard) => void;
}

// Each stage now derives its dot colour from the parent pipeline's brand accent.
function pipelineForStage(stage: StageId) {
  return PIPELINES.find((p) => p.stages.some((s) => s.id === stage))!.id;
}

export const StageSection = ({
  title, stage, cards, onOpenCard, onOpenMaster, onOpenShipment,
  onSwipeForward, onSwipeBack, onOpenPicker,
}: StageSectionProps) => {
  const [open, setOpen] = useState(true);
  const pipelineId = pipelineForStage(stage);
  const accentHex = PIPELINE_ACCENT[pipelineId].hex;

  return (
    <section className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-[var(--shadow-card)] border border-border/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-muted/40 transition-[var(--transition-smooth)]"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accentHex }} />
          <h2 className="text-base sm:text-lg font-medium text-foreground tracking-tight">{title}</h2>
          {cards.length > 0 && (
            <span
              className="text-[11px] tabular font-semibold rounded-full text-white inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5"
              style={{ backgroundColor: "hsl(var(--brand-orange))" }}
              title={`${cards.length} in this stage`}
            >
              {cards.length}
            </span>
          )}
          {cards.length === 0 && (
            <span className="text-[11px] tabular text-muted-foreground/60 px-2 py-0.5 rounded-full bg-muted/60">0</span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-muted-foreground transition-transform duration-300",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>

      <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="px-4 pb-4 sm:px-5 sm:pb-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {cards.length === 0 ? (
              <p className="text-sm text-muted-foreground italic col-span-full py-2">No projects.</p>
            ) : (
              cards.map((c) => (
                <ProjectCard
                  key={c.id}
                  card={c}
                  onOpen={() => onOpenCard(c)}
                  onOpenMaster={() => onOpenMaster(c.master.id)}
                  onOpenShipment={c.shipment ? () => onOpenShipment(c.shipment!.id) : undefined}
                  onSwipeForward={() => onSwipeForward(c)}
                  onSwipeBack={() => onSwipeBack(c)}
                  onOpenPicker={() => onOpenPicker(c)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
