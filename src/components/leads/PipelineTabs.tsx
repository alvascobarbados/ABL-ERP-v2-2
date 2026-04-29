import { cn } from "@/lib/utils";
import { PIPELINES, PipelineId } from "@/data/pipelines";
import { useFriendlyMode, FRIENDLY_PIPELINE_SUBTITLES } from "@/hooks/useFriendlyMode";

interface Props {
  active: PipelineId;
  onChange: (id: PipelineId) => void;
  counts: Record<PipelineId, number>;
  pulse?: PipelineId | null;
}

export const PipelineTabs = ({ active, onChange, counts, pulse }: Props) => {
  const { friendly } = useFriendlyMode();
  return (
    <div
      className={cn(
        "flex items-center p-1 rounded-full border w-fit",
        friendly ? "gap-2" : "gap-1.5",
      )}
      style={{ borderColor: "hsl(var(--brand-navy) / 0.15)", backgroundColor: "hsl(var(--brand-navy) / 0.04)" }}
    >
      {PIPELINES.map((p) => {
        const isActive = p.id === active;
        const isPulsing = pulse === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={cn(
              "relative font-medium rounded-full transition-[var(--transition-smooth)] flex items-center gap-1.5 border",
              friendly ? "px-4 sm:px-5 py-2 text-sm" : "text-xs sm:text-sm px-3 sm:px-4 py-1.5",
              isActive
                ? "text-white border-transparent"
                : "text-foreground/70 border-transparent hover:text-foreground hover:bg-white/60",
            )}
            style={{
              ...(isActive ? { backgroundColor: "hsl(var(--brand-navy))" } : {}),
              ...(isPulsing ? { boxShadow: "0 0 0 2px hsl(var(--brand-orange) / 0.7)" } : {}),
              ...(friendly ? { minHeight: 44 } : {}),
            }}
          >
            <span className="leading-tight">{p.title}</span>
            <span
              className={cn(
                "text-[10px] tabular font-semibold px-1.5 py-0.5 rounded-full",
              )}
              style={
                isActive
                  ? { backgroundColor: "rgba(255,255,255,0.2)", color: "#fff" }
                  : counts[p.id] > 0
                    ? { backgroundColor: "hsl(var(--brand-orange))", color: "#fff" }
                    : { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
              }
            >
              {counts[p.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
};
