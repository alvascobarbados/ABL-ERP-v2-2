/**
 * Activity Log — live, reverse-chronological audit feed across the platform.
 *
 * Data source: project_log_entries (Supabase, realtime publication enabled).
 * Renders: grouped (Today / Yesterday / This week / Last week / This month
 * / individual past months), Slack-density rows with avatar, name, formatted
 * description, project link, timestamp.
 *
 * Filters: free-text search (debounced) + single-select team member.
 * Realtime: dedicated channel that tears down on unmount.
 * Pagination: initial 50, infinite scroll +50 within 200px of bottom.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronUp, X as XIcon, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { useMasterData } from "@/hooks/useMasterData";
import { usePipelineStore, getStageTitle } from "@/hooks/usePipelineStore";
import { PIPELINES, PipelineId, StageId } from "@/data/pipelines";
import { cn } from "@/lib/utils";
import { DateRangeFilter, ALL_TIME, DateRangeValue } from "@/components/leads/DateRangeFilter";
import { exportActivityPdf, ActivityPdfGroup } from "@/lib/activityPdf";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";

const PAGE_SIZE = 50;

interface LogRow {
  id: string;
  project_id: string;
  ts: string;
  actor_user_id: string;
  actor_display_name: string;
  action_type: string;
  description: string;
  metadata: Record<string, any> | null;
}

// ─── Date grouping ────────────────────────────────────────────────────────
type GroupKey = string; // "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "YYYY-MM"
interface GroupSpec { key: GroupKey; label: string; sort: number }

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function startOfWeek(d: Date) { // Sunday
  const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x;
}

function groupForDate(ts: Date, now: Date): GroupSpec {
  const today = startOfDay(now);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const thisWeekStart = startOfWeek(now);
  const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const t = ts.getTime();
  if (t >= today.getTime()) return { key: "today", label: "Today", sort: 0 };
  if (t >= yesterday.getTime()) return { key: "yesterday", label: "Yesterday", sort: 1 };
  if (t >= thisWeekStart.getTime()) return { key: "this_week", label: "This week", sort: 2 };
  if (t >= lastWeekStart.getTime()) return { key: "last_week", label: "Last week", sort: 3 };
  if (t >= thisMonthStart.getTime()) return { key: "this_month", label: "This month", sort: 4 };
  const y = ts.getFullYear(), m = ts.getMonth();
  const label = ts.toLocaleString(undefined, { month: "long", year: "numeric" });
  // sort: older = larger; encode as 100 + months-ago so all later than fixed groups
  const monthsAgo = (now.getFullYear() - y) * 12 + (now.getMonth() - m);
  return { key: `${y}-${String(m).padStart(2, "0")}`, label, sort: 100 + monthsAgo };
}

// ─── Time formatting ──────────────────────────────────────────────────────
function fmtTime(ts: Date, now: Date): string {
  const today = startOfDay(now);
  if (ts.getTime() >= today.getTime()) {
    return ts.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return ts.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ─── Avatar color ─────────────────────────────────────────────────────────
const AVATAR_PALETTE = [
  "#1B2A4E", "#E97B2C", "#4A5D8A", "#3D7B86", "#7A3A10",
  "#B45309", "#0F766E", "#7C3AED", "#BE185D", "#15803D",
];
function colorForInitials(initials: string): string {
  let h = 0;
  for (const c of initials) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

// ─── Sentence builder ─────────────────────────────────────────────────────
// Builds a natural-sentence rendering: [actor] {pre} [project] {post} · [time AST]
// where the project reference sits immediately after the verb.
// TODO: flag_toggle should store {newState: true|false} in metadata for
//   clean rendering — currently we parse "flagged"/"unflagged" from text.
const FIELD_LABELS: Record<string, string> = {
  pointPerson: "sales rep",
  shippingMode: "mode",
  value: "amount",
  supplierId: "supplier",
  supplierLabel: "supplier",
  quoteNumber: "Q#",
  projectName: "project name",
  detailSummary: "detail",
  deadline: "deadline",
  customer: "customer",
  contactPerson: "contact",
  priority: "priority",
  orderType: "order type",
  tag: "tag",
  poNumber: "PO#",
  invoiceNumber: "invoice #",
  paymentTerms: "payment terms",
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/([A-Z])/g, " $1").toLowerCase().trim();
}

function fmtFieldValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(v);
}

export interface Sentence {
  pre: string;        // text between actor name and project link (with trailing space)
  post: string;       // text after project link (with leading space if non-empty)
}

export function buildSentence(row: LogRow): Sentence {
  const m = row.metadata ?? {};
  switch (row.action_type) {
    case "stage_change": {
      const fromP = m.fromPipeline as PipelineId | undefined;
      const fromS = m.fromStage as StageId | undefined;
      const toP = m.toPipeline as PipelineId | undefined;
      const toS = m.toStage as StageId | undefined;
      if (fromP && fromS && toP && toS) {
        try {
          const fromTitle = getStageTitle(fromP, fromS);
          const toTitle = getStageTitle(toP, toS);
          const fromPipeName = PIPELINES.find((p) => p.id === fromP)?.title ?? fromP;
          const toPipeName = PIPELINES.find((p) => p.id === toP)?.title ?? toP;
          return { pre: "moved ", post: ` from ${fromPipeName} · ${fromTitle} → ${toPipeName} · ${toTitle}` };
        } catch { /* fall through */ }
      }
      return { pre: "moved ", post: "" };
    }
    case "flag_toggle": {
      const isOff = /unflagged/i.test(row.description ?? "");
      return { pre: isOff ? "unflagged " : "flagged ", post: "" };
    }
    case "field_edit": {
      const f = (m.field as string) ?? "field";
      const label = fieldLabel(f);
      const hasFrom = m.fromValue !== undefined && m.fromValue !== null && m.fromValue !== "";
      const hasTo = m.toValue !== undefined && m.toValue !== null && m.toValue !== "";
      // Hide raw IDs (supplierId) from value rendering — fall back to "updated …"
      const isIdField = f === "supplierId";
      if (hasFrom && hasTo && !isIdField) {
        return { pre: `changed ${label} on `, post: ` from ${fmtFieldValue(m.fromValue)} → ${fmtFieldValue(m.toValue)}` };
      }
      return { pre: `updated ${label} on `, post: "" };
    }
    case "note_added":
      return { pre: "added a note to ", post: "" };
    case "line_item_change":
      return { pre: "updated line items on ", post: "" };
    case "trash":
      return { pre: "trashed ", post: "" };
    case "restore":
      return { pre: "restored ", post: "" };
    case "project_created":
      return { pre: "created ", post: "" };
    default:
      return { pre: `${row.action_type.replace(/_/g, " ")} `, post: "" };
  }
}

// Time formatted in Barbados (AST, UTC-4, no DST) with explicit "AST" label.
const AST_TIME_FMT = new Intl.DateTimeFormat("en-US", {
  hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Barbados",
});
export function fmtAstTime(ts: Date): string {
  return `${AST_TIME_FMT.format(ts)} AST`;
}

export function projectFallbackLabel(
  project: { customer: string; projectName: string } | undefined,
  projectId: string,
): string {
  if (project) {
    if (project.customer && project.projectName) return `${project.customer} · ${project.projectName}`;
    if (project.projectName) return project.projectName;
    return "[unknown project]";
  }
  return projectId ? "[deleted project]" : "[unknown project]";
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function ActivityPage() {
  const navigate = useNavigate();
  const md = useMasterData();
  const { projects } = usePipelineStore();
  const projectMap = useMemo(() => {
    const m = new Map<string, { customer: string; projectName: string }>();
    projects.forEach((p) => m.set(p.id, { customer: p.customer, projectName: p.projectName }));
    return m;
  }, [projects]);

  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState(0); // 0-based; loaded pages 0..page
  const [loadingMore, setLoadingMore] = useState(false);
  const [endReached, setEndReached] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState<string>(""); // initials, "" = all
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_TIME);
  const [exporting, setExporting] = useState(false);
  const [confirmLargeExport, setConfirmLargeExport] = useState<number | null>(null);

  const [newCount, setNewCount] = useState(0);
  const [scrolledDown, setScrolledDown] = useState(false);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Initial load + reload on filter change
  const loadInitial = useCallback(async () => {
    setEndReached(false);
    let q = supabase
      .from("project_log_entries")
      .select("*", { count: "exact" })
      .order("ts", { ascending: false })
      .range(0, PAGE_SIZE - 1);
    if (search) q = q.ilike("description", `%${search}%`);
    if (memberFilter) {
      const tm = md.teamMembers.find((t) => t.initials.toUpperCase() === memberFilter);
      if (tm) q = q.eq("actor_display_name", tm.full_name);
    }
    if (dateRange.from) q = q.gte("ts", dateRange.from.toISOString());
    if (dateRange.to) q = q.lte("ts", dateRange.to.toISOString());
    const { data, count } = await q;
    const list = (data ?? []) as LogRow[];
    setRows(list);
    setPage(0);
    setTotal(count ?? 0);
    setEndReached(list.length < PAGE_SIZE);
    knownIdsRef.current = new Set(list.map((r) => r.id));
  }, [search, memberFilter, dateRange.from, dateRange.to, md.teamMembers]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (loadingMore || endReached) return;
    setLoadingMore(true);
    const next = page + 1;
    const from = next * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q = supabase
      .from("project_log_entries")
      .select("*")
      .order("ts", { ascending: false })
      .range(from, to);
    if (search) q = q.ilike("description", `%${search}%`);
    if (memberFilter) {
      const tm = md.teamMembers.find((t) => t.initials.toUpperCase() === memberFilter);
      if (tm) q = q.eq("actor_display_name", tm.full_name);
    }
    if (dateRange.from) q = q.gte("ts", dateRange.from.toISOString());
    if (dateRange.to) q = q.lte("ts", dateRange.to.toISOString());
    const { data } = await q;
    const list = (data ?? []) as LogRow[];
    setRows((prev) => [...prev, ...list]);
    list.forEach((r) => knownIdsRef.current.add(r.id));
    setPage(next);
    setLoadingMore(false);
    if (list.length < PAGE_SIZE) setEndReached(true);
  }, [loadingMore, endReached, page, search, memberFilter, dateRange.from, dateRange.to, md.teamMembers]);

  // Realtime subscription — dedicated channel for this page
  useEffect(() => {
    const channel = supabase
      .channel("activity-log-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "project_log_entries" }, (payload) => {
        const r = payload.new as LogRow;
        if (knownIdsRef.current.has(r.id)) return;
        knownIdsRef.current.add(r.id);
        // Apply current filters
        if (search && !(r.description ?? "").toLowerCase().includes(search.toLowerCase())) return;
        if (memberFilter) {
          const tm = md.teamMembers.find((t) => t.initials.toUpperCase() === memberFilter);
          if (!tm || r.actor_display_name !== tm.full_name) return;
        }
        const ts = new Date(r.ts).getTime();
        if (dateRange.from && ts < dateRange.from.getTime()) return;
        if (dateRange.to && ts > dateRange.to.getTime()) return;
        setRows((prev) => [r, ...prev]);
        setTotal((t) => t + 1);
        if (scrolledDown) {
          setNewCount((n) => n + 1);
        } else {
          setHighlightIds((s) => { const n = new Set(s); n.add(r.id); return n; });
          setTimeout(() => {
            setHighlightIds((s) => { const n = new Set(s); n.delete(r.id); return n; });
          }, 1500);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [search, memberFilter, dateRange.from, dateRange.to, md.teamMembers, scrolledDown]);

  // Scroll handling: track position + infinite scroll
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const isDown = el.scrollTop > 200;
    setScrolledDown(isDown);
    if (!isDown) setNewCount(0);
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      loadMore();
    }
  }, [loadMore]);

  const scrollToTop = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setNewCount(0);
  };

  // Group rows
  const grouped = useMemo(() => {
    const now = new Date();
    const map = new Map<GroupKey, { spec: GroupSpec; rows: LogRow[] }>();
    rows.forEach((r) => {
      const ts = new Date(r.ts);
      const spec = groupForDate(ts, now);
      const g = map.get(spec.key) ?? { spec, rows: [] };
      g.rows.push(r);
      map.set(spec.key, g);
    });
    return Array.from(map.values()).sort((a, b) => a.spec.sort - b.spec.sort);
  }, [rows]);

  const filtersActive = !!search || !!memberFilter || dateRange.presetKey !== "all";

  const clearAll = () => {
    setSearchInput(""); setSearch(""); setMemberFilter(""); setDateRange(ALL_TIME);
  };

  // ─── Export PDF ─────────────────────────────────────────────────────────
  const memberFullName = useMemo(() => {
    if (!memberFilter) return "";
    return md.teamMembers.find((t) => t.initials.toUpperCase() === memberFilter)?.full_name ?? "";
  }, [memberFilter, md.teamMembers]);

  const fetchAllForExport = async (cap: number): Promise<LogRow[]> => {
    let q = supabase
      .from("project_log_entries")
      .select("*")
      .order("ts", { ascending: false })
      .range(0, cap - 1);
    if (search) q = q.ilike("description", `%${search}%`);
    if (memberFullName) q = q.eq("actor_display_name", memberFullName);
    if (dateRange.from) q = q.gte("ts", dateRange.from.toISOString());
    if (dateRange.to) q = q.lte("ts", dateRange.to.toISOString());
    const { data } = await q;
    return (data ?? []) as LogRow[];
  };

  const runExport = async () => {
    setExporting(true);
    try {
      const list = await fetchAllForExport(5001);
      if (list.length > 5000) {
        toast.error("Too many entries — please narrow your filter to under 5000");
        return;
      }
      const now = new Date();
      const groupMap = new Map<GroupKey, { spec: GroupSpec; rows: LogRow[] }>();
      list.forEach((r) => {
        const spec = groupForDate(new Date(r.ts), now);
        const g = groupMap.get(spec.key) ?? { spec, rows: [] };
        g.rows.push(r); groupMap.set(spec.key, g);
      });
      const groups: ActivityPdfGroup[] = Array.from(groupMap.values())
        .sort((a, b) => a.spec.sort - b.spec.sort)
        .map((g) => ({
          label: g.spec.label,
          rows: g.rows.map((r) => {
            const proj = projectMap.get(r.project_id);
            const sentence = buildSentence(r);
            return {
              id: r.id,
              ts: new Date(r.ts),
              actorDisplayName: r.actor_display_name,
              pre: sentence.pre,
              post: sentence.post,
              projectLabel: projectFallbackLabel(proj, r.project_id),
              astTime: fmtAstTime(new Date(r.ts)),
            };
          }),
        }));
      exportActivityPdf(groups, {
        member: memberFullName,
        search,
        dateRangeLabel: dateRange.label,
        totalCount: list.length,
      });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't generate PDF");
    } finally {
      setExporting(false);
    }
  };

  const startExport = () => {
    if (total > 5000) {
      toast.error("Too many entries — please narrow your filter to under 5000");
      return;
    }
    if (total >= 1000) {
      setConfirmLargeExport(total);
      return;
    }
    runExport();
  };

  return (
    <DesktopAppShell contentScroll={false}>
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="flex-1 overflow-auto relative"
        style={{ backgroundColor: "hsl(var(--background))" }}
      >
        {/* Sticky page header */}
        <div
          className="sticky top-0 z-30 px-8 py-5 border-b backdrop-blur-sm"
          style={{
            backgroundColor: "hsl(var(--background) / 0.92)",
            borderColor: "hsl(var(--brand-navy) / 0.08)",
          }}
        >
          <div className="flex items-end justify-between gap-4 max-w-[1400px] mx-auto">
            <div>
              <h1
                className="font-display text-[32px] leading-none"
                style={{ color: "hsl(var(--brand-navy))", fontWeight: 300 }}
              >
                Activity Log
              </h1>
              <p className="mt-1.5 text-[13px]" style={{ color: "hsl(var(--brand-navy) / 0.6)" }}>
                Showing {rows.length.toLocaleString()} of {total.toLocaleString()} entries
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative" style={{ width: 280 }}>
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "hsl(var(--brand-navy) / 0.5)" }} />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search activity..."
                  className="w-full h-9 pl-8 pr-3 rounded-md border bg-white text-[13px] outline-none focus:ring-2 focus:ring-offset-0"
                  style={{ borderColor: "hsl(var(--brand-navy) / 0.15)", color: "hsl(var(--brand-navy))" }}
                />
              </div>
              <DateRangeFilter value={dateRange} onChange={setDateRange} />
              <select
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value)}
                className="h-9 px-2.5 rounded-md border bg-white text-[13px] outline-none"
                style={{ width: 160, borderColor: "hsl(var(--brand-navy) / 0.15)", color: "hsl(var(--brand-navy))" }}
              >
                <option value="">All team members</option>
                {md.teamMembers.map((t) => (
                  <option key={t.id} value={t.initials.toUpperCase()}>{t.full_name}</option>
                ))}
              </select>
              <button
                onClick={startExport}
                disabled={exporting || total === 0}
                title={total === 0 ? "No activity to export" : "Export filtered entries to PDF"}
                className="h-9 inline-flex items-center gap-1.5 px-3 rounded-md border bg-white text-[13px] font-medium outline-none disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[hsl(var(--brand-navy)/0.04)]"
                style={{ borderColor: "hsl(var(--brand-navy) / 0.15)", color: "hsl(var(--brand-navy))" }}
              >
                <Download className="h-3.5 w-3.5" />
                {exporting ? "Generating..." : "Export PDF"}
              </button>
              {filtersActive && (
                <button
                  onClick={clearAll}
                  className="text-[12px] underline"
                  style={{ color: "hsl(var(--brand-navy) / 0.6)" }}
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* New activity pill */}
        {newCount > 0 && scrolledDown && (
          <div className="sticky top-[88px] z-40 flex justify-center pt-3">
            <button
              onClick={scrollToTop}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold shadow-md transition-transform hover:scale-105"
              style={{
                backgroundColor: "hsl(var(--brand-orange))",
                color: "#fff",
              }}
            >
              <ChevronUp className="h-3.5 w-3.5" />
              {newCount} new {newCount === 1 ? "entry" : "entries"}
            </button>
          </div>
        )}

        <div className="max-w-[1400px] mx-auto">
          {rows.length === 0 ? (
            <div className="px-8 py-24 text-center">
              <p className="text-[14px]" style={{ color: "hsl(var(--brand-navy) / 0.6)" }}>
                {filtersActive
                  ? "No activity matches your filters."
                  : "No activity yet. Changes you and your team make will appear here in real time."}
              </p>
              {filtersActive && (
                <button
                  onClick={clearAll}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[12px] font-medium"
                  style={{ borderColor: "hsl(var(--brand-navy) / 0.2)", color: "hsl(var(--brand-navy))" }}
                >
                  <XIcon className="h-3 w-3" /> Clear filters
                </button>
              )}
            </div>
          ) : (
            grouped.map((g) => (
              <section key={g.spec.key}>
                <div
                  className="sticky z-20 px-8 py-3 border-b"
                  style={{
                    top: 88,
                    backgroundColor: "hsl(var(--background))",
                    borderColor: "hsl(var(--brand-navy) / 0.08)",
                    fontSize: 12, fontWeight: 600,
                    color: "hsl(var(--brand-navy) / 0.7)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {g.spec.label}
                </div>
                <ul>
                  {g.rows.map((r) => (
                    <ActivityRow
                      key={r.id}
                      row={r}
                      project={projectMap.get(r.project_id)}
                      teamMembers={md.teamMembers}
                      now={new Date()}
                      highlight={highlightIds.has(r.id)}
                      onOpenProject={(id) => navigate(`/?project=${encodeURIComponent(id)}`)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}

          {/* Loader / end */}
          {rows.length > 0 && (
            <div className="px-8 py-6 text-center text-[12px]" style={{ color: "hsl(var(--brand-navy) / 0.5)" }}>
              {loadingMore ? "Loading more…" : endReached ? "End of activity" : ""}
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmLargeExport !== null}
        title="Export large activity log?"
        description={`Export ${confirmLargeExport?.toLocaleString()} entries to PDF? This may take a moment.`}
        confirmLabel="Export"
        cancelLabel="Cancel"
        onConfirm={() => { const _t = confirmLargeExport; setConfirmLargeExport(null); if (_t) runExport(); }}
        onCancel={() => setConfirmLargeExport(null)}
      />
    </DesktopAppShell>
  );
}

// ─── Single row ───────────────────────────────────────────────────────────
function ActivityRow({
  row, project, teamMembers, now, highlight, onOpenProject,
}: {
  row: LogRow;
  project?: { customer: string; projectName: string };
  teamMembers: { id: string; full_name: string; initials: string }[];
  now: Date;
  highlight: boolean;
  onOpenProject: (id: string) => void;
}) {
  const tm = teamMembers.find((t) => t.full_name === row.actor_display_name);
  const initials = (tm?.initials ?? row.actor_display_name.slice(0, 2)).toUpperCase();
  const avatarColor = colorForInitials(initials);
  const sentence = buildSentence(row);
  const projectLabel = projectFallbackLabel(project, row.project_id);
  const projectClickable = !!project;
  const astTime = fmtAstTime(new Date(row.ts));

  return (
    <li
      className="px-8 transition-colors group"
      style={{
        borderBottom: "1px solid hsl(var(--brand-navy) / 0.05)",
        backgroundColor: highlight ? "hsl(var(--brand-orange) / 0.12)" : undefined,
        transition: "background-color 1.5s ease-out",
      }}
    >
      <div
        className={cn("flex items-center gap-3 py-2.5 hover:bg-[hsl(var(--brand-navy)/0.025)] -mx-8 px-8")}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
          style={{ backgroundColor: avatarColor }}
          title={row.actor_display_name}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0 truncate text-[13px]" style={{ color: "hsl(var(--brand-navy) / 0.9)" }}>
          <span style={{ fontWeight: 600 }}>{row.actor_display_name}</span>{" "}
          <span>{sentence.pre}</span>
          {projectClickable ? (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenProject(row.project_id); }}
              className="hover:underline"
              style={{ color: "hsl(var(--brand-navy))", fontWeight: 500 }}
            >
              {projectLabel}
            </button>
          ) : (
            <span style={{ color: "hsl(var(--brand-navy) / 0.5)", fontStyle: "italic" }}>{projectLabel}</span>
          )}
          {sentence.post && <span>{sentence.post}</span>}
          <span style={{ color: "hsl(var(--brand-navy) / 0.4)" }}> · </span>
          <span style={{ color: "hsl(var(--brand-navy) / 0.55)" }}>{astTime}</span>
        </div>
        <div className="text-[11px] tabular-nums shrink-0" style={{ color: "hsl(var(--brand-navy) / 0.5)" }}>
          {fmtTime(new Date(row.ts), now)}
        </div>
      </div>
    </li>
  );
}
