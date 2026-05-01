import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar } from "@/components/ui/calendar";
import { Factory, Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Supplier, ShippingMode } from "@/data/pipelines";

// ─────────── Generic bottom sheet ───────────
interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  onSave?: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  children: React.ReactNode;
}
export const BottomSheet = ({ open, onClose, title, onSave, saveLabel = "Done", saveDisabled, children }: BottomSheetProps) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal((
    <div className="fixed inset-0 z-[1100] flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-md bg-background rounded-t-3xl sm:rounded-2xl border-t sm:border shadow-2xl animate-slide-in-right"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.15)", animation: "slide-up 220ms ease-out" }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground transition-colors px-1" style={{ minHeight: 44 }}>
            Cancel
          </button>
          <div className="text-sm font-semibold tracking-tight" style={{ color: "hsl(var(--brand-navy))" }}>{title}</div>
          {onSave ? (
            <button
              onClick={onSave}
              disabled={saveDisabled}
              className="text-sm font-semibold px-1 transition-opacity disabled:opacity-40"
              style={{ color: "hsl(var(--brand-orange))", minHeight: 44 }}
            >
              {saveLabel}
            </button>
          ) : <span className="w-12" />}
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
      <style>{`@keyframes slide-up { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  ), document.body);
};

// ─────────── Text editor ───────────
interface TextEditorProps {
  open: boolean;
  onClose: () => void;
  title: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  warning?: string | null;
  onSave: (v: string) => void;
}
export const TextEditor = ({ open, onClose, title, value, placeholder, multiline, warning, onSave }: TextEditorProps) => {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useEffect(() => { if (open) setV(value); }, [open, value]);
  useEffect(() => { if (open) setTimeout(() => ref.current?.focus(), 50); }, [open]);
  return (
    <BottomSheet open={open} onClose={onClose} title={title} onSave={() => onSave(v.trim())} saveDisabled={!v.trim()}>
      {multiline ? (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)] resize-none"
        />
      ) : (
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
          style={{ minHeight: 48 }}
        />
      )}
      {warning && (
        <p className="mt-3 text-xs leading-snug" style={{ color: "hsl(var(--brand-orange))" }}>{warning}</p>
      )}
    </BottomSheet>
  );
};

// ─────────── Date editor ───────────
interface DateEditorProps {
  open: boolean;
  onClose: () => void;
  title: string;
  value: Date;
  onSave: (d: Date) => void;
}
export const DateEditor = ({ open, onClose, title, value, onSave }: DateEditorProps) => {
  const [d, setD] = useState<Date | undefined>(value);
  useEffect(() => { if (open) setD(value); }, [open, value]);
  return (
    <BottomSheet open={open} onClose={onClose} title={title} onSave={() => d && onSave(d)} saveDisabled={!d}>
      <div className="flex justify-center">
        <Calendar
          mode="single"
          selected={d}
          onSelect={setD}
          className="p-3 pointer-events-auto"
        />
      </div>
    </BottomSheet>
  );
};

// ─────────── Single-list picker (stage-mode-style) ───────────
export interface ListOption { id: string; label: string; sublabel?: string; }
interface ListPickerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  options: ListOption[];
  selectedId?: string;
  onPick: (id: string) => void;
}
export const ListPicker = ({ open, onClose, title, options, selectedId, onPick }: ListPickerProps) => {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <ul className="space-y-1.5">
        {options.map((o) => (
          <li key={o.id}>
            <button
              onClick={() => onPick(o.id)}
              className={cn(
                "w-full text-left px-3.5 py-3 rounded-xl border transition-colors hover:bg-muted/40",
                selectedId === o.id ? "bg-muted/60" : "bg-card border-border/60",
              )}
              style={{ minHeight: 48, borderColor: selectedId === o.id ? "hsl(var(--brand-navy) / 0.35)" : undefined }}
            >
              <div className="text-sm font-medium text-foreground">{o.label}</div>
              {o.sublabel && <div className="text-xs text-muted-foreground mt-0.5">{o.sublabel}</div>}
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
};

// ─────────── Supplier picker (with search + add new) ───────────
interface SupplierPickerProps {
  open: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  selectedId?: string;
  selectedHint?: "TBD" | "Various";
  onPickSupplier: (id: string) => void;
  onPickHint: (h: "TBD" | "Various") => void;
  onAddSupplier: (input: { name: string; country: string; defaultShippingMode: ShippingMode }) => Supplier;
}
export const SupplierPicker = ({
  open, onClose, suppliers, selectedId, selectedHint,
  onPickSupplier, onPickHint, onAddSupplier,
}: SupplierPickerProps) => {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCountry, setNewCountry] = useState("China");
  const [newMode, setNewMode] = useState<ShippingMode>("Ocean");
  useEffect(() => { if (open) { setQ(""); setAdding(false); setNewName(""); } }, [open]);

  const filtered = useMemo(() => {
    if (!q.trim()) return suppliers;
    const lo = q.trim().toLowerCase();
    return suppliers.filter((s) => s.name.toLowerCase().includes(lo) || s.country.toLowerCase().includes(lo));
  }, [q, suppliers]);

  if (adding) {
    return (
      <BottomSheet
        open={open}
        onClose={() => setAdding(false)}
        title="Add supplier"
        saveLabel="Add"
        saveDisabled={!newName.trim()}
        onSave={() => {
          const sup = onAddSupplier({ name: newName.trim(), country: newCountry.trim() || "—", defaultShippingMode: newMode });
          onPickSupplier(sup.id);
        }}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]" style={{ minHeight: 48 }} autoFocus />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">Country</label>
            <input value={newCountry} onChange={(e) => setNewCountry(e.target.value)} className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]" style={{ minHeight: 48 }} />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">Default shipping</label>
            <select value={newMode} onChange={(e) => setNewMode(e.target.value as ShippingMode)} className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]" style={{ minHeight: 48 }}>
              <option value="Ocean FCL">Ocean FCL</option>
              <option value="Ocean LCL">Ocean LCL</option>
              <option value="Air">Air</option>
            </select>
          </div>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Pick supplier">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search suppliers"
          className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
          style={{ minHeight: 48 }}
        />
      </div>
      {/* Special hints */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {(["TBD", "Various"] as const).map((h) => (
          <button
            key={h}
            onClick={() => onPickHint(h)}
            className={cn(
              "px-3 py-2.5 rounded-xl border text-sm transition-colors hover:bg-muted/40",
              selectedHint === h ? "bg-muted/60" : "bg-card border-border/60",
            )}
            style={{ minHeight: 48, borderColor: selectedHint === h ? "hsl(var(--brand-navy) / 0.35)" : undefined }}
          >
            <span className="italic text-muted-foreground">{h}</span>
          </button>
        ))}
      </div>
      <ul className="space-y-1.5">
        {filtered.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => onPickSupplier(s.id)}
              className={cn(
                "w-full text-left px-3.5 py-2.5 rounded-xl border transition-colors hover:bg-muted/40 flex items-center gap-2.5",
                selectedId === s.id ? "bg-muted/60" : "bg-card border-border/60",
              )}
              style={{ minHeight: 48, borderColor: selectedId === s.id ? "hsl(var(--brand-navy) / 0.35)" : undefined }}
            >
              <Factory className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--brand-navy) / 0.6)" }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground truncate">{s.name}</div>
                <div className="text-xs text-muted-foreground">{s.country} · {s.defaultShippingMode}</div>
              </div>
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="text-sm text-muted-foreground italic px-3 py-4 text-center">No suppliers match.</li>
        )}
      </ul>
      <button
        onClick={() => setAdding(true)}
        className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3.5 py-3 rounded-xl border border-dashed text-sm font-medium hover:bg-muted/40 transition-colors"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: 48 }}
      >
        <Plus className="h-4 w-4" /> Add new supplier
      </button>
    </BottomSheet>
  );
};

// ─────────── Line item editor ───────────
interface LineItemEditorProps {
  open: boolean;
  onClose: () => void;
  title: string;
  qty: number | "";
  description: string;
  onSave: (qty: number, description: string) => void;
  onDelete?: () => void;
}
export const LineItemEditor = ({ open, onClose, title, qty, description, onSave, onDelete }: LineItemEditorProps) => {
  const [q, setQ] = useState<string>(String(qty ?? ""));
  const [d, setD] = useState(description);
  useEffect(() => { if (open) { setQ(String(qty ?? "")); setD(description); } }, [open, qty, description]);
  const qNum = Number(q);
  const valid = qNum > 0 && d.trim().length > 0;
  return (
    <BottomSheet open={open} onClose={onClose} title={title} onSave={() => valid && onSave(qNum, d.trim())} saveDisabled={!valid}>
      <div className="space-y-3">
        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">Quantity</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] tabular focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
            style={{ minHeight: 48 }}
            autoFocus
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">Item description</label>
          <input
            value={d}
            onChange={(e) => setD(e.target.value)}
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
            style={{ minHeight: 48 }}
          />
        </div>
        {onDelete && (
          <button
            onClick={onDelete}
            className="w-full mt-2 px-3.5 py-3 rounded-xl border text-sm font-medium hover:bg-muted/40 transition-colors"
            style={{ borderColor: "hsl(var(--urgent) / 0.4)", color: "hsl(var(--urgent))", minHeight: 48 }}
          >
            Delete item
          </button>
        )}
      </div>
    </BottomSheet>
  );
};
