/**
 * Generic list-bound bottom-sheet picker for the 4 master-data entities
 * (Customer, Supplier, Team Member, Product) and a multi-select variant
 * for Sales Reps.
 *
 * The pattern, from the brief:
 *   - Title at top
 *   - Auto-focused search input
 *   - Live-filtered, alphabetised list
 *   - "+ Add new …" inline form (escape valve, always available)
 *   - Optional meta-options at the top of the list (TBD/Various/Unassigned for
 *     Supplier; "Custom (free text)" for Product)
 *
 * Free-typing in the host form is REPLACED by tapping a field → this picker
 * opens. Locked-by-default master data, escape valve always there.
 */
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./EditorSheets";
import { useMasterData, EntityKind, parseInitials } from "@/hooks/useMasterData";
import type { ShippingMode } from "@/data/pipelines";

// ─── Single-select picker ────────────────────────────────────────────────
interface SingleProps {
  open: boolean;
  onClose: () => void;
  kind: EntityKind;
  /** Currently selected id (Customer/Supplier/Team/Product) */
  selectedId?: string | null;
  /** Currently selected meta value (e.g. "TBD", "Custom"). */
  selectedMeta?: string | null;
  /** Called with the row's primary identifier:
   *   - Customer  → name
   *   - Supplier  → id (uuid)
   *   - Team      → initials
   *   - Product   → name
   */
  onPick: (idOrName: string) => void;
  /** Called with a meta-option key (e.g. "TBD", "Various", "Unassigned", "Custom"). */
  onPickMeta?: (meta: string, value?: string) => void;
}

const META_OPTIONS: Record<EntityKind, { key: string; label: string; italic?: boolean }[]> = {
  supplier: [
    { key: "TBD", label: "TBD", italic: true },
    { key: "Various", label: "Various", italic: true },
    { key: "Unassigned", label: "Unassigned", italic: true },
  ],
  product: [
    { key: "Custom", label: "Custom (free text)", italic: true },
  ],
  customer: [],
  team: [],
};

const TITLES: Record<EntityKind, string> = {
  customer: "Pick customer",
  supplier: "Pick supplier",
  team: "Pick sales rep",
  product: "Pick product",
};

const ADD_LABELS: Record<EntityKind, string> = {
  customer: "Add new customer",
  supplier: "Add new supplier",
  team: "Add new team member",
  product: "Add new product",
};

export const EntityPicker = ({
  open, onClose, kind, selectedId, selectedMeta, onPick, onPickMeta,
}: SingleProps) => {
  const md = useMasterData();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => { if (open) { setQ(""); setAdding(false); } }, [open]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (kind === "customer") {
      return md.customers
        .filter((c) => !term || c.name.toLowerCase().includes(term))
        .map((c) => ({ id: c.name, label: c.name, sub: c.industry ?? undefined }));
    }
    if (kind === "supplier") {
      return md.suppliers
        .filter((s) => !term || s.name.toLowerCase().includes(term))
        .map((s) => ({ id: s.id, label: s.name, sub: [s.country, s.default_shipping_mode].filter(Boolean).join(" · ") || undefined }));
    }
    if (kind === "team") {
      return md.teamMembers
        .filter((t) => !term || t.initials.toLowerCase().includes(term) || t.full_name.toLowerCase().includes(term))
        .map((t) => ({ id: t.initials, label: `${t.initials} — ${t.full_name}`, sub: t.role ?? undefined }));
    }
    return md.products
      .filter((p) => !term || p.name.toLowerCase().includes(term))
      .map((p) => ({ id: p.name, label: p.name, sub: p.default_unit ?? undefined }));
  }, [kind, md.customers, md.suppliers, md.teamMembers, md.products, q]);

  const exactMatch = rows.some((r) => r.label.toLowerCase() === q.trim().toLowerCase());
  const showInlineCreate = q.trim().length > 0 && !exactMatch && kind !== "team";

  if (adding) {
    return (
      <InlineAdd
        open={open}
        kind={kind}
        initialName={q}
        onClose={() => setAdding(false)}
        onCreated={(idOrName) => {
          setAdding(false);
          onPick(idOrName);
          onClose();
        }}
      />
    );
  }

  const metaOpts = META_OPTIONS[kind];

  return (
    <BottomSheet open={open} onClose={onClose} title={TITLES[kind]}>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
          style={{ minHeight: 48 }}
          autoFocus
        />
      </div>

      {/* Meta options */}
      {metaOpts.length > 0 && onPickMeta && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {metaOpts.map((m) => (
            <button
              key={m.key}
              onClick={() => { onPickMeta(m.key); onClose(); }}
              className={cn(
                "px-2.5 py-2.5 rounded-xl border text-sm transition-colors hover:bg-muted/40",
                selectedMeta === m.key ? "bg-muted/60" : "bg-card border-border/60",
              )}
              style={{ minHeight: 44 }}
            >
              <span className={cn(m.italic && "italic text-muted-foreground")}>{m.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Inline-create row when search has no match */}
      {showInlineCreate && (
        <button
          onClick={() => setAdding(true)}
          className="mb-2 w-full inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed text-sm font-medium hover:bg-muted/40 transition-colors"
          style={{ borderColor: "hsl(var(--brand-orange) / 0.55)", color: "hsl(var(--brand-orange))", minHeight: 48 }}
        >
          <Plus className="h-4 w-4" /> Add "{q.trim()}"
        </button>
      )}

      {/* Existing list */}
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => { onPick(r.id); onClose(); }}
              className={cn(
                "w-full text-left px-3.5 py-2.5 rounded-xl border transition-colors hover:bg-muted/40",
                selectedId === r.id ? "bg-muted/60" : "bg-card border-border/60",
              )}
              style={{ minHeight: 48, borderColor: selectedId === r.id ? "hsl(var(--brand-navy) / 0.35)" : undefined }}
            >
              <div className="text-sm font-medium text-foreground truncate">{r.label}</div>
              {r.sub && <div className="text-xs text-muted-foreground">{r.sub}</div>}
            </button>
          </li>
        ))}
        {rows.length === 0 && !showInlineCreate && (
          <li className="text-sm text-muted-foreground italic px-3 py-4 text-center">No matches.</li>
        )}
      </ul>

      {/* Always-available Add-new */}
      <button
        onClick={() => setAdding(true)}
        className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3.5 py-3 rounded-xl border border-dashed text-sm font-medium hover:bg-muted/40 transition-colors"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: 48 }}
      >
        <Plus className="h-4 w-4" /> {ADD_LABELS[kind]}
      </button>
    </BottomSheet>
  );
};

// ─── Multi-select (used for Sales Rep) ───────────────────────────────────
interface MultiProps {
  open: boolean;
  onClose: () => void;
  /** Currently selected initials (uppercase). */
  selected: string[];
  onConfirm: (initials: string[]) => void;
}

export const TeamMultiPicker = ({ open, onClose, selected, onConfirm }: MultiProps) => {
  const md = useMasterData();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);

  useEffect(() => { if (open) { setQ(""); setDraft(selected); setAdding(false); } }, [open, selected]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return md.teamMembers
      .filter((t) => !term || t.initials.toLowerCase().includes(term) || t.full_name.toLowerCase().includes(term))
      .map((t) => ({ initials: t.initials.toUpperCase(), label: `${t.initials} — ${t.full_name}`, role: t.role }));
  }, [md.teamMembers, q]);

  const toggle = (init: string) => {
    setDraft((d) => d.includes(init) ? d.filter((x) => x !== init) : [...d, init]);
  };

  if (adding) {
    return (
      <InlineAdd
        open={open}
        kind="team"
        initialName=""
        onClose={() => setAdding(false)}
        onCreated={(initials) => {
          setAdding(false);
          setDraft((d) => d.includes(initials) ? d : [...d, initials]);
        }}
      />
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Pick sales reps"
      onSave={() => { onConfirm(draft); onClose(); }}
      saveLabel="Done"
    >
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search team"
          className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
          style={{ minHeight: 48 }}
          autoFocus
        />
      </div>

      {/* Draft chips */}
      {draft.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {draft.map((init) => {
            const t = md.getTeamByInitials(init);
            return (
              <button
                key={init}
                onClick={() => toggle(init)}
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[12px] font-semibold tracking-wide"
                style={{
                  background: "hsl(var(--brand-navy) / 0.1)",
                  color: "hsl(var(--brand-navy))",
                }}
                title={t?.full_name ?? init}
              >
                {init}
                <X className="h-3 w-3" />
              </button>
            );
          })}
        </div>
      )}

      <ul className="space-y-1.5">
        {rows.map((r) => {
          const on = draft.includes(r.initials);
          return (
            <li key={r.initials}>
              <button
                onClick={() => toggle(r.initials)}
                className={cn(
                  "w-full text-left px-3.5 py-2.5 rounded-xl border transition-colors hover:bg-muted/40 flex items-center gap-2.5",
                  on ? "bg-muted/60" : "bg-card border-border/60",
                )}
                style={{ minHeight: 48, borderColor: on ? "hsl(var(--brand-navy) / 0.35)" : undefined }}
              >
                <span
                  className={cn(
                    "h-5 w-5 rounded border flex items-center justify-center shrink-0",
                    on && "bg-[hsl(var(--brand-navy))] border-transparent",
                  )}
                  style={{ borderColor: on ? undefined : "hsl(var(--brand-navy) / 0.4)" }}
                >
                  {on && <Check className="h-3.5 w-3.5 text-background" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">{r.label}</div>
                  {r.role && <div className="text-xs text-muted-foreground">{r.role}</div>}
                </div>
              </button>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="text-sm text-muted-foreground italic px-3 py-4 text-center">No team members match.</li>
        )}
      </ul>

      <button
        onClick={() => setAdding(true)}
        className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3.5 py-3 rounded-xl border border-dashed text-sm font-medium hover:bg-muted/40 transition-colors"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: 48 }}
      >
        <Plus className="h-4 w-4" /> Add new team member
      </button>
    </BottomSheet>
  );
};

// ─── Inline-add form ─────────────────────────────────────────────────────
interface InlineAddProps {
  open: boolean;
  kind: EntityKind;
  initialName?: string;
  onClose: () => void;
  /** Returns the new entity's primary identifier (same convention as `onPick`). */
  onCreated: (idOrName: string) => void;
}

export const InlineAdd = ({ open, kind, initialName = "", onClose, onCreated }: InlineAddProps) => {
  const md = useMasterData();
  const [name, setName] = useState(initialName);
  // Supplier extras
  const [country, setCountry] = useState("");
  const [mode, setMode] = useState<ShippingMode>("Ocean");
  // Team extras
  const [initials, setInitials] = useState("");
  const [fullName, setFullName] = useState("");
  // Customer extras
  const [industry, setIndustry] = useState("");
  // Product extras
  const [unit, setUnit] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setCountry(""); setMode("Ocean"); setInitials(""); setFullName("");
    setIndustry(""); setUnit("");
  }, [open, initialName]);

  const titles: Record<EntityKind, string> = {
    customer: "Add customer",
    supplier: "Add supplier",
    team: "Add team member",
    product: "Add product",
  };

  const valid = kind === "team"
    ? initials.trim().length > 0 && fullName.trim().length > 0
    : name.trim().length > 0;

  const submit = async () => {
    try {
      if (kind === "customer") {
        const c = await md.addCustomer({ name: name.trim(), industry: industry.trim() || undefined });
        toast.success(`Customer "${c.name}" added`);
        onCreated(c.name);
      } else if (kind === "supplier") {
        const s = await md.addSupplier({
          name: name.trim(),
          country: country.trim() || undefined,
          default_shipping_mode: mode,
        });
        toast.success(`Supplier "${s.name}" added`);
        onCreated(s.id);
      } else if (kind === "team") {
        const t = await md.addTeamMember({
          initials: initials.trim().toUpperCase(),
          full_name: fullName.trim(),
        });
        toast.success(`${t.initials} — ${t.full_name} added`);
        onCreated(t.initials);
      } else {
        const p = await md.addProduct({ name: name.trim(), default_unit: unit.trim() || undefined });
        toast.success(`Product "${p.name}" added`);
        onCreated(p.name);
      }
    } catch (err: any) {
      const msg: string = err?.message ?? "Could not create record";
      if (/duplicate/i.test(msg) || /unique/i.test(msg)) {
        toast.error(`That ${kind} already exists.`);
      } else {
        toast.error(msg);
      }
    }
  };

  const inputCls = "w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]";
  const labelCls = "block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5";

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={titles[kind]}
      onSave={submit}
      saveDisabled={!valid}
      saveLabel="Add"
    >
      <div className="space-y-3">
        {kind !== "team" && (
          <div>
            <label className={labelCls}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} style={{ minHeight: 48 }} autoFocus />
          </div>
        )}
        {kind === "customer" && (
          <div>
            <label className={labelCls}>Industry (optional)</label>
            <input value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputCls} style={{ minHeight: 48 }} placeholder="e.g. Beverage" />
          </div>
        )}
        {kind === "supplier" && (
          <>
            <div>
              <label className={labelCls}>Country (optional)</label>
              <input value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls} style={{ minHeight: 48 }} placeholder="e.g. China" />
            </div>
            <div>
              <label className={labelCls}>Default shipping</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as ShippingMode)} className={inputCls} style={{ minHeight: 48 }}>
                <option value="Air">Air</option>
                <option value="Ocean">Ocean</option>
                <option value="Local">Local</option>
              </select>
            </div>
          </>
        )}
        {kind === "team" && (
          <>
            <div>
              <label className={labelCls}>Initials</label>
              <input value={initials} onChange={(e) => setInitials(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))} className={inputCls} style={{ minHeight: 48 }} placeholder="AV" autoFocus />
            </div>
            <div>
              <label className={labelCls}>Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} style={{ minHeight: 48 }} placeholder="Alvasco Admin" />
            </div>
          </>
        )}
        {kind === "product" && (
          <div>
            <label className={labelCls}>Default unit (optional)</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls} style={{ minHeight: 48 }} placeholder="pcs, sets, m²…" />
          </div>
        )}
      </div>
    </BottomSheet>
  );
};
