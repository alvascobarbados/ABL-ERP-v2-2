/**
 * Sub-chevron — per-stage filter tabs shown beneath the main ChevronTabs.
 *
 * Visually mirrors the main ChevronTabs at smaller scale: chevron-shaped
 * tabs with stacked label + count. No "All <Pipeline>" tab — to widen back
 * out, the user clicks the active sub-stage again (toggle off) or re-clicks
 * the main pipeline tab.
 *
 * Visible only on multi-stage pipeline tabs (Sales, Design, Finance).
 * Hidden on Active, Purchasing, Production, Shipping, Completed.
 */
import { PIPELINES, PipelineId, StageId } from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import type { TabId } from "./PipelineTabs";

interface Props {
  activeTab: TabId;
  /** Currently selected stage within this pipeline, or null for "all of pipeline". */
  selectedStage: StageId | null;
  onSelect: (stage: StageId | null) => void;
  /** Live counts per stage (post-filter, post-search). */
  stageCounts: Partial<Record<StageId, number>>;
}

// Pipelines that have a meaningful sub-chevron (more than one user-facing stage).
const MULTI_STAGE: PipelineId[] = ["sales", "design", "finance"];

const CHEV = 12;          // chevron point depth — smaller than main (16)
const TAB_H = 40;         // sub-chevron height — clearly secondary to main
const BORDER = 1;
const CHEVRON_CLIP = `polygon(0 0, calc(100% - ${CHEV}px) 0, 100% 50%, calc(100% - ${CHEV}px) 100%, 0 100%, ${CHEV}px 50%)`;

export const SubChevron = ({ activeTab, selectedStage, onSelect, stageCounts }: Props) => {
  if (activeTab === "all" || activeTab === "completed") return null;
  const pipelineId = activeTab as PipelineId;
  if (!MULTI_STAGE.includes(pipelineId)) return null;

  const pipeline = PIPELINES.find((p) => p.id === pipelineId);
  if (!pipeline) return null;

  const accentHex = PIPELINE_ACCENT[pipelineId].hex;
  const total = pipeline.stages.length;

  // Saturation ramp by stage index — earlier stages render lighter (lower
  // background/text opacity), later stages render at full saturation. With
  // two stages: 0.45 → 1.0; with three: 0.3 → 0.65 → 1.0.
  const ramp = (i: number) => {
    if (total <= 1) return 1;
    const min = 0.3;
    return min + ((1 - min) * i) / (total - 1);
  };

  return (
    <div className="flex items-stretch w-full">
      {pipeline.stages.map((s, i) => {
        const isActive = selectedStage === s.id;
        const count = stageCounts[s.id] ?? 0;
        const overlap = i === 0 ? 0 : -CHEV;
        const shade = ramp(i); // 0..1 — saturation strength of THIS stage's shade
        // Active: solid fill at this stage's shade strength.
        // Inactive: paper-tone fill, text in the shade.
        const fill = isActive
          ? `color-mix(in srgb, ${accentHex} ${Math.round(shade * 100)}%, #FFFFFF)`
          : "hsl(var(--background))";
        const outline = isActive
          ? `color-mix(in srgb, ${accentHex} ${Math.round(shade * 100)}%, #FFFFFF)`
          : `color-mix(in srgb, ${accentHex} ${Math.round(shade * 60)}%, transparent)`;
        const textColor = isActive
          ? "#fff"
          : `color-mix(in srgb, ${accentHex} ${Math.round(shade * 100)}%, hsl(var(--brand-navy)))`;

        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(isActive ? null : s.id)}
            className="relative flex-1 min-w-0 group"
            style={{
              height: TAB_H,
              marginLeft: overlap,
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              zIndex: isActive ? 2 : 1,
            }}
          >
            <span
              aria-hidden
              className="absolute inset-0 transition-colors"
              style={{ clipPath: CHEVRON_CLIP, backgroundColor: outline }}
            />
            <span
              aria-hidden
              className="absolute transition-colors"
              style={{
                top: BORDER, bottom: BORDER, left: BORDER, right: BORDER,
                clipPath: CHEVRON_CLIP, backgroundColor: fill,
              }}
            />
            {!isActive && (
              <span
                aria-hidden
                className="absolute opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  top: BORDER, bottom: BORDER, left: BORDER, right: BORDER,
                  clipPath: CHEVRON_CLIP,
                  backgroundColor: `color-mix(in srgb, ${accentHex} ${Math.round(shade * 14)}%, transparent)`,
                }}
              />
            )}
            <span
              className="relative flex flex-col items-center justify-center h-full leading-none"
              style={{ color: textColor, paddingLeft: CHEV + 4, paddingRight: CHEV + 4 }}
            >
              <span className="text-[12px] font-medium tracking-tight">{s.title}</span>
              <span
                className="text-[16px] font-semibold tabular mt-1"
                style={{ opacity: isActive ? 1 : 0.75 }}
              >
                {count}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
};
