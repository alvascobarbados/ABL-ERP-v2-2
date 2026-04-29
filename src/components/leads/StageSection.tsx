import { useEffect, useState } from "react";
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
  onOpenShipment: (shipmentId: string) => void;
  onSwipeForward: (c: PipelineCard) => void;
  onSwipeBack: (c: PipelineCard) => void;
  onOpenPicker: (c: PipelineCard) => void;
  emptyHint?: string;
}

function pipelineForStage(stage: StageId) {
  return PIPELINES.find((p) => p.stages.some((s) => s.id === stage))!.id;
}

const COLLAPSED_BY_DEFAULT: StageId[] = ["archive"];

export const StageSection = ({
  title, stage, cards, onOpenCard,
  onSwipeForward, onSwipeBack, onOpenPicker, emptyHint,
}: StageSectionProps) => {
  const collapsedDefault = COLLAPSED_BY_DEFAULT.includes(stage);
  const [open, setOpen] = useState(!collapsedDefault);
  useEffect(() => { if (collapsedDefault) setOpen(false); }, [collapsedDefault]);
  const pipelineId = pipelineForStage(stage);
  const accentHex = PIPELINE_ACCENT[pipelineId].hex;

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
            style={{ backgroundColor: accentHex, opacity: 0.7, width: 8, height: 8 }}
          />
          <h2
            className="font-semibold text-foreground tracking-tight truncate text-lg sm:text-xl"
            style={{ color: "hsl(var(--brand-navy))" }}
          >
            {title}
          </h2>
          {cards.length > 0 ? (
            <span
              className="text-[11px] tabular font-semibold rounded-full inline-flex items-center justify-center min-w-[22px] h-[22px] px-2"
              style={{ backgroundColor: "hsl(var(--brand-navy) / 0.08)", color: "hsl(var(--brand-navy))" }}
              title={`${cards.length} in this stage`}
            >
              {cards.length}
            </span>
          ) : (
            <span className="text-[11px] tabular text-muted-foreground/60 px-2 py-0.5 rounded-full bg-muted/60">0</span>
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 px-5 pb-6 sm:px-6 sm:pb-7 gap-5 sm:gap-6">
            {cards.length === 0 ? (
              <div className="col-span-full py-3">
                <p className="text-sm text-muted-foreground italic">{emptyHint ?? "No projects."}</p>
              </div>
            ) : (
              cards.map((c) => (
                <ProjectCard
                  key={c.id}
                  card={c}
                  onOpen={() => onOpenCard(c)}
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
