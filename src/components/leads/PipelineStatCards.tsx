/**
 * Pipeline stat cards — desktop tab strip.
 *
 * Layout (left → right):
 *   [Active]  | gap | [Sales] › [Design] › [Purchasing] › [Production] › [Shipping] › [Finance]  | gap | [Completed]
 *
 * - Workflow cards (6 pipelines) are full-size, equal-flex, connected by
 *   visible ChevronRight arrows.
 * - Active and Completed are bookend "summary buckets" — narrower, shorter,
 *   separated from the workflow row by a wider gap that includes a thin
 *   vertical separator line.
 * - The sub-stage row is rendered separately below this component (see
 *   SubStageRow). To visually link the active card to that row, the active
 *   workflow card draws a small "fin" extending below it in its accent color.
 */
import { cn } from "@/lib/utils";
import {
  Radio, TrendingUp, PenTool, ShoppingCart, Settings,
  Truck, DollarSign, CheckCircle2, ChevronRight,
} from "lucide-react";
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
  /** When true, renders a downward fin on the active workflow card to link
   *  it to the sub-stage row below. */
  showFin?: boolean;
}

const ICON_FOR: Record<TabId, typeof Radio> = {
  all: Radio,
  sales: TrendingUp,
  design: PenTool,
  purchasing: ShoppingCart,
  production: Settings,
  operations: Settings,
  shipping: Truck,
  finance: DollarSign,
  completed: CheckCircle2,
};

const SAGE = "#6B8E5A";
const BOOKEND_GAP = 36; // wider gap with visible separator inside

const CountSlot = ({ value, loading, fontSize }: { value: number; loading?: boolean; fontSize: number }) => {
  if (loading) {
    return (
      <span
        aria-hidden
        className="inline-block rounded animate-pulse"
        style={{
          width: Math.round(fontSize * 1.3), height: Math.round(fontSize * 0.92),
          backgroundColor: "currentColor",
          opacity: 0.2,
        }}
      />
    );
  }
  return <span style={{ fontSize, lineHeight: 1 }}>{value}</span>;
};

interface CardProps {
  id: TabId;
  title: string;
  count: number;
  active: boolean;
  accent: string;
  onClick: () => void;
  pulse?: boolean;
  loading?: boolean;
  variant: "workflow" | "bookend";
  /** When true, draw a downward-pointing fin in the accent color. */
  fin?: boolean;
}

const StatCard = ({ id, title, count, active, accent, onClick, pulse, loading, variant, fin }: CardProps) => {
  const Icon = ICON_FOR[id];
  const isBookend = variant === "bookend";

  const fillBg = active ? accent : "#FFFFFF";
  const fillBorder = active ? accent : "hsl(var(--brand-navy) / 0.1)";
  const titleColor = active ? "rgba(255,255,255,0.85)" : "hsl(var(--brand-navy) / 0.7)";
  const countColor = active ? "#fff" : "hsl(var(--brand-navy))";
  const iconColor = active ? "rgba(255,255,255,0.95)" : accent;
  const iconOpacity = active ? 1 : (isBookend ? 0.6 : 0.8);

  const titleSize = isBookend ? 11 : 12.5;
  const countSize = isBookend ? 23 : 30;
  const iconSize = isBookend ? 17 : 20;
  const height = isBookend ? 72 : 86;
  const padding = isBookend ? "9px 11px" : "12px 14px";
  const minWidth = isBookend ? 118 : 152;
  const flexBasis = isBookend ? "0 0 auto" : "1 1 0%";
  const flexWidth = isBookend ? 122 : undefined;

  return (
    <div className="relative flex shrink-0" style={{ flex: flexBasis, width: flexWidth, minWidth }}>
      <button
        type="button"
        onClick={onClick}
        className={cn("relative flex flex-col text-left transition-all rounded-xl border hover:shadow-sm w-full")}
        style={{
          height,
          padding,
          backgroundColor: fillBg,
          borderColor: fillBorder,
          borderWidth: 1,
          boxShadow: pulse ? "0 0 0 2px hsl(var(--brand-orange))" : undefined,
        }}
      >
        <div className="flex items-start justify-between gap-2 w-full">
          <span
            className="font-medium tracking-tight truncate"
            style={{ color: titleColor, fontSize: titleSize }}
          >
            {title}
          </span>
          <Icon
            className="shrink-0"
            style={{ width: iconSize, height: iconSize, color: iconColor, opacity: iconOpacity }}
          />
        </div>
        <div
          className="mt-auto font-bold tabular leading-none"
          style={{ color: countColor }}
        >
          <CountSlot value={count} loading={loading} fontSize={countSize} />
        </div>
      </button>

      {/* Downward fin — visually links active card to the sub-stage row */}
      {fin && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: -8,
            left: "50%",
            transform: "translateX(-50%)",
            width: 16,
            height: 8,
            backgroundColor: accent,
            clipPath: "polygon(0 0, 100% 0, 50% 100%)",
          }}
        />
      )}
    </div>
  );
};

const FlowArrow = () => (
  <div
    className="shrink-0 flex items-center justify-center"
    style={{ width: 22, alignSelf: "stretch" }}
    aria-hidden
  >
    <ChevronRight
      style={{
        width: 18, height: 18,
        color: "hsl(var(--brand-navy))",
        opacity: 0.5,
        strokeWidth: 2.5,
      }}
    />
  </div>
);

const BookendSeparator = () => (
  <div
    className="shrink-0 flex items-center justify-center"
    style={{ width: BOOKEND_GAP }}
    aria-hidden
  >
    <div
      style={{
        width: 1,
        height: 64,
        backgroundColor: "hsl(var(--brand-navy) / 0.18)",
      }}
    />
  </div>
);

export const PipelineStatCards = ({
  active, onChange, counts, completedCount = 0, pulse, loading, showFin,
}: Props) => {
  const activeCount =
    counts.sales + counts.design + counts.purchasing + counts.production +
    counts.shipping + counts.finance + counts.operations;

  // Completed is now the LAST card in the workflow row (no longer a right
  // bookend). Active remains the only bookend on the left.
  const workflowIds: PipelineId[] = [
    "sales", "design", "purchasing", "production", "shipping", "finance", "completed",
  ];

  return (
    <div className="relative w-full">
      <div
        className="flex items-stretch w-full overflow-x-auto"
        style={{ scrollbarWidth: "thin", gap: 0 }}
      >
        {/* Active bookend */}
        <StatCard
          id="all"
          title="Active"
          count={activeCount}
          active={active === "all"}
          accent="hsl(var(--brand-navy))"
          onClick={() => onChange("all")}
          loading={loading}
          variant="bookend"
        />

        {/* Bookend → workflow gap with separator */}
        <BookendSeparator />

        {/* Workflow cards with chevron arrows between them. Completed is
            the terminal card and uses its own count + sage accent. */}
        {workflowIds.map((p, i) => {
          const isCompletedCard = p === "completed";
          const meta = isCompletedCard
            ? { id: "completed" as PipelineId, title: "Completed" }
            : PIPELINES.find((x) => x.id === p);
          if (!meta) return null;
          const isActive = isCompletedCard ? active === "completed" : active === p;
          const accent = isCompletedCard ? SAGE : PIPELINE_ACCENT[p].hex;
          const count = isCompletedCard ? completedCount : counts[p];
          const tabId: TabId = isCompletedCard ? "completed" : p;
          return (
            <div key={p} className="flex items-stretch" style={{ flex: "1 1 0%", minWidth: 152, gap: 0 }}>
              {i > 0 && <FlowArrow />}
              <div className="flex-1 min-w-0 flex">
                <StatCard
                  id={tabId}
                  title={meta.title}
                  count={count}
                  active={isActive}
                  accent={accent}
                  onClick={() => onChange(tabId)}
                  pulse={!isCompletedCard && pulse === p}
                  loading={loading}
                  variant="workflow"
                  fin={isActive && showFin}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
