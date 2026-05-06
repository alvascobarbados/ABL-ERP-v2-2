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
  /** Fixed visual prefix shown left of input (e.g. "Q-"). Not part of the saved value. */
  prefix?: string;
  /** Restrict input to digits only (paste is sanitized; prefix stripped). */
  digitsOnly?: boolean;
  /** Allow one decimal point in addition to digits (only when digitsOnly is true). */
  allowDecimal?: boolean;
  onSave: (v: string) => void;
}
export const TextEditor = ({ open, onClose, title, value, placeholder, multiline, warning, prefix, digitsOnly, onSave }: TextEditorProps) => {
export const TextEditor = ({ open, onClose, title, value, placeholder, multiline, warning, prefix, digitsOnly, allowDecimal, onSave }: TextEditorProps) => {
  const sanitizeDigitsLike = (raw: string): string => {
    if (!digitsOnly) return raw;
    if (!allowDecimal) return raw.replace(/\D/g, "");
    // Strip everything but digits + dot, then collapse to at most one dot.
    const cleaned = raw.replace(/[^\d.]/g, "");
    const firstDot = cleaned.indexOf(".");
    if (firstDot === -1) return cleaned;
    return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
  };
  // When digitsOnly+prefix, seed with digits only — strip any leading prefix from incoming value.
  const sanitizeIncoming = (raw: string) => {
    if (!digitsOnly) return raw;
    let s = raw.trim();
    if (prefix) {
      const px = prefix.replace(/-$/, "");
      const re = new RegExp(`^\\s*${px}-?`, "i");
      s = s.replace(re, "");
    }
    return sanitizeDigitsLike(s);
  };
  const [v, setV] = useState(sanitizeIncoming(value));
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useEffect(() => { if (open) setV(sanitizeIncoming(value)); }, [open, value]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      // Place cursor at end so prefix stays untouched
      const len = (el as HTMLInputElement).value.length;
      try { (el as HTMLInputElement).setSelectionRange(len, len); } catch { /* noop */ }
    }, 50);
    return () => clearTimeout(t);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!digitsOnly) return;
    // Allow control keys
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Tab", "Enter", "Escape"];
    if (allowed.includes(e.key)) return;
    if (allowDecimal) {
      if (/^\d$/.test(e.key)) return;
      if (e.key === "." && !v.includes(".")) return;
      e.preventDefault();
      return;
    }
    if (!/^\d$/.test(e.key)) e.preventDefault();
  };
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (!digitsOnly) return;
    e.preventDefault();
    const raw = e.clipboardData.getData("text") ?? "";
    let s = raw.trim();
    if (prefix) {
      const px = prefix.replace(/-$/, "");
      const re = new RegExp(`^\\s*${px}-?`, "i");
      s = s.replace(re, "");
    }
    const cleaned = sanitizeDigitsLike(s);
    if (!cleaned) return;
    const target = e.currentTarget;
    const start = target.selectionStart ?? v.length;
    const end = target.selectionEnd ?? v.length;
    const next = v.slice(0, start) + cleaned + v.slice(end);
    setV(sanitizeDigitsLike(next));
  };
  const handleChange = (raw: string) => {
    if (digitsOnly) setV(sanitizeDigitsLike(raw));
    else setV(raw);
  };
  const commit = () => {
    if (digitsOnly) onSave(sanitizeDigitsLike(v));
    else onSave(v.trim());
  };
  // Allow empty save when digitsOnly (clearing the field is meaningful)
  const saveDisabled = digitsOnly ? false : !v.trim();

  return (
    <BottomSheet open={open} onClose={onClose} title={title} onSave={commit} saveDisabled={saveDisabled}>
      {multiline ? (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)] resize-none"
        />
      ) : prefix ? (
        <div
          className="flex items-center w-full rounded-xl border border-border bg-card px-3 py-2.5 focus-within:ring-2 focus-within:ring-[hsl(var(--brand-navy)/0.4)] focus-within:border-transparent"
          style={{ minHeight: 48 }}
          onMouseDown={(e) => {
            // Clicking the prefix label forwards focus to the input (cursor at end).
            if (e.target !== ref.current) {
              e.preventDefault();
              const el = ref.current as HTMLInputElement | null;
              if (el) {
                el.focus();
                const len = el.value.length;
                try { el.setSelectionRange(len, len); } catch { /* noop */ }
              }
            }
          }}
        >
          <span
            aria-hidden
            className="text-[15px] tabular select-none pointer-events-none shrink-0 mr-0.5"
            style={{ color: "hsl(var(--brand-navy) / 0.6)" }}
          >
            {prefix}
          </span>
          <input
            ref={ref as React.RefObject<HTMLInputElement>}
            value={v}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            inputMode={digitsOnly ? "numeric" : undefined}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px] tabular p-0"
            style={{ color: "hsl(var(--brand-navy))" }}
          />
        </div>
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
  value?: Date;
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
              <option value="Air">Air</option>
              <option value="Ocean">Ocean</option>
              <option value="Local">Local</option>
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

// ─────────── Tracking reference editor ───────────
// Air → DHL / FedEx / Other (free-text carrier name)
// Ocean → FCL / LCL
interface TrackingEditorProps {
  open: boolean;
  onClose: () => void;
  shippingMode: "Air" | "Ocean";
  value?: string; // canonical PREFIX-number, e.g. "DHL-373747" or "FCL-125"
  onSave: (v: string | undefined) => void;
}
const parseTracking = (raw?: string) => {
  if (!raw) return { prefix: "", number: "" };
  const m = raw.match(/^([A-Za-z][A-Za-z0-9]*)-(.*)$/);
  if (m) return { prefix: m[1].toUpperCase(), number: m[2] };
  return { prefix: "", number: raw };
};
export const TrackingEditor = ({ open, onClose, shippingMode, value, onSave }: TrackingEditorProps) => {
  const air = ["DHL", "FedEx", "Other"] as const;
  const ocean = ["FCL", "LCL"] as const;
  const initial = parseTracking(value);
  const initialChoice = shippingMode === "Air"
    ? (air.includes(initial.prefix as any) ? initial.prefix : (initial.prefix ? "Other" : ""))
    : (ocean.includes(initial.prefix as any) ? initial.prefix : "");
  const [choice, setChoice] = useState<string>(initialChoice);
  const [otherCarrier, setOtherCarrier] = useState<string>(
    shippingMode === "Air" && initialChoice === "Other" ? initial.prefix : ""
  );
  const [number, setNumber] = useState<string>(initial.number);

  useEffect(() => {
    if (!open) return;
    const p = parseTracking(value);
    const c = shippingMode === "Air"
      ? (air.includes(p.prefix as any) ? p.prefix : (p.prefix ? "Other" : ""))
      : (ocean.includes(p.prefix as any) ? p.prefix : "");
    setChoice(c);
    setOtherCarrier(shippingMode === "Air" && c === "Other" ? p.prefix : "");
    setNumber(p.number);
  }, [open, value, shippingMode]);

  const effectivePrefix = shippingMode === "Air"
    ? (choice === "Other" ? otherCarrier.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : choice)
    : choice;
  const cleanNumber = number.trim();
  const valid = !!effectivePrefix && !!cleanNumber;
  const canonical = valid ? `${effectivePrefix}-${cleanNumber}` : undefined;
  const options = shippingMode === "Air" ? air : ocean;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={shippingMode === "Air" ? "Air tracking" : "Ocean tracking"}
      onSave={() => onSave(canonical)}
      saveDisabled={!valid}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">
            {shippingMode === "Air" ? "Carrier" : "Container"}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {options.map((o) => (
              <button
                key={o}
                onClick={() => setChoice(o)}
                className={cn(
                  "px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors hover:bg-muted/40",
                  choice === o ? "bg-muted/60" : "bg-card border-border/60",
                )}
                style={{ minHeight: 48, borderColor: choice === o ? "hsl(var(--brand-navy) / 0.45)" : undefined }}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        {shippingMode === "Air" && choice === "Other" && (
          <div>
            <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">
              Carrier name
            </label>
            <input
              value={otherCarrier}
              onChange={(e) => setOtherCarrier(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="e.g. UPS"
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] tracking-wide focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
              style={{ minHeight: 48 }}
              autoFocus
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">Letters and digits only — uppercased automatically.</p>
          </div>
        )}

        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">
            {shippingMode === "Air" ? "Tracking number" : "Container / booking number"}
          </label>
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder={shippingMode === "Air" ? "373747" : "125"}
            inputMode={shippingMode === "Air" ? "text" : "text"}
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] tabular focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
            style={{ minHeight: 48 }}
          />
        </div>

        <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1">Preview</div>
          <div className="text-[15px] font-semibold tabular" style={{ color: "hsl(var(--brand-navy))" }}>
            {canonical ?? <span className="italic text-muted-foreground font-normal">PREFIX-number</span>}
          </div>
        </div>
      </div>
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
