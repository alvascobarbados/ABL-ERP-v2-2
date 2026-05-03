import { cn } from "@/lib/utils";
import { PIPELINES, PipelineId } from "@/data/pipelines";
import { useFriendlyMode } from "@/hooks/useFriendlyMode";

export type TabId = PipelineId | "all" | "completed";

interface Props {
  active: TabId;
  onChange: (id: TabId) => void;
  counts: Record<PipelineId, number>;
  completedCount?: number;
  pulse?: PipelineId | null;
}

export const PipelineTabs = ({ active, onChange, counts, completedCount = 0, pulse }: Props) => {
  const { friendly } = useFriendlyMode();
  const activeCount = counts.sales + counts.operations + counts.shipping + counts.finance;

  const tabs: { id: TabId; title: string; count: number; isAll?: boolean; isCompleted?: boolean }[] = [
    { id: "all", title: "Active", count: activeCount, isAll: true },
    ...PIPELINES.map((p) => ({ id: p.id as TabId, title: p.title, count: counts[p.id] })),
    { id: "completed", title: "Completed", count: completedCount, isCompleted: true },
  ];

  return (
    <div
      className={cn(
        "flex items-center p-1 rounded-full border w-fit overflow-x-auto no-scrollbar max-w-full",
        friendly ? "gap-2" : "gap-1.5",
      )}
      style={{ borderColor: "hsl(var(--brand-navy) / 0.15)", backgroundColor: "hsl(var(--brand-navy) / 0.04)" }}
    >
      {tabs.map((p) => {
        const isActive = p.id === active;
        const isPulsing = !p.isAll && !p.isCompleted && pulse === p.id;
        const activeBg = p.isCompleted ? "#6B8E5A" : p.isAll ? "hsl(var(--foreground))" : "hsl(var(--brand-navy))";
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={cn(
              "relative font-medium rounded-full transition-[var(--transition-smooth)] flex items-center gap-1.5 border whitespace-nowrap",
              friendly ? "px-4 sm:px-5 py-2 text-sm" : "text-xs sm:text-sm px-3 sm:px-4 py-1.5",
              isActive
                ? "text-white border-transparent"
                : "text-foreground/70 border-transparent hover:text-foreground hover:bg-white/60",
            )}
            style={{
              ...(isActive ? { backgroundColor: activeBg } : {}),
              ...(isPulsing ? { boxShadow: "0 0 0 2px hsl(var(--brand-orange) / 0.7)" } : {}),
              ...(friendly ? { minHeight: 44 } : {}),
            }}
          >
            <span className="leading-tight">{p.title}</span>
            <span
              className="text-[10px] tabular font-semibold px-1.5 py-0.5 rounded-full"
              style={
                isActive
                  ? { backgroundColor: "rgba(255,255,255,0.2)", color: "#fff" }
                  : p.count > 0
                    ? {
                        backgroundColor: p.isCompleted
                          ? "#6B8E5A"
                          : p.isAll
                            ? "hsl(var(--foreground))"
                            : "hsl(var(--brand-orange))",
                        color: "#fff",
                      }
                    : { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
              }
            >
              {p.count}
            </span>
          </button>
        );
      })}
    </div>
  );
};
