import { cn } from "@/lib/utils";
import { PIPELINES, PipelineId } from "@/data/pipelines";

interface Props {
  active: PipelineId;
  onChange: (id: PipelineId) => void;
  counts: Record<PipelineId, number>;
  pulse?: PipelineId | null;
}

export const PipelineTabs = ({ active, onChange, counts, pulse }: Props) => {
  return (
    <div className="flex items-center gap-1.5 p-1 rounded-full bg-muted/70 border border-border/60 w-fit">
      {PIPELINES.map((p) => {
        const isActive = p.id === active;
        const isPulsing = pulse === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={cn(
              "relative text-xs sm:text-sm font-medium px-3 sm:px-4 py-1.5 rounded-full transition-[var(--transition-smooth)] flex items-center gap-1.5",
              isActive
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              isPulsing && "ring-2 ring-offset-1 ring-offset-background",
            )}
            style={isPulsing ? { boxShadow: "0 0 0 2px hsl(var(--swipe-forward) / 0.55)" } : undefined}
          >
            {p.title}
            <span className={cn("text-[10px] tabular-nums px-1.5 py-0.5 rounded-full", isActive ? "bg-muted text-foreground/70" : "bg-card/50 text-muted-foreground")}>
              {counts[p.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
};
