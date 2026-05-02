/**
 * Desktop Kanban board — renders one column per stage/group, each column
 * scrolls independently. Reuses the existing ProjectCard so all gestures,
 * detail view, edit mode, and visual treatments stay identical.
 *
 * Mobile (<1024px) does NOT render this — Index.tsx branches on a media
 * query and continues to render the existing vertical StageSection list.
 *
 * Drag-and-drop is intentionally NOT implemented (deferred to a follow-up).
 * Stage changes still flow through the existing long-press picker, three-
 * dots menu, and chevron-driven flows.
 */
import { useMemo } from "react";
import {
  PIPELINES, PipelineId, PipelineCard, Project, Shipment, StageId, ShippingMode,
  buildCard,
} from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { ProjectCard } from "./ProjectCard";
import type { TabId } from "./PipelineTabs";

interface Column {
  id: string;
  title: string;
  pipeline: PipelineId;
  cards: PipelineCard[];
}

interface Props {
  activeTab: TabId;
  visible: PipelineCard[];        // already filtered + sorted
  projects: Project[];            // for shipping grouping
  shipments: Shipment[];          // unused for now, kept for future
  onOpenCard: (c: PipelineCard) => void;
  onSwipeForward: (c: PipelineCard) => void;
  onSwipeBack: (c: PipelineCard) => void;
  onOpenPicker: (c: PipelineCard) => void;
}

const SHIPPING_MODES: ShippingMode[] = ["Air", "Ocean", "Local"];

function buildColumns(activeTab: TabId, visible: PipelineCard[]): Column[] {
  if (activeTab === "all") {
    return PIPELINES.map((p) => ({
      id: p.id,
      title: p.title,
      pipeline: p.id,
      cards: visible.filter((c) => c.pipeline === p.id),
    }));
  }
  if (activeTab === "shipping") {
    return SHIPPING_MODES.map((mode) => ({
      id: mode,
      title: mode,
      pipeline: "shipping" as PipelineId,
      cards: visible.filter((c) => (c.project.shippingMode ?? "Local") === mode),
    }));
  }
  const cfg = PIPELINES.find((p) => p.id === activeTab)!;
  return cfg.stages.map((s) => ({
    id: s.id,
    title: s.title,
    pipeline: cfg.id,
    cards: visible.filter((c) => c.stage === s.id),
  }));
}

export const KanbanBoard = ({
  activeTab, visible, onOpenCard, onSwipeForward, onSwipeBack, onOpenPicker,
}: Props) => {
  const columns = useMemo(() => buildColumns(activeTab, visible), [activeTab, visible]);

  return (
    <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
      <div className="h-full flex gap-4 px-5 py-4 w-full">
        {columns.map((col) => {
          const accentHex = PIPELINE_ACCENT[col.pipeline].hex;
          return (
            <div
              key={col.id}
              className="flex flex-col rounded-2xl border border-border/60 bg-card/60"
              style={{ flex: "1 1 0", minWidth: 280, maxWidth: 480, maxHeight: "100%" }}
            >
              {/* Sticky column header */}
              <div
                className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 rounded-t-2xl border-b"
                style={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                }}
              >
                <span
                  className="rounded-full shrink-0"
                  style={{ backgroundColor: accentHex, width: 8, height: 8 }}
                />
                <h3
                  className="text-sm font-semibold tracking-tight truncate"
                  style={{ color: "hsl(var(--brand-navy))" }}
                >
                  {col.title}
                </h3>
                <span
                  className="ml-auto text-[11px] tabular font-semibold rounded-full inline-flex items-center justify-center min-w-[22px] h-[22px] px-2"
                  style={{
                    backgroundColor: col.cards.length
                      ? "hsl(var(--brand-navy) / 0.08)"
                      : "hsl(var(--muted))",
                    color: col.cards.length
                      ? "hsl(var(--brand-navy))"
                      : "hsl(var(--muted-foreground))",
                  }}
                >
                  {col.cards.length}
                </span>
              </div>

              {/* Independently scrolling card list */}
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
                {col.cards.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground italic px-2 py-6 text-center">
                    No projects here.
                  </p>
                ) : (
                  col.cards.map((c) => (
                    <ProjectCard
                      key={c.id}
                      card={c}
                      showStageLabel={activeTab === "all"}
                      onOpen={() => onOpenCard(c)}
                      onSwipeForward={() => onSwipeForward(c)}
                      onSwipeBack={() => onSwipeBack(c)}
                      onOpenPicker={() => onOpenPicker(c)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
