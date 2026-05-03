/**
 * SpreadsheetView — shared list-of-records grammar.
 *
 * Supports an optional inline-edit mode controlled by the caller via
 * `editMode` + `onToggleEditMode`. Columns opt-in via `editor`, which describes
 * the input type and how to commit the value (the caller routes commits through
 * its store, e.g. `usePipelineStore.updateProject`).
 *
 * Keyboard model (when editing a cell):
 *   Enter      → commit, advance DOWN within the same column
 *   Tab        → commit, advance RIGHT to the next editable visible column
 *   Shift+Tab  → commit, advance LEFT to the previous editable visible column
 *   Escape     → cancel, exit editor
 *   Click out  → commit, exit editor (no advance)
 */
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, Columns3, Download, Lock, LockOpen, Plus, Search, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Editor descriptors ────────────────────────────────────────────────────
export type EditorOption = { value: string; label: string };

export type SpreadsheetEditor<TRow> =
  | { type: "text" }
  | { type: "number"; min?: number; max?: number; step?: number; format?: (n: number) => string }
  | { type: "date" }
  | {
      type: "select";
      /** Static options or computed per-row (e.g. cascading Buyer→Customer). */
      options: EditorOption[] | ((row: TRow) => EditorOption[]);
      /** Allow free-text? Defaults to false (constrained). */
      allowFree?: boolean;
    };

export interface SpreadsheetColumn<TRow> {
  id: string;
  label: string;
  width: number;
  align?: "left" | "right";
  render: (row: TRow) => ReactNode;
  toText?: (row: TRow) => string;
  sortKey?: (row: TRow) => string | number;
  defaultHidden?: boolean;
  /** Inline-edit configuration. Cells without `editor` stay read-only. */
  editor?: SpreadsheetEditor<TRow>;
  /** Current raw value (for editor initial state). Falls back to toText/render. */
  getValue?: (row: TRow) => string | number | Date | null | undefined;
  /** Commit handler — called when user presses Enter / Tab / clicks away.
   *  Should perform the mutation (sync or async). Throw / reject to surface error. */
  commit?: (row: TRow, nextValue: string | number | Date | null) => void | Promise<void>;
  /** Optional in-line validation. Return error message string to block commit. */
  validate?: (row: TRow, nextValue: string | number | Date | null) => string | null;
  /** Hard-disable editor on certain rows (e.g. computed rows). */
  isEditable?: (row: TRow) => boolean;
}

export interface SpreadsheetFilter {
  key: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
}

interface Props<TRow> {
  title: string;
  subtitle?: string;
  storageKey: string;
  onAdd?: () => void;
  addLabel?: string;
  aggregate?: ReactNode;
  filters?: SpreadsheetFilter[];
  rowKey: (row: TRow) => string;
  onRowClick?: (row: TRow) => void;
  rowActions?: (row: TRow) => ReactNode;
  columns: SpreadsheetColumn<TRow>[];
  data: TRow[];
  csvName: string;
  emptyHint?: string;
  /** Inline-edit mode (controlled). When true, editable cells become clickable inputs. */
  editMode?: boolean;
  onToggleEditMode?: () => void;
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

function fmtDateInput(d: Date | string | number | null | undefined): string {
  if (!d) return "";
  const dd = d instanceof Date ? d : new Date(d);
  if (isNaN(dd.getTime())) return "";
  return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}-${String(dd.getDate()).padStart(2, "0")}`;
}

// ─── Inline cell editor ────────────────────────────────────────────────────
interface CellEditorProps<TRow> {
  row: TRow;
  column: SpreadsheetColumn<TRow>;
  initial: string | number | Date | null | undefined;
  onCommit: (next: string | number | Date | null) => void;
  onCancel: () => void;
  onAdvance: (dir: "down" | "right" | "left") => void;
}

function CellEditor<TRow>({ row, column, initial, onCommit, onCancel, onAdvance }: CellEditorProps<TRow>) {
  const editor = column.editor!;
  const [value, setValue] = useState<string>(() => {
    if (initial == null) return "";
    if (initial instanceof Date) return fmtDateInput(initial);
    return String(initial);
  });
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
  }, []);

  const parse = useCallback((raw: string): { ok: boolean; value: string | number | Date | null; error?: string } => {
    if (editor.type === "number") {
      const trimmed = raw.replace(/,/g, "").trim();
      if (trimmed === "") return { ok: true, value: 0 };
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return { ok: false, value: null, error: "Must be a number" };
      if (editor.min != null && n < editor.min) return { ok: false, value: null, error: `Must be ≥ ${editor.min}` };
      return { ok: true, value: n };
    }
    if (editor.type === "date") {
      if (!raw) return { ok: true, value: null };
      const d = new Date(raw + "T00:00:00");
      if (isNaN(d.getTime())) return { ok: false, value: null, error: "Invalid date" };
      return { ok: true, value: d };
    }
    return { ok: true, value: raw };
  }, [editor]);

  const tryCommit = useCallback((advance?: "down" | "right" | "left") => {
    const parsed = parse(value);
    if (!parsed.ok) { setError(parsed.error ?? "Invalid"); return false; }
    const validationErr = column.validate?.(row, parsed.value);
    if (validationErr) { setError(validationErr); return false; }
    onCommit(parsed.value);
    if (advance) onAdvance(advance);
    return true;
  }, [parse, value, column, row, onCommit, onAdvance]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); tryCommit("down"); }
    else if (e.key === "Tab") { e.preventDefault(); tryCommit(e.shiftKey ? "left" : "right"); }
    else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  };

  const baseStyle: React.CSSProperties = {
    width: "100%", height: 32, padding: "0 6px", borderRadius: 4,
    border: `1.5px solid ${error ? "hsl(var(--destructive))" : "hsl(var(--brand-orange))"}`,
    background: "white", color: navy(), font: "inherit", outline: "none",
  };

  let control: ReactNode;
  if (editor.type === "select") {
    const opts = typeof editor.options === "function" ? editor.options(row) : editor.options;
    control = (
      <select
        ref={(el) => { inputRef.current = el; }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => tryCommit()}
        onKeyDown={onKeyDown}
        style={baseStyle}
      >
        {!opts.find((o) => o.value === value) && <option value={value}>{value || "—"}</option>}
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  } else {
    control = (
      <input
        ref={(el) => { inputRef.current = el; }}
        type={editor.type === "number" ? "text" : editor.type === "date" ? "date" : "text"}
        inputMode={editor.type === "number" ? "decimal" : undefined}
        value={value}
        placeholder="—"
        onChange={(e) => { setValue(e.target.value); if (error) setError(null); }}
        onBlur={() => tryCommit()}
        onKeyDown={onKeyDown}
        style={{ ...baseStyle, textAlign: column.align ?? "left" }}
      />
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {control}
      {error && (
        <div
          style={{
            position: "absolute", top: "100%", left: 0, marginTop: 2,
            background: "hsl(var(--destructive))", color: "white",
            padding: "2px 6px", borderRadius: 3, fontSize: 11, whiteSpace: "nowrap", zIndex: 30,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Main view ─────────────────────────────────────────────────────────────
export function SpreadsheetView<TRow>({
  title, subtitle, storageKey, onAdd, addLabel = "Add",
  aggregate, filters, rowKey, onRowClick, rowActions,
  columns, data, csvName, emptyHint,
  editMode = false, onToggleEditMode,
}: Props<TRow>) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" } | null>(null);
  const [visibility, setVisibility] = useState<Record<string, boolean>>(
    () => loadVisibility(storageKey, columns as SpreadsheetColumn<unknown>[]),
  );
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [editing, setEditing] = useState<{ rowKey: string; colId: string } | null>(null);
  const [savedPulse, setSavedPulse] = useState<{ rowKey: string; colId: string } | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);

  // Live "Saved Xs ago" counter
  useEffect(() => {
    if (!lastSavedAt) return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [lastSavedAt]);

  useEffect(() => {
    try { localStorage.setItem(`alvasco.spreadsheet.${storageKey}.cols.v1`, JSON.stringify(visibility)); } catch { /* noop */ }
  }, [storageKey, visibility]);

  // Exit any open editor when the user toggles edit mode off.
  useEffect(() => { if (!editMode) setEditing(null); }, [editMode]);

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
    if (editMode) return; // sorting disabled while editing to avoid row reshuffles
    setSort((s) => (s && s.col === id ? { col: id, dir: s.dir === "asc" ? "desc" : "asc" } : { col: id, dir: "asc" }));
  };

  const exportCsv = () => {
    const header = visibleColumns.map((c) => c.label);
    const body = sorted.map((r) => visibleColumns.map((c) => textOf(c, r)));
    downloadCsv(`${csvName}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  // ── Edit-mode helpers ────────────────────────────────────────────────────
  const editableColIds = useMemo(
    () => visibleColumns.filter((c) => c.editor && c.commit).map((c) => c.id),
    [visibleColumns],
  );

  const advance = useCallback((dir: "down" | "right" | "left") => {
    if (!editing) return;
    const rIdx = sorted.findIndex((r) => rowKey(r) === editing.rowKey);
    const cIdx = editableColIds.indexOf(editing.colId);
    if (rIdx < 0 || cIdx < 0) { setEditing(null); return; }
    if (dir === "down") {
      const nextR = sorted[rIdx + 1];
      if (nextR) setEditing({ rowKey: rowKey(nextR), colId: editing.colId });
      else setEditing(null);
    } else if (dir === "right") {
      const nextCol = editableColIds[cIdx + 1];
      if (nextCol) setEditing({ rowKey: editing.rowKey, colId: nextCol });
      else setEditing(null);
    } else {
      const prevCol = editableColIds[cIdx - 1];
      if (prevCol) setEditing({ rowKey: editing.rowKey, colId: prevCol });
      else setEditing(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, editableColIds, sorted]);

  const commitCell = useCallback(async (
    row: TRow, col: SpreadsheetColumn<TRow>, value: string | number | Date | null,
  ) => {
    try {
      await col.commit?.(row, value);
      const k = rowKey(row);
      setSavedPulse({ rowKey: k, colId: col.id });
      setLastSavedAt(Date.now());
      window.setTimeout(() => {
        setSavedPulse((s) => (s && s.rowKey === k && s.colId === col.id ? null : s));
      }, 700);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }, [rowKey]);

  const savedAgo = (() => {
    if (!lastSavedAt) return null;
    const s = Math.max(0, Math.round((Date.now() - lastSavedAt) / 1000));
    if (s < 60) return `Saved ${s}s ago`;
    const m = Math.round(s / 60);
    return `Saved ${m}m ago`;
  })();

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
          {onToggleEditMode && (
            <button
              onClick={onToggleEditMode}
              title={editMode ? "Edit mode active — click cells to edit" : "Click to enable inline editing"}
              aria-label={editMode ? "Lock spreadsheet" : "Unlock spreadsheet"}
              aria-pressed={editMode}
              className={cn(
                "inline-flex items-center justify-center rounded-lg border transition-all",
                editMode && "animate-pulse-once",
              )}
              style={{
                width: 36, height: 36,
                background: editMode ? "hsl(var(--brand-orange))" : "hsl(var(--background))",
                borderColor: editMode ? "hsl(var(--brand-orange))" : navy(0.2),
                color: editMode ? "white" : navy(),
              }}
            >
              {editMode ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </button>
          )}
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

      {/* Edit-mode accent strip */}
      {editMode && (
        <div
          className="shrink-0"
          style={{ height: 2, background: "hsl(var(--brand-orange))" }}
          aria-hidden
        />
      )}

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
                      "px-4 py-2.5 border-b border-r select-none whitespace-nowrap",
                      "text-[10px] uppercase font-semibold",
                      editMode ? "cursor-default" : "cursor-pointer",
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
                const rk = rowKey(row);
                return (
                  <tr
                    key={rk}
                    onClick={(e) => {
                      if (editMode) return; // suppress row navigation while editing
                      // Don't navigate if user is interacting with a cell editor.
                      if ((e.target as HTMLElement).closest("[data-cell-editor]")) return;
                      onRowClick?.(row);
                    }}
                    className={cn(
                      "group transition-colors",
                      onRowClick && !editMode && "cursor-pointer",
                    )}
                    style={{ height: 56 }}
                  >
                    {visibleColumns.map((c, i) => {
                      const isFirst = i === 0;
                      const v = c.render(row);
                      const isEmpty = v === null || v === undefined || v === "" || v === "—";
                      const cellEditable =
                        editMode && !!c.editor && !!c.commit && (c.isEditable ? c.isEditable(row) : true);
                      const isEditingThis = editing?.rowKey === rk && editing?.colId === c.id;
                      const isPulsing = savedPulse?.rowKey === rk && savedPulse?.colId === c.id;
                      return (
                        <td
                          key={c.id}
                          onClick={(e) => {
                            if (cellEditable) {
                              e.stopPropagation();
                              setEditing({ rowKey: rk, colId: c.id });
                            }
                          }}
                          data-cell-editor={isEditingThis ? "1" : undefined}
                          className={cn(
                            "px-4 py-3 border-b border-r whitespace-nowrap overflow-hidden text-ellipsis",
                            !editMode && "group-hover:bg-[hsl(var(--brand-navy)/0.04)]",
                            isFirst && "font-medium",
                            cellEditable && "hover:bg-[hsl(var(--brand-navy)/0.05)] cursor-text",
                          )}
                          style={{
                            width: c.width, minWidth: c.width, maxWidth: c.width,
                            borderColor: isPulsing ? "hsl(var(--brand-orange))" : navy(0.06),
                            backgroundColor: stripe,
                            color: isEmpty ? navy(0.4) : navy(),
                            textAlign: c.align ?? "left",
                            position: isFirst ? "sticky" : undefined,
                            left: isFirst ? 0 : undefined,
                            zIndex: isFirst ? 11 : undefined,
                            transition: "border-color 600ms ease",
                            padding: isEditingThis ? "4px 6px" : undefined,
                          }}
                          title={!isEditingThis && (typeof v === "string" || typeof v === "number") ? String(v) : undefined}
                        >
                          {isEditingThis ? (
                            <CellEditor
                              row={row}
                              column={c}
                              initial={c.getValue ? c.getValue(row) : (typeof v === "string" || typeof v === "number" ? v : textOf(c, row))}
                              onCommit={(val) => commitCell(row, c, val)}
                              onCancel={() => setEditing(null)}
                              onAdvance={advance}
                            />
                          ) : (
                            isEmpty ? "—" : v
                          )}
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
        <span className="tabular font-medium" style={{ color: navy(0.8) }}>
          {savedAgo ?? aggregate}
        </span>
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
