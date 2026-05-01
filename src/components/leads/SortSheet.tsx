import { useEffect } from "react";
import { X, Check, ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortField =
  | "deadline"
  | "created"
  | "customer"
  | "projectName"
  | "quote"
  | "supplier"
  | "shippingMode"
  | "salesRep"
  | "updated"
  | "daysToDeadline";

export type SortDir = "asc" | "desc";

export interface SortState {
  field: SortField;
  dir: SortDir;
}

interface Option {
  field: SortField;
  label: string;
  ascLabel: string;
  descLabel: string;
}

export const SORT_OPTIONS: Option[] = [
  { field: "deadline", label: "Deadline", ascLabel: "Soonest first", descLabel: "Latest first" },
  { field: "daysToDeadline", label: "Days until deadline", ascLabel: "Most urgent first", descLabel: "Least urgent first" },
  { field: "created", label: "Date created", ascLabel: "Oldest first", descLabel: "Newest first" },
  { field: "updated", label: "Last updated", ascLabel: "Oldest first", descLabel: "Most recent first" },
  { field: "customer", label: "Customer name", ascLabel: "A → Z", descLabel: "Z → A" },
  { field: "projectName", label: "Project name", ascLabel: "A → Z", descLabel: "Z → A" },
  { field: "supplier", label: "Supplier", ascLabel: "A → Z", descLabel: "Z → A" },
  { field: "shippingMode", label: "Shipping mode", ascLabel: "Air → Ocean → Local", descLabel: "Local → Ocean → Air" },
  { field: "salesRep", label: "Sales rep", ascLabel: "A → Z", descLabel: "Z → A" },
  { field: "quote", label: "Quote #", ascLabel: "Ascending", descLabel: "Descending" },
];

export const DEFAULT_DIR: Record<SortField, SortDir> = {
  deadline: "asc",
  daysToDeadline: "asc",
  created: "desc",
  updated: "desc",
  customer: "asc",
  projectName: "asc",
  supplier: "asc",
  shippingMode: "asc",
  salesRep: "asc",
  quote: "desc",
};

export function sortLabel(s: SortState): string {
  const opt = SORT_OPTIONS.find((o) => o.field === s.field)!;
  const arrow = s.dir === "asc" ? "↑" : "↓";
  return `Sort: ${opt.label} ${arrow}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  value: SortState;
  onChange: (s: SortState) => void;
}

export const SortSheet = ({ open, onClose, value, onChange }: Props) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const handlePick = (field: SortField) => {
    if (value.field === field) {
      // flip direction
      onChange({ field, dir: value.dir === "asc" ? "desc" : "asc" });
    } else {
      onChange({ field, dir: DEFAULT_DIR[field] });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-6">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 animate-fade-in" />
      <div
        className={cn(
          "relative bg-card shadow-[var(--shadow-section)] border animate-fade-in flex flex-col",
          "mt-auto rounded-t-3xl w-full max-h-[85vh]",
          "sm:mt-0 sm:rounded-2xl sm:max-w-md sm:w-full sm:max-h-[70vh]",
        )}
        style={{ borderColor: "hsl(var(--brand-navy) / 0.15)" }}
      >
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <span className="block w-10 h-1.5 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="px-5 pt-3 pb-3 flex items-center justify-between border-b border-border/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center justify-center rounded-full shrink-0"
              style={{ width: 32, height: 32, backgroundColor: "hsl(var(--brand-navy) / 0.08)", color: "hsl(var(--brand-navy))" }}>
              <ArrowUpDown className="h-4 w-4" />
            </span>
            <h3 className="text-base font-semibold tracking-tight" style={{ color: "hsl(var(--brand-navy))" }}>
              Sort by
            </h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="inline-flex items-center justify-center rounded-full hover:bg-muted/60 text-muted-foreground"
            style={{ width: 36, height: 36 }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          <ul className="flex flex-col">
            {SORT_OPTIONS.map((o) => {
              const isSelected = value.field === o.field;
              const dirLabel = isSelected
                ? (value.dir === "asc" ? o.ascLabel : o.descLabel)
                : o.ascLabel;
              const Arrow = isSelected ? (value.dir === "asc" ? ArrowUp : ArrowDown) : null;
              return (
                <li key={o.field}>
                  <button type="button" onClick={() => handlePick(o.field)}
                    className={cn(
                      "w-full text-left rounded-xl flex items-center justify-between gap-3 px-3 transition-colors",
                      isSelected ? "bg-muted/70" : "hover:bg-muted/40",
                    )}
                    style={{ minHeight: 56 }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium" style={{ color: "hsl(var(--brand-navy))" }}>{o.label}</p>
                      <p className="text-xs text-muted-foreground">{dirLabel}{isSelected ? " · tap to flip" : ""}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {Arrow && <Arrow className="h-4 w-4" style={{ color: "hsl(var(--brand-navy))" }} />}
                      {isSelected && (
                        <span className="inline-flex items-center justify-center rounded-full text-white"
                          style={{ width: 22, height: 22, backgroundColor: "hsl(var(--brand-orange))" }}>
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] border-t border-border/60">
          <button type="button" onClick={onClose}
            className="w-full inline-flex items-center justify-center rounded-xl border text-sm font-medium hover:bg-muted/40 transition-colors"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: 48 }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
