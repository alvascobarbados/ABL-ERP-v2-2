import { STAGES, PipelineId } from "@/data/stages";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { cn } from "@/lib/utils";

interface Props {
  stage: PipelineId;
  className?: string;
}

const ORDER: PipelineId[] = ["sales", "operations", "shipping", "finance"];

/**
 * Tiny 3-segment bar showing where in the whole business journey a project sits.
 * Sales → Operations → Finance.
 */
export const MiniJourneyBar = ({ stage, className }: Props) => {
  const idx = ORDER.indexOf(stage);
  const accent = PIPELINE_ACCENT[stage].hex;
  return (
    <div className={cn("flex items-center gap-1", className)} aria-label={`Journey: ${stage}`}>
      {ORDER.map((p, i) => {
        const state = i < idx ? "done" : i === idx ? "current" : "future";
        const title = STAGES.find((x) => x.id === p)?.title ?? p;
        return (
          <span
            key={p}
            title={title}
            className={cn(
              "h-1 w-6 rounded-full transition-colors",
              state === "done" && "bg-muted-foreground/40",
              state === "future" && "border border-muted-foreground/30 bg-transparent",
            )}
            style={state === "current" ? { backgroundColor: accent } : undefined}
          />
        );
      })}
    </div>
  );
};
