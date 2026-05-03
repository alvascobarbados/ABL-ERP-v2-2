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
import type { TabId } from "./PipelineTabs";

interface Props {
  active: TabId;
  onChange: (id: TabId) => void;
  /** Filtered counts per pipeline — update live as filters change. */
  counts: Record<PipelineId, number>;
  pulse?: PipelineId | null;
}

const CHEV = 16;          // chevron point depth in px
const TAB_H = 60;         // tab height
const BORDER = 1;         // outline thickness in px

// Uniform chevron silhouette: notched-left + pointed-right (applied to ALL tabs).
const CHEVRON_CLIP = `polygon(0 0, calc(100% - ${CHEV}px) 0, 100% 50%, calc(100% - ${CHEV}px) 100%, 0 100%, ${CHEV}px 50%)`;

export const ChevronTabs = ({ active, onChange, counts, pulse }: Props) => {
  const allCount = counts.sales + counts.operations + counts.shipping + counts.finance;
  const flowTabs = PIPELINES.map((p) => ({ id: p.id, title: p.title, count: counts[p.id] }));
  const allActive = active === "all";

  return (
    <div className="flex items-stretch gap-3 w-full">
      {/* All pill — separate lens, stays rounded, active = navy (NOT orange) */}
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
        <span className="text-[14px] font-medium leading-tight">All</span>
        <span className={cn("text-[18px] font-bold tabular leading-tight", !allActive && "opacity-70")}>
          {allCount}
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

          const fill = isActive ? "hsl(var(--brand-orange))" : "hsl(var(--background))";
          const outline = isActive ? "hsl(var(--brand-orange))" : "hsl(var(--brand-navy) / 0.15)";
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
              {/* Outer chevron = outline color */}
              <span
                aria-hidden
                className="absolute inset-0 transition-colors"
                style={{
                  clipPath: CHEVRON_CLIP,
                  backgroundColor: outline,
                }}
              />
              {/* Inner chevron = fill color, inset by BORDER on all sides
                  to leave a hairline outline visible from the outer layer */}
              <span
                aria-hidden
                className="absolute transition-colors group-hover:[--hover-wash:hsl(var(--brand-navy)/0.05)]"
                style={{
                  top: BORDER,
                  bottom: BORDER,
                  left: BORDER,
                  right: BORDER,
                  clipPath: CHEVRON_CLIP,
                  backgroundColor: fill,
                  boxShadow: isActive ? "inset 0 0 0 9999px transparent" : undefined,
                }}
              />
              {/* Hover wash (inactive only) — paper layer overlay */}
              {!isActive && (
                <span
                  aria-hidden
                  className="absolute opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    top: BORDER,
                    bottom: BORDER,
                    left: BORDER,
                    right: BORDER,
                    clipPath: CHEVRON_CLIP,
                    backgroundColor: "hsl(var(--brand-navy) / 0.05)",
                  }}
                />
              )}
              {/* Label + count */}
              <span
                className="relative flex flex-col items-center justify-center h-full"
                style={{
                  color: textColor,
                  // Pad past notch on the left and past the point on the right
                  // so text stays clear of the chevron edges.
                  paddingLeft: CHEV + 6,
                  paddingRight: CHEV + 6,
                }}
              >
                <span className="text-[14px] font-medium leading-tight tracking-tight">{t.title}</span>
                <span
                  className="text-[18px] font-bold tabular leading-tight"
                  style={{ opacity: isActive ? 1 : 0.7 }}
                >
                  {t.count}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
