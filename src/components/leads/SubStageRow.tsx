/**
 * SubStageRow — full-width persistent sub-stage pill row.
 *
 * Always rendered (reserves vertical space) so the filter row never jumps
 * vertically when switching between tabs that do/don't have sub-stages.
 *
 * Populated for: sales, design, finance.
 * Empty (neutral background) for: all, purchasing, production, shipping, completed.
 */
import { PIPELINES, PipelineId, StageId } from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import type { TabId } from "./PipelineTabs";

interface Props {
  activeTab: TabId;
  selectedStage: StageId | null;
  onSelect: (stage: StageId | null) => void;
  stageCounts: Partial<Record<StageId, number>>;
}

const MULTI_STAGE: PipelineId[] = ["sales", "design", "finance"];
const ROW_HEIGHT = 54;

export const SubStageRow = ({ activeTab, selectedStage, onSelect, stageCounts }: Props) => {
  const isMulti =
    activeTab !== "all" &&
    activeTab !== "completed" &&
    MULTI_STAGE.includes(activeTab as PipelineId);

  if (!isMulti) {
    // Empty placeholder — preserves layout
    return (
      <div
        aria-hidden
        style={{ height: ROW_HEIGHT }}
      />
    );
  }

  const pipelineId = activeTab as PipelineId;
  const pipeline = PIPELINES.find((p) => p.id === pipelineId)!;
  const accent = PIPELINE_ACCENT[pipelineId].hex;
  const total = pipeline.stages.length;

  const ramp = (i: number) => {
    if (total <= 1) return 1;
    const min = 0.32;
    return min + ((1 - min) * i) / (total - 1);
  };

  return (
    <div
      className="flex items-center w-full"
      style={{ height: ROW_HEIGHT }}
    >
      <div className="flex-1 min-w-0 flex items-center" style={{ gap: 8 }}>
        {pipeline.stages.map((s, i) => {
          const isActive = selectedStage === s.id;
          const count = stageCounts[s.id] ?? 0;
          const shade = ramp(i);
          const pct = Math.round(shade * 100);
          const fill = isActive
            ? `color-mix(in srgb, ${accent} ${pct}%, #FFFFFF)`
            : "#FFFFFF";
          const border = isActive
            ? "transparent"
            : `color-mix(in srgb, ${accent} ${Math.round(shade * 45)}%, transparent)`;
          const labelColor = isActive
            ? "#FFFFFF"
            : `color-mix(in srgb, ${accent} ${pct}%, hsl(var(--brand-navy)))`;
          const countColor = isActive ? "#FFFFFF" : accent;
          const countOpacity = isActive ? 1 : 0.85;

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(isActive ? null : s.id)}
              className="flex items-center justify-between rounded-full transition-colors"
              style={{
                padding: "7px 14px",
                backgroundColor: fill,
                border: `1px solid ${border}`,
                cursor: "pointer",
                boxShadow: isActive ? `0 1px 2px color-mix(in srgb, ${accent} 30%, transparent)` : "none",
                gap: 10,
              }}
            >
              <span
                className="font-medium tracking-tight truncate"
                style={{ fontSize: 12, color: labelColor }}
              >
                {s.title}
              </span>
              <span
                className="font-semibold tabular shrink-0"
                style={{ fontSize: 12, color: countColor, opacity: countOpacity, lineHeight: 1 }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
