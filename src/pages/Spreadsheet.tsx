import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowDown, ArrowUp, Columns3, Download, Search, X } from "lucide-react";
import { usePipelineStore, getStageTitle } from "@/hooks/usePipelineStore";
import { PIPELINES, PipelineId, Project, SUPPLIERS } from "@/data/pipelines";
import { cn } from "@/lib/utils";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";

// ─────────── Column model ───────────
type ColumnId =
  | "id" | "pipeline" | "stage" | "customer" | "projectName" | "detail"
  | "quote" | "po" | "invoice" | "supplier" | "shippingMode" | "tracking"
  | "deadline" | "daysToDeadline" | "salesRep" | "createdAt" | "updatedAt";

interface ColumnDef {
  id: ColumnId;
  label: string;
  width: number; // px
  align?: "left" | "right";
}

const COLUMNS: ColumnDef[] = [
  { id: "id",             label: "ID",             width: 70 },
  { id: "pipeline",       label: "Pipeline",       width: 90 },
  { id: "stage",          label: "Stage",          width: 130 },
  { id: "customer",       label: "Customer",       width: 160 },
  { id: "projectName",    label: "Project",        width: 170 },
  { id: "detail",         label: "Detail",         width: 200 },
  { id: "quote",          label: "Quote #",        width: 90 },
  { id: "po",             label: "PO #",           width: 90 },
  { id: "invoice",        label: "Invoice #",      width: 100 },
  { id: "supplier",       label: "Supplier",       width: 150 },
  { id: "shippingMode",   label: "Ship",           width: 70 },
  { id: "tracking",       label: "Tracking",       width: 140 },
  { id: "deadline",       label: "Deadline",       width: 100 },
  { id: "daysToDeadline", label: "Δ Days",         width: 70, align: "right" },
  { id: "salesRep",       label: "Sales Rep",      width: 140 },
  { id: "createdAt",      label: "Created",        width: 100 },
  { id: "updatedAt",      label: "Updated",        width: 100 },
];

const VISIBILITY_KEY = "alvasco.spreadsheet.cols.v1";
const SORT_KEY = "alvasco.spreadsheet.sort.v1";

// ─────────── Helpers ───────────
const fmtDate = (d?: Date) =>
  d ? `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleString("en-US", { month: "short" })} ${String(d.getFullYear()).slice(2)}` : "—";

const daysFromToday = (d: Date) => {
  const ms = d.getTime() - Date.now();
  return Math.round(ms / (1000 * 60 * 60 * 24));
};

const PIPELINE_LABEL: Record<PipelineId, string> = {
  sales: "Sales", operations: "Production", shipping: "Shipping", finance: "Finance",
};

const supplierName = (id?: string, fallback?: string) =>
  (id && SUPPLIERS.find((s) => s.id === id)?.name) || fallback || "—";

interface Row {
  id: string;
  project: Project;
  values: Record<ColumnId, string>;
  // Raw values for sorting (Date | number | string)
  sortKeys: Record<ColumnId, string | number>;
}

function buildRow(p: Project, displayId: string): Row {
  const days = daysFromToday(p.deadlineDate);
  const v: Record<ColumnId, string> = {
    id: displayId,
    pipeline: PIPELINE_LABEL[p.pipeline],
    stage: getStageTitle(p.pipeline, p.stage),
    customer: p.customer,
    projectName: p.projectName,
    detail: p.detailSummary ?? "—",
    quote: p.quoteNumber ?? "—",
    po: p.poNumber ?? "—",
    invoice: p.invoiceNumber ?? "—",
    supplier: supplierName(p.supplierId, p.supplierLabel),
    shippingMode: p.shippingMode ?? "—",
    tracking: p.trackingRef?.toUpperCase() ?? "—",
    deadline: fmtDate(p.deadlineDate),
    daysToDeadline: days >= 0 ? `in ${days}d` : `${days}d`,
    salesRep: p.pointPerson,
    createdAt: fmtDate(p.createdAt),
    updatedAt: p.updatedAt ? fmtDate(p.updatedAt) : "—",
  };
  const k: Record<ColumnId, string | number> = {
    id: displayId,
    pipeline: v.pipeline,
    stage: v.stage,
    customer: p.customer,
    projectName: p.projectName,
    detail: v.detail,
    quote: p.quoteNumber ?? "",
    po: p.poNumber ?? "",
    invoice: p.invoiceNumber ?? "",
    supplier: v.supplier,
    shippingMode: v.shippingMode,
    tracking: v.tracking,
    deadline: p.deadlineDate.getTime(),
    daysToDeadline: days,
    salesRep: p.pointPerson,
    createdAt: p.createdAt.getTime(),
    updatedAt: p.updatedAt?.getTime() ?? 0,
  };
  return { id: p.id, project: p, values: v, sortKeys: k };
}

function loadVisibility(): Record<ColumnId, boolean> {
  const all = COLUMNS.reduce((acc, c) => ({ ...acc, [c.id]: true }), {} as Record<ColumnId, boolean>);
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY);
    if (!raw) return all;
    const parsed = JSON.parse(raw);
    return { ...all, ...parsed };
  } catch { return all; }
}

interface SortState { col: ColumnId; dir: "asc" | "desc"; }
function loadSort(): SortState {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return { col: "id", dir: "asc" };
}

function downloadCsv(filename: string, rows: string[][]) {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────── Page ───────────
export default function Spreadsheet() {
  const navigate = useNavigate();
  const { projects } = usePipelineStore();

  const [search, setSearch] = useState("");
  const [pipelineFilter, setPipelineFilter] = useState<PipelineId | "all">("all");
  const [sort, setSort] = useState<SortState>(loadSort);
  const [visibility, setVisibility] = useState<Record<ColumnId, boolean>>(loadVisibility);
  const [columnsOpen, setColumnsOpen] = useState(false);

  useEffect(() => { try { localStorage.setItem(SORT_KEY, JSON.stringify(sort)); } catch { /* noop */ } }, [sort]);
  useEffect(() => { try { localStorage.setItem(VISIBILITY_KEY, JSON.stringify(visibility)); } catch { /* noop */ } }, [visibility]);

  // Build rows. Display ID is the prj-N suffix as a 4-digit zero-padded number,
  // so the spreadsheet shows compact, stable identifiers.
  const allRows = useMemo<Row[]>(() => {
    return projects.map((p) => {
      const m = /(\d+)$/.exec(p.id);
      const displayId = m ? String(m[1]).padStart(4, "0") : p.id.slice(-4);
      return buildRow(p, displayId);
    });
  }, [projects]);

  const filtered = useMemo<Row[]>(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (pipelineFilter !== "all" && r.project.pipeline !== pipelineFilter) return false;
      if (!q) return true;
      return Object.values(r.values).some((v) => v.toLowerCase().includes(q));
    });
  }, [allRows, search, pipelineFilter]);

  const sorted = useMemo<Row[]>(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a.sortKeys[sort.col];
      const bv = b.sortKeys[sort.col];
      if (typeof av === "number" && typeof bv === "number") return dir * (av - bv);
      return dir * String(av).localeCompare(String(bv), undefined, { numeric: true });
    });
  }, [filtered, sort]);

  const visibleColumns = COLUMNS.filter((c) => visibility[c.id]);

  // Keep the ID column always-visible regardless of toggle (it's the anchor).
  if (!visibleColumns.find((c) => c.id === "id")) {
    visibleColumns.unshift(COLUMNS[0]);
  }

  const cycleSort = (col: ColumnId) => {
    setSort((s) => s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" });
  };

  const exportCsv = () => {
    const header = visibleColumns.map((c) => c.label);
    const body = sorted.map((r) => visibleColumns.map((c) => r.values[c.id]));
    downloadCsv(`alvasco-projects-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background border-b" style={{ borderColor: "hsl(var(--brand-navy) / 0.15)" }}>
        <div className="px-3 sm:px-5 pt-[max(env(safe-area-inset-top),10px)] pb-2 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            aria-label="Back"
            className="inline-flex items-center justify-center rounded-full border bg-card/60 hover:bg-card transition-colors shrink-0"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.25)", color: "hsl(var(--brand-navy))", width: 36, height: 36 }}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-base sm:text-lg font-semibold tracking-[0.06em] truncate" style={{ color: "hsl(var(--brand-navy))" }}>
              Spreadsheet
            </h1>
            <p className="text-[11px] text-muted-foreground tabular">
              {sorted.length} of {allRows.length} {allRows.length === 1 ? "project" : "projects"}
            </p>
          </div>
          <button
            onClick={() => setColumnsOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] font-medium hover:bg-muted/50"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.25)", color: "hsl(var(--brand-navy))" }}
          >
            <Columns3 className="h-3.5 w-3.5" /> Columns
          </button>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] font-medium hover:bg-muted/50"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.25)", color: "hsl(var(--brand-navy))" }}
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>

        {/* Search + filter row */}
        <div className="px-3 sm:px-5 pb-2.5 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-lg border bg-card px-2.5"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.2)", minHeight: 36 }}>
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all columns…"
              className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground py-1.5"
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Clear search" className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <select
            value={pipelineFilter}
            onChange={(e) => setPipelineFilter(e.target.value as PipelineId | "all")}
            className="rounded-lg border bg-card px-2 py-1.5 text-[12px] font-medium"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.2)", color: "hsl(var(--brand-navy))", minHeight: 36 }}
          >
            <option value="all">All pipelines</option>
            {PIPELINES.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Table — single scroll container, sticky header & first column via CSS */}
      <div className="flex-1 overflow-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        <table className="border-collapse text-[12px]" style={{ tableLayout: "fixed", borderSpacing: 0 }}>
          <thead>
            <tr>
              {visibleColumns.map((c, i) => {
                const isFirst = i === 0;
                const sorted = sort.col === c.id;
                return (
                  <th
                    key={c.id}
                    onClick={() => cycleSort(c.id)}
                    className={cn(
                      "px-2 py-2 border-b border-r select-none cursor-pointer hover:bg-muted/60 whitespace-nowrap",
                      "text-[10px] uppercase tracking-[0.12em] font-semibold",
                      sorted ? "bg-[hsl(var(--brand-navy)/0.08)] text-[hsl(var(--brand-navy))]" : "bg-muted/40 text-muted-foreground",
                    )}
                    style={{
                      width: c.width, minWidth: c.width, maxWidth: c.width,
                      borderColor: "hsl(var(--brand-navy) / 0.15)",
                      textAlign: c.align ?? "left",
                      position: "sticky",
                      top: 0,
                      left: isFirst ? 0 : undefined,
                      zIndex: isFirst ? 22 : 21,
                    }}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {sorted && (sort.dir === "asc"
                        ? <ArrowUp className="h-3 w-3" />
                        : <ArrowDown className="h-3 w-3" />)}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} className="px-4 py-10 text-center text-muted-foreground italic">
                  No matching projects.
                </td>
              </tr>
            ) : (
              sorted.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/?project=${encodeURIComponent(r.project.id)}`)}
                  className="hover:bg-[hsl(var(--brand-navy)/0.04)] cursor-pointer"
                >
                  {visibleColumns.map((c, i) => {
                    const isFirst = i === 0;
                    return (
                      <td
                        key={c.id}
                        className={cn(
                          "px-2 py-1.5 border-b border-r whitespace-nowrap overflow-hidden text-ellipsis",
                          isFirst && "font-semibold tabular bg-background",
                        )}
                        style={{
                          width: c.width, minWidth: c.width, maxWidth: c.width,
                          borderColor: "hsl(var(--brand-navy) / 0.08)",
                          textAlign: c.align ?? "left",
                          position: isFirst ? "sticky" : undefined,
                          left: isFirst ? 0 : undefined,
                          zIndex: isFirst ? 11 : undefined,
                          color: c.id === "daysToDeadline"
                            ? (r.sortKeys.daysToDeadline as number) < 0
                              ? "hsl(0 70% 45%)"
                              : (r.sortKeys.daysToDeadline as number) <= 7
                                ? "hsl(var(--brand-orange))"
                                : undefined
                            : undefined,
                        }}
                        title={r.values[c.id]}
                      >
                        {r.values[c.id]}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Columns picker (overlay) */}
      {columnsOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center"
          onClick={() => setColumnsOpen(false)}>
          <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" />
          <div
            className="relative w-full sm:max-w-sm bg-background rounded-t-2xl sm:rounded-2xl border shadow-2xl p-4 max-h-[80vh] flex flex-col"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.2)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold" style={{ color: "hsl(var(--brand-navy))" }}>Columns</h3>
              <button onClick={() => setColumnsOpen(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto -mx-1">
              {COLUMNS.map((c) => {
                const checked = visibility[c.id];
                const isAnchor = c.id === "id";
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
                      checked={checked}
                      disabled={isAnchor}
                      onChange={(e) => setVisibility((v) => ({ ...v, [c.id]: e.target.checked }))}
                      className="h-4 w-4 accent-[hsl(var(--brand-orange))]"
                    />
                  </label>
                );
              })}
            </div>
            <div className="pt-3 mt-2 border-t flex justify-end gap-2" style={{ borderColor: "hsl(var(--brand-navy) / 0.1)" }}>
              <button
                onClick={() => setVisibility(COLUMNS.reduce((acc, c) => ({ ...acc, [c.id]: true }), {} as Record<ColumnId, boolean>))}
                className="text-[12px] px-3 py-1.5 rounded-lg border hover:bg-muted/50"
                style={{ borderColor: "hsl(var(--brand-navy) / 0.2)", color: "hsl(var(--brand-navy))" }}
              >
                Show all
              </button>
              <button
                onClick={() => setColumnsOpen(false)}
                className="text-[12px] px-3 py-1.5 rounded-lg font-semibold text-white"
                style={{ backgroundColor: "hsl(var(--brand-navy))" }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden link kept for accessibility — react-router prefetch is fine */}
      <Link to="/" className="sr-only">Back to pipelines</Link>
    </div>
  );
}
