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
import { getStageTitle, usePipelineStore } from "@/hooks/usePipelineStore";
import { cn } from "@/lib/utils";
import { CardActionsPopover } from "./CardActionsPopover";
import { CardEditOverlay } from "./CardEditOverlay";
import type { TabId } from "./PipelineTabs";

type SortKey =
  | "flagged" | "stage" | "customer" | "project" | "supplier"
  | "quote" | "amount" | "mode" | "tracking" | "rep" | "deadline" | "urgency";

interface Props {
  activeTab: TabId;
  visible: PipelineCard[];
  onOpenCard: (c: PipelineCard) => void;
  onOpenPicker: (c: PipelineCard) => void;
}

const TODAY = new Date(2026, 4, 8);
const DAY = 86400000;

function urgencyLabel(date?: Date): { text: string; tone: "urgent" | "soon" | "neutral" | "none"; days: number } {
  if (!date) return { text: "—", tone: "none", days: Number.POSITIVE_INFINITY };
  const diff = Math.ceil((date.getTime() - TODAY.getTime()) / DAY);
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
  if (activeTab === "all") {
    if (c.pipeline === "shipping") {
      return `${pipelineTitle} · ${c.project.shippingMode ?? "—"}`;
    }
    return `${pipelineTitle} · ${getStageTitle(c.pipeline, c.stage)}`;
  }
  if (activeTab === "shipping") {
    return c.project.shippingMode ?? "—";
  }
  return getStageTitle(c.pipeline, c.stage);
}

function supplierName(id?: string): string {
  if (!id) return "";
  return SUPPLIERS.find((s) => s.id === id)?.name ?? "";
}

function repInitials(name?: string): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function compareCards(a: PipelineCard, b: PipelineCard, key: SortKey, dir: 1 | -1): number {
  const dl = (c: PipelineCard) => c.deadlineDate?.getTime?.() ?? Number.POSITIVE_INFINITY;
  switch (key) {
    case "flagged":
      // flagged first when asc
      return dir * (Number(!!b.project.flagged) - Number(!!a.project.flagged));
    case "stage":
      return dir * (`${a.pipeline}-${a.stage}`).localeCompare(`${b.pipeline}-${b.stage}`);
    case "customer":
      return dir * a.project.customer.localeCompare(b.project.customer);
    case "project":
      return dir * a.project.projectName.localeCompare(b.project.projectName);
    case "supplier": {
      const av = supplierName(a.project.supplierId) || a.project.supplierLabel || "";
      const bv = supplierName(b.project.supplierId) || b.project.supplierLabel || "";
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

const COLS: { key: SortKey; label: string; width: string; align?: "right" | "left" }[] = [
  { key: "flagged", label: "", width: "32px" },
  { key: "stage", label: "Pipeline · Stage", width: "150px" },
  { key: "customer", label: "Customer", width: "150px" },
  { key: "project", label: "Project", width: "minmax(220px, 1.6fr)" },
  { key: "supplier", label: "Supplier", width: "130px" },
  { key: "quote", label: "Q#", width: "84px" },
  { key: "amount", label: "Amount", width: "104px", align: "right" },
  { key: "mode", label: "Mode", width: "76px" },
  { key: "tracking", label: "Tracking", width: "120px" },
  { key: "rep", label: "Rep", width: "60px" },
  { key: "deadline", label: "Deadline", width: "92px" },
  { key: "urgency", label: "Urgency", width: "100px" },
];

const GRID_COLS = COLS.map((c) => c.width).join(" ") + " 36px"; // +1 for actions

export const ProjectTable = ({ activeTab, visible, onOpenCard, onOpenPicker }: Props) => {
  const store = usePipelineStore();
  const [sortKey, setSortKey] = useState<SortKey>("deadline");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const list = [...visible].sort((a, b) => compareCards(a, b, sortKey, sortDir));
    return list;
  }, [visible, sortKey, sortDir]);

  const totalAmount = useMemo(
    () => sorted.reduce((sum, c) => sum + (c.project.value ?? 0), 0),
    [sorted],
  );

  const onHeaderClick = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(1); }
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
              const isActive = sortKey === c.key;
              const Arrow = isActive ? (sortDir === 1 ? ArrowUp : ArrowDown) : null;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => onHeaderClick(c.key)}
                  className={cn(
                    "h-10 px-3 inline-flex items-center gap-1 hover:bg-[hsl(var(--brand-navy)/0.04)] transition-colors text-left truncate",
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
                onEdit={() => setEditingId(card.project.id)}
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

      {editingId && (
        <CardEditOverlay
          projectId={editingId}
          onClose={() => setEditingId(null)}
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
  const supName = supplierName(proj.supplierId) || proj.supplierLabel || "";

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
