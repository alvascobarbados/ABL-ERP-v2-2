/**
 * "Columns" popover trigger — lets the user toggle which columns appear
 * in the desktop ProjectTable. Persists per-tab via useColumnVisibility.
 *
 * Universal anchors (Flag, Stage, Customer, Project) are always-on; they
 * still appear in the list with a "Recommended" tag and a disabled checkbox
 * so users can see why they can't be hidden.
 */
import { useMemo } from "react";
import { Columns3 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ALWAYS_ON, DEFAULT_VISIBLE, useColumnVisibility, type ColumnId,
} from "@/hooks/useColumnVisibility";
import type { TabId } from "./PipelineTabs";
import { cn } from "@/lib/utils";

// All toggleable columns + their user-facing labels. Order matches the table.
const COLUMN_DEFS: { id: ColumnId; label: string }[] = [
  { id: "flagged", label: "Flag" },
  { id: "stage", label: "Stage · State" },
  { id: "customer", label: "Customer" },
  { id: "project", label: "Project" },
  { id: "detail", label: "Detail" },
  { id: "designBrief", label: "Design Brief" },
  { id: "supplier", label: "Supplier" },
  { id: "quote", label: "Q#" },
  { id: "proof", label: "Proof" },
  { id: "po", label: "PO#" },
  { id: "invoice", label: "INV#" },
  { id: "amount", label: "Amount" },
  { id: "balance", label: "Inv Balance" },
  { id: "weight", label: "Weight" },
  { id: "cbm", label: "CBM" },
  { id: "pkgs", label: "Pkgs" },
  { id: "mode", label: "Mode" },
  { id: "tracking", label: "Tracking" },
  { id: "rep", label: "Rep" },
  { id: "completionDate", label: "Completed" },
  { id: "deadline", label: "Deadline" },
];

// Recommended (i.e. universal-anchor) columns. These cannot be hidden.
const RECOMMENDED: ReadonlySet<ColumnId> = ALWAYS_ON;

interface Props {
  activeTab: TabId;
  /** User-facing label for the active tab (e.g. "Creative" not "design"). */
  tabLabel: string;
}

export const ColumnsPopover = ({ activeTab, tabLabel }: Props) => {
  const vis = useColumnVisibility();
  const visibleSet = vis.visibleFor(activeTab);
  const currentList = useMemo(
    () => COLUMN_DEFS.filter((c) => visibleSet.has(c.id)).map((c) => c.id),
    [visibleSet],
  );

  const toggle = (id: ColumnId, on: boolean) => {
    if (RECOMMENDED.has(id)) return; // always-on
    const next = new Set(currentList);
    if (on) next.add(id); else next.delete(id);
    vis.setVisible(activeTab, Array.from(next));
  };

  const onReset = () => vis.resetTab(activeTab);
  const onApplyAll = () => vis.applyToAllTabs(currentList);

  // Defaults match? — used to optionally subdue "Reset" when redundant.
  const defaultIds = new Set<ColumnId>([...(DEFAULT_VISIBLE[activeTab] ?? []), ...ALWAYS_ON]);
  const isAtDefault = currentList.length === defaultIds.size && currentList.every((c) => defaultIds.has(c));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 h-8 text-xs font-medium transition-colors",
            "hover:bg-white/60",
          )}
          style={{
            borderColor: "hsl(var(--brand-navy) / 0.15)",
            backgroundColor: "hsl(var(--brand-navy) / 0.04)",
            color: "hsl(var(--brand-navy))",
          }}
          title="Show / hide columns"
        >
          <Columns3 className="h-3.5 w-3.5" />
          Columns
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="w-[280px] p-0"
      >
        <div
          className="px-3 py-2 border-b text-[11px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: "hsl(var(--brand-navy) / 0.6)", borderColor: "hsl(var(--brand-navy) / 0.08)" }}
        >
          Show columns for {tabLabel}
        </div>
        <div className="py-1 max-h-[420px] overflow-y-auto">
          {COLUMN_DEFS.map((c) => {
            const checked = visibleSet.has(c.id);
            const recommended = RECOMMENDED.has(c.id);
            return (
              <label
                key={c.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-[13px] cursor-pointer hover:bg-muted/50",
                  recommended && "cursor-default",
                )}
                style={{ color: "hsl(var(--brand-navy))" }}
              >
                <Checkbox
                  checked={checked}
                  disabled={recommended}
                  onCheckedChange={(v) => toggle(c.id, !!v)}
                />
                <span className="flex-1 truncate">{c.label}</span>
                {recommended && (
                  <span
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: "hsl(var(--brand-navy) / 0.45)" }}
                  >
                    Recommended
                  </span>
                )}
              </label>
            );
          })}
        </div>
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 border-t"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.08)" }}
        >
          <button
            type="button"
            onClick={onReset}
            disabled={isAtDefault}
            className="text-[12px] underline underline-offset-4 disabled:no-underline disabled:opacity-50"
            style={{ color: "hsl(var(--brand-navy))" }}
          >
            Reset to defaults
          </button>
          <button
            type="button"
            onClick={onApplyAll}
            className="text-[12px] underline underline-offset-4"
            style={{ color: "hsl(var(--brand-navy))" }}
          >
            Apply to all tabs
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
