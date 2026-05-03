/**
 * Desktop Table view — dense, sortable data grid alternative to the
 * Kanban board. Same projects, same gestures (click=open, double-click=flag,
 * long-click=stage picker). Reuses the existing CardActionsPopover for
 * the per-row three-dots menu.
 *
 * Mobile (<1024px) never renders this — Index.tsx hides the view switcher
 * and only mounts the Table at the lg breakpoint.
 */
import { useMemo, useState, useRef, MouseEvent as ReactMouseEvent } from "react";
import { Flag, MoreHorizontal, ArrowUp, ArrowDown } from "lucide-react";
import {
  PIPELINES, PipelineCard, PipelineId, StageId, SUPPLIERS,
} from "@/data/pipelines";
import { useColumnWidths } from "@/hooks/useColumnWidths";
import { ColumnResizeHandle } from "./ColumnResizeHandle";

// Pipeline order matches the chevron flow (Sales → Production → Shipping → Finance).
const PIPELINE_ORDER: Record<PipelineId, number> = {
  sales: 0, operations: 1, shipping: 2, finance: 3,
};
// Display overrides for stages whose canonical title differs from the
// PIPELINES config (or that aren't listed there at all). "paid" must
// render Title Case; both shipping sub-stages collapse to "Shipping"
// because the Shipping pipeline has only one user-facing stage.
const STAGE_DISPLAY: Partial<Record<StageId, string>> = {
  paid: "Paid",
  shipment_required: "Shipping",
  shipment_assigned: "Shipping",
};
function displayStageTitle(pipeline: PipelineId, stage: StageId): string {
  return STAGE_DISPLAY[stage] ?? getStageTitle(pipeline, stage);
}
import { getStageTitle, usePipelineStore } from "@/hooks/usePipelineStore";
import { useMasterData } from "@/hooks/useMasterData";
import { cn } from "@/lib/utils";
import { CardActionsPopover } from "./CardActionsPopover";
import { CardEditOverlay } from "./CardEditOverlay";
import type { TabId } from "./PipelineTabs";

type SortKey =
  | "flagged" | "stage" | "customer" | "project" | "detail" | "supplier"
  | "quote" | "amount" | "mode" | "tracking" | "rep" | "deadline" | "urgency";

interface Props {
  activeTab: TabId;
  visible: PipelineCard[];
  onOpenCard: (c: PipelineCard) => void;
  onOpenPicker: (c: PipelineCard) => void;
  hasActiveFilter?: boolean;
  onClearFilters?: () => void;
}

const DAY = 86400000;

function urgencyLabel(date?: Date): { text: string; tone: "urgent" | "soon" | "neutral" | "none"; days: number } {
  if (!date) return { text: "—", tone: "none", days: Number.POSITIVE_INFINITY };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((d.getTime() - today.getTime()) / DAY);
  if (diff === 0) return { text: "due today", tone: "soon", days: 0 };
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, tone: "urgent", days: diff };
  if (diff <= 7) return { text: `in ${diff}d`, tone: "urgent", days: diff };
  if (diff <= 14) return { text: `in ${diff}d`, tone: "soon", days: diff };
  return { text: `in ${diff}d`, tone: "neutral", days: diff };
}

function fmtMoney(v: number | undefined): string {
  if (!v && v !== 0) return "—";
  return `$${v.toLocaleString()}`;
}

function fmtDeadline(date?: Date): string {
  if (!date) return "—";
  return `${date.getDate()} ${date.toLocaleString("en-US", { month: "short" })}`;
}

function stageLabel(c: PipelineCard, activeTab: TabId): string {
  const pipelineTitle = PIPELINES.find((p) => p.id === c.pipeline)?.title ?? c.pipeline;
  // Shipping has exactly one user-facing stage ("Shipping") — collapse the
  // pipeline·stage display to just "Shipping" rather than "Shipping · Shipping".
  // The mode (Air/Ocean/Local) is rendered in the dedicated Mode column, NOT here.
  if (c.pipeline === "shipping") {
    return activeTab === "all" ? "Shipping" : "Shipping";
  }
  const stageTitle = displayStageTitle(c.pipeline, c.stage);
  if (activeTab === "all") return `${pipelineTitle} · ${stageTitle}`;
  return stageTitle;
}

// Stage progression rank within each pipeline. Lower = earlier in the flow.
// Shipping collapses to a single rank (only one user-facing stage).
const STAGE_RANK: Record<StageId, number> = {
  proposal: 0, quote: 1, confirming: 2, archive: 99,
  preproduction: 0, in_production: 1,
  shipment_required: 0, shipment_assigned: 0,
  invoice_required: 0, invoiced: 1, paid: 2,
};

function supplierName(id: string | undefined, lookup?: (id?: string | null) => { name: string } | undefined): string {
  if (!id) return "";
  const fromMaster = lookup?.(id)?.name;
  if (fromMaster) return fromMaster;
  return SUPPLIERS.find((s) => s.id === id)?.name ?? "";
}

function repInitials(name?: string): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function compareCards(
  a: PipelineCard, b: PipelineCard, key: SortKey, dir: 1 | -1,
  lookup?: (id?: string | null) => { name: string } | undefined,
): number {
  const dl = (c: PipelineCard) => c.deadlineDate?.getTime?.() ?? Number.POSITIVE_INFINITY;
  switch (key) {
    case "flagged":
      // flagged first when asc
      return dir * (Number(!!b.project.flagged) - Number(!!a.project.flagged));
    case "stage": {
      // Sort by pipeline order (Sales→Production→Shipping→Finance), then by
      // stage progression rank within pipeline (NOT alphabetical). Within
      // Shipping (single stage) tie-break alphabetically by Customer.
      const ap = PIPELINE_ORDER[a.pipeline] ?? 99;
      const bp = PIPELINE_ORDER[b.pipeline] ?? 99;
      if (ap !== bp) return dir * (ap - bp);
      const ar = STAGE_RANK[a.stage] ?? 99;
      const br = STAGE_RANK[b.stage] ?? 99;
      if (ar !== br) return dir * (ar - br);
      return dir * a.project.customer.localeCompare(b.project.customer);
    }
    case "customer":
      return dir * a.project.customer.localeCompare(b.project.customer);
    case "project":
      return dir * a.project.projectName.localeCompare(b.project.projectName);
    case "detail": {
      const av = a.project.detailSummary?.trim() ?? "";
      const bv = b.project.detailSummary?.trim() ?? "";
      if (!av && bv) return 1;
      if (av && !bv) return -1;
      return dir * av.localeCompare(bv);
    }
    case "supplier": {
      const av = supplierName(a.project.supplierId, lookup) || a.project.supplierLabel || "";
      const bv = supplierName(b.project.supplierId, lookup) || b.project.supplierLabel || "";
      if (!av && bv) return 1;
      if (av && !bv) return -1;
      return dir * av.localeCompare(bv);
    }
    case "quote": {
      const av = a.project.quoteNumber ?? "";
      const bv = b.project.quoteNumber ?? "";
      if (!av && bv) return 1;
      if (av && !bv) return -1;
      return dir * av.localeCompare(bv, undefined, { numeric: true });
    }
    case "amount":
      return dir * ((a.project.value ?? 0) - (b.project.value ?? 0));
    case "mode": {
      const av = a.project.shippingMode ?? "";
      const bv = b.project.shippingMode ?? "";
      if (!av && bv) return 1;
      if (av && !bv) return -1;
      return dir * av.localeCompare(bv);
    }
    case "tracking": {
      const av = a.project.trackingRef ?? "";
      const bv = b.project.trackingRef ?? "";
      if (!av && bv) return 1;
      if (av && !bv) return -1;
      return dir * av.localeCompare(bv, undefined, { numeric: true });
    }
    case "rep":
      return dir * (a.project.pointPerson ?? "").localeCompare(b.project.pointPerson ?? "");
    case "deadline":
      return dir * (dl(a) - dl(b));
    case "urgency":
      return dir * (urgencyLabel(a.deadlineDate).days - urgencyLabel(b.deadlineDate).days);
  }
}

// Each entry has a default pixel width AND a flexible flag. The "project"
// column historically used `minmax(220px, 1.6fr)` to absorb leftover space;
// now that columns are individually resizable we keep all widths in pixels
// and let the table grow horizontally if the user widens columns past the
// viewport (overflow-auto on the wrapper handles it).
const COLS: { key: SortKey; label: string; defaultPx: number; align?: "right" | "left"; resizable?: boolean }[] = [
  { key: "flagged", label: "", defaultPx: 32, resizable: false },
  { key: "stage", label: "Pipeline · Stage", defaultPx: 220 },
  { key: "customer", label: "Customer", defaultPx: 150 },
  { key: "project", label: "Project", defaultPx: 280 },
  { key: "detail", label: "Detail", defaultPx: 200 },
  { key: "supplier", label: "Supplier", defaultPx: 130 },
  { key: "quote", label: "Q#", defaultPx: 84 },
  { key: "amount", label: "Amount", defaultPx: 104, align: "right" },
  { key: "mode", label: "Mode", defaultPx: 76 },
  { key: "tracking", label: "Tracking", defaultPx: 120 },
  { key: "rep", label: "Rep", defaultPx: 60 },
  { key: "deadline", label: "Deadline", defaultPx: 92 },
  { key: "urgency", label: "Urgency", defaultPx: 100 },
];

const GRID_COLS = COLS.map((c) => c.width).join(" ") + " 36px"; // +1 for actions

export const ProjectTable = ({ activeTab, visible, onOpenCard, onOpenPicker }: Props) => {
  const store = usePipelineStore();
  const md = useMasterData();
  // null = no local override; rows render in the order Index.tsx provides
  // (which respects the global sort/default for the current scope).
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<PipelineCard | null>(null);

  const sorted = useMemo(() => {
    if (!sortKey) return visible;
    const list = [...visible].sort((a, b) => compareCards(a, b, sortKey, sortDir, md.getSupplierByAnyId));
    return list;
  }, [visible, sortKey, sortDir, md.getSupplierByAnyId]);

  const totalAmount = useMemo(
    () => sorted.reduce((sum, c) => sum + (c.project.value ?? 0), 0),
    [sorted],
  );

  // Click cycle: asc → desc → cleared (back to default).
  const onHeaderClick = (k: SortKey) => {
    if (sortKey !== k) { setSortKey(k); setSortDir(1); return; }
    if (sortDir === 1) { setSortDir(-1); return; }
    setSortKey(null); setSortDir(1);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto px-5 pt-3 pb-2">
        <div
          className="rounded-xl border bg-card/40"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.12)" }}
        >
          {/* Header */}
          <div
            className="sticky top-0 z-10 grid items-center text-[11px] font-semibold uppercase tracking-[0.06em] rounded-t-xl"
            style={{
              gridTemplateColumns: GRID_COLS,
              backgroundColor: "hsl(var(--background))",
              color: "hsl(var(--brand-navy))",
              borderBottom: "1px solid hsl(var(--brand-navy) / 0.12)",
            }}
          >
            {COLS.map((c) => {
              // On the Completed scope the stage column is non-sortable —
              // every row is already in the terminal stage.
              const sortable = !(activeTab === "completed" && c.key === "stage");
              const isActive = sortable && sortKey === c.key;
              const Arrow = isActive ? (sortDir === 1 ? ArrowUp : ArrowDown) : null;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={sortable ? () => onHeaderClick(c.key) : undefined}
                  disabled={!sortable}
                  className={cn(
                    "h-10 px-3 inline-flex items-center gap-1 transition-colors text-left truncate",
                    sortable ? "hover:bg-[hsl(var(--brand-navy)/0.04)] cursor-pointer" : "cursor-default",
                    c.align === "right" ? "justify-end" : "justify-start",
                  )}
                  title={c.label}
                >
                  <span className="truncate">{c.label}</span>
                  {Arrow && <Arrow className="h-3 w-3 shrink-0" />}
                </button>
              );
            })}
            <div className="h-10" />
          </div>

          {/* Rows */}
          {sorted.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              No projects to show.
            </div>
          ) : (
            sorted.map((card, i) => (
              <TableRow
                key={card.id}
                index={i}
                card={card}
                activeTab={activeTab}
                isMenuOpen={menuFor === card.id}
                onMenuOpenChange={(open) => setMenuFor(open ? card.id : null)}
                onOpen={() => onOpenCard(card)}
                onToggleFlag={() => store.toggleFlag(card.project.id)}
                onEdit={() => setEditingCard(card)}
                onMoveStage={() => onOpenPicker(card)}
                onDuplicate={() => store.duplicateProject(card.project.id)}
                onArchive={() => store.moveCard(card.id, { pipeline: "sales", stage: "archive" as StageId })}
                onDelete={() => store.deleteProject(card.project.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        className="px-5 pb-3 pt-1 text-right text-[11px] tabular"
        style={{ color: "hsl(var(--brand-navy) / 0.6)" }}
      >
        {sorted.length} project{sorted.length === 1 ? "" : "s"}
        {totalAmount > 0 && <> · ${totalAmount.toLocaleString()} BBD total</>}
      </div>

      {editingCard && (
        <CardEditOverlay
          card={editingCard}
          onExit={() => setEditingCard(null)}
        />
      )}
    </div>
  );
};

interface RowProps {
  index: number;
  card: PipelineCard;
  activeTab: TabId;
  isMenuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onOpen: () => void;
  onToggleFlag: () => void;
  onEdit: () => void;
  onMoveStage: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

const TableRow = ({
  index, card, activeTab, isMenuOpen, onMenuOpenChange,
  onOpen, onToggleFlag, onEdit, onMoveStage, onDuplicate, onArchive, onDelete,
}: RowProps) => {
  const proj = card.project;
  const flagged = !!proj.flagged;
  const u = urgencyLabel(card.deadlineDate);
  const md = useMasterData();
  const supName = supplierName(proj.supplierId, md.getSupplierByAnyId) || proj.supplierLabel || "";

  // Long-press / long-click → stage picker
  const longPressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  // Single vs double click discrimination
  const clickTimer = useRef<number | null>(null);

  const startLongPress = () => {
    longPressed.current = false;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      onMoveStage();
    }, 400);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleClick = (e: ReactMouseEvent) => {
    if (longPressed.current) return; // long-press already fired
    // Defer so a second click within 250ms can cancel into double-click → flag
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onToggleFlag();
      return;
    }
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      onOpen();
    }, 220);
  };

  const handleContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    onMenuOpenChange(true);
  };

  const tone = u.tone;
  const urgencyColor =
    tone === "urgent" ? "hsl(var(--urgent))"
    : tone === "soon" ? "hsl(var(--brand-orange))"
    : tone === "none" ? "hsl(var(--muted-foreground))"
    : "hsl(var(--brand-navy))";

  const stripeBg = index % 2 === 0
    ? "transparent"
    : "hsl(var(--brand-navy) / 0.025)";

  return (
    <div
      role="row"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={startLongPress}
      onMouseUp={cancelLongPress}
      onMouseLeave={cancelLongPress}
      className={cn(
        "grid items-center text-[13px] cursor-pointer transition-colors group select-none",
        "hover:bg-[hsl(var(--brand-navy)/0.05)]",
      )}
      style={{
        gridTemplateColumns: GRID_COLS,
        minHeight: 44,
        backgroundColor: flagged ? "hsl(var(--brand-orange) / 0.05)" : stripeBg,
        borderBottom: "1px solid hsl(var(--brand-navy) / 0.06)",
        boxShadow: flagged ? "inset 3px 0 0 0 hsl(var(--brand-orange))" : "none",
        color: "hsl(var(--brand-navy))",
      }}
    >
      {/* Flag */}
      <div className="px-3 flex items-center justify-center">
        {flagged ? (
          <Flag className="h-3.5 w-3.5 fill-current" style={{ color: "hsl(var(--brand-orange))" }} />
        ) : null}
      </div>
      {/* Pipeline · Stage */}
      <Cell title={stageLabel(card, activeTab)}>
        <span className="font-medium">{stageLabel(card, activeTab)}</span>
      </Cell>
      <Cell title={proj.customer}>{proj.customer}</Cell>
      <Cell title={proj.projectName}>{proj.projectName}</Cell>
      <Cell title={proj.detailSummary?.trim() || undefined} muted={!proj.detailSummary?.trim()}>
        {proj.detailSummary?.trim() || "—"}
      </Cell>
      <Cell title={supName} muted={!supName}>{supName || "—"}</Cell>
      <Cell title={proj.quoteNumber ?? ""} muted={!proj.quoteNumber}>
        <span className="tabular">{proj.quoteNumber ?? "—"}</span>
      </Cell>
      <Cell align="right" muted={!proj.value}>
        <span className="tabular">{fmtMoney(proj.value)}</span>
      </Cell>
      <Cell muted={!proj.shippingMode}>{proj.shippingMode ?? "—"}</Cell>
      <Cell title={proj.trackingRef ?? ""} muted={!proj.trackingRef}>
        <span className="tabular">{proj.trackingRef ?? "—"}</span>
      </Cell>
      <Cell title={proj.pointPerson}>
        <span className="tabular">{repInitials(proj.pointPerson)}</span>
      </Cell>
      <Cell muted={!card.deadlineDate}>
        <span className="tabular">{fmtDeadline(card.deadlineDate)}</span>
      </Cell>
      <Cell>
        <span className="tabular" style={{ color: urgencyColor, fontWeight: tone === "urgent" ? 600 : 400 }}>
          {u.text}
        </span>
      </Cell>
      {/* Actions */}
      <div className="px-1 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <CardActionsPopover
          open={isMenuOpen}
          onOpenChange={onMenuOpenChange}
          flagged={flagged}
          onToggleFlag={onToggleFlag}
          onEdit={onEdit}
          onOpenProject={onOpen}
          onMoveStage={onMoveStage}
          onDuplicate={onDuplicate}
          onArchive={onArchive}
          onDelete={onDelete}
          trigger={
            <button
              type="button"
              aria-label="Actions"
              className="inline-flex items-center justify-center rounded-md hover:bg-[hsl(var(--brand-navy)/0.08)] text-foreground/70"
              style={{ width: 28, height: 28 }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          }
        />
      </div>
    </div>
  );
};

interface CellProps {
  children: React.ReactNode;
  title?: string;
  align?: "left" | "right";
  muted?: boolean;
}
const Cell = ({ children, title, align = "left", muted }: CellProps) => (
  <div
    className={cn(
      "px-3 py-2 truncate",
      align === "right" ? "text-right" : "text-left",
    )}
    style={muted ? { color: "hsl(var(--muted-foreground))" } : undefined}
    title={title}
  >
    {children}
  </div>
);
