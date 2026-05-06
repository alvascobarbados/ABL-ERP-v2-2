/**
 * Pipeline stat cards — desktop, restructured into labeled rows.
 *
 * Renders TWO of the three rows in the new top-of-pipeline layout:
 *   Row 1 — "ACTIVE" label + a single compact Active card (left-aligned).
 *   Row 2 — "STAGE" label + 7 equal-width workflow cards (Sales → … → Completed)
 *           with ChevronRight arrows between adjacent cards.
 *
 * Row 3 (sub-stage) is rendered separately by Index.tsx via SubStageRow.
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
  /** Unused in new layout — kept for API compatibility. */
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

const RowLabel = ({ children }: { children: React.ReactNode }) => (
  <div
    className="uppercase"
    style={{
      fontSize: 10,
      fontWeight: 500,
      letterSpacing: "0.10em",
      color: "rgba(27, 42, 78, 0.5)",
      marginBottom: 7,
    }}
  >
    {children}
  </div>
);

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
  const titleColor = active ? "rgba(255,255,255,0.85)" : "hsl(var(--brand-navy) / 0.65)";
  const countColor = active ? "#fff" : "hsl(var(--brand-navy))";
  const iconColor = active ? "rgba(255,255,255,0.95)" : accent;
  const iconOpacity = active ? 1 : 0.85;

  const titleSize = 11;
  const countSize = isCompact ? 22 : 28;
  const iconSize = isCompact ? 17 : 20;
  const padding = isCompact ? "9px 14px" : "14px 16px";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("relative flex flex-col text-left transition-all rounded-xl border hover:shadow-sm w-full")}
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
          style={{ color: titleColor, fontSize: titleSize }}
        >
          {title}
        </span>
        <Icon
          className="shrink-0"
          style={{ width: iconSize, height: iconSize, color: iconColor, opacity: iconOpacity }}
        />
      </div>
      <div className="mt-2 tabular leading-none" style={{ color: countColor }}>
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

export const PipelineStatCards = ({
  active, onChange, counts, completedCount = 0, pulse, loading,
}: Props) => {
  const activeCount =
    counts.sales + counts.design + counts.purchasing + counts.production +
    counts.shipping + counts.finance + counts.operations;

  const workflowIds: PipelineId[] = [
    "sales", "design", "purchasing", "production", "shipping", "finance", "completed",
  ];

  return (
    <div className="w-full flex flex-col" style={{ gap: 14 }}>
      {/* Row 1 — ACTIVE */}
      <div>
        <RowLabel>Active</RowLabel>
        <div style={{ width: 200 }}>
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
      </div>

      {/* Row 2 — STAGE */}
      <div>
        <RowLabel>Stage</RowLabel>
        <div className="flex items-stretch w-full" style={{ gap: 0 }}>
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
  );
};
