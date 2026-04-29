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
    <div className="flex items-center gap-1.5 p-1 rounded-full border w-fit"
      style={{ borderColor: "hsl(var(--brand-navy) / 0.15)", backgroundColor: "hsl(var(--brand-navy) / 0.04)" }}>
      {PIPELINES.map((p) => {
        const isActive = p.id === active;
        const isPulsing = pulse === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={cn(
              "relative text-xs sm:text-sm font-medium px-3 sm:px-4 py-1.5 rounded-full transition-[var(--transition-smooth)] flex items-center gap-1.5 border",
              isActive
                ? "text-white border-transparent"
                : "text-foreground/70 border-transparent hover:text-foreground hover:bg-white/60",
            )}
            style={{
              ...(isActive ? { backgroundColor: "hsl(var(--brand-navy))" } : {}),
              ...(isPulsing ? { boxShadow: "0 0 0 2px hsl(var(--brand-orange) / 0.7)" } : {}),
            }}
          >
            {p.title}
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
