/**
 * SpreadsheetView — shared list-of-records grammar.
 *
 * Used by /spreadsheet today; will be reused by Customers, Suppliers, Team,
 * Products and Shipments sub-pages in subsequent slices. Mobile (<lg) is
 * intentionally minimally styled — these pages are desktop-first.
 *
 * Visual contract (Alvasco brand):
 *   - Header zone: Raleway SemiBold 22px navy title + 14px navy/60% subtitle
 *   - Right controls: Columns · CSV · (optional) Add (orange filled)
 *   - Search row + optional secondary <select> filters
 *   - Sticky thead + sticky first column on horizontal scroll
 *   - 56px row height, alternating paper / 2%-navy stripes, 4% navy hover
 *   - Cell font Raleway 14px navy, em-dash placeholder at 40% opacity
 *   - Footer: "X of Y records" left, optional aggregate right
 */
import { ReactNode, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Columns3, Download, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SpreadsheetColumn<TRow> {
  id: string;
  label: string;
  width: number;
  align?: "left" | "right";
  /** Render the cell (string, number, or custom node). Return undefined/null → em-dash. */
  render: (row: TRow) => ReactNode;
  /** Plain string used for global search + CSV export. Defaults to render() coerced. */
  toText?: (row: TRow) => string;
  /** Sort key — string or number. Defaults to toText(). */
  sortKey?: (row: TRow) => string | number;
  /** Hide from default visibility (user can re-enable in Columns popover). */
  defaultHidden?: boolean;
}

export interface SpreadsheetFilter {
  key: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
}

interface Props<TRow> {
  /** Page title — Raleway SemiBold 22px navy. */
  title: string;
  /** "79 customers · all-time". */
  subtitle?: string;
  /** Stable per-page key for sort + visibility persistence (visibility persists, sort session-only). */
  storageKey: string;
  /** Optional Add button (only on master-data pages). */
  onAdd?: () => void;
  addLabel?: string;
  /** Aggregate string rendered right side of the footer. */
  aggregate?: ReactNode;
  /** Secondary dropdown filters (rendered right of search). */
  filters?: SpreadsheetFilter[];
  /** Row identity (for React key). */
  rowKey: (row: TRow) => string;
  /** Click row → open detail. */
  onRowClick?: (row: TRow) => void;
  /** Three-dots row menu (renders icon if provided). */
  rowActions?: (row: TRow) => ReactNode;
  columns: SpreadsheetColumn<TRow>[];
  data: TRow[];
  /** CSV filename stem (date suffix appended). */
  csvName: string;
  /** Optional empty state. */
  emptyHint?: string;
}

const navy = (a = 1) => `hsl(var(--brand-navy) / ${a})`;

function loadVisibility(storageKey: string, cols: SpreadsheetColumn<unknown>[]): Record<string, boolean> {
  const defaults = cols.reduce<Record<string, boolean>>((acc, c) => {
    acc[c.id] = !c.defaultHidden;
    return acc;
  }, {});
  try {
    const raw = localStorage.getItem(`alvasco.spreadsheet.${storageKey}.cols.v1`);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* noop */ }
  return defaults;
}

function downloadCsv(filename: string, rows: string[][]) {
  const escape = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function SpreadsheetView<TRow>({
  title, subtitle, storageKey, onAdd, addLabel = "Add",
  aggregate, filters, rowKey, onRowClick, rowActions,
  columns, data, csvName, emptyHint,
}: Props<TRow>) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" } | null>(null);
  const [visibility, setVisibility] = useState<Record<string, boolean>>(
    () => loadVisibility(storageKey, columns as SpreadsheetColumn<unknown>[]),
  );
  const [columnsOpen, setColumnsOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(`alvasco.spreadsheet.${storageKey}.cols.v1`, JSON.stringify(visibility)); } catch { /* noop */ }
  }, [storageKey, visibility]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => visibility[c.id] !== false),
    [columns, visibility],
  );

  const textOf = (c: SpreadsheetColumn<TRow>, row: TRow): string => {
    if (c.toText) return c.toText(row) ?? "";
    const v = c.render(row);
    if (v === null || v === undefined) return "";
    if (typeof v === "string" || typeof v === "number") return String(v);
    return "";
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((row) =>
      visibleColumns.some((c) => textOf(c, row).toLowerCase().includes(q)),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, search, visibleColumns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.id === sort.col);
    if (!col) return filtered;
    const keyFn = col.sortKey ?? ((r: TRow) => textOf(col, r).toLowerCase());
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = keyFn(a); const bv = keyFn(b);
      if (typeof av === "number" && typeof bv === "number") return dir * (av - bv);
      return dir * String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, columns]);

  const cycleSort = (id: string) => {
    setSort((s) => (s && s.col === id ? { col: id, dir: s.dir === "asc" ? "desc" : "asc" } : { col: id, dir: "asc" }));
  };

  const exportCsv = () => {
    const header = visibleColumns.map((c) => c.label);
    const body = sorted.map((r) => visibleColumns.map((c) => textOf(c, r)));
    downloadCsv(`${csvName}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  return (
    <div className="h-full lg:h-screen flex flex-col" style={{ backgroundColor: "hsl(var(--background))" }}>
      {/* Header zone */}
      <header
        className="shrink-0 border-b px-6 pt-6 pb-4 flex items-end gap-4"
        style={{ borderColor: navy(0.12) }}
      >
        <div className="flex-1 min-w-0">
          <h1
            className="text-[22px] leading-tight tracking-tight truncate"
            style={{ color: navy(), fontWeight: 600 }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-[14px]" style={{ color: navy(0.6) }}>
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setColumnsOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[13px] font-medium hover:bg-[hsl(var(--brand-navy)/0.04)] transition-colors"
            style={{ borderColor: navy(0.2), color: navy() }}
          >
            <Columns3 className="h-3.5 w-3.5" /> Columns
          </button>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[13px] font-medium hover:bg-[hsl(var(--brand-navy)/0.04)] transition-colors"
            style={{ borderColor: navy(0.2), color: navy() }}
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          {onAdd && (
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-colors"
              style={{ background: "hsl(var(--brand-orange))", color: "white" }}
            >
              <Plus className="h-3.5 w-3.5" /> {addLabel}
            </button>
          )}
        </div>
      </header>

      {/* Search + filter row */}
      <div
        className="shrink-0 px-6 py-3 flex items-center gap-2 border-b"
        style={{ borderColor: navy(0.08) }}
      >
        <div
          className="flex-1 flex items-center gap-2 rounded-lg border bg-card px-3"
          style={{ borderColor: navy(0.18), minHeight: 38 }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: navy(0.5) }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="flex-1 bg-transparent text-[14px] outline-none py-1.5"
            style={{ color: navy() }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="hover:opacity-80"
              style={{ color: navy(0.5) }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {filters?.map((f) => (
          <select
            key={f.key}
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            className="rounded-lg border bg-card px-3 py-1.5 text-[13px] font-medium"
            style={{ borderColor: navy(0.18), color: navy(), minHeight: 38 }}
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        <table className="border-collapse text-[14px]" style={{ tableLayout: "fixed", borderSpacing: 0 }}>
          <thead>
            <tr>
              {visibleColumns.map((c, i) => {
                const isFirst = i === 0;
                const sortedHere = sort?.col === c.id;
                return (
                  <th
                    key={c.id}
                    onClick={() => cycleSort(c.id)}
                    className={cn(
                      "px-4 py-2.5 border-b border-r select-none cursor-pointer whitespace-nowrap",
                      "text-[10px] uppercase font-semibold",
                    )}
                    style={{
                      width: c.width, minWidth: c.width, maxWidth: c.width,
                      borderColor: navy(0.12),
                      backgroundColor: sortedHere ? "hsl(var(--brand-navy) / 0.06)" : "hsl(var(--background))",
                      color: navy(0.6),
                      letterSpacing: "0.05em",
                      textAlign: c.align ?? "left",
                      position: "sticky",
                      top: 0,
                      left: isFirst ? 0 : undefined,
                      zIndex: isFirst ? 22 : 21,
                    }}
                  >
                    <span className={cn("inline-flex items-center gap-1", c.align === "right" && "flex-row-reverse")}>
                      {c.label}
                      {sortedHere && (sort!.dir === "asc"
                        ? <ArrowUp className="h-3 w-3" />
                        : <ArrowDown className="h-3 w-3" />)}
                    </span>
                  </th>
                );
              })}
              {rowActions && (
                <th
                  className="border-b w-10"
                  style={{
                    borderColor: navy(0.12),
                    backgroundColor: "hsl(var(--background))",
                    position: "sticky", top: 0, zIndex: 21,
                  }}
                />
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + (rowActions ? 1 : 0)}
                  className="px-6 py-16 text-center text-[14px] italic"
                  style={{ color: navy(0.5) }}
                >
                  {emptyHint ?? (search ? "No matches." : "No records yet.")}
                </td>
              </tr>
            ) : (
              sorted.map((row, idx) => {
                const stripe = idx % 2 === 0
                  ? "hsl(var(--background))"
                  : "hsl(var(--brand-navy) / 0.02)";
                return (
                  <tr
                    key={rowKey(row)}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      "group transition-colors",
                      onRowClick && "cursor-pointer",
                    )}
                    style={{ height: 56 }}
                  >
                    {visibleColumns.map((c, i) => {
                      const isFirst = i === 0;
                      const v = c.render(row);
                      const isEmpty = v === null || v === undefined || v === "" || v === "—";
                      return (
                        <td
                          key={c.id}
                          className={cn(
                            "px-4 py-3 border-b border-r whitespace-nowrap overflow-hidden text-ellipsis group-hover:bg-[hsl(var(--brand-navy)/0.04)]",
                            isFirst && "font-medium",
                          )}
                          style={{
                            width: c.width, minWidth: c.width, maxWidth: c.width,
                            borderColor: navy(0.06),
                            backgroundColor: isFirst ? stripe : stripe,
                            color: isEmpty ? navy(0.4) : navy(),
                            textAlign: c.align ?? "left",
                            position: isFirst ? "sticky" : undefined,
                            left: isFirst ? 0 : undefined,
                            zIndex: isFirst ? 11 : undefined,
                          }}
                          title={typeof v === "string" || typeof v === "number" ? String(v) : undefined}
                        >
                          {isEmpty ? "—" : v}
                        </td>
                      );
                    })}
                    {rowActions && (
                      <td
                        className="border-b text-center group-hover:bg-[hsl(var(--brand-navy)/0.04)]"
                        style={{ borderColor: navy(0.06), backgroundColor: stripe }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {rowActions(row)}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer zone */}
      <footer
        className="shrink-0 border-t px-6 py-2.5 flex items-center justify-between text-[12px]"
        style={{ borderColor: navy(0.12), color: navy(0.6) }}
      >
        <span className="tabular">
          {sorted.length} of {data.length} {data.length === 1 ? "record" : "records"}
        </span>
        {aggregate && <span className="tabular font-medium" style={{ color: navy(0.8) }}>{aggregate}</span>}
      </footer>

      {/* Columns popover */}
      {columnsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center"
          onClick={() => setColumnsOpen(false)}
        >
          <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" />
          <div
            className="relative w-full sm:max-w-sm bg-background rounded-t-2xl sm:rounded-2xl border shadow-2xl p-4 max-h-[80vh] flex flex-col"
            style={{ borderColor: navy(0.2) }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold" style={{ color: navy() }}>Columns</h3>
              <button onClick={() => setColumnsOpen(false)} aria-label="Close" style={{ color: navy(0.5) }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto -mx-1">
              {columns.map((c, i) => {
                const isAnchor = i === 0;
                const checked = visibility[c.id] !== false;
                return (
                  <label
                    key={c.id}
                    className={cn(
                      "flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer hover:bg-muted/50",
                      isAnchor && "opacity-60 cursor-not-allowed",
                    )}
                  >
                    <span className="text-[13px]">{c.label}{isAnchor && " (anchor)"}</span>
                    <input
                      type="checkbox"
                      checked={isAnchor ? true : checked}
                      disabled={isAnchor}
                      onChange={(e) => setVisibility((v) => ({ ...v, [c.id]: e.target.checked }))}
                      className="h-4 w-4 accent-[hsl(var(--brand-orange))]"
                    />
                  </label>
                );
              })}
            </div>
            <div className="pt-3 mt-2 border-t flex justify-end gap-2" style={{ borderColor: navy(0.1) }}>
              <button
                onClick={() => setVisibility(columns.reduce((acc, c) => ({ ...acc, [c.id]: !c.defaultHidden }), {}))}
                className="text-[12px] px-3 py-1.5 rounded-lg border hover:bg-muted/50"
                style={{ borderColor: navy(0.2), color: navy() }}
              >
                Reset
              </button>
              <button
                onClick={() => setColumnsOpen(false)}
                className="text-[12px] px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: "hsl(var(--brand-orange))", color: "white" }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
