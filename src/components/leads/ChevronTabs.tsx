/**
 * Desktop-only chevron pipeline tabs (Salesforce-style flow).
 * "All" is a rounded pill on the left; Sales/Production/Shipping/Finance
 * are chevron-shaped tabs chained left-to-right that signal forward flow.
 *
 * Mobile uses the original PipelineTabs (rendered separately).
 */
import { cn } from "@/lib/utils";
import { PIPELINES, PipelineId } from "@/data/pipelines";
import type { TabId } from "./PipelineTabs";

interface Props {
  active: TabId;
  onChange: (id: TabId) => void;
  /** Filtered counts per pipeline — update live as filters change. */
  counts: Record<PipelineId, number>;
  pulse?: PipelineId | null;
}

const CHEV = 18; // chevron depth in px

export const ChevronTabs = ({ active, onChange, counts, pulse }: Props) => {
  const allCount = counts.sales + counts.operations + counts.shipping + counts.finance;
  const flowTabs = PIPELINES.map((p) => ({ id: p.id, title: p.title, count: counts[p.id] }));

  return (
    <div className="flex items-stretch gap-2 w-full">
      {/* All pill */}
      <button
        onClick={() => onChange("all")}
        className={cn(
          "shrink-0 rounded-2xl border transition-colors flex flex-col items-center justify-center px-5",
          active === "all" ? "text-white" : "hover:bg-white/60",
        )}
        style={{
          minWidth: 110,
          height: 60,
          backgroundColor: active === "all" ? "hsl(var(--foreground))" : "hsl(var(--background))",
          borderColor: active === "all" ? "hsl(var(--foreground))" : "hsl(var(--brand-navy) / 0.15)",
          color: active === "all" ? "#fff" : "hsl(var(--brand-navy))",
        }}
      >
        <span className="text-[13px] font-semibold leading-tight">All</span>
        <span className="text-[16px] font-bold tabular leading-tight">{allCount}</span>
      </button>

      {/* Chevron flow */}
      <div className="flex-1 min-w-0 flex items-stretch" style={{ gap: 4 }}>
        {flowTabs.map((t, i) => {
          const isActive = active === t.id;
          const isFirst = i === 0;
          const isPulsing = pulse === t.id;
          // First tab has flat left edge; others have left notch matching previous chevron point.
          const clipPath = isFirst
            ? `polygon(0 0, calc(100% - ${CHEV}px) 0, 100% 50%, calc(100% - ${CHEV}px) 100%, 0 100%)`
            : `polygon(0 0, calc(100% - ${CHEV}px) 0, 100% 50%, calc(100% - ${CHEV}px) 100%, 0 100%, ${CHEV}px 50%)`;

          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={cn(
                "relative flex-1 min-w-0 transition-all flex flex-col items-center justify-center",
                isActive ? "text-white" : "hover:brightness-95",
              )}
              style={{
                height: 60,
                clipPath,
                backgroundColor: isActive ? "hsl(var(--brand-navy))" : "hsl(var(--background))",
                color: isActive ? "#fff" : "hsl(var(--brand-navy))",
                border: "none",
                outline: isPulsing ? "2px solid hsl(var(--brand-orange))" : "none",
                paddingLeft: isFirst ? 12 : CHEV + 8,
                paddingRight: CHEV + 8,
                boxShadow: isActive ? "0 2px 6px hsl(222 30% 12% / 0.15)" : "inset 0 0 0 1.5px hsl(var(--brand-navy) / 0.12)",
              }}
            >
              <span className="text-[13px] font-semibold leading-tight tracking-tight">{t.title}</span>
              <span className="text-[16px] font-bold tabular leading-tight">{t.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
