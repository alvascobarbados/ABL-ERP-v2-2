/**
 * Desktop Kanban board — renders one column per state/group, each column
 * scrolls independently. Reuses the existing ProjectCard so all gestures,
 * detail view, edit mode, and visual treatments stay identical.
 *
 * Mobile (<1024px) does NOT render this — Index.tsx branches on a media
 * query and continues to render the existing vertical StateSection list.
 *
 * Drag-and-drop is intentionally NOT implemented (deferred to a follow-up).
 * State changes still flow through the existing long-press picker, three-
 * dots menu, and chevron-driven flows.
 */
import { useMemo } from "react";
import {
  STATES, StageId, StageCard, Project, Shipment, StateId, ShippingMode,
  buildCard,
} from "@/data/states";
import { STAGE_ACCENT } from "@/lib/brand";
import { ProjectCard } from "./ProjectCard";
import type { TabId } from "./StateTabs";

interface Column {
  id: string;
  title: string;
  state: StageId;
  cards: StageCard[];
}

interface Props {
  activeTab: TabId;
  visible: StageCard[];        // already filtered + sorted
  projects: Project[];            // for shipping grouping
  shipments: Shipment[];          // unused for now, kept for future
  onOpenCard: (c: StageCard) => void;
  onSwipeForward: (c: StageCard) => void;
  onSwipeBack: (c: StageCard) => void;
  onOpenPicker: (c: StageCard) => void;
}

const SHIPPING_MODES: ShippingMode[] = ["Air", "Ocean", "Local"];

function buildColumns(activeTab: TabId, visible: StageCard[]): Column[] {
  if (activeTab === "all") {
    return STATES.map((p) => ({
      id: p.id,
      title: p.title,
      state: p.id,
      cards: visible.filter((c) => c.state === p.id),
    }));
  }
  if (activeTab === "shipping") {
    // Shipping has one state ("Shipping"). The kanban groups by mode
    // (Air/Ocean/Local) as a UX exception — mode is NOT a state. Do not
    // propagate this grouping into the data model.
    return SHIPPING_MODES.map((mode) => ({
      id: mode,
      title: mode,
      state: "shipping" as StageId,
      cards: visible.filter((c) => (c.project.shippingMode ?? "Local") === mode),
    }));
  }
  const cfg = STATES.find((p) => p.id === activeTab)!;
  return cfg.states.map((s) => ({
    id: s.id,
    title: s.title,
    state: cfg.id,
    cards: visible.filter((c) => c.state === s.id),
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
          const accentHex = STAGE_ACCENT[col.state].hex;
          const isPaid = col.state === "finance" && col.id === "paid";
          const dotHex = isPaid ? "#6B8E5A" : accentHex;
          const headerBg = isPaid ? "rgba(107, 142, 90, 0.10)" : "hsl(var(--card))";
          const badgeBg = isPaid
            ? "rgba(107, 142, 90, 0.18)"
            : col.cards.length ? "hsl(var(--brand-navy) / 0.08)" : "hsl(var(--muted))";
          const badgeFg = isPaid
            ? "#3D5A30"
            : col.cards.length ? "hsl(var(--brand-navy))" : "hsl(var(--muted-foreground))";
          return (
            <div
              key={col.id}
              className="flex flex-col rounded-2xl border border-border/60 bg-card/60"
              style={{ flex: "1 1 0", minWidth: 280, maxWidth: 1000, maxHeight: "100%" }}
            >
              {/* Sticky column header */}
              <div
                className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 rounded-t-2xl border-b"
                style={{ backgroundColor: headerBg, borderColor: "hsl(var(--border))" }}
              >
                <span
                  className="rounded-full shrink-0"
                  style={{ backgroundColor: dotHex, width: 8, height: 8 }}
                />
                <h3 className="text-sm font-semibold tracking-tight truncate"
                    style={{ color: "hsl(var(--brand-navy))" }}>
                  {col.title}
                </h3>
                <span
                  className="ml-auto text-[11px] tabular font-semibold rounded-full inline-flex items-center justify-center min-w-[22px] h-[22px] px-2"
                  style={{ backgroundColor: badgeBg, color: badgeFg }}
                >
                  {col.cards.length}
                </span>
              </div>

              {/* Independently scrolling vertical card stack — always one
                  card per row regardless of column width. */}
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
                {col.cards.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground italic px-2 py-6 text-center">
                    No projects here.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {col.cards.map((c) => (
                      <ProjectCard
                        key={c.id}
                        card={c}
                        showStageLabel={activeTab === "all"}
                        onOpen={() => onOpenCard(c)}
                        onSwipeForward={() => onSwipeForward(c)}
                        onSwipeBack={() => onSwipeBack(c)}
                        onOpenPicker={() => onOpenPicker(c)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
