/**
 * Desktop-only segmented pill that toggles between the Kanban Board view
 * and the dense Table view. The parent decides whether to render this
 * (it should be hidden at <1024px). Selection state lives upstream
 * (per-tab) — see useViewMode.
 */
import { LayoutGrid, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/hooks/useViewMode";

interface Props {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
}

export const ViewSwitcher = ({ value, onChange }: Props) => {
  const Item = ({ id, label, Icon }: { id: ViewMode; label: string; Icon: typeof LayoutGrid }) => {
    const active = value === id;
    return (
      <button
        type="button"
        onClick={() => onChange(id)}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex items-center justify-center rounded-full transition-colors",
          active ? "text-white" : "hover:bg-white/60",
        )}
        style={{
          width: 32,
          height: 32,
          backgroundColor: active ? "hsl(var(--brand-navy))" : "transparent",
          color: active ? "#ffffff" : "hsl(var(--brand-navy) / 0.6)",
        }}
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  };

  return (
    <div
      className="inline-flex items-center gap-1 p-0.5 rounded-full border"
      style={{
        borderColor: "hsl(var(--brand-navy) / 0.15)",
        backgroundColor: "hsl(var(--brand-navy) / 0.04)",
      }}
    >
      <Item id="board" label="Board view" Icon={LayoutGrid} />
      <Item id="table" label="Table view" Icon={Rows3} />
    </div>
  );
};
