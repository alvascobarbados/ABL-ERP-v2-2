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
import { toast } from "sonner";
import {
  PIPELINES, PipelineCard, PipelineId, StageId, SUPPLIERS, ShippingMode,
} from "@/data/pipelines";
import { useColumnWidths } from "@/hooks/useColumnWidths";
import { ColumnResizeHandle } from "./ColumnResizeHandle";
import { EditableCell, SaveResult } from "./EditableCell";
import { EntityPicker, TeamMultiPicker } from "./EntityPicker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Pipeline order matches the chevron flow (Sales → Production → Shipping → Finance).
const PIPELINE_ORDER: Record<PipelineId, number> = {
  sales: 0, design: 1, operations: 2, shipping: 3, finance: 4,
};
// Display overrides for stages whose canonical title differs from the
// PIPELINES config (or that aren't listed there at all). "paid" must
// render Title Case; both shipping sub-stages render as "Shipping".
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

function stageLabel(c: PipelineCard, _activeTab: TabId): string {
  // Always render as "Department · State" — including redundant pairs like
  // "Shipping · Shipping" or "Design · Design". Department = team owner;
  // state = work status. Conceptually different even when labels match.
  const pipelineTitle = PIPELINES.find((p) => p.id === c.pipeline)?.title ?? c.pipeline;
  const stageTitle = displayStageTitle(c.pipeline, c.stage);
  return `${pipelineTitle} · ${stageTitle}`;
}

// Stage progression rank within each pipeline. Lower = earlier in the flow.
// Shipping collapses to a single rank (only one user-facing stage).
const STAGE_RANK: Record<StageId, number> = {
  proposal: 0, quote: 1, confirming: 2, archive: 99,
  design: 0, proof: 1,
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

export const ProjectTable = ({ activeTab, visible, onOpenCard, onOpenPicker, hasActiveFilter, onClearFilters }: Props) => {
  const store = usePipelineStore();
  const md = useMasterData();
  const cw = useColumnWidths();
  const colWidths = COLS.map((c) => cw.widthFor(c.key, c.defaultPx));
  const gridCols = colWidths.map((w) => `${w}px`).join(" ") + " 36px";
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
              gridTemplateColumns: gridCols,
              backgroundColor: "hsl(var(--background))",
              color: "hsl(var(--brand-navy))",
              borderBottom: "1px solid hsl(var(--brand-navy) / 0.12)",
            }}
          >
            {COLS.map((c) => {
              const sortable = !(activeTab === "completed" && c.key === "stage");
              const isActive = sortable && sortKey === c.key;
              const Arrow = isActive ? (sortDir === 1 ? ArrowUp : ArrowDown) : null;
              const resizable = c.resizable !== false;
              return (
                <div key={c.key} className="relative">
                  <button
                    type="button"
                    onClick={sortable ? () => onHeaderClick(c.key) : undefined}
                    disabled={!sortable}
                    className={cn(
                      "h-10 px-3 inline-flex items-center gap-1 transition-colors text-left truncate w-full",
                      sortable ? "hover:bg-[hsl(var(--brand-navy)/0.04)] cursor-pointer" : "cursor-default",
                      c.align === "right" ? "justify-end" : "justify-start",
                    )}
                    title={c.label}
                  >
                    <span className="truncate">{c.label}</span>
                    {Arrow && <Arrow className="h-3 w-3 shrink-0" />}
                  </button>
                  {resizable && (
                    <ColumnResizeHandle
                      startWidth={cw.widthFor(c.key, c.defaultPx)}
                      onChange={(w) => cw.setWidth(c.key, w)}
                      onReset={() => cw.setWidth(c.key, c.defaultPx)}
                    />
                  )}
                </div>
              );
            })}
            <div className="h-10" />
          </div>

          {/* Rows */}
          {sorted.length === 0 ? (
            hasActiveFilter ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                No projects match the current filters.
                {onClearFilters && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={onClearFilters}
                      className="underline underline-offset-4 hover:text-foreground"
                      style={{ color: "hsl(var(--brand-navy))" }}
                    >
                      Clear filters
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                No projects to show.
              </div>
            )
          ) : (
            sorted.map((card, i) => (
              <TableRow
                key={card.id}
                index={i}
                card={card}
                activeTab={activeTab}
                gridCols={gridCols}
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
  gridCols: string;
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

type EntityKindKey = "customer" | "supplier" | "rep";

const TableRow = ({
  index, card, activeTab, gridCols, isMenuOpen, onMenuOpenChange,
  onOpen, onToggleFlag, onEdit, onMoveStage, onDuplicate, onArchive, onDelete,
}: RowProps) => {
  const proj = card.project;
  const flagged = !!proj.flagged;
  const u = urgencyLabel(card.deadlineDate);
  const md = useMasterData();
  const store = usePipelineStore();
  const supName = supplierName(proj.supplierId, md.getSupplierByAnyId) || proj.supplierLabel || "";

  // ── Inline-edit state ────────────────────────────────────────────────
  // Active entity popover: which kind is open (only one at a time).
  const [openPicker, setOpenPicker] = useState<EntityKindKey | "mode" | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
  // Per-cell flash override (for entity/enum saves where popover closes first).
  const [flashCell, setFlashCell] = useState<{ key: string; tone: "success" | "error" } | null>(null);

  const flashFor = (k: string) => (flashCell?.key === k ? flashCell.tone : null);
  const triggerFlash = (k: string, tone: "success" | "error") => {
    setFlashCell({ key: k, tone });
    window.setTimeout(() => setFlashCell((cur) => (cur?.key === k ? null : cur)), 700);
  };

  // Long-press / long-click → stage picker. Disabled while a popover is open
  // OR while a cell is being edited (EditableCell stops mousedown propagation
  // on click, so this only fires on row-area presses).
  const longPressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
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

  const handleClick = (_e: ReactMouseEvent) => {
    if (longPressed.current) return;
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

  // ── Save helpers (text columns) ──────────────────────────────────────
  const saveText = async (field: keyof typeof proj, raw: string): Promise<SaveResult> => {
    const trimmed = raw.trim();
    try {
      await store.updateProject(proj.id, { [field]: trimmed || undefined } as any);
      return { ok: true };
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
      return { ok: false, reason: err?.message };
    }
  };
  const saveProjectName = async (raw: string): Promise<SaveResult> => {
    const trimmed = raw.trim();
    if (!trimmed) {
      toast.error("Project name cannot be empty");
      return { ok: false };
    }
    try {
      await store.updateProject(proj.id, { projectName: trimmed });
      return { ok: true };
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
      return { ok: false };
    }
  };
  const saveCustomer = async (raw: string): Promise<SaveResult> => {
    const trimmed = raw.trim();
    if (!trimmed) {
      toast.error("Customer cannot be empty");
      return { ok: false };
    }
    try {
      await store.updateProject(proj.id, { customer: trimmed });
      return { ok: true };
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
      return { ok: false };
    }
  };
  const saveValue = async (raw: string): Promise<SaveResult> => {
    const cleaned = raw.replace(/[^0-9.\-]/g, "");
    const n = cleaned === "" ? 0 : Number(cleaned);
    if (!Number.isFinite(n)) {
      toast.error("Enter a valid number");
      return { ok: false };
    }
    try {
      await store.updateProject(proj.id, { value: n });
      return { ok: true };
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
      return { ok: false };
    }
  };

  // ── Entity-save helpers (called from popover onPick) ─────────────────
  const pickCustomer = async (name: string) => {
    setOpenPicker(null);
    try {
      await store.updateProject(proj.id, { customer: name });
      triggerFlash("customer", "success");
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
      triggerFlash("customer", "error");
    }
  };
  const pickSupplier = async (id: string) => {
    setOpenPicker(null);
    try {
      const s = md.getSupplierByAnyId(id);
      await store.updateProject(proj.id, { supplierId: id, supplierLabel: s?.name });
      triggerFlash("supplier", "success");
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
      triggerFlash("supplier", "error");
    }
  };
  const pickSupplierMeta = async (meta: string) => {
    setOpenPicker(null);
    try {
      await store.updateProject(proj.id, { supplierId: undefined, supplierLabel: meta });
      triggerFlash("supplier", "success");
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
      triggerFlash("supplier", "error");
    }
  };
  const pickReps = async (initials: string[]) => {
    setOpenPicker(null);
    try {
      await store.updateProject(proj.id, { pointPerson: initials.join(", ") || "AV" });
      triggerFlash("rep", "success");
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
      triggerFlash("rep", "error");
    }
  };
  const pickShippingMode = async (m: ShippingMode) => {
    setOpenPicker(null);
    try {
      await store.updateProject(proj.id, { shippingMode: m });
      triggerFlash("mode", "success");
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
      triggerFlash("mode", "error");
    }
  };

  return (
    <div
      role="row"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={startLongPress}
      onMouseUp={cancelLongPress}
      onMouseLeave={cancelLongPress}
      className={cn(
        "grid items-stretch text-[13px] cursor-pointer transition-colors group select-none",
        "hover:bg-[hsl(var(--brand-navy)/0.05)]",
      )}
      style={{
        gridTemplateColumns: gridCols,
        minHeight: 44,
        backgroundColor: flagged ? "hsl(var(--brand-orange) / 0.05)" : stripeBg,
        borderBottom: "1px solid hsl(var(--brand-navy) / 0.06)",
        boxShadow: flagged ? "inset 3px 0 0 0 hsl(var(--brand-orange))" : "none",
        color: "hsl(var(--brand-navy))",
      }}
    >
      {/* Flag — read-only (toggled via row double-click) */}
      <div className="px-3 flex items-center justify-center">
        {flagged ? (
          <Flag className="h-3.5 w-3.5 fill-current" style={{ color: "hsl(var(--brand-orange))" }} />
        ) : null}
      </div>

      {/* Pipeline · Stage — read-only here; long-press opens StagePicker */}
      <ReadOnlyCell title={stageLabel(card, activeTab)}>
        <span className="font-medium">{stageLabel(card, activeTab)}</span>
      </ReadOnlyCell>

      {/* Customer — entity popover */}
      <EditableCell
        mode="custom"
        align="left"
        display={proj.customer}
        title={proj.customer}
        active={openPicker === "customer"}
        flash={flashFor("customer")}
        onActivate={(el) => { setPickerAnchor(el); setOpenPicker("customer"); }}
      />

      {/* Project name — text */}
      <EditableCell
        mode="text"
        align="left"
        display={proj.projectName}
        title={proj.projectName}
        value={proj.projectName}
        onCommit={saveProjectName}
      />

      {/* Detail summary — text */}
      <EditableCell
        mode="text"
        align="left"
        display={proj.detailSummary?.trim() || "—"}
        title={proj.detailSummary?.trim() || undefined}
        muted={!proj.detailSummary?.trim()}
        value={proj.detailSummary ?? ""}
        placeholder="Add detail…"
        onCommit={(v) => saveText("detailSummary", v)}
      />

      {/* Supplier — entity popover */}
      <EditableCell
        mode="custom"
        align="left"
        display={supName || "—"}
        title={supName}
        muted={!supName}
        active={openPicker === "supplier"}
        flash={flashFor("supplier")}
        onActivate={(el) => { setPickerAnchor(el); setOpenPicker("supplier"); }}
      />

      {/* Quote # — text */}
      <EditableCell
        mode="text"
        align="left"
        display={<span className="tabular">{proj.quoteNumber ?? "—"}</span>}
        title={proj.quoteNumber ?? ""}
        muted={!proj.quoteNumber}
        value={proj.quoteNumber ?? ""}
        placeholder="Q#"
        onCommit={(v) => saveText("quoteNumber", v)}
      />

      {/* Amount — number */}
      <EditableCell
        mode="number"
        align="right"
        display={<span className="tabular">{fmtMoney(proj.value)}</span>}
        muted={!proj.value}
        value={proj.value ? String(proj.value) : ""}
        placeholder="0"
        onCommit={saveValue}
      />

      {/* Mode — enum popover */}
      <ModeCell
        value={proj.shippingMode}
        active={openPicker === "mode"}
        flash={flashFor("mode")}
        onActivate={(el) => { setPickerAnchor(el); setOpenPicker("mode"); }}
        onPick={pickShippingMode}
        open={openPicker === "mode"}
        onClose={() => setOpenPicker(null)}
        anchorEl={pickerAnchor}
      />

      {/* Tracking — text */}
      <EditableCell
        mode="text"
        align="left"
        display={<span className="tabular">{proj.trackingRef ?? "—"}</span>}
        title={proj.trackingRef ?? ""}
        muted={!proj.trackingRef}
        value={proj.trackingRef ?? ""}
        placeholder="Tracking"
        onCommit={(v) => saveText("trackingRef", v)}
      />

      {/* Rep — multi popover */}
      <EditableCell
        mode="custom"
        align="left"
        display={<span className="tabular">{repInitials(proj.pointPerson)}</span>}
        title={proj.pointPerson}
        active={openPicker === "rep"}
        flash={flashFor("rep")}
        onActivate={(el) => { setPickerAnchor(el); setOpenPicker("rep"); }}
      />

      {/* Deadline — read-only (date picker lives in CardEditOverlay) */}
      <ReadOnlyCell muted={!card.deadlineDate}>
        <span className="tabular">{fmtDeadline(card.deadlineDate)}</span>
      </ReadOnlyCell>

      {/* Urgency — read-only computed */}
      <ReadOnlyCell>
        <span className="tabular" style={{ color: urgencyColor, fontWeight: tone === "urgent" ? 600 : 400 }}>
          {u.text}
        </span>
      </ReadOnlyCell>

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

      {/* ── Anchored popovers (rendered once per row, only one open at a time) ── */}
      {openPicker === "customer" && (
        <EntityPicker
          open
          onClose={() => setOpenPicker(null)}
          kind="customer"
          presentation="popover"
          anchorEl={pickerAnchor}
          selectedId={proj.customer}
          onPick={pickCustomer}
        />
      )}
      {openPicker === "supplier" && (
        <EntityPicker
          open
          onClose={() => setOpenPicker(null)}
          kind="supplier"
          presentation="popover"
          anchorEl={pickerAnchor}
          selectedId={proj.supplierId}
          selectedMeta={proj.supplierLabel}
          onPick={pickSupplier}
          onPickMeta={pickSupplierMeta}
        />
      )}
      {openPicker === "rep" && (
        <TeamMultiPicker
          open
          onClose={() => setOpenPicker(null)}
          presentation="popover"
          anchorEl={pickerAnchor}
          selected={parseInitialsList(proj.pointPerson)}
          onConfirm={pickReps}
        />
      )}
    </div>
  );
};

// Parse "AV, RC" → ["AV","RC"] for TeamMultiPicker.
function parseInitialsList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
}

// ── Read-only cell (Pipeline·Stage, Deadline, Urgency) ─────────────────
interface ReadOnlyCellProps {
  children: React.ReactNode;
  title?: string;
  align?: "left" | "right";
  muted?: boolean;
}
const ReadOnlyCell = ({ children, title, align = "left", muted }: ReadOnlyCellProps) => (
  <div
    className={cn(
      "px-3 py-2 truncate flex items-center",
      align === "right" ? "justify-end text-right" : "justify-start text-left",
    )}
    style={muted ? { color: "hsl(var(--muted-foreground))" } : undefined}
    title={title}
  >
    <span className="truncate w-full">{children}</span>
  </div>
);

// ── Mode cell (Air / Ocean / Local enum popover) ──────────────────────
interface ModeCellProps {
  value: ShippingMode | undefined;
  active: boolean;
  flash: "success" | "error" | null;
  onActivate: (el: HTMLElement) => void;
  onPick: (m: ShippingMode) => void;
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
}
const ModeCell = ({ value, active, flash, onActivate, onPick, open, onClose, anchorEl }: ModeCellProps) => {
  return (
    <>
      <EditableCell
        mode="custom"
        align="left"
        display={value ?? "—"}
        muted={!value}
        active={active}
        flash={flash}
        onActivate={onActivate}
      />
      {open && (
        <Popover open onOpenChange={(o) => { if (!o) onClose(); }}>
          <PopoverTrigger asChild>
            <span
              style={{
                position: "fixed",
                left: anchorEl?.getBoundingClientRect().left ?? 0,
                top: anchorEl?.getBoundingClientRect().bottom ?? 0,
                width: anchorEl?.getBoundingClientRect().width ?? 0,
                height: 0,
                pointerEvents: "none",
              }}
            />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={2}
            className="w-[160px] p-1.5"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {(["Air", "Ocean", "Local"] as ShippingMode[]).map((m) => (
              <button
                key={m}
                onClick={() => onPick(m)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-[13px] hover:bg-muted/60 transition-colors",
                  value === m && "bg-muted/60 font-medium",
                )}
                style={{ color: "hsl(var(--brand-navy))" }}
              >
                {m}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </>
  );
};

