/**
 * SpreadsheetView — shared list-of-records grammar with Sheets/Excel-style
 * cell selection + inline editing.
 *
 * Cell states:
 *   NORMAL    — default (paper or alternating stripe)
 *   SELECTED  — single click; subtle navy border. Works locked or unlocked.
 *   EDITING   — double click (or Enter/F2) on a SELECTED cell when unlocked.
 *               Inline editor appears; pure white background, navy border.
 *
 * Keyboard:
 *   ←/→/↑/↓   move SELECTED between cells
 *   Enter/F2  enter EDITING (on selected cell, when unlocked)
 *   Enter     while editing — commit + advance selection DOWN (cell exits edit)
 *   Tab/⇧Tab  while editing — commit + advance selection RIGHT/LEFT
 *   Esc       cancel edit
 *   Cmd/⌘+C   copy display value of SELECTED cell
 *   Cmd/⌘+V   paste into SELECTED cell (only when unlocked + editable)
 *
 * The component never owns mutation — every commit calls `column.commit`.
 * Callers (e.g. Spreadsheet.tsx) push undo entries inside their own commit.
 */
import {
  ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown, ArrowUp, Calendar as CalendarIcon, Columns3, Download, Lock, LockOpen, Plus, Search, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useColumnWidths } from "@/hooks/useColumnWidths";
import { ColumnResizeHandle } from "./ColumnResizeHandle";

// ─── Editor descriptors ────────────────────────────────────────────────────
export type EditorOption = { value: string; label: string };

export interface CreateFormField {
  key: string;
  label: string;
  type?: "text" | "email" | "tel" | "select";
  options?: EditorOption[];
  required?: boolean;
  placeholder?: string;
}

export interface CreateFormSpec {
  title: string;
  fields: CreateFormField[];
  /** Returns the new option to assign to the cell. */
  onSubmit: (values: Record<string, string>) => Promise<EditorOption | null>;
  /** Label rendered on the "+ Add new …" footer button. */
  addLabel: string;
}

export type SpreadsheetEditor<TRow> =
  | { type: "text"; multiline?: boolean }
  | { type: "number"; min?: number; max?: number; step?: number }
  | { type: "date" }
  | {
      type: "select";
      options: EditorOption[] | ((row: TRow) => EditorOption[]);
      allowFree?: boolean;
    }
  | {
      type: "search-select";
      options: EditorOption[] | ((row: TRow) => EditorOption[]);
      /** Pinned options shown at top (TBD/Various/Unassigned). */
      pinned?: EditorOption[];
      /** "+ Add new …" inline form. */
      createForm?: (row: TRow) => CreateFormSpec | null;
      /** When falsy, hides "+ Add new" affordance for this row. */
      placeholder?: string;
    }
  | {
      /** Prefix-locked: e.g. Q-, P-, INV-. The prefix is rendered fixed; the user types digits only. */
      type: "prefix-text";
      prefix: string;
      /** Restrict to digits only (default true). */
      digitsOnly?: boolean;
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
  editor?: SpreadsheetEditor<TRow>;
  getValue?: (row: TRow) => string | number | Date | null | undefined;
  commit?: (row: TRow, nextValue: string | number | Date | null) => void | Promise<void>;
  validate?: (row: TRow, nextValue: string | number | Date | null) => string | null;
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
  editMode?: boolean;
  onToggleEditMode?: () => void;
}

const navy = (a = 1) => `hsl(var(--brand-navy) / ${a})`;
const orange = (a = 1) => `hsl(var(--brand-orange) / ${a})`;

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
  cellRect: DOMRect | null;
  onCommit: (next: string | number | Date | null) => boolean | Promise<boolean>;
  onCancel: () => void;
  onAdvance: (dir: "down" | "right" | "left") => void;
}

function CellEditor<TRow>({ row, column, initial, cellRect, onCommit, onCancel, onAdvance }: CellEditorProps<TRow>) {
  const editor = column.editor!;
  const [value, setValue] = useState<string>(() => {
    if (initial == null) return "";
    if (initial instanceof Date) return fmtDateInput(initial);
    if (editor.type === "prefix-text") {
      const s = String(initial);
      return s.startsWith(editor.prefix) ? s.slice(editor.prefix.length) : s;
    }
    return String(initial);
  });
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(editor.type === "search-select");
  const [createOpen, setCreateOpen] = useState(false);
  const [createValues, setCreateValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Search-select uses a separate type-ahead query so the cell's current value
  // never filters the master list down to itself.
  const [query, setQuery] = useState("");

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
    if (el instanceof HTMLTextAreaElement) el.select();
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
    if (editor.type === "prefix-text") {
      const trimmed = raw.trim();
      if (trimmed === "") return { ok: true, value: null };
      if (editor.digitsOnly !== false && !/^\d+$/.test(trimmed)) {
        return { ok: false, value: null, error: "Digits only" };
      }
      return { ok: true, value: `${editor.prefix}${trimmed}` };
    }
    return { ok: true, value: raw };
  }, [editor]);

  const tryCommit = useCallback(async (advance?: "down" | "right" | "left", overrideValue?: string, closeOnSuccess = false) => {
    const raw = overrideValue ?? value;
    const parsed = parse(raw);
    if (!parsed.ok) { setError(parsed.error ?? "Invalid"); return false; }
    const validationErr = column.validate?.(row, parsed.value);
    if (validationErr) { setError(validationErr); return false; }
    const ok = await onCommit(parsed.value);
    if (ok === false) return false;
    if (advance) onAdvance(advance);
    else if (closeOnSuccess) {
      setPopoverOpen(false);
      onCancel();
    }
    return true;
  }, [parse, value, column, row, onCommit, onAdvance, onCancel]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !(editor.type === "text" && (editor as { multiline?: boolean }).multiline && e.shiftKey)) {
      e.preventDefault(); tryCommit("down");
    } else if (e.key === "Tab") {
      e.preventDefault(); tryCommit(e.shiftKey ? "left" : "right");
    } else if (e.key === "Escape") {
      e.preventDefault(); onCancel();
    }
  };

  const borderColor = error ? "hsl(var(--destructive))" : navy();
  const baseStyle: React.CSSProperties = {
    width: "100%", height: editor.type === "text" && (editor as { multiline?: boolean }).multiline ? 64 : 32,
    padding: "0 6px", borderRadius: 4,
    border: `1.5px solid ${borderColor}`,
    background: "white", color: navy(), font: "inherit", outline: "none",
  };

  // ── Search-select popover ──────────────────────────────────────────────
  if (editor.type === "search-select") {
    const allOpts = typeof editor.options === "function" ? editor.options(row) : editor.options;
    const pinned = editor.pinned ?? [];
    // `value` holds the cell's current committed value; `query` drives the
    // type-ahead. Always show the FULL master list, filtered only by `query`.
    const q = query.trim().toLowerCase();
    const matches = q
      ? allOpts.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
      : allOpts;
    const cf = editor.createForm?.(row) ?? null;

    const submitCreate = async () => {
      if (!cf) return;
      // simple required check
      for (const f of cf.fields) {
        if (f.required && !(createValues[f.key] || "").trim()) { setError(`${f.label} required`); return; }
      }
      setBusy(true); setError(null);
      try {
        const created = await cf.onSubmit(createValues);
        if (created) {
          const ok = await tryCommit(undefined, created.value, true);
          if (!ok) setBusy(false);
        } else {
          setBusy(false);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create");
        setBusy(false);
      }
    };

    return (
      <div style={{ position: "relative" }} data-cell-editor>
        <input
          ref={(el) => { inputRef.current = el; }}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPopoverOpen(true); if (error) setError(null); }}
          onFocus={() => setPopoverOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); onCancel(); }
            if (e.key === "Tab") { e.preventDefault(); /* require explicit pick */ onCancel(); }
          }}
          placeholder={editor.placeholder ?? "Search…"}
          style={baseStyle}
        />
        {popoverOpen && cellRect && createPortal(
          <div
            data-cell-editor
            style={{
              position: "fixed",
              top: cellRect.bottom + 2,
              left: cellRect.left,
              minWidth: Math.max(220, cellRect.width),
              maxHeight: 280,
              background: "white",
              border: `1px solid ${navy(0.2)}`,
              borderRadius: 6,
              boxShadow: "0 10px 30px -10px hsl(var(--brand-navy) / 0.3)",
              zIndex: 100,
              overflow: "hidden",
              display: "flex", flexDirection: "column",
            }}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            {createOpen && cf ? (
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: navy() }}>{cf.title}</div>
                {cf.fields.map((f) => (
                  f.type === "select" ? (
                    <select
                      key={f.key}
                      value={createValues[f.key] ?? ""}
                      onChange={(e) => setCreateValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      style={{
                        height: 30, padding: "0 8px", borderRadius: 4,
                        border: `1px solid ${navy(0.2)}`, fontSize: 13, color: navy(), outline: "none",
                        background: "white",
                      }}
                      autoFocus={f === cf.fields[0]}
                    >
                      <option value="">{f.placeholder ?? f.label}</option>
                      {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input
                      key={f.key}
                      type={f.type ?? "text"}
                      value={createValues[f.key] ?? ""}
                      placeholder={f.placeholder ?? f.label}
                      onChange={(e) => setCreateValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      style={{
                        height: 30, padding: "0 8px", borderRadius: 4,
                        border: `1px solid ${navy(0.2)}`, fontSize: 13, color: navy(), outline: "none",
                      }}
                      autoFocus={f === cf.fields[0]}
                    />
                  )
                ))}
                {error && <div style={{ fontSize: 11, color: "hsl(var(--destructive))" }}>{error}</div>}
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => { setCreateOpen(false); setCreateValues({}); setError(null); }}
                    style={{ fontSize: 12, padding: "4px 10px", borderRadius: 4, border: `1px solid ${navy(0.2)}`, color: navy() }}
                  >Cancel</button>
                  <button
                    onClick={submitCreate}
                    disabled={busy}
                    style={{ fontSize: 12, padding: "4px 10px", borderRadius: 4, background: orange(), color: "white", fontWeight: 600 }}
                  >{busy ? "Saving…" : "Save"}</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {pinned.length > 0 && (
                    <>
                      {pinned.map((o) => (
                        <button
                          key={`p-${o.value}`}
                          onClick={() => { void tryCommit(undefined, o.value, true); }}
                          style={{
                            display: "block", width: "100%", textAlign: "left",
                            padding: "6px 10px", fontSize: 13, color: navy(0.7),
                            background: "transparent", border: 0, cursor: "pointer",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = navy(0.05))}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >{o.label}</button>
                      ))}
                      <div style={{ height: 1, background: navy(0.08), margin: "2px 0" }} />
                    </>
                  )}
                  {matches.length === 0 ? (
                    <div style={{ padding: "8px 10px", fontSize: 12, color: navy(0.5), fontStyle: "italic" }}>
                      {allOpts.length === 0 && !q
                        ? (cf ? `No ${(editor.placeholder ?? "items").toLowerCase()} yet — add one below` : "No items")
                        : "No matches"}
                    </div>
                  ) : matches.slice(0, 50).map((o) => (
                    <button
                      key={o.value}
                      onClick={() => { void tryCommit(undefined, o.value, true); }}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "6px 10px", fontSize: 13, color: navy(),
                        background: "transparent", border: 0, cursor: "pointer",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = navy(0.05))}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >{o.label}</button>
                  ))}
                </div>
                {cf && (
                  <button
                    onClick={() => { setCreateOpen(true); setCreateValues({}); }}
                    style={{
                      borderTop: `1px solid ${navy(0.1)}`, padding: "8px 10px",
                      textAlign: "left", fontSize: 12, color: orange(), fontWeight: 600,
                      background: "white", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 4,
                    }}
                  >
                    <Plus className="h-3 w-3" /> {cf.addLabel}
                  </button>
                )}
              </>
            )}
          </div>,
          document.body,
        )}
        {error && !createOpen && (
          <div style={errorTagStyle}>{error}</div>
        )}
      </div>
    );
  }

  // ── Prefix-text ────────────────────────────────────────────────────────
  if (editor.type === "prefix-text") {
    return (
      <div style={{ position: "relative" }} data-cell-editor>
        <div
          style={{
            ...baseStyle,
            display: "flex", alignItems: "center", padding: 0, overflow: "hidden",
          }}
        >
          <span
            style={{
              padding: "0 6px", fontWeight: 600, color: navy(0.6),
              background: navy(0.06), height: "100%", display: "flex", alignItems: "center",
              borderRight: `1px solid ${navy(0.12)}`, fontSize: 13,
            }}
          >{editor.prefix}</span>
          <input
            ref={(el) => { inputRef.current = el; }}
            value={value}
            inputMode="numeric"
            onChange={(e) => {
              const v = editor.digitsOnly === false ? e.target.value : e.target.value.replace(/\D/g, "");
              setValue(v); if (error) setError(null);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => tryCommit()}
            placeholder="0001"
            style={{
              flex: 1, height: "100%", border: 0, outline: "none",
              padding: "0 6px", color: navy(), font: "inherit", background: "transparent",
            }}
          />
        </div>
        {error && <div style={errorTagStyle}>{error}</div>}
      </div>
    );
  }

  // ── Plain select ───────────────────────────────────────────────────────
  if (editor.type === "select") {
    const opts = typeof editor.options === "function" ? editor.options(row) : editor.options;
    return (
      <div style={{ position: "relative" }} data-cell-editor>
        <select
          ref={(el) => { inputRef.current = el; }}
          value={value}
          onChange={(e) => { setValue(e.target.value); tryCommit(undefined, e.target.value); }}
          onBlur={() => tryCommit()}
          onKeyDown={onKeyDown}
          style={baseStyle}
        >
          {!opts.find((o) => o.value === value) && <option value={value}>{value || "—"}</option>}
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {error && <div style={errorTagStyle}>{error}</div>}
      </div>
    );
  }

  // ── Date / number / text ───────────────────────────────────────────────
  const isMulti = editor.type === "text" && (editor as { multiline?: boolean }).multiline;
  return (
    <div style={{ position: "relative" }} data-cell-editor>
      {isMulti ? (
        <textarea
          ref={(el) => { inputRef.current = el; }}
          value={value}
          onChange={(e) => { setValue(e.target.value); if (error) setError(null); }}
          onBlur={() => tryCommit()}
          onKeyDown={onKeyDown}
          style={{ ...baseStyle, height: 64, padding: 6, resize: "none", textAlign: column.align ?? "left" }}
        />
      ) : (
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
      )}
      {error && <div style={errorTagStyle}>{error}</div>}
    </div>
  );
}

const errorTagStyle: React.CSSProperties = {
  position: "absolute", top: "100%", left: 0, marginTop: 2,
  background: "hsl(var(--destructive))", color: "white",
  padding: "2px 6px", borderRadius: 3, fontSize: 11, whiteSpace: "nowrap", zIndex: 30,
};

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
  const [selected, setSelected] = useState<{ rowKey: string; colId: string } | null>(null);
  const [editing, setEditing] = useState<{ rowKey: string; colId: string } | null>(null);
  const [savedPulse, setSavedPulse] = useState<{ rowKey: string; colId: string } | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const [editingCellRect, setEditingCellRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!lastSavedAt) return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [lastSavedAt]);

  useEffect(() => {
    try { localStorage.setItem(`alvasco.spreadsheet.${storageKey}.cols.v1`, JSON.stringify(visibility)); } catch { /* noop */ }
  }, [storageKey, visibility]);

  useEffect(() => { if (!editMode) setEditing(null); }, [editMode]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => visibility[c.id] !== false),
    [columns, visibility],
  );
  const cw = useColumnWidths();
  const effW = (c: SpreadsheetColumn<TRow>) => cw.widthFor(c.id, c.width);

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
    if (editMode) return;
    setSort((s) => (s && s.col === id ? { col: id, dir: s.dir === "asc" ? "desc" : "asc" } : { col: id, dir: "asc" }));
  };

  const exportCsv = () => {
    const header = visibleColumns.map((c) => c.label);
    const body = sorted.map((r) => visibleColumns.map((c) => textOf(c, r)));
    downloadCsv(`${csvName}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  // ── Selection & navigation ──────────────────────────────────────────────
  const cellKey = (rk: string, colId: string) => `${rk}::${colId}`;

  const moveSelection = useCallback((dir: "up" | "down" | "left" | "right") => {
    if (!selected) return;
    const rIdx = sorted.findIndex((r) => rowKey(r) === selected.rowKey);
    const cIdx = visibleColumns.findIndex((c) => c.id === selected.colId);
    if (rIdx < 0 || cIdx < 0) return;
    let nr = rIdx, nc = cIdx;
    if (dir === "up") nr = Math.max(0, rIdx - 1);
    if (dir === "down") nr = Math.min(sorted.length - 1, rIdx + 1);
    if (dir === "left") nc = Math.max(0, cIdx - 1);
    if (dir === "right") nc = Math.min(visibleColumns.length - 1, cIdx + 1);
    setSelected({ rowKey: rowKey(sorted[nr]), colId: visibleColumns[nc].id });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, sorted, visibleColumns]);

  const advance = useCallback((dir: "down" | "right" | "left") => {
    if (!editing) return;
    const rIdx = sorted.findIndex((r) => rowKey(r) === editing.rowKey);
    const cIdx = visibleColumns.findIndex((c) => c.id === editing.colId);
    if (rIdx < 0 || cIdx < 0) { setEditing(null); return; }
    let nr = rIdx, nc = cIdx;
    if (dir === "down") nr = Math.min(sorted.length - 1, rIdx + 1);
    if (dir === "right") nc = Math.min(visibleColumns.length - 1, cIdx + 1);
    if (dir === "left") nc = Math.max(0, cIdx - 1);
    setEditing(null);
    setSelected({ rowKey: rowKey(sorted[nr]), colId: visibleColumns[nc].id });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, sorted, visibleColumns]);

  const isCellEditable = (c: SpreadsheetColumn<TRow>, row: TRow) =>
    !!c.editor && !!c.commit && (c.isEditable ? c.isEditable(row) : true);

  const startEdit = (rk: string, colId: string) => {
    if (!editMode) return;
    const row = sorted.find((r) => rowKey(r) === rk);
    const col = visibleColumns.find((c) => c.id === colId);
    if (!row || !col || !isCellEditable(col, row)) return;
    setEditing({ rowKey: rk, colId });
  };

  // Track editing cell rect for portal popover
  useLayoutEffect(() => {
    if (!editing) { setEditingCellRect(null); return; }
    const el = cellRefs.current.get(cellKey(editing.rowKey, editing.colId));
    if (el) setEditingCellRect(el.getBoundingClientRect());
  }, [editing]);

  // Global keyboard handler (selection nav, copy/paste, deselect)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ignore if typing in any other input outside the table
      const target = e.target as HTMLElement;
      const inTable = tableContainerRef.current?.contains(target) || target === document.body;
      if (!inTable) return;
      if (editing) return; // editor handles its own keys

      if (!selected) return;
      if (e.key === "ArrowUp") { e.preventDefault(); moveSelection("up"); }
      else if (e.key === "ArrowDown") { e.preventDefault(); moveSelection("down"); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); moveSelection("left"); }
      else if (e.key === "ArrowRight") { e.preventDefault(); moveSelection("right"); }
      else if ((e.key === "Enter" || e.key === "F2") && editMode) {
        e.preventDefault(); startEdit(selected.rowKey, selected.colId);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
        const row = sorted.find((r) => rowKey(r) === selected.rowKey);
        const col = visibleColumns.find((c) => c.id === selected.colId);
        if (row && col) {
          e.preventDefault();
          const text = textOf(col, row);
          navigator.clipboard?.writeText(text).catch(() => { /* noop */ });
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
        if (!editMode) return;
        const row = sorted.find((r) => rowKey(r) === selected.rowKey);
        const col = visibleColumns.find((c) => c.id === selected.colId);
        if (row && col && isCellEditable(col, row)) {
          e.preventDefault();
          navigator.clipboard?.readText().then(async (text) => {
            const trimmed = text.trim();
            // light coercion
            let parsed: string | number | Date | null = trimmed;
            if (col.editor?.type === "number") {
              const n = Number(trimmed.replace(/,/g, ""));
              if (!Number.isFinite(n)) { shake(selected); return; }
              parsed = n;
            } else if (col.editor?.type === "date") {
              const d = new Date(trimmed);
              if (isNaN(d.getTime())) { shake(selected); return; }
              parsed = d;
            }
            const err = col.validate?.(row, parsed);
            if (err) { shake(selected); return; }
            try { await col.commit?.(row, parsed); pulse(selected.rowKey, selected.colId); }
            catch { shake(selected); }
          }).catch(() => { /* noop */ });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, editing, editMode, sorted, visibleColumns]);

  // Click-away deselect
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-cell-editor]")) return;
      if (!tableContainerRef.current?.contains(t)) {
        setSelected(null);
        setEditing(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const [shakeKey, setShakeKey] = useState<string | null>(null);
  const shake = (s: { rowKey: string; colId: string }) => {
    setShakeKey(cellKey(s.rowKey, s.colId));
    window.setTimeout(() => setShakeKey(null), 400);
  };

  const pulse = (rk: string, colId: string) => {
    setSavedPulse({ rowKey: rk, colId });
    setLastSavedAt(Date.now());
    window.setTimeout(() => setSavedPulse((s) => (s && s.rowKey === rk && s.colId === colId ? null : s)), 700);
  };

  const commitCell = useCallback(async (
    row: TRow, col: SpreadsheetColumn<TRow>, value: string | number | Date | null,
  ) => {
    try {
      await col.commit?.(row, value);
      pulse(rowKey(row), col.id);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
      return false;
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
          <h1 className="text-[22px] leading-tight tracking-tight truncate" style={{ color: navy(), fontWeight: 600 }}>{title}</h1>
          {subtitle && <p className="mt-0.5 text-[14px]" style={{ color: navy(0.6) }}>{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {onToggleEditMode && (
            <button
              onClick={onToggleEditMode}
              title={editMode ? "Edit mode active — double-click cells to edit" : "Click to enable inline editing"}
              aria-label={editMode ? "Lock spreadsheet" : "Unlock spreadsheet"}
              aria-pressed={editMode}
              className="inline-flex items-center justify-center rounded-lg border transition-all"
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
      <div className="shrink-0 px-6 py-3 flex items-center gap-2 border-b" style={{ borderColor: navy(0.08) }}>
        <div className="flex-1 flex items-center gap-2 rounded-lg border bg-card px-3" style={{ borderColor: navy(0.18), minHeight: 38 }}>
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: navy(0.5) }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="flex-1 bg-transparent text-[14px] outline-none py-1.5"
            style={{ color: navy() }}
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Clear search" className="hover:opacity-80" style={{ color: navy(0.5) }}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {filters?.map((f) => (
          <select
            key={f.key} value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            className="rounded-lg border bg-card px-3 py-1.5 text-[13px] font-medium"
            style={{ borderColor: navy(0.18), color: navy(), minHeight: 38 }}
          >
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
      </div>

      {editMode && <div className="shrink-0" style={{ height: 2, background: orange() }} aria-hidden />}

      {/* Table */}
      <div className="flex-1 overflow-auto" ref={tableContainerRef} style={{ WebkitOverflowScrolling: "touch" }}>
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
                      position: "sticky", top: 0,
                      left: isFirst ? 0 : undefined,
                      zIndex: isFirst ? 22 : 21,
                    }}
                  >
                    <span className={cn("inline-flex items-center gap-1", c.align === "right" && "flex-row-reverse")}>
                      {c.label}
                      {sortedHere && (sort!.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </span>
                  </th>
                );
              })}
              {rowActions && (
                <th
                  className="border-b w-10"
                  style={{ borderColor: navy(0.12), backgroundColor: "hsl(var(--background))", position: "sticky", top: 0, zIndex: 21 }}
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
                  <tr key={rk} className="group" style={{ height: 56 }}>
                    {visibleColumns.map((c, i) => {
                      const isFirst = i === 0;
                      const v = c.render(row);
                      const isEmpty = v === null || v === undefined || v === "" || v === "—";
                      const editable = isCellEditable(c, row);
                      const isEditingThis = editing?.rowKey === rk && editing?.colId === c.id;
                      const isSelectedThis = selected?.rowKey === rk && selected?.colId === c.id;
                      const isPulsing = savedPulse?.rowKey === rk && savedPulse?.colId === c.id;
                      const isShaking = shakeKey === cellKey(rk, c.id);

                      const borderColor = isEditingThis ? navy()
                        : isPulsing ? orange()
                        : isSelectedThis ? navy(0.6)
                        : navy(0.06);
                      const bg = isEditingThis ? "white" : stripe;
                      const borderWidth = isEditingThis ? 1.5 : isSelectedThis ? 1.5 : 1;

                      return (
                        <td
                          key={c.id}
                          ref={(el) => { if (el) cellRefs.current.set(cellKey(rk, c.id), el); }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isEditingThis) return;
                            setSelected({ rowKey: rk, colId: c.id });
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            // Locked = inert. Double-click only opens the editor
                            // when unlocked. Detail/edit panels are reached via
                            // the three-dots row menu, never from a cell.
                            if (editMode && editable) startEdit(rk, c.id);
                          }}
                          className={cn(
                            "px-4 py-3 whitespace-nowrap overflow-hidden text-ellipsis",
                            !isSelectedThis && !isEditingThis && "group-hover:bg-[hsl(var(--brand-navy)/0.04)]",
                            isFirst && "font-medium",
                            editMode && editable && !isEditingThis && "cursor-cell",
                            isShaking && "animate-pulse",
                          )}
                          style={{
                            width: c.width, minWidth: c.width, maxWidth: c.width,
                            borderRight: `1px solid ${navy(0.06)}`,
                            borderBottom: `1px solid ${navy(0.06)}`,
                            outline: isSelectedThis || isEditingThis || isPulsing
                              ? `${borderWidth}px solid ${borderColor}` : "none",
                            outlineOffset: -borderWidth,
                            backgroundColor: bg,
                            color: isEmpty ? navy(0.4) : navy(),
                            textAlign: c.align ?? "left",
                            position: isFirst ? "sticky" : undefined,
                            left: isFirst ? 0 : undefined,
                            zIndex: isEditingThis ? 15 : isFirst ? 11 : undefined,
                            transition: "outline-color 600ms ease, background-color 120ms ease",
                            padding: isEditingThis ? "4px 6px" : undefined,
                            overflow: isEditingThis ? "visible" : undefined,
                          }}
                          title={!isEditingThis && (typeof v === "string" || typeof v === "number") ? String(v) : undefined}
                        >
                          {isEditingThis ? (
                            <CellEditor
                              row={row}
                              column={c}
                              initial={c.getValue ? c.getValue(row) : (typeof v === "string" || typeof v === "number" ? v : textOf(c, row))}
                              cellRect={editingCellRect}
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center" onClick={() => setColumnsOpen(false)}>
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
              >Reset</button>
              <button
                onClick={() => setColumnsOpen(false)}
                className="text-[12px] px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: "hsl(var(--brand-orange))", color: "white" }}
              >Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
