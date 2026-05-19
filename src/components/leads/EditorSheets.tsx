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
  /** Optional clear-all action. Renders a muted full-width button at the bottom of the sheet. */
  onClear?: () => void;
  clearLabel?: string;
  children: React.ReactNode;
}
export const BottomSheet = ({ open, onClose, title, onSave, saveLabel = "Done", saveDisabled, onClear, clearLabel = "Clear", children }: BottomSheetProps) => {
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
        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {children}
          {onClear && (
            <div className="mt-5 pt-4 border-t border-border/60">
              <button
                type="button"
                onClick={onClear}
                className="w-full text-[13px] text-muted-foreground hover:text-foreground transition-colors py-2 rounded-lg"
                style={{ minHeight: 40 }}
              >
                {clearLabel}
              </button>
            </div>
          )}
        </div>
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
  /** Optional max input length (characters). No cap when omitted. */
  maxLength?: number;
  /** Inline validation error rendered in muted red below the input. When set, also disables Save. */
  errorText?: string | null;
  /** Allow saving an empty value (for nullable fields). Defaults to false (required). */
  allowEmpty?: boolean;
  onSave: (v: string) => void;
  /** Optional clear handler. When provided, renders a "Clear" button that wipes the field. */
  onClear?: () => void;
  clearLabel?: string;
}
export const TextEditor = ({ open, onClose, title, value, placeholder, multiline, warning, prefix, digitsOnly, allowDecimal, maxLength, errorText, allowEmpty, onSave, onClear, clearLabel }: TextEditorProps) => {
  const capLen = (s: string) => (maxLength != null ? s.slice(0, maxLength) : s);
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
    setV(capLen(sanitizeDigitsLike(next)));
  };
  const handleChange = (raw: string) => {
    if (digitsOnly) setV(capLen(sanitizeDigitsLike(raw)));
    else setV(capLen(raw));
  };
  const commit = () => {
    if (digitsOnly) onSave(capLen(sanitizeDigitsLike(v)));
    else onSave(capLen(v.trim()));
  };
  // Allow empty save when digitsOnly (clearing the field is meaningful) or when allowEmpty is opted in.
  const saveDisabled = (digitsOnly || allowEmpty) ? false : !v.trim();

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      onSave={commit}
      saveDisabled={saveDisabled}
      onClear={onClear}
      clearLabel={clearLabel ?? `Clear ${title.toLowerCase()}`}
    >
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
            maxLength={maxLength}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px] tabular p-0"
            style={{ color: "hsl(var(--brand-navy))" }}
          />
        </div>
      ) : (
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          value={v}
          onChange={(e) => setV(capLen(e.target.value))}
          placeholder={placeholder}
          maxLength={maxLength}
          className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
          style={{ minHeight: 48 }}
        />
      )}
      {errorText && (
        <p className="mt-3 text-xs leading-snug" style={{ color: "hsl(var(--urgent))" }}>{errorText}</p>
      )}
      {warning && !errorText && (
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
  onClear?: () => void;
}
export const DateEditor = ({ open, onClose, title, value, onSave, onClear }: DateEditorProps) => {
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
      {onClear && value && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={onClear}
            className="text-[13px] italic px-3 py-2 rounded-lg hover:bg-muted/40 transition-colors"
            style={{ color: "hsl(var(--brand-navy) / 0.65)" }}
          >
            — Clear date —
          </button>
        </div>
      )}
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
  onClear?: () => void;
  clearLabel?: string;
}
export const ListPicker = ({ open, onClose, title, options, selectedId, onPick, onClear, clearLabel }: ListPickerProps) => {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <ul className="space-y-1.5">
        {onClear && selectedId != null && (
          <li>
            <button
              onClick={onClear}
              className="w-full text-left px-3.5 py-3 rounded-xl border border-dashed transition-colors hover:bg-muted/40"
              style={{ minHeight: 48, borderColor: "hsl(var(--brand-navy) / 0.2)" }}
            >
              <div className="text-sm italic" style={{ color: "hsl(var(--brand-navy) / 0.6)" }}>
                {clearLabel ?? "— Clear selection —"}
              </div>
            </button>
          </li>
        )}
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

// ─────────── Tracking reference editor (mode-gated, format-enforced) ───────────
import {
  AIR_CARRIERS, OCEAN_TRACKING_PREFIX, SHIPMENT_AIR_PREFIX, SHIPMENT_OCEAN_PREFIXES,
  parseTracking, parseShipmentNumber,
  sanitizeCustomPrefix, sanitizeDigits, sanitizeAlnum,
  validateAndCompose, validateShipmentNumber,
} from "@/lib/tracking";

interface TrackingEditorProps {
  open: boolean;
  onClose: () => void;
  /** null/undefined → editor opens disabled with helper text. */
  shippingMode: ShippingMode | null | undefined;
  value?: string | null;
  onSave: (v: string | null) => void;
}

export const TrackingEditor = ({ open, onClose, shippingMode, value, onSave }: TrackingEditorProps) => {
  const mode = shippingMode ?? null;

  // Initial parse — Air uses carrier dropdown, Ocean uses BL- text, Local is free.
  const initial = parseTracking(value ?? "");
  const initialCarrier = (() => {
    if (mode !== "Air") return "";
    if (initial.prefix && (AIR_CARRIERS as readonly string[]).includes(initial.prefix)) return initial.prefix;
    if (initial.prefix || initial.number) return "Other";
    return "";
  })();
  const initialCustom = initialCarrier === "Other" ? initial.prefix : "";
  const initialNumber = mode === "Air" ? sanitizeDigits(initial.number) : "";
  const initialOceanBl = mode === "Ocean" && initial.prefix === OCEAN_TRACKING_PREFIX
    ? sanitizeAlnum(initial.number)
    : "";
  const initialLocal = mode === "Local" ? (value ?? "") : "";

  const [carrier, setCarrier] = useState<string>(initialCarrier);
  const [customPrefix, setCustomPrefix] = useState<string>(initialCustom);
  const [number, setNumber] = useState<string>(initialNumber);
  const [oceanBl, setOceanBl] = useState<string>(initialOceanBl);
  const [localText, setLocalText] = useState<string>(initialLocal);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const p = parseTracking(value ?? "");
    if (mode === "Local") {
      setCarrier(""); setCustomPrefix(""); setNumber(""); setOceanBl("");
      setLocalText(value ?? "");
    } else if (mode === "Air") {
      const c = p.prefix && (AIR_CARRIERS as readonly string[]).includes(p.prefix)
        ? p.prefix
        : (p.prefix || p.number ? "Other" : "");
      setCarrier(c);
      setCustomPrefix(c === "Other" ? p.prefix : "");
      setNumber(sanitizeDigits(p.number));
      setOceanBl("");
      setLocalText("");
    } else if (mode === "Ocean") {
      setCarrier(""); setCustomPrefix(""); setNumber("");
      setOceanBl(p.prefix === OCEAN_TRACKING_PREFIX ? sanitizeAlnum(p.number) : "");
      setLocalText("");
    } else {
      setCarrier(""); setCustomPrefix(""); setNumber(""); setOceanBl(""); setLocalText("");
    }
    setError(null);
  }, [open, value, mode]);

  const handleSave = () => {
    if (!mode) return;
    // Empty bypasses format validation — saving an empty tracking value clears the field.
    if (mode === "Local" && (localText ?? "").trim() === "") { onSave(null); return; }
    if (mode === "Ocean" && sanitizeAlnum(oceanBl ?? "") === "") { onSave(null); return; }
    if (mode === "Air") {
      const hasCarrier = carrier === "Other" ? !!sanitizeCustomPrefix(customPrefix).replace(/-+$/, "") : !!carrier;
      const hasNumber = !!sanitizeDigits(number);
      if (!hasCarrier && !hasNumber) { onSave(null); return; }
    }
    const result = validateAndCompose({ mode, carrier, customPrefix, number, localText, oceanBlSuffix: oceanBl });
    if (!result.ok) { setError(result.error ?? "Invalid"); return; }
    onSave(result.value === undefined ? null : (result.value ?? null));
  };

  const handleClear = () => { onSave(null); };

  // ── Disabled state ────────────────────────────────────────────────────
  if (!mode) {
    return (
      <BottomSheet open={open} onClose={onClose} title="Tracking">
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-center">
          <div className="text-[13px] text-muted-foreground">
            Set Mode first to enable Tracking.
          </div>
        </div>
      </BottomSheet>
    );
  }

  // ── Local: free-text ──────────────────────────────────────────────────
  if (mode === "Local") {
    return (
      <BottomSheet open={open} onClose={onClose} title="Local tracking" onSave={handleSave} onClear={handleClear} clearLabel="Clear tracking">
        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">
            Tracking note
          </label>
          <input
            value={localText}
            onChange={(e) => setLocalText(e.target.value)}
            placeholder="Driver name, reference, etc."
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
            style={{ minHeight: 48 }}
            autoFocus
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">Anything goes — leave blank to clear.</p>
        </div>
      </BottomSheet>
    );
  }

  // ── Ocean: BL- prefix locked + alphanumeric suffix ────────────────────
  if (mode === "Ocean") {
    const preview = oceanBl ? `${OCEAN_TRACKING_PREFIX}-${oceanBl}` : "";
    return (
      <BottomSheet open={open} onClose={onClose} title="Ocean tracking (B/L)" onSave={handleSave} onClear={handleClear} clearLabel="Clear tracking">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">
              B/L number
            </label>
            <div
              className="flex items-center w-full rounded-xl border border-border bg-card px-3 py-2.5 focus-within:ring-2 focus-within:ring-[hsl(var(--brand-navy)/0.4)]"
              style={{ minHeight: 48 }}
            >
              <span
                aria-hidden
                className="text-[15px] tabular select-none pointer-events-none shrink-0 mr-0.5"
                style={{ color: "hsl(var(--brand-navy) / 0.6)" }}
              >
                {OCEAN_TRACKING_PREFIX}-
              </span>
              <input
                value={oceanBl}
                onChange={(e) => { setOceanBl(sanitizeAlnum(e.target.value)); setError(null); }}
                onPaste={(e) => {
                  e.preventDefault();
                  const txt = e.clipboardData.getData("text") ?? "";
                  const stripped = txt.trim().replace(/^\s*BL-?/i, "");
                  setOceanBl(sanitizeAlnum(stripped));
                  setError(null);
                }}
                placeholder="ZIMUHAI80204723"
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px] tabular p-0"
                style={{ color: "hsl(var(--brand-navy))" }}
                autoFocus
              />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Letters and digits only — no spaces.</p>
          </div>
          {error && (
            <div className="text-[12px] font-medium" style={{ color: "hsl(var(--urgent))" }}>{error}</div>
          )}
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1">Preview</div>
            <div className="text-[15px] font-semibold tabular" style={{ color: "hsl(var(--brand-navy))" }}>
              {preview || <span className="italic text-muted-foreground font-normal">BL-number</span>}
            </div>
          </div>
        </div>
      </BottomSheet>
    );
  }

  // ── Air: carrier dropdown + digits ────────────────────────────────────
  const options: string[] = [...AIR_CARRIERS, "Other"];
  const isOther = carrier === "Other";
  const previewPrefix = isOther
    ? sanitizeCustomPrefix(customPrefix).replace(/-+$/, "")
    : carrier;
  const previewNumber = sanitizeDigits(number);
  const preview = previewPrefix && previewNumber ? `${previewPrefix}-${previewNumber}` : "";

  return (
    <BottomSheet open={open} onClose={onClose} title="Air tracking" onSave={handleSave} onClear={handleClear} clearLabel="Clear tracking">
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">
            Carrier
          </label>
          <div className="grid grid-cols-3 gap-2">
            {options.map((o) => (
              <button
                key={o}
                onClick={() => { setCarrier(o); setError(null); }}
                className={cn(
                  "px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors hover:bg-muted/40",
                  carrier === o ? "bg-muted/60" : "bg-card border-border/60",
                )}
                style={{ minHeight: 48, borderColor: carrier === o ? "hsl(var(--brand-navy) / 0.45)" : undefined }}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        {isOther && (
          <div>
            <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">
              Carrier code
            </label>
            <input
              value={customPrefix}
              onChange={(e) => { setCustomPrefix(sanitizeCustomPrefix(e.target.value)); setError(null); }}
              placeholder="e.g. ARAMEX"
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] tracking-wide focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
              style={{ minHeight: 48 }}
              autoFocus
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">Uppercase letters, digits, hyphens.</p>
          </div>
        )}

        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">
            Tracking number
          </label>
          <input
            value={number}
            onChange={(e) => { setNumber(sanitizeDigits(e.target.value)); setError(null); }}
            onPaste={(e) => {
              e.preventDefault();
              const txt = e.clipboardData.getData("text");
              setNumber(sanitizeDigits(txt));
              setError(null);
            }}
            inputMode="numeric"
            placeholder="9876543210"
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] tabular focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
            style={{ minHeight: 48 }}
          />
        </div>

        {error && (
          <div className="text-[12px] font-medium" style={{ color: "hsl(var(--urgent))" }}>{error}</div>
        )}

        <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1">Preview</div>
          <div className="text-[15px] font-semibold tabular" style={{ color: "hsl(var(--brand-navy))" }}>
            {preview || <span className="italic text-muted-foreground font-normal">PREFIX-number</span>}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
};

// ─────────── Shipment Number editor (mode-gated, format-enforced) ───────────
//
// Internal company-assigned number. AIR-#### (4 digits) or FCL-### / LCL-### (3 digits).
// Local mode is not supported in v1.
interface ShipmentNumberEditorProps {
  open: boolean;
  onClose: () => void;
  shippingMode: ShippingMode | null | undefined;
  value?: string | null;
  onSave: (v: string | null) => void;
}

export const ShipmentNumberEditor = ({ open, onClose, shippingMode, value, onSave }: ShipmentNumberEditorProps) => {
  const mode = shippingMode ?? null;
  const parsed = parseShipmentNumber(value ?? null);

  const initialOceanPrefix: "FCL" | "LCL" =
    mode === "Ocean" && (parsed?.prefix === "FCL" || parsed?.prefix === "LCL")
      ? (parsed.prefix as "FCL" | "LCL")
      : "FCL";
  const initialNumber = parsed
    ? sanitizeDigits(parsed.number, mode === "Air" ? 4 : 3)
    : "";

  const [oceanPrefix, setOceanPrefix] = useState<"FCL" | "LCL">(initialOceanPrefix);
  const [number, setNumber] = useState<string>(initialNumber);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const p = parseShipmentNumber(value ?? null);
    if (mode === "Air") {
      setNumber(p?.prefix === "AIR" ? sanitizeDigits(p.number, 4) : "");
      setOceanPrefix("FCL");
    } else if (mode === "Ocean") {
      setOceanPrefix(p?.prefix === "LCL" ? "LCL" : "FCL");
      setNumber(p && (p.prefix === "FCL" || p.prefix === "LCL") ? sanitizeDigits(p.number, 3) : "");
    } else {
      setNumber("");
      setOceanPrefix("FCL");
    }
    setError(null);
  }, [open, value, mode]);

  const handleSave = () => {
    if (!mode) return;
    if (number === "") { onSave(null); return; }
    const composed = mode === "Air"
      ? `${SHIPMENT_AIR_PREFIX}-${number}`
      : `${oceanPrefix}-${number}`;
    const v = validateShipmentNumber(mode, composed);
    if (!v.ok) { setError(v.error ?? "Invalid"); return; }
    onSave(v.value === undefined ? null : (v.value ?? null));
  };

  const handleClear = () => { onSave(null); };

  if (!mode) {
    return (
      <BottomSheet open={open} onClose={onClose} title="Shipment Number">
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-center">
          <div className="text-[13px] text-muted-foreground">Set Mode first to enable Shipment Number.</div>
        </div>
      </BottomSheet>
    );
  }

  if (mode === "Local") {
    return (
      <BottomSheet open={open} onClose={onClose} title="Shipment Number">
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-center">
          <div className="text-[13px] text-muted-foreground">Shipment Number not yet supported for Local mode.</div>
        </div>
      </BottomSheet>
    );
  }

  const maxLen = mode === "Air" ? 4 : 3;
  const lockedPrefix = mode === "Air" ? `${SHIPMENT_AIR_PREFIX}-` : `${oceanPrefix}-`;
  const preview = number ? `${lockedPrefix}${number}` : "";

  return (
    <BottomSheet open={open} onClose={onClose} title={mode === "Air" ? "Air shipment number" : "Ocean shipment number"} onSave={handleSave} onClear={handleClear} clearLabel="Clear shipment number">
      <div className="space-y-4">
        {mode === "Ocean" && (
          <div>
            <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">
              Container type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SHIPMENT_OCEAN_PREFIXES.map((o) => (
                <button
                  key={o}
                  onClick={() => { setOceanPrefix(o); setError(null); }}
                  className={cn(
                    "px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors hover:bg-muted/40",
                    oceanPrefix === o ? "bg-muted/60" : "bg-card border-border/60",
                  )}
                  style={{ minHeight: 48, borderColor: oceanPrefix === o ? "hsl(var(--brand-navy) / 0.45)" : undefined }}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">
            {mode === "Air" ? "Number (4 digits)" : "Number (3 digits)"}
          </label>
          <div
            className="flex items-center w-full rounded-xl border border-border bg-card px-3 py-2.5 focus-within:ring-2 focus-within:ring-[hsl(var(--brand-navy)/0.4)]"
            style={{ minHeight: 48 }}
          >
            <span
              aria-hidden
              className="text-[15px] tabular select-none pointer-events-none shrink-0 mr-0.5"
              style={{ color: "hsl(var(--brand-navy) / 0.6)" }}
            >
              {lockedPrefix}
            </span>
            <input
              value={number}
              onChange={(e) => { setNumber(sanitizeDigits(e.target.value, maxLen)); setError(null); }}
              onPaste={(e) => {
                e.preventDefault();
                const txt = e.clipboardData.getData("text") ?? "";
                const stripped = txt.trim().replace(/^\s*(AIR|FCL|LCL)-?/i, "");
                setNumber(sanitizeDigits(stripped, maxLen));
                setError(null);
              }}
              inputMode="numeric"
              placeholder={mode === "Air" ? "1224" : "124"}
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px] tabular p-0"
              style={{ color: "hsl(var(--brand-navy))" }}
              autoFocus
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Leave blank to clear.</p>
        </div>
        {error && (
          <div className="text-[12px] font-medium" style={{ color: "hsl(var(--urgent))" }}>{error}</div>
        )}
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1">Preview</div>
          <div className="text-[15px] font-semibold tabular" style={{ color: "hsl(var(--brand-navy))" }}>
            {preview || <span className="italic text-muted-foreground font-normal">PREFIX-number</span>}
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
