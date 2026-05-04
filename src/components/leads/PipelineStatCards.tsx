/**
 * Pipeline stat cards — desktop tab strip rebuilt as a row of equal-width
 * cards. Each card represents one tab: Active (lens), the 6 pipelines, and
 * Completed (bookend). Each card shows pipeline name, large count, and a
 * Lucide icon.
 *
 * Active card (selected): solid navy fill, white text.
 * Inactive cards: white background, navy text, icon tinted in pipeline accent
 * at reduced saturation for at-a-glance recognition.
 *
 * Behavior is identical to ChevronTabs — same TabId, same onChange contract.
 * At ≥1400px content width all 8 cards fit equally; below that the row scrolls
 * horizontally so each card keeps its minimum readable width.
 */
import { cn } from "@/lib/utils";
import {
  Radio, TrendingUp, PenTool, ShoppingCart, Settings,
  Truck, DollarSign, CheckCircle2,
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
}

const ICON_FOR: Record<TabId, typeof Radio> = {
  all: Radio,
  sales: TrendingUp,
  design: PenTool,
  purchasing: ShoppingCart,
  production: Settings,
  operations: Settings, // legacy alias
  shipping: Truck,
  finance: DollarSign,
  completed: CheckCircle2,
};

const SAGE = "#6B8E5A";

const CountSlot = ({ value, loading }: { value: number; loading?: boolean }) => {
  if (loading) {
    return (
      <span
        aria-hidden
        className="inline-block rounded animate-pulse"
        style={{
          width: 36, height: 26,
          backgroundColor: "currentColor",
          opacity: 0.2,
        }}
      />
    );
  }
  return <>{value}</>;
};

interface CardProps {
  id: TabId;
  title: string;
  count: number;
  active: boolean;
  accent: string;     // pipeline accent hex (used for inactive icon tint + active fill)
  onClick: () => void;
  pulse?: boolean;
  loading?: boolean;
}

const StatCard = ({ id, title, count, active, accent, onClick, pulse, loading }: CardProps) => {
  const Icon = ICON_FOR[id];
  const fillBg = active ? accent : "#FFFFFF";
  const fillBorder = active ? accent : "hsl(var(--brand-navy) / 0.1)";
  const titleColor = active ? "rgba(255,255,255,0.85)" : "hsl(var(--brand-navy) / 0.7)";
  const countColor = active ? "#fff" : "hsl(var(--brand-navy))";
  const iconColor = active ? "rgba(255,255,255,0.95)" : accent;
  const iconOpacity = active ? 1 : 0.75;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 relative flex flex-col text-left transition-all rounded-xl border",
        "hover:shadow-sm",
      )}
      style={{
        flex: "1 1 0%",
        minWidth: 152,
        height: 86,
        padding: "12px 14px",
        backgroundColor: fillBg,
        borderColor: fillBorder,
        borderWidth: 1,
        boxShadow: pulse ? "0 0 0 2px hsl(var(--brand-orange))" : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-2 w-full">
        <span
          className="text-[12px] font-medium tracking-tight truncate"
          style={{ color: titleColor }}
        >
          {title}
        </span>
        <Icon
          className="shrink-0"
          style={{
            width: 20, height: 20,
            color: iconColor,
            opacity: iconOpacity,
          }}
        />
      </div>
      <div
        className="mt-auto text-[28px] font-bold tabular leading-none"
        style={{ color: countColor }}
      >
        <CountSlot value={count} loading={loading} />
      </div>
    </button>
  );
};

export const PipelineStatCards = ({ active, onChange, counts, completedCount = 0, pulse, loading }: Props) => {
  const activeCount =
    counts.sales + counts.design + counts.purchasing + counts.production +
    counts.shipping + counts.finance + counts.operations;

  return (
    <div
      className="flex items-stretch gap-2.5 w-full overflow-x-auto"
      style={{ scrollbarWidth: "thin" }}
    >
      <StatCard
        id="all"
        title="Active"
        count={activeCount}
        active={active === "all"}
        accent="hsl(var(--brand-navy))"
        onClick={() => onChange("all")}
        loading={loading}
      />
      {PIPELINES.map((p) => (
        <StatCard
          key={p.id}
          id={p.id}
          title={p.title}
          count={counts[p.id]}
          active={active === p.id}
          accent={PIPELINE_ACCENT[p.id].hex}
          onClick={() => onChange(p.id)}
          pulse={pulse === p.id}
          loading={loading}
        />
      ))}
      <StatCard
        id="completed"
        title="Completed"
        count={completedCount}
        active={active === "completed"}
        accent={SAGE}
        onClick={() => onChange("completed")}
        loading={loading}
      />
    </div>
  );
};
