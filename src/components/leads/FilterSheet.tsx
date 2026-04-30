import { useEffect } from "react";
import { X, Filter as FilterIcon, Users, Briefcase, Factory, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilterState } from "./FilterBar";

interface Props {
  open: boolean;
  onClose: () => void;
  value: FilterState;
  onChange: (next: FilterState) => void;
  customers: string[];
  projectNames: string[];
  suppliers: { id: string; name: string }[];
  onOpenPicker: (kind: "customer" | "project" | "supplier") => void;
}

const Row = ({
  icon: Icon, label, value, onClick, onClear,
}: { icon: typeof Users; label: string; value: string | null; onClick: () => void; onClear: () => void }) => (
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-between gap-3 px-3 rounded-xl border transition-colors hover:bg-muted/40",
        value ? "bg-muted/40" : "bg-background",
      )}
      style={{ minHeight: 52, borderColor: "hsl(var(--brand-navy) / 0.18)" }}
    >
      <span className="flex items-center gap-3 min-w-0">
        <Icon className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--brand-navy))" }} />
        <span className="min-w-0">
          <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
          <span className={cn("block text-sm truncate", value ? "font-medium" : "text-muted-foreground")}
            style={{ color: value ? "hsl(var(--brand-navy))" : undefined }}>
            {value ?? "Any"}
          </span>
        </span>
      </span>
      {value ? <Check className="h-4 w-4" style={{ color: "hsl(var(--brand-orange))" }} /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
    </button>
    {value && (
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label}`}
        className="p-2.5 rounded-xl border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.18)" }}
      >
        <X className="h-4 w-4" />
      </button>
    )}
  </div>
);

export const FilterSheet = ({
  open, onClose, value, onChange, suppliers, onOpenPicker,
}: Props) => {
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
  const supplierName = suppliers.find((s) => s.id === value.supplierId)?.name ?? null;
  const activeCount = [value.customer, value.projectName, value.supplierId].filter(Boolean).length;

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
            <span className="inline-flex items-center justify-center rounded-full"
              style={{ width: 32, height: 32, backgroundColor: "hsl(var(--brand-navy) / 0.08)", color: "hsl(var(--brand-navy))" }}>
              <FilterIcon className="h-4 w-4" />
            </span>
            <h3 className="text-base font-semibold tracking-tight" style={{ color: "hsl(var(--brand-navy))" }}>
              Filter {activeCount > 0 ? `(${activeCount})` : ""}
            </h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="inline-flex items-center justify-center rounded-full hover:bg-muted/60 text-muted-foreground"
            style={{ width: 36, height: 36 }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <Row icon={Users} label="Customer" value={value.customer}
            onClick={() => onOpenPicker("customer")}
            onClear={() => onChange({ ...value, customer: null })} />
          <Row icon={Briefcase} label="Project" value={value.projectName}
            onClick={() => onOpenPicker("project")}
            onClear={() => onChange({ ...value, projectName: null })} />
          <Row icon={Factory} label="Supplier" value={supplierName}
            onClick={() => onOpenPicker("supplier")}
            onClear={() => onChange({ ...value, supplierId: null })} />
        </div>

        <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] border-t border-border/60 flex gap-2">
          {activeCount > 0 && (
            <button type="button"
              onClick={() => onChange({ customer: null, projectName: null, supplierId: null })}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border text-sm font-medium hover:bg-muted/40 transition-colors"
              style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: 48 }}>
              <X className="h-4 w-4" /> Clear all
            </button>
          )}
          <button type="button" onClick={onClose}
            className="flex-1 inline-flex items-center justify-center rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: "hsl(var(--brand-navy))", minHeight: 48 }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
