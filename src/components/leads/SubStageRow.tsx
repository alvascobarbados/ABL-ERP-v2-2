/**
 * SubStageRow — persistent sub-stage pill row.
 *
 * Always rendered (reserves vertical space) so the filter row never jumps
 * between tabs that do/don't have sub-stages.
 *
 * Populated for: sales, design, finance.
 * For pipelines without sub-stages, renders an inline "No sub-stages for X"
 * hint (the parent row label dims separately in Index.tsx).
 *
 * All pills share a uniform soft-orange treatment regardless of position.
 * The selected pill flips to solid orange + white text.
 */
import { PIPELINES, PipelineId, StageId } from "@/data/pipelines";
import type { TabId } from "./PipelineTabs";

interface Props {
  activeTab: TabId;
  selectedStage: StageId | null;
  onSelect: (stage: StageId | null) => void;
  stageCounts: Partial<Record<StageId, number>>;
}

const MULTI_STAGE: PipelineId[] = ["sales", "design", "finance"];
const ROW_HEIGHT = 40;
const ORANGE = "#E97B2C";
const PILL_BG = "rgba(233,123,44,0.12)";
const PILL_BORDER = "rgba(233,123,44,0.35)";

const PIPELINE_LABEL: Partial<Record<TabId, string>> = {
  all: "All",
  purchasing: "Purchasing",
  production: "Production",
  shipping: "Shipping",
  completed: "Completed",
};

export const SubStageRow = ({ activeTab, selectedStage, onSelect, stageCounts }: Props) => {
  const isMulti =
    activeTab !== "all" &&
    activeTab !== "completed" &&
    MULTI_STAGE.includes(activeTab as PipelineId);

  if (!isMulti) {
    const label = PIPELINE_LABEL[activeTab] ?? "this pipeline";
    return (
      <div
        className="flex items-center w-full"
        style={{ height: ROW_HEIGHT }}
      >
        <span
          style={{
            fontSize: 11,
            fontStyle: "italic",
            color: "rgba(27,42,78,0.35)",
          }}
        >
          No sub-stages for {label}
        </span>
      </div>
    );
  }

  const pipelineId = activeTab as PipelineId;
  const pipeline = PIPELINES.find((p) => p.id === pipelineId)!;

  return (
    <div
      className="flex items-center w-full"
      style={{ height: ROW_HEIGHT }}
    >
      <div className="flex-1 min-w-0 flex items-center" style={{ gap: 8 }}>
        {pipeline.stages.map((s) => {
          const isActive = selectedStage === s.id;
          const count = stageCounts[s.id] ?? 0;
          const fill = isActive ? ORANGE : PILL_BG;
          const border = isActive ? ORANGE : PILL_BORDER;
          const labelColor = isActive ? "#FFFFFF" : "#7A3A10";
          const countColor = isActive ? "#FFFFFF" : "#7A3A10";

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
                boxShadow: isActive ? `0 1px 2px rgba(233,123,44,0.30)` : "none",
                gap: 10,
              }}
            >
              <span
                className="tracking-tight truncate"
                style={{ fontSize: 12, color: labelColor, fontWeight: 600 }}
              >
                {s.title}
              </span>
              <span
                className="tabular shrink-0"
                style={{ fontSize: 12, color: countColor, lineHeight: 1, fontWeight: 600 }}
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
