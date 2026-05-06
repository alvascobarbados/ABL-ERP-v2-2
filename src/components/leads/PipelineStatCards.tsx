/**
 * Pipeline stat cards — desktop, single-row layout.
 *
 * Row 1: [ALL label]              [STAGE label]
 *        [Active card] | [Sales › Design › Purchasing › Production › Shipping › Finance › Completed]
 *
 * A single 2-column CSS grid (95px / 1fr) drives label-to-card alignment so
 * "ALL" sits perfectly above the 95px Active card. Row 2 (sub-stage) is
 * rendered separately by Index.tsx via SubStageRow.
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
  counts: Record<PipelineId, number>;
  completedCount?: number;
  pulse?: PipelineId | null;
  loading?: boolean;
  /** Unused — kept for API compatibility. */
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
const ACTIVE_COL_WIDTH = 95;

const CountSlot = ({ value, loading, fontSize }: { value: number; loading?: boolean; fontSize: number }) => {
  if (loading) {
    return (
      <span
        aria-hidden
        className="inline-block rounded animate-pulse"
        style={{
          width: Math.round(fontSize * 1.3),
          height: Math.round(fontSize * 0.92),
          backgroundColor: "currentColor",
          opacity: 0.2,
        }}
      />
    );
  }
  return <span style={{ fontSize, lineHeight: 1, fontWeight: 500 }}>{value}</span>;
};

/**
 * Shared row-label primitive. Two visual variants:
 * - "section" (default) — 10px / 500 / navy 50% / 0.10em — used for STAGE, SUB-STAGE.
 * - "tight"             — 8px  / 600 / navy 100% / 0.12em — used for ALL.
 */
export const RowLabel = ({
  children,
  variant = "section",
  dim = false,
  style,
}: {
  children: React.ReactNode;
  variant?: "section" | "tight";
  dim?: boolean;
  style?: React.CSSProperties;
}) => {
  const tight = variant === "tight";
  const baseColor = tight ? "rgba(27,42,78,1)" : "rgba(27,42,78,0.5)";
  const dimmed = "rgba(27,42,78,0.35)";
  return (
    <div
      className="uppercase"
      style={{
        fontSize: tight ? 8 : 10,
        fontWeight: tight ? 600 : 500,
        letterSpacing: tight ? "0.12em" : "0.10em",
        color: dim ? dimmed : baseColor,
        marginBottom: tight ? 3 : 4,
        ...style,
      }}
    >
      {children}
    </div>
  );
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
  variant: "compact" | "stage";
}

const StatCard = ({ id, title, count, active, accent, onClick, pulse, loading, variant }: CardProps) => {
  const Icon = ICON_FOR[id];
  const isCompact = variant === "compact";

  const fillBg = active ? accent : "#FFFFFF";
  const fillBorder = active ? accent : "hsl(var(--brand-navy) / 0.1)";
  const titleColor = active ? "rgba(255,255,255,0.90)" : "hsl(var(--brand-navy) / 0.75)";
  const countColor = active ? "#fff" : "hsl(var(--brand-navy))";
  const iconColor = active ? "rgba(255,255,255,0.95)" : accent;
  const iconOpacity = active ? 1 : 0.85;

  const titleSize = 14;
  const countSize = isCompact ? 20 : 24;
  const iconSize = isCompact ? 16 : 20;
  const padding = isCompact ? "12px" : "14px 16px";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("relative flex flex-col text-left transition-all rounded-xl border hover:shadow-sm w-full h-full")}
      style={{
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
          style={{ color: titleColor, fontSize: titleSize, fontWeight: 500, lineHeight: 1.1 }}
        >
          {title}
        </span>
        <Icon
          className="shrink-0"
          style={{ width: iconSize, height: iconSize, color: iconColor, opacity: iconOpacity }}
        />
      </div>
      <div className="tabular leading-none" style={{ color: countColor, marginTop: 4 }}>
        <CountSlot value={count} loading={loading} fontSize={countSize} />
      </div>
    </button>
  );
};

const FlowArrow = () => (
  <div
    className="shrink-0 flex items-center justify-center"
    style={{ width: 20, alignSelf: "stretch" }}
    aria-hidden
  >
    <ChevronRight
      style={{
        width: 14, height: 14,
        color: "hsl(var(--brand-navy))",
        opacity: 0.35,
        strokeWidth: 2.5,
      }}
    />
  </div>
);

const Divider = () => (
  <div
    aria-hidden
    className="shrink-0 self-stretch"
    style={{
      width: 1,
      backgroundColor: "rgba(27,42,78,0.18)",
      marginLeft: 14,
      marginRight: 14,
    }}
  />
);

export const PipelineStatCards = ({
  active, onChange, counts, completedCount = 0, pulse, loading,
}: Props) => {
  const activeCount =
    counts.sales + counts.design + counts.purchasing + counts.production +
    counts.shipping + counts.finance + counts.operations;

  const workflowIds: PipelineId[] = [
    "sales", "design", "purchasing", "production", "shipping", "finance", "completed",
  ];

  const gridCols = `${ACTIVE_COL_WIDTH}px 1fr`;

  return (
    <div className="w-full">
      {/* Label row — two zones aligned over the cards below */}
      <div className="grid w-full" style={{ gridTemplateColumns: gridCols, columnGap: 0 }}>
        <RowLabel variant="tight">All</RowLabel>
        {/* Offset the STAGE label past the divider's 1px + 14px+14px margins so it sits over the first stage card */}
        <RowLabel variant="tight" style={{ paddingLeft: 29 }}>Stage</RowLabel>
      </div>

      {/* Card row — Active | divider | 7 stage cards */}
      <div className="grid w-full items-stretch" style={{ gridTemplateColumns: gridCols, columnGap: 0 }}>
        <div style={{ width: ACTIVE_COL_WIDTH }}>
          <StatCard
            id="all"
            title="Active"
            count={activeCount}
            active={active === "all"}
            accent="hsl(var(--brand-navy))"
            onClick={() => onChange("all")}
            loading={loading}
            variant="compact"
          />
        </div>

        <div className="flex items-stretch min-w-0">
          <Divider />
          <div className="flex items-stretch flex-1 min-w-0" style={{ gap: 0 }}>
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
                <div key={p} className="flex items-stretch" style={{ flex: "1 1 0%", minWidth: 0 }}>
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
                      variant="stage"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
