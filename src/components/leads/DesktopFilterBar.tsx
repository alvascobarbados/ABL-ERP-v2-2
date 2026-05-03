/**
 * Desktop-only horizontal filter strip. Single full-width row that wraps to
 * additional rows only on overflow, never splitting a category. Each category
 * renders as: small uppercase label + inline chips, with subtle vertical
 * dividers between groups. Customer/Supplier are chip-style buttons that open
 * a searchable dropdown.
 *
 * Hidden on mobile by parent (lg:block wrapper).
 */
import { useMemo, useState, useRef, useEffect } from "react";
import { ChevronDown, Search, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilterState, DeadlineUrgency } from "./FilterBar";
import { EMPTY_FILTER, filterCount } from "./FilterBar";
import type { ShippingMode } from "@/data/pipelines";

interface Props {
  value: FilterState;
  onChange: (next: FilterState) => void;
  customers: string[];
  suppliers: { id: string; name: string }[];
  salesReps: string[];
}

const MODES: ShippingMode[] = ["Air", "Ocean", "Local"];
const URGENCY: { id: Exclude<DeadlineUrgency, null>; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "this_week", label: "Due 7d" },
  { id: "this_month", label: "Future" },
];

// ── Pill chip (paper rest / navy active) ──
const Chip = ({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "h-7 px-2.5 rounded-full text-[12px] font-medium transition-colors border whitespace-nowrap",
      active ? "text-white border-transparent" : "hover:border-foreground/40",
    )}
    style={{
      backgroundColor: active ? "hsl(var(--brand-navy))" : "hsl(var(--brand-paper, 36 38% 95%))",
      color: active ? "white" : "hsl(var(--brand-navy))",
      borderColor: active ? "transparent" : "hsl(var(--brand-navy) / 0.2)",
    }}
  >
    {children}
  </button>
);

const GroupLabel = ({ children }: { children: React.ReactNode }) => (
  <span
    className="text-[10px] font-semibold uppercase mr-2 shrink-0"
    style={{ color: "hsl(var(--brand-navy) / 0.6)", letterSpacing: "0.05em" }}
  >
    {children}
  </span>
);

const Divider = () => (
  <span
    aria-hidden
    className="inline-block shrink-0"
    style={{
      width: 1, height: 18,
      backgroundColor: "hsl(var(--brand-navy) / 0.12)",
      margin: "0 14px",
    }}
  />
);

// ── Searchable dropdown (chip-style trigger) ──
function SearchDropdown({
  label, value, count, options, onChange,
}: {
  label: string;
  value: string | null;
  count: number;
  options: { id: string; label: string }[];
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = options.find((o) => o.id === value);
  const active = !!selected;
  const filtered = useMemo(
    () => (q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options),
    [options, q],
  );

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "h-7 pl-2.5 pr-1.5 rounded-full text-[12px] font-medium transition-colors border inline-flex items-center gap-1 whitespace-nowrap",
          active ? "text-white border-transparent" : "hover:border-foreground/40",
        )}
        style={{
          minWidth: 110,
          backgroundColor: active ? "hsl(var(--brand-orange))" : "hsl(var(--brand-paper, 36 38% 95%))",
          color: active ? "white" : "hsl(var(--brand-navy))",
          borderColor: active ? "transparent" : "hsl(var(--brand-navy) / 0.2)",
        }}
      >
        <span className="max-w-[160px] truncate">{active ? selected!.label : label}</span>
        {active && count > 1 && (
          <span
            className="inline-flex items-center justify-center rounded-full text-[10px] font-bold"
            style={{
              minWidth: 16, height: 16, padding: "0 4px",
              backgroundColor: "white", color: "hsl(var(--brand-navy))",
            }}
          >
            {count}
          </span>
        )}
        {active ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
            className="p-0.5 rounded-full hover:bg-white/20"
          >
            <X className="h-3 w-3" />
          </span>
        ) : (
          <ChevronDown className="h-3 w-3 opacity-60" />
        )}
      </button>
      {open && (
        <div
          className="absolute z-50 mt-8 left-0 w-64 bg-popover border rounded-lg shadow-lg overflow-hidden"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.15)" }}
        >
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b" style={{ borderColor: "hsl(var(--brand-navy) / 0.1)" }}>
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="flex-1 bg-transparent text-[12px] outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-muted-foreground">No matches</div>
            ) : filtered.map((o) => {
              const isSel = o.id === value;
              return (
                <button
                  key={o.id}
                  onClick={() => { onChange(o.id); setOpen(false); setQ(""); }}
                  className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted/50 flex items-center justify-between"
                >
                  <span className="truncate">{o.label}</span>
                  {isSel && <Check className="h-3.5 w-3.5 text-foreground/60" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline group: label + chips, kept on the same wrap line ──
const Group = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="inline-flex items-center gap-1.5 shrink-0">
    <GroupLabel>{label}</GroupLabel>
    {children}
  </div>
);

export const DesktopFilterBar = ({ value, onChange, customers, suppliers, salesReps }: Props) => {
  const toggleArr = <T extends string>(arr: T[], item: T): T[] =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

  const setMode = (m: ShippingMode) => onChange({ ...value, shippingModes: toggleArr(value.shippingModes as ShippingMode[], m) });
  const setRep = (r: string) => onChange({ ...value, salesReps: toggleArr(value.salesReps, r) });
  const toggleFlag = () => onChange({ ...value, flagged: value.flagged === true ? null : true });
  const setUrgency = (u: Exclude<DeadlineUrgency, null>) =>
    onChange({ ...value, urgency: value.urgency === u ? null : u });

  const customer = value.customers[0] ?? null;
  const supplier = value.supplierIds[0] ?? null;
  const count = filterCount(value);

  return (
    <div
      className="rounded-2xl border px-3 py-2.5"
      style={{
        backgroundColor: "hsl(var(--brand-navy) / 0.03)",
        borderColor: "hsl(var(--brand-navy) / 0.1)",
      }}
    >
      <div className="flex flex-wrap items-center gap-y-2">
        <Group label="MODE">
          {MODES.map((m, i) => (
            <Chip key={m} active={value.shippingModes.includes(m)} onClick={() => setMode(m)}>{m}</Chip>
          ))}
        </Group>

        {salesReps.length > 0 && (
          <>
            <Divider />
            <Group label="REP">
              {salesReps.map((r) => (
                <Chip key={r} active={value.salesReps.includes(r)} onClick={() => setRep(r)}>{r}</Chip>
              ))}
            </Group>
          </>
        )}

        <Divider />
        <Group label="FLAG">
          <Chip active={value.flagged === true} onClick={toggleFlag}>Flagged</Chip>
        </Group>

        <Divider />
        <Group label="URGENCY">
          {URGENCY.map((u) => (
            <Chip key={u.id} active={value.urgency === u.id} onClick={() => setUrgency(u.id)}>{u.label}</Chip>
          ))}
        </Group>

        <Divider />
        <Group label="CUSTOMER">
          <SearchDropdown
            label="Customer"
            value={customer}
            count={value.customers.length}
            options={customers.map((c) => ({ id: c, label: c }))}
            onChange={(id) => onChange({ ...value, customers: id ? [id] : [] })}
          />
        </Group>

        <Divider />
        <Group label="SUPPLIER">
          <SearchDropdown
            label="Supplier"
            value={supplier}
            count={value.supplierIds.length}
            options={[{ id: "__unassigned", label: "Unassigned" }, ...suppliers.map((s) => ({ id: s.id, label: s.name }))]}
            onChange={(id) => onChange({ ...value, supplierIds: id ? [id] : [] })}
          />
        </Group>

        {count > 0 && (
          <button
            onClick={() => onChange(EMPTY_FILTER)}
            className="ml-auto text-[12px] font-medium hover:underline underline-offset-2 px-2"
            style={{ color: "hsl(var(--brand-navy) / 0.7)" }}
          >
            Reset all
          </button>
        )}
      </div>
    </div>
  );
};
