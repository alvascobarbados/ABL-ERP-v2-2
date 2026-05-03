import { Filter as FilterIcon, ArrowUpDown, ArrowUp, ArrowDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilterState } from "./FilterBar";
import { filterCount as computeFilterCount } from "./FilterBar";
import type { SortState } from "./SortSheet";
import { SORT_OPTIONS } from "./SortSheet";

interface Props {
  filter: FilterState;
  sort: SortState;
  search: string;
  onSearchChange: (q: string) => void;
  onOpenFilter: () => void;
  onOpenSort: () => void;
  hideFilter?: boolean;
}

/**
 * Compact top controls row: [Filter pill] [Sort pill] [Search input — fills].
 * Search is always visible; X clears, Esc clears.
 */
export const TopControls = ({
  filter, sort, search, onSearchChange, onOpenFilter, onOpenSort, hideFilter,
}: Props) => {
  const filterCount = computeFilterCount(filter);
  const sortOpt = SORT_OPTIONS.find((o) => o.field === sort.field)!;
  const Arrow = sort.dir === "asc" ? ArrowUp : ArrowDown;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onOpenFilter}
        aria-label="Filter"
        className={cn(
          "no-select inline-flex items-center justify-center rounded-full border transition-colors shrink-0 relative",
          filterCount > 0
            ? "bg-foreground text-background border-foreground"
            : "bg-card/60 text-foreground/80 border-border hover:border-foreground/30 hover:text-foreground",
        )}
        style={{ width: 36, height: 36 }}
        title="Filter"
      >
        <FilterIcon className="h-4 w-4" />
        {filterCount > 0 && (
          <span
            className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full text-[9px] font-bold tabular text-white"
            style={{
              minWidth: 16, height: 16, padding: "0 4px",
              backgroundColor: "hsl(var(--brand-orange))",
            }}
          >
            {filterCount}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={onOpenSort}
        aria-label={`Sort by ${sortOpt.label}`}
        className="no-select inline-flex items-center gap-1 rounded-full border bg-card/60 text-foreground/80 border-border hover:border-foreground/30 hover:text-foreground transition-colors shrink-0 px-2.5"
        style={{ height: 36 }}
        title={`Sort: ${sortOpt.label}`}
      >
        <ArrowUpDown className="h-3.5 w-3.5" />
        <Arrow className="h-3 w-3" />
      </button>

      <div
        className="flex-1 min-w-0 flex items-center gap-1.5 rounded-full border bg-card/80 px-3"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.2)", height: 36 }}
      >
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") onSearchChange(""); }}
          placeholder="Search…"
          className="flex-1 min-w-0 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground text-foreground"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="p-0.5 rounded-md hover:bg-muted/60 text-muted-foreground shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
