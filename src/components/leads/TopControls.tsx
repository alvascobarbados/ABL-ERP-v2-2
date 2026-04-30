import { useEffect, useRef, useState } from "react";
import { Filter as FilterIcon, ArrowUpDown, ArrowUp, ArrowDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilterState } from "./FilterBar";
import type { SortState } from "./SortSheet";
import { SORT_OPTIONS } from "./SortSheet";

interface Props {
  filter: FilterState;
  sort: SortState;
  search: string;
  onSearchChange: (q: string) => void;
  onOpenFilter: () => void;
  onOpenSort: () => void;
}

export const TopControls = ({
  filter, sort, search, onSearchChange, onOpenFilter, onOpenSort,
}: Props) => {
  const [searching, setSearching] = useState(!!search);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (searching) inputRef.current?.focus();
  }, [searching]);

  const filterCount = [filter.customer, filter.projectName, filter.supplierId].filter(Boolean).length;
  const sortOpt = SORT_OPTIONS.find((o) => o.field === sort.field)!;
  const Arrow = sort.dir === "asc" ? ArrowUp : ArrowDown;

  const cancelSearch = () => {
    onSearchChange("");
    setSearching(false);
  };

  if (searching) {
    return (
      <div className="flex items-center gap-2">
        <div
          className="flex-1 flex items-center gap-2 rounded-full border bg-card/80 px-3"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.25)", minHeight: 40 }}
        >
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search projects, customers, references…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground text-foreground"
          />
          {search && (
            <button type="button" onClick={() => onSearchChange("")} aria-label="Clear search"
              className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={cancelSearch}
          className="text-sm font-medium px-2 shrink-0"
          style={{ color: "hsl(var(--brand-navy))" }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
      <button
        type="button"
        onClick={onOpenFilter}
        className={cn(
          "no-select inline-flex items-center gap-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap shrink-0 px-3",
          filterCount > 0
            ? "bg-foreground text-background border-foreground"
            : "bg-card/60 text-foreground/80 border-border hover:border-foreground/30 hover:text-foreground",
        )}
        style={{ minHeight: 36 }}
      >
        <FilterIcon className="h-3.5 w-3.5" />
        <span>Filter</span>
        {filterCount > 0 && (
          <span className="ml-0.5 inline-flex items-center justify-center rounded-full text-[10px] font-bold tabular"
            style={{
              minWidth: 18, height: 18, padding: "0 5px",
              backgroundColor: "hsl(var(--brand-orange))", color: "#fff",
            }}>
            {filterCount}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={onOpenSort}
        className="no-select inline-flex items-center gap-1.5 text-xs font-medium rounded-full border bg-card/60 text-foreground/80 border-border hover:border-foreground/30 hover:text-foreground transition-colors whitespace-nowrap shrink-0 px-3"
        style={{ minHeight: 36 }}
      >
        <ArrowUpDown className="h-3.5 w-3.5" />
        <span>Sort: {sortOpt.label}</span>
        <Arrow className="h-3 w-3" />
      </button>

      <div className="flex-1" />

      <button
        type="button"
        aria-label="Search"
        onClick={() => setSearching(true)}
        className="no-select inline-flex items-center justify-center rounded-full border bg-card/60 text-foreground/80 border-border hover:border-foreground/30 hover:text-foreground transition-colors shrink-0"
        style={{ width: 36, height: 36 }}
      >
        <Search className="h-4 w-4" />
      </button>
    </div>
  );
};
