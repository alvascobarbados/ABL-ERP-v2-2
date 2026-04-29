import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { PipelineCard, StageId, PIPELINES } from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { ProjectCard } from "./ProjectCard";
import { HelpTip } from "./HelpTip";
import { cn } from "@/lib/utils";
import { useFriendlyMode, FRIENDLY_STAGE_LABELS, FRIENDLY_STAGE_HELP } from "@/hooks/useFriendlyMode";

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
  emptyHint?: string;
}

function pipelineForStage(stage: StageId) {
  return PIPELINES.find((p) => p.stages.some((s) => s.id === stage))!.id;
}

export const StageSection = ({
  title, stage, cards, onOpenCard, onOpenMaster, onOpenShipment,
  onSwipeForward, onSwipeBack, onOpenPicker, emptyHint,
}: StageSectionProps) => {
  const [open, setOpen] = useState(true);
  const pipelineId = pipelineForStage(stage);
  const accentHex = PIPELINE_ACCENT[pipelineId].hex;
  const { friendly } = useFriendlyMode();

  const TODAY = new Date(2026, 4, 8);
  const overdueCount = cards.filter((c) => c.deadlineDate.getTime() < TODAY.getTime()).length;

  const displayTitle = friendly ? FRIENDLY_STAGE_LABELS[stage] : title;

  return (
    <section className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-[var(--shadow-card)] border border-border/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center justify-between hover:bg-muted/40 transition-[var(--transition-smooth)]",
          friendly ? "p-5 sm:p-6" : "p-4 sm:p-5",
        )}
        aria-expanded={open}
        style={friendly ? { minHeight: 64 } : undefined}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="rounded-full shrink-0"
            style={{
              backgroundColor: accentHex,
              width: friendly ? 10 : 8,
              height: friendly ? 10 : 8,
            }}
          />
          <h2
            className={cn(
              "font-medium text-foreground tracking-tight truncate",
              friendly ? "text-lg sm:text-xl" : "text-base sm:text-lg",
            )}
            style={friendly ? { fontWeight: 600 } : undefined}
          >
            {displayTitle}
          </h2>
          {cards.length > 0 ? (
            <span
              className="text-[11px] tabular font-semibold rounded-full text-white inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5"
              style={{ backgroundColor: "hsl(var(--brand-orange))" }}
              title={`${cards.length} in this stage`}
            >
              {cards.length}
            </span>
          ) : (
            <span className="text-[11px] tabular text-muted-foreground/60 px-2 py-0.5 rounded-full bg-muted/60">0</span>
          )}
          <span onClick={(e) => e.stopPropagation()}>
            <HelpTip text={FRIENDLY_STAGE_HELP[stage]} label={`Help for ${title}`} />
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-muted-foreground transition-transform duration-300 shrink-0",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>

      {friendly && overdueCount > 0 && open && (
        <div
          className="mx-4 sm:mx-5 mb-3 rounded-xl border px-4 py-2.5 text-sm font-medium flex items-center gap-2"
          style={{
            backgroundColor: "hsl(var(--urgent) / 0.08)",
            borderColor: "hsl(var(--urgent) / 0.3)",
            color: "hsl(var(--urgent))",
          }}
        >
          ⚠ {overdueCount} project{overdueCount > 1 ? "s" : ""} overdue — review below
        </div>
      )}

      <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className={cn(
            "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
            friendly ? "px-4 pb-5 sm:px-5 sm:pb-6 gap-4 sm:gap-5" : "px-4 pb-4 sm:px-5 sm:pb-5 gap-3 sm:gap-4",
          )}>
            {cards.length === 0 ? (
              <div className="col-span-full py-3">
                {friendly ? (
                  <div
                    className="rounded-xl border border-dashed px-4 py-5 text-sm text-center"
                    style={{ borderColor: "hsl(var(--brand-navy) / 0.2)", color: "hsl(var(--muted-foreground))" }}
                  >
                    {emptyHint ?? "No projects here yet."}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No projects.</p>
                )}
              </div>
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
