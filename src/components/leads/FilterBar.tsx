import { useEffect, useRef, useState } from "react";
import { Filter, ChevronDown, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterState {
  shippingMode: string | null;
  orderType: string | null;
  priority: string | null;
  customer: string | null;
  supplierId: string | null;
}

interface Props {
  value: FilterState;
  onChange: (next: FilterState) => void;
  customers: string[];
  suppliers: { id: string; name: string }[];
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

interface SearchableDropdownProps {
  label: string;
  active: boolean;
  selectedLabel?: string;
  options: { id: string; label: string }[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const SearchableDropdown = ({ label, active, selectedLabel, options, selectedId, onSelect }: SearchableDropdownProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="relative shrink-0" ref={ref}>
      <div
        className={cn(
          "inline-flex items-center text-xs font-medium rounded-full border transition-[var(--transition-smooth)] whitespace-nowrap overflow-hidden",
          active
            ? "bg-foreground text-background border-foreground"
            : "bg-card/60 text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5"
        >
          <span>{active && selectedLabel ? selectedLabel : label}</span>
          {!active && <ChevronDown className="h-3 w-3" />}
        </button>
        {active && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(null); setQuery(""); }}
            className="pl-1 pr-2.5 py-1.5 hover:opacity-80"
            aria-label={`Clear ${label}`}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-64 bg-popover border border-border rounded-xl shadow-[var(--shadow-section)] z-30 overflow-hidden animate-fade-in">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground text-foreground"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-3 py-2">No matches.</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onMouseDown={(e) => {
                    // fire before the document mousedown closes the panel
                    e.preventDefault();
                    onSelect(o.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "w-full text-left text-xs px-3 py-1.5 hover:bg-muted flex items-center justify-between gap-2",
                    selectedId === o.id && "bg-muted/60 font-medium text-foreground",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {selectedId === o.id && <Check className="h-3 w-3 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const FilterBar = ({ value, onChange, customers, suppliers }: Props) => {
  const toggle = <K extends keyof FilterState>(k: K, v: FilterState[K]) =>
    onChange({ ...value, [k]: value[k] === v ? null : v });

  const hasFilters = !!(
    value.shippingMode || value.orderType || value.priority || value.customer || value.supplierId
  );

  const supplierName = suppliers.find((s) => s.id === value.supplierId)?.name;

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-1">
      <div className="flex items-center gap-1 text-muted-foreground shrink-0 pr-1">
        <Filter className="h-3.5 w-3.5" />
      </div>

      <SearchableDropdown
        label="Customer"
        active={!!value.customer}
        selectedLabel={value.customer ?? undefined}
        options={customers.map((c) => ({ id: c, label: c }))}
        selectedId={value.customer}
        onSelect={(id) => onChange({ ...value, customer: id })}
      />
      <SearchableDropdown
        label="Supplier"
        active={!!value.supplierId}
        selectedLabel={supplierName}
        options={suppliers.map((s) => ({ id: s.id, label: s.name }))}
        selectedId={value.supplierId}
        onSelect={(id) => onChange({ ...value, supplierId: id })}
      />

      <span className="w-px h-4 bg-border shrink-0" />
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
          onClick={() => onChange({ shippingMode: null, orderType: null, priority: null, customer: null, supplierId: null })}
          className="text-xs text-muted-foreground underline underline-offset-4 ml-1 shrink-0"
        >
          Clear
        </button>
      )}
    </div>
  );
};
