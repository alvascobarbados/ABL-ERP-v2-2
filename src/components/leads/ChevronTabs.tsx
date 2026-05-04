/**
 * Desktop-only chevron pipeline tabs.
 *
 * The chevron silhouette (notched-left + pointed-right) is structural and
 * always present on every pipeline tab regardless of state. State is
 * communicated by FILL COLOR only:
 *   - Active   → orange (current segment of the pipeline process)
 *   - Inactive → paper background with a 1px navy-15% outline
 *
 * Outline trick: each tab is a 1px-thick navy-15% chevron with a slightly
 * smaller paper/orange chevron stacked on top, producing a hairline border
 * that follows the clip-path silhouette (CSS borders don't follow clip-path).
 *
 * "All" stays a rounded pill — it's a lens, not a stage in the flow.
 */
import { cn } from "@/lib/utils";
import { PIPELINES, PipelineId } from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import type { TabId } from "./PipelineTabs";

interface Props {
  active: TabId;
  onChange: (id: TabId) => void;
  /** Filtered counts per pipeline — update live as filters change. */
  counts: Record<PipelineId, number>;
  completedCount?: number;
  pulse?: PipelineId | null;
  loading?: boolean;
}

const CountSlot = ({ value, loading, active }: { value: number; loading?: boolean; active: boolean }) => {
  if (loading) {
    return (
      <span
        aria-hidden
        className="inline-block rounded animate-pulse"
        style={{
          width: 22,
          height: 14,
          marginTop: 2,
          backgroundColor: active ? "rgba(255,255,255,0.35)" : "hsl(var(--brand-navy) / 0.15)",
        }}
      />
    );
  }
  return <>{value}</>;
};

const CHEV = 16;          // chevron point depth in px
const TAB_H = 54;         // tab height
const BORDER = 1;         // outline thickness in px

// Uniform chevron silhouette: notched-left + pointed-right (applied to ALL tabs).
const CHEVRON_CLIP = `polygon(0 0, calc(100% - ${CHEV}px) 0, 100% 50%, calc(100% - ${CHEV}px) 100%, 0 100%, ${CHEV}px 50%)`;

export const ChevronTabs = ({ active, onChange, counts, completedCount = 0, pulse, loading }: Props) => {
  const activeCount = counts.sales + counts.design + counts.purchasing + counts.production + counts.shipping + counts.finance + counts.operations;
  const flowTabs = PIPELINES.map((p) => ({ id: p.id, title: p.title, count: counts[p.id] }));
  const allActive = active === "all";
  const completedActive = active === "completed";
  const SAGE = "#6B8E5A";

  return (
    <div className="flex items-stretch gap-3 w-full">
      {/* Active pill — left bookend, square shape, navy when selected */}
      <button
        onClick={() => onChange("all")}
        className={cn(
          "shrink-0 rounded-2xl border transition-colors flex flex-col items-center justify-center px-5",
          allActive ? "text-white" : "hover:bg-[hsl(var(--brand-navy)/0.05)]",
        )}
        style={{
          minWidth: 96,
          height: TAB_H,
          backgroundColor: allActive ? "hsl(var(--brand-navy))" : "hsl(var(--background))",
          borderColor: allActive ? "hsl(var(--brand-navy))" : "hsl(var(--brand-navy) / 0.15)",
          color: allActive ? "#fff" : "hsl(var(--brand-navy))",
        }}
      >
        <span className="flex items-center gap-1.5 text-[14px] font-medium leading-tight">
          {!allActive && (
            <span className="rounded-full" style={{ backgroundColor: "hsl(var(--brand-navy))", width: 8, height: 8 }} />
          )}
          Active
        </span>
        <span className={cn("text-[18px] font-bold tabular leading-tight", !allActive && "opacity-70")}>
          <CountSlot value={activeCount} loading={loading} active={allActive} />
        </span>
      </button>

      {/* Chevron chain — interlocking, zero gap, equal width */}
      <div className="flex-1 min-w-0 flex items-stretch">
        {flowTabs.map((t, i) => {
          const isActive = active === t.id;
          const isPulsing = pulse === t.id;

          // Negative left margin so the next tab's left notch sits on top of
          // the previous tab's right point — interlocking with zero visual gap.
          const overlap = i === 0 ? 0 : -CHEV;

          const accentHex = PIPELINE_ACCENT[t.id].hex;
          const fill = isActive ? accentHex : "hsl(var(--background))";
          const outline = isActive ? accentHex : "hsl(var(--brand-navy) / 0.15)";
          const textColor = isActive ? "#fff" : "hsl(var(--brand-navy))";

          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className="relative flex-1 min-w-0 group"
              style={{
                height: TAB_H,
                marginLeft: overlap,
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                zIndex: isActive ? 2 : 1,
                outline: isPulsing ? "2px solid hsl(var(--brand-orange))" : "none",
              }}
            >
              <span
                aria-hidden
                className="absolute inset-0 transition-colors"
                style={{ clipPath: CHEVRON_CLIP, backgroundColor: outline }}
              />
              <span
                aria-hidden
                className="absolute transition-colors group-hover:[--hover-wash:hsl(var(--brand-navy)/0.05)]"
                style={{
                  top: BORDER, bottom: BORDER, left: BORDER, right: BORDER,
                  clipPath: CHEVRON_CLIP, backgroundColor: fill,
                  boxShadow: isActive ? "inset 0 0 0 9999px transparent" : undefined,
                }}
              />
              {!isActive && (
                <span
                  aria-hidden
                  className="absolute opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    top: BORDER, bottom: BORDER, left: BORDER, right: BORDER,
                    clipPath: CHEVRON_CLIP, backgroundColor: "hsl(var(--brand-navy) / 0.05)",
                  }}
                />
              )}
              <span
                className="relative flex flex-col items-center justify-center h-full"
                style={{ color: textColor, paddingLeft: CHEV + 6, paddingRight: CHEV + 6 }}
              >
                <span className="text-[14px] font-medium leading-tight tracking-tight">{t.title}</span>
                <span className="text-[18px] font-bold tabular leading-tight" style={{ opacity: isActive ? 1 : 0.7 }}>
                  <CountSlot value={t.count} loading={loading} active={isActive} />
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Completed pill — right bookend, square shape, sage green when selected */}
      <button
        onClick={() => onChange("completed")}
        className={cn(
          "shrink-0 rounded-2xl border transition-colors flex flex-col items-center justify-center px-5",
          completedActive ? "text-white" : "hover:bg-[#6B8E5A0d]",
        )}
        style={{
          minWidth: 110,
          height: TAB_H,
          backgroundColor: completedActive ? SAGE : "hsl(var(--background))",
          borderColor: completedActive ? SAGE : "hsl(var(--brand-navy) / 0.15)",
          color: completedActive ? "#fff" : "hsl(var(--brand-navy))",
        }}
      >
        <span className="flex items-center gap-1.5 text-[14px] font-medium leading-tight">
          {!completedActive && (
            <span className="rounded-full" style={{ backgroundColor: SAGE, width: 8, height: 8 }} />
          )}
          Completed
        </span>
        <span className={cn("text-[18px] font-bold tabular leading-tight", !completedActive && "opacity-70")}>
          <CountSlot value={completedCount} loading={loading} active={completedActive} />
        </span>
      </button>
    </div>
  );
};
