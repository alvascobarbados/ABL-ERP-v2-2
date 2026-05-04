/**
 * Sub-chevron — per-stage filter pills shown beneath the main ChevronTabs.
 *
 * Visible only on multi-stage pipeline tabs (Sales, Design, Finance).
 * Hidden on Active, Purchasing, Production, Shipping, Completed.
 *
 * Selecting a stage writes into the parent FilterState.stages so the existing
 * filter machinery handles the rest. "All <Pipeline>" = empty stages array
 * (subject to the rule that filtered stages must belong to the active pipeline).
 */
import { cn } from "@/lib/utils";
import { PIPELINES, PipelineId, StageId } from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import type { TabId } from "./PipelineTabs";

interface Props {
  activeTab: TabId;
  /** Currently selected stage within this pipeline, or null for "All". */
  selectedStage: StageId | null;
  onSelect: (stage: StageId | null) => void;
  /** Live counts per stage (post-filter, post-search). */
  stageCounts: Partial<Record<StageId, number>>;
  /** Total in this pipeline (for the "All <Pipeline>" pill). */
  allCount: number;
}

// Pipelines that have a meaningful sub-chevron (more than one user-facing stage).
const MULTI_STAGE: PipelineId[] = ["sales", "design", "finance"];

export const SubChevron = ({ activeTab, selectedStage, onSelect, stageCounts, allCount }: Props) => {
  if (activeTab === "all" || activeTab === "completed") return null;
  const pipelineId = activeTab as PipelineId;
  if (!MULTI_STAGE.includes(pipelineId)) return null;

  const pipeline = PIPELINES.find((p) => p.id === pipelineId);
  if (!pipeline) return null;

  const accent = PIPELINE_ACCENT[pipelineId].hex;

  const allActive = selectedStage === null;
  const renderPill = (key: string, label: string, count: number, isActive: boolean, onClick: () => void) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full transition-colors whitespace-nowrap border",
        "px-3.5 text-[12px] font-medium",
      )}
      style={{
        height: 30,
        backgroundColor: isActive ? accent : "hsl(var(--background))",
        color: isActive ? "#fff" : accent,
        borderColor: isActive ? accent : `${accent}33`,
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = `${accent}10`;
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "hsl(var(--background))";
      }}
    >
      <span>{label}</span>
      <span
        className="tabular text-[11px] font-semibold"
        style={{
          opacity: isActive ? 1 : 0.6,
        }}
      >
        {count}
      </span>
    </button>
  );

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {renderPill(
        "__all__",
        `All ${pipeline.title}`,
        allCount,
        allActive,
        () => onSelect(null),
      )}
      {pipeline.stages.map((s) => {
        const isActive = selectedStage === s.id;
        const count = stageCounts[s.id] ?? 0;
        return renderPill(s.id, s.title, count, isActive, () => onSelect(s.id));
      })}
    </div>
  );
};
