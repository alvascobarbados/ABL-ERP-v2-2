import { useEffect, useRef, useState } from "react";
import { Filter, ChevronDown, Check, Search, X, Users, Factory } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFriendlyMode } from "@/hooks/useFriendlyMode";

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

// ─── Picker (full-screen bottom sheet) ───
interface PickerSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: React.ReactNode;
  options: { id: string; label: string }[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const PickerSheet = ({ open, onClose, title, icon, options, selectedId, onSelect }: PickerSheetProps) => {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-6">
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 animate-fade-in"
      />

      {/* Panel: bottom sheet on mobile, centered card on sm+ */}
      <div
        className={cn(
          "relative bg-card shadow-[var(--shadow-section)] border animate-fade-in",
          "mt-auto rounded-t-3xl w-full max-h-[85vh] flex flex-col",
          "sm:mt-0 sm:rounded-2xl sm:max-w-md sm:w-full sm:max-h-[70vh]",
        )}
        style={{ borderColor: "hsl(var(--brand-navy) / 0.15)" }}
      >
        {/* Grabber (mobile) */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <span className="block w-10 h-1.5 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="px-5 pt-3 pb-3 flex items-center justify-between border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="inline-flex items-center justify-center rounded-full shrink-0"
              style={{
                width: 32, height: 32,
                backgroundColor: "hsl(var(--brand-navy) / 0.08)",
                color: "hsl(var(--brand-navy))",
              }}
            >
              {icon}
            </span>
            <h3 className="text-base font-semibold tracking-tight truncate" style={{ color: "hsl(var(--brand-navy))" }}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center justify-center rounded-full hover:bg-muted/60 text-muted-foreground"
            style={{ width: 36, height: 36 }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-border/60 shrink-0">
          <div
            className="flex items-center gap-2 rounded-xl border bg-background/60 px-3"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.2)", minHeight: 48 }}
          >
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${title.toLowerCase()}…`}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground text-foreground py-2"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Options list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground italic px-4 py-6 text-center">No matches.</p>
          ) : (
            <ul className="flex flex-col">
              {filtered.map((o) => {
                const isSelected = selectedId === o.id;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => { onSelect(o.id); onClose(); }}
                      className={cn(
                        "w-full text-left rounded-xl flex items-center justify-between gap-3 px-3 transition-colors",
                        isSelected ? "bg-muted/70 font-medium text-foreground" : "hover:bg-muted/40",
                      )}
                      style={{ minHeight: 52 }}
                    >
                      <span className="text-[15px] truncate">{o.label}</span>
                      {isSelected && (
                        <span
                          className="inline-flex items-center justify-center rounded-full text-white shrink-0"
                          style={{ width: 22, height: 22, backgroundColor: "hsl(var(--brand-orange))" }}
                        >
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] border-t border-border/60 flex gap-2 shrink-0"
        >
          {selectedId ? (
            <button
              type="button"
              onClick={() => { onSelect(null); onClose(); }}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border text-sm font-medium hover:bg-muted/40 transition-colors"
              style={{
                borderColor: "hsl(var(--brand-navy) / 0.3)",
                color: "hsl(var(--brand-navy))",
                minHeight: 48,
              }}
            >
              <X className="h-4 w-4" /> Clear filter
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center rounded-xl border text-sm font-medium hover:bg-muted/40 transition-colors"
              style={{
                borderColor: "hsl(var(--brand-navy) / 0.3)",
                color: "hsl(var(--brand-navy))",
                minHeight: 48,
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Trigger chip ───
interface FilterChipProps {
  label: string;
  selectedLabel?: string;
  active: boolean;
  onOpen: () => void;
  onClear: () => void;
}

const FilterChip = ({ label, selectedLabel, active, onOpen, onClear }: FilterChipProps) => {
  return (
    <div
      className={cn(
        "inline-flex items-center text-xs font-medium rounded-full border transition-[var(--transition-smooth)] whitespace-nowrap overflow-hidden shrink-0",
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-card/60 text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 max-w-[180px]"
      >
        <span className="truncate">{active && selectedLabel ? selectedLabel : label}</span>
        {!active && <ChevronDown className="h-3 w-3 shrink-0" />}
      </button>
      {active && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="pl-1 pr-2.5 py-1.5 hover:opacity-80"
          aria-label={`Clear ${label}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};

export const FilterBar = ({ value, onChange, customers, suppliers }: Props) => {
  const { friendly } = useFriendlyMode();
  const [open, setOpen] = useState<null | "customer" | "supplier">(null);

  const toggle = <K extends keyof FilterState>(k: K, v: FilterState[K]) =>
    onChange({ ...value, [k]: value[k] === v ? null : v });

  const hasFilters = !!(
    value.shippingMode || value.orderType || value.priority || value.customer || value.supplierId
  );

  const supplierName = suppliers.find((s) => s.id === value.supplierId)?.name;

  return (
    <>
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-1">
        <div className="flex items-center gap-1 text-muted-foreground shrink-0 pr-1">
          <Filter className="h-3.5 w-3.5" />
        </div>

        <FilterChip
          label={friendly ? "Filter by customer" : "Customer"}
          selectedLabel={value.customer ?? undefined}
          active={!!value.customer}
          onOpen={() => setOpen("customer")}
          onClear={() => onChange({ ...value, customer: null })}
        />
        <FilterChip
          label={friendly ? "Filter by supplier" : "Supplier"}
          selectedLabel={supplierName}
          active={!!value.supplierId}
          onOpen={() => setOpen("supplier")}
          onClear={() => onChange({ ...value, supplierId: null })}
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

      <PickerSheet
        open={open === "customer"}
        onClose={() => setOpen(null)}
        title="Filter by customer"
        icon={<Users className="h-4 w-4" />}
        options={customers.map((c) => ({ id: c, label: c }))}
        selectedId={value.customer}
        onSelect={(id) => onChange({ ...value, customer: id })}
      />
      <PickerSheet
        open={open === "supplier"}
        onClose={() => setOpen(null)}
        title="Filter by supplier"
        icon={<Factory className="h-4 w-4" />}
        options={suppliers.map((s) => ({ id: s.id, label: s.name }))}
        selectedId={value.supplierId}
        onSelect={(id) => onChange({ ...value, supplierId: id })}
      />
    </>
  );
};
