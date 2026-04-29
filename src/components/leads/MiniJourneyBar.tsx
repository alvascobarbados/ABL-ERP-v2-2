import { PIPELINES, PipelineId } from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { cn } from "@/lib/utils";

interface Props {
  pipeline: PipelineId;
  className?: string;
}

const ORDER: PipelineId[] = ["sales", "operations", "shipping", "finance"];

/**
 * Tiny 3-segment bar showing where in the whole business journey a project sits.
 * Sales → Operations → Finance.
 */
export const MiniJourneyBar = ({ pipeline, className }: Props) => {
  const idx = ORDER.indexOf(pipeline);
  const accent = PIPELINE_ACCENT[pipeline].hex;
  return (
    <div className={cn("flex items-center gap-1", className)} aria-label={`Journey: ${pipeline}`}>
      {ORDER.map((p, i) => {
        const state = i < idx ? "done" : i === idx ? "current" : "future";
        const title = PIPELINES.find((x) => x.id === p)?.title ?? p;
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
