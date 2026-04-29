import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterState {
  shippingMode: string | null; // "Air" | "Ocean LCL" | "Ocean FCL"
  orderType: string | null;    // "New" | "Re-order"
  priority: string | null;     // "Rush"
}

interface Props {
  value: FilterState;
  onChange: (next: FilterState) => void;
}

const Pill = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={cn(
      "text-xs font-medium px-3 py-1.5 rounded-full border transition-[var(--transition-smooth)] whitespace-nowrap",
      active
        ? "bg-foreground text-background border-foreground"
        : "bg-card/60 text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground",
    )}
  >
    {children}
  </button>
);

export const FilterBar = ({ value, onChange }: Props) => {
  const toggle = <K extends keyof FilterState>(k: K, v: FilterState[K]) =>
    onChange({ ...value, [k]: value[k] === v ? null : v });

  const hasFilters = !!(value.shippingMode || value.orderType || value.priority);

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-1">
      <div className="flex items-center gap-1 text-muted-foreground shrink-0 pr-1">
        <Filter className="h-3.5 w-3.5" />
      </div>
      <Pill active={value.priority === "Rush"} onClick={() => toggle("priority", "Rush")}>Rush</Pill>
      <span className="w-px h-4 bg-border shrink-0" />
      <Pill active={value.shippingMode === "Air"} onClick={() => toggle("shippingMode", "Air")}>Air</Pill>
      <Pill active={value.shippingMode === "Ocean LCL"} onClick={() => toggle("shippingMode", "Ocean LCL")}>LCL</Pill>
      <Pill active={value.shippingMode === "Ocean FCL"} onClick={() => toggle("shippingMode", "Ocean FCL")}>FCL</Pill>
      <span className="w-px h-4 bg-border shrink-0" />
      <Pill active={value.orderType === "New"} onClick={() => toggle("orderType", "New")}>New</Pill>
      <Pill active={value.orderType === "Re-order"} onClick={() => toggle("orderType", "Re-order")}>Re-order</Pill>
      {hasFilters && (
        <button
          onClick={() => onChange({ shippingMode: null, orderType: null, priority: null })}
          className="text-xs text-muted-foreground underline underline-offset-4 ml-1 shrink-0"
        >
          Clear
        </button>
      )}
    </div>
  );
};
