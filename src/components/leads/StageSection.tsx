import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { PipelineCard, StageId, STAGE_ACCENT } from "@/data/pipelines";
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

const accentBgClass: Record<string, string> = {
  indigo: "bg-stage-indigo", amber: "bg-stage-amber", emerald: "bg-stage-emerald",
  rose: "bg-stage-rose", slate: "bg-stage-slate", violet: "bg-stage-violet",
  orange: "bg-stage-orange", teal: "bg-stage-teal", sky: "bg-stage-sky",
  cyan: "bg-stage-cyan", fuchsia: "bg-stage-fuchsia",
};

export const StageSection = ({ title, stage, cards, onOpenCard, onOpenMaster, onOpenShipment, onSwipeForward, onSwipeBack, onOpenPicker }: StageSectionProps) => {
  const [open, setOpen] = useState(true);
  const accent = STAGE_ACCENT[stage];

  return (
    <section className="bg-card/70 backdrop-blur-sm rounded-2xl shadow-[var(--shadow-card)] border border-border/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-muted/40 transition-[var(--transition-smooth)]"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <span className={cn("w-2 h-2 rounded-full", accentBgClass[accent])} />
          <h2 className="font-serif-display text-lg sm:text-xl font-semibold text-foreground">{title}</h2>
          <span className="text-xs text-muted-foreground font-medium tabular-nums px-2 py-0.5 rounded-full bg-muted">
            {cards.length}
          </span>
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
