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
import { Flag, MoreHorizontal, ArrowUp, ArrowDown, Plane, Waves, MapPin } from "lucide-react";
import { toast } from "sonner";
import {
  PIPELINES, PipelineCard, PipelineId, StageId, SUPPLIERS, ShippingMode,
} from "@/data/pipelines";
import { useColumnWidths } from "@/hooks/useColumnWidths";
import { ColumnResizeHandle } from "./ColumnResizeHandle";
import { EditableCell, SaveResult, SelectionProvider } from "./EditableCell";
import { EntityPicker, TeamMultiPicker } from "./EntityPicker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Pipeline order matches the chevron flow (Sales → Design → Purchasing → Production → Shipping → Finance → Completed).
const PIPELINE_ORDER: Record<PipelineId, number> = {
  sales: 0, design: 1, purchasing: 2, production: 3, shipping: 4, finance: 5, completed: 6,
  operations: 3, // legacy alias — same slot as production
};
// Display overrides for stages whose canonical title differs from the
// PIPELINES config (or that aren't listed there at all). "paid" is a
// legacy stage shown as Title Case; both shipping sub-stages render as
// "Shipping". "completed" already has "Completed" in PIPELINES.
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
import { pipelineAccent } from "@/lib/brand";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { CardActionsPopover } from "./CardActionsPopover";
import { CardEditOverlay } from "./CardEditOverlay";
import { TrackingEditor } from "./EditorSheets";
import { ConfirmDialog } from "./ConfirmDialog";
import type { TabId } from "./PipelineTabs";
import { useColumnVisibility, type ColumnId } from "@/hooks/useColumnVisibility";

type SortKey =
  | "flagged" | "stage" | "customer" | "project" | "detail" | "supplier"
  | "quote" | "po" | "invoice" | "amount" | "balance"
  | "designBrief" | "completionDate"
  | "weight" | "cbm" | "pkgs" | "mode" | "tracking" | "rep" | "deadline";

interface Props {
  activeTab: TabId;
  visible: PipelineCard[];
  onOpenCard: (c: PipelineCard) => void;
  onOpenPicker: (c: PipelineCard) => void;
  /** Inline stage transition from the Stage·State popover. Reuses Index.performMove. */
  onPickStage?: (card: PipelineCard, target: { pipeline: PipelineId; stage: StageId }) => void;
  hasActiveFilter?: boolean;
  onClearFilters?: () => void;
  /** When true (sub-chevron stage selected), drop the Stage column entirely. */
  hideStageColumn?: boolean;
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
  sourcing: 0, proposal: 1, quote: 2, confirming: 3, archive: 99,
  design: 0, proof: 1,
  purchasing: 0, production: 0,
  preproduction: 0, in_production: 1, // legacy
  shipment_required: 0, shipment_assigned: 0,
  invoice_required: 0, invoiced: 1, paid: 2,
  completed: 0,
};

// Number of user-facing stages per pipeline (used for shade ramp).
// Single-state pipelines stay at full saturation.
const STAGE_COUNT: Record<PipelineId, number> = {
  sales: 4, design: 2, purchasing: 1, production: 1,
  shipping: 1, finance: 2, completed: 1, operations: 1,
};

/** Shade strength 0..1 — earlier stages lighter, later stages full saturation. */
function stageShade(pipeline: PipelineId, stage: StageId): number {
  const total = STAGE_COUNT[pipeline] ?? 1;
  if (total <= 1) return 1;
  // For finance, "paid" is index 2 (full); for sales, confirming is index 2.
  const idx = STAGE_RANK[stage] ?? 0;
  const min = 0.3;
  return Math.min(1, min + ((1 - min) * idx) / (total - 1));
}

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
    case "amount": {
      const av = a.project.value, bv = b.project.value;
      if (!av && bv) return 1;
      if (av && !bv) return -1;
      return dir * ((av ?? 0) - (bv ?? 0));
    }
    case "weight": {
      const av = a.project.weightKg, bv = b.project.weightKg;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return dir * (av - bv);
    }
    case "cbm": {
      const av = a.project.cbm, bv = b.project.cbm;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return dir * (av - bv);
    }
    case "pkgs": {
      const av = a.project.numPackages, bv = b.project.numPackages;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return dir * (av - bv);
    }
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
  }
}

// Each entry has a default pixel width AND a flexible flag. The "project"
// column historically used `minmax(220px, 1.6fr)` to absorb leftover space;
// now that columns are individually resizable we keep all widths in pixels
// and let the table grow horizontally if the user widens columns past the
// viewport (overflow-auto on the wrapper handles it).
const ALL_COLS: { key: SortKey; label: string; defaultPx: number; align?: "right" | "left"; resizable?: boolean }[] = [
  { key: "flagged", label: "", defaultPx: 32, resizable: false },
  { key: "stage", label: "Stage · State", defaultPx: 150 },
  { key: "customer", label: "Customer", defaultPx: 160 },
  { key: "project", label: "Project", defaultPx: 280 },
  { key: "detail", label: "Detail", defaultPx: 180 },
  { key: "supplier", label: "Supplier", defaultPx: 130 },
  { key: "quote", label: "Q#", defaultPx: 84 },
  { key: "amount", label: "Amount", defaultPx: 104, align: "right" },
  { key: "weight", label: "Weight", defaultPx: 80, align: "right" },
  { key: "cbm", label: "CBM", defaultPx: 70, align: "right" },
  { key: "pkgs", label: "Pkgs", defaultPx: 60, align: "right" },
  { key: "mode", label: "Mode", defaultPx: 96 },
  { key: "tracking", label: "Tracking", defaultPx: 120 },
  { key: "rep", label: "Rep", defaultPx: 60 },
  { key: "deadline", label: "Deadline", defaultPx: 120 },
];

export const ProjectTable = ({ activeTab, visible, onOpenCard, onOpenPicker, onPickStage, hasActiveFilter, onClearFilters, hideStageColumn: _ignored }: Props) => {
  const store = usePipelineStore();
  const md = useMasterData();
  const cw = useColumnWidths();
  // Stage column is now ALWAYS shown — the redundancy with sub-chevron is
  // intentional (consistent column set across filtered & unfiltered views).
  const COLS = ALL_COLS;
  const colWidths = COLS.map((c) => cw.widthFor(c.key, c.defaultPx));
  const gridCols = colWidths.map((w) => `${w}px`).join(" ") + " 36px";
  const totalWidth = colWidths.reduce((a, b) => a + b, 0) + 36;
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

  const tableRootRef = useRef<HTMLDivElement>(null);

  return (
    <SelectionProvider outsideRef={tableRootRef}>
    <TooltipProvider delayDuration={300}>
    <div className="flex-1 min-h-0 min-w-0 flex flex-col">
      <div className="flex-1 min-h-0 min-w-0 flex flex-col px-6 lg:px-8 pt-3 pb-0 overflow-hidden">
        <div
          ref={tableRootRef}
          className="border flex-1 min-h-0 overflow-auto"
          style={{
            borderColor: "hsl(var(--brand-navy) / 0.08)",
            borderBottom: "none",
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            backgroundColor: "#FFFFFF",
            padding: "16px 16px 0 16px",
          }}
        >
          <div style={{ minWidth: totalWidth }}>
          {/* Header — sticky; full-width band */}
          <div
            className="sticky z-20 grid items-center border-b"
            style={{
              top: -16, // offset container's 16px top padding so header pins flush
              gridTemplateColumns: gridCols,
              backgroundColor: "#FFFFFF",
              borderColor: "hsl(var(--brand-navy) / 0.08)",
            }}
          >

            {COLS.map((c, idx) => {
              const sortable = !(activeTab === "completed" && c.key === "stage");
              const isActive = sortable && sortKey === c.key;
              const Arrow = isActive ? (sortDir === 1 ? ArrowUp : ArrowDown) : null;
              const resizable = c.resizable !== false;
              const isLast = idx === COLS.length - 1;
              return (
                <div
                  key={c.key}
                  className="relative"
                  style={!isLast ? { boxShadow: "inset -1px 0 0 0 rgba(27,42,78,0.12)" } : undefined}
                >
                  <button
                    type="button"
                    onClick={sortable ? () => onHeaderClick(c.key) : undefined}
                    disabled={!sortable}
                    className={cn(
                      "h-10 px-4 inline-flex items-center gap-1 transition-colors truncate w-full text-[11px] font-semibold uppercase",
                      sortable ? "hover:text-[hsl(var(--brand-navy))] cursor-pointer" : "cursor-default",
                      c.key === "flagged"
                        ? "justify-center"
                        : c.align === "right" ? "justify-end text-left" : "justify-start text-left",
                    )}
                    style={{ color: "hsl(var(--brand-navy) / 0.55)", letterSpacing: "0.06em" }}
                    title={c.key === "flagged" ? "Flag" : c.label}
                  >
                    {c.key === "flagged" ? (
                      <Flag className="h-3.5 w-3.5 shrink-0" aria-label="Flag" />
                    ) : (
                      <span className="truncate">{c.label}</span>
                    )}
                    {Arrow && <Arrow className="h-3 w-3 shrink-0" style={{ opacity: 1, color: "hsl(var(--brand-navy))" }} />}
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
                onPickStage={onPickStage}
                onDuplicate={() => store.duplicateProject(card.project.id)}
                onArchive={() => store.moveCard(card.id, { pipeline: "sales", stage: "archive" as StageId })}
                onDelete={() => store.deleteProject(card.project.id)}
              />

            ))
          )}
          </div>
          {/* Footer — inside the white container */}
          <div
            className="text-right text-[12px] tabular"
            style={{
              color: "hsl(var(--brand-navy) / 0.6)",
              marginTop: 14,
              paddingBottom: 12,
            }}
          >
            {sorted.length} project{sorted.length === 1 ? "" : "s"}
            {totalAmount > 0 && <> · ${totalAmount.toLocaleString()} BBD total</>}
          </div>
        </div>
      </div>

      {editingCard && (
        <CardEditOverlay
          card={editingCard}
          onExit={() => setEditingCard(null)}
        />
      )}
    </div>
    </TooltipProvider>
    </SelectionProvider>
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
  onPickStage?: (card: PipelineCard, target: { pipeline: PipelineId; stage: StageId }) => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

type EntityKindKey = "customer" | "supplier" | "rep";

const TableRow = ({
  index, card, activeTab, gridCols, isMenuOpen, onMenuOpenChange,
  onOpen, onToggleFlag, onEdit, onMoveStage, onPickStage, onDuplicate, onArchive, onDelete,
}: RowProps) => {
  const proj = card.project;
  const flagged = !!proj.flagged;
  const u = urgencyLabel(card.deadlineDate);
  const md = useMasterData();
  const store = usePipelineStore();
  const supName = supplierName(proj.supplierId, md.getSupplierByAnyId) || proj.supplierLabel || "";

  // ── Inline-edit state ────────────────────────────────────────────────
  // Active entity popover: which kind is open (only one at a time).
  const [openPicker, setOpenPicker] = useState<EntityKindKey | "mode" | "stage" | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
  // Per-cell flash override (for entity/enum saves where popover closes first).
  const [flashCell, setFlashCell] = useState<{ key: string; tone: "success" | "error" } | null>(null);

  const flashFor = (k: string) => (flashCell?.key === k ? flashCell.tone : null);
  const triggerFlash = (k: string, tone: "success" | "error") => {
    setFlashCell({ key: k, tone });
    window.setTimeout(() => setFlashCell((cur) => (cur?.key === k ? null : cur)), 700);
  };

  // Long-press → stage picker. Disabled while a popover is open OR while a
  // cell is being edited (EditableCell stops mousedown propagation, so this
  // only fires on row-area presses outside cells).
  const longPressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

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

  // Single-click on row whitespace (not on a cell) → open detail.
  // Cells stop propagation, so this only fires on margins / read-only gutters.
  // Double-click no longer toggles flag — that gesture is reserved for cells.
  const handleClick = (_e: ReactMouseEvent) => {
    if (longPressed.current) return;
    onOpen();
  };

  const handleContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    onMenuOpenChange(true);
  };

  const tone = u.tone;
  const accent = pipelineAccent(card.pipeline);
  const stageOnly = displayStageTitle(card.pipeline, card.stage);

  const stripeBg = index % 2 === 0
    ? "transparent"
    : "hsl(var(--brand-navy) / 0.018)";

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
  // Numeric shipping fields. Empty input → clear to undefined. Negatives rejected silently.
  const saveNumberField = (field: "weightKg" | "cbm" | "numPackages", integer: boolean) =>
    async (raw: string): Promise<SaveResult> => {
      const re = integer ? /[^\d]/g : /[^\d.]/g;
      const cleaned = (raw ?? "").replace(re, "");
      try {
        if (cleaned === "") {
          await store.updateProject(proj.id, { [field]: undefined } as any);
          return { ok: true };
        }
        const n = Number(cleaned);
        if (!Number.isFinite(n) || n < 0) return { ok: false };
        const value = integer ? Math.floor(n) : n;
        await store.updateProject(proj.id, { [field]: value } as any);
        return { ok: true };
      } catch (err: any) {
        toast.error(err?.message ?? "Save failed");
        return { ok: false, reason: err?.message };
      }
    };
  const saveWeight = saveNumberField("weightKg", false);
  const saveCbm = saveNumberField("cbm", false);
  const savePackages = saveNumberField("numPackages", true);

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
      await store.updateProject(proj.id, { supplierId: id, supplierLabel: undefined });
      triggerFlash("supplier", "success");
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
      triggerFlash("supplier", "error");
    }
  };
  const pickSupplierMeta = async (meta: string) => {
    setOpenPicker(null);
    try {
      const label = meta === "TBD" || meta === "Various" ? meta : undefined;
      await store.updateProject(proj.id, { supplierId: undefined, supplierLabel: label });
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
    if (m === proj.shippingMode) return;
    const hasTracking = !!proj.trackingRef && proj.trackingRef.trim() !== "";
    const apply = async (clearTracking: boolean) => {
      try {
        const patch: any = { shippingMode: m };
        if (clearTracking || m === "Local") patch.trackingRef = undefined;
        await store.updateProject(proj.id, patch);
        triggerFlash("mode", "success");
      } catch (err: any) {
        toast.error(err?.message ?? "Save failed");
        triggerFlash("mode", "error");
      }
    };
    if (hasTracking) {
      setModeChangeConfirm({ from: proj.shippingMode, to: m, tracking: proj.trackingRef! });
      return;
    }
    apply(false);
  };

  // Mode-change confirmation state (when tracking would be cleared).
  const [modeChangeConfirm, setModeChangeConfirm] = useState<
    { from: ShippingMode | undefined; to: ShippingMode; tracking: string } | null
  >(null);
  // Tracking editor (BottomSheet) — opened from inline cell click.
  const [trackingEditorOpen, setTrackingEditorOpen] = useState(false);
  const saveTracking = async (v: string | null) => {
    setTrackingEditorOpen(false);
    try {
      await store.updateProject(proj.id, { trackingRef: v ?? undefined });
      triggerFlash("trackingRef", "success");
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
      triggerFlash("trackingRef", "error");
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
        "grid items-stretch text-[13.5px] cursor-pointer transition-colors group select-none relative",
        "hover:bg-[hsl(var(--brand-orange)/0.045)]",
      )}
      style={{
        gridTemplateColumns: gridCols,
        minHeight: 44,
        backgroundColor: flagged ? "hsl(var(--brand-orange) / 0.05)" : stripeBg,
        borderBottom: "1px solid hsl(var(--brand-navy) / 0.05)",
        boxShadow: `inset 4px 0 0 0 ${flagged ? "hsl(var(--brand-orange))" : accent}`,
        color: "hsl(var(--brand-navy))",
      }}
    >
      {/* Flag — single click toggles (special-case column) */}
      <div
        className="px-3 flex items-center justify-center cursor-pointer hover:bg-[hsl(var(--brand-orange)/0.08)]"
        onClick={(e) => { e.stopPropagation(); onToggleFlag(); }}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        title={flagged ? "Unflag" : "Flag"}
      >
        {flagged ? (
          <Flag className="h-3.5 w-3.5 fill-current" style={{ color: "hsl(var(--brand-orange))" }} />
        ) : (
          <Flag className="h-3.5 w-3.5 opacity-0 hover:opacity-30" style={{ color: "hsl(var(--brand-orange))" }} />
        )}
      </div>

      {/* Stage · State — inline-editable pill. Three-state cell; popover lists all stages. */}
      <StageCell
        cellKey={`${card.id}:stage`}
        pipeline={card.pipeline}
        stage={card.stage}
        accent={accent}
        active={openPicker === "stage"}
        flash={flashFor("stage")}
        onActivate={(el) => { setPickerAnchor(el); setOpenPicker("stage"); }}
        open={openPicker === "stage"}
        onClose={() => setOpenPicker(null)}
        anchorEl={pickerAnchor}
        onPick={(target) => {
          setOpenPicker(null);
          if (target.pipeline === card.pipeline && target.stage === card.stage) return;
          if (onPickStage) {
            onPickStage(card, target);
          } else {
            store.moveCard(card.id, target);
          }
          triggerFlash("stage", "success");
        }}
      />

      {/* Customer — entity popover (primary anchor: medium weight, slightly larger) */}
      <EditableCell
        cellKey={`${card.id}:customer`}
        mode="custom"
        align="left"
        display={<span className="font-semibold text-[13.5px] truncate block">{proj.customer}</span>}
        title={proj.customer}
        active={openPicker === "customer"}
        flash={flashFor("customer")}
        onActivate={(el) => { setPickerAnchor(el); setOpenPicker("customer"); }}
      />

      {/* Project name — text */}
      <EditableCell
        cellKey={`${card.id}:projectName`}
        mode="text"
        align="left"
        display={proj.projectName}
        title={proj.projectName}
        value={proj.projectName}
        onCommit={saveProjectName}
      />

      {/* Detail summary — text */}
      <EditableCell
        cellKey={`${card.id}:detailSummary`}
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
        cellKey={`${card.id}:supplier`}
        mode="custom"
        align="left"
        display={supName || "—"}
        title={supName}
        muted={!supName}
        active={openPicker === "supplier"}
        flash={flashFor("supplier")}
        onActivate={(el) => { setPickerAnchor(el); setOpenPicker("supplier"); }}
      />

      {/* Quote # — text with fixed "Q-" prefix in edit mode */}
      <EditableCell
        cellKey={`${card.id}:quoteNumber`}
        mode="text"
        align="left"
        display={<span className="tabular">{proj.quoteNumber ? `Q-${proj.quoteNumber}` : "—"}</span>}
        title={proj.quoteNumber ? `Q-${proj.quoteNumber}` : ""}
        muted={!proj.quoteNumber}
        value={proj.quoteNumber ?? ""}
        placeholder="####"
        prefix="Q-"
        onCommit={(v) => {
          const trimmed = v.replace(/^\s*Q-?/i, "").replace(/\D/g, "").trim();
          return saveText("quoteNumber", trimmed);
        }}
      />

      {/* Amount — number, proportional visual weight */}
      <EditableCell
        cellKey={`${card.id}:value`}
        mode="number"
        align="right"
        display={
          <span
            className="tabular"
            style={{
              opacity: !proj.value ? 0.55 : 1,
              fontWeight: (proj.value ?? 0) >= 10000 ? 600 : 400,
              color: (proj.value ?? 0) >= 10000 ? "hsl(var(--brand-navy))" : undefined,
            }}
          >
            {fmtMoney(proj.value)}
          </span>
        }
        muted={!proj.value}
        value={proj.value ? String(proj.value) : ""}
        placeholder="0"
        onCommit={saveValue}
      />

      {/* Weight (kg) — numeric, decimals allowed */}
      <EditableCell
        cellKey={`${card.id}:weightKg`}
        mode="number"
        align="right"
        display={<span className="tabular">{proj.weightKg != null ? String(proj.weightKg) : "—"}</span>}
        muted={proj.weightKg == null}
        value={proj.weightKg != null ? String(proj.weightKg) : ""}
        placeholder="0"
        onCommit={saveWeight}
      />

      {/* CBM — numeric, decimals allowed */}
      <EditableCell
        cellKey={`${card.id}:cbm`}
        mode="number"
        align="right"
        display={<span className="tabular">{proj.cbm != null ? String(proj.cbm) : "—"}</span>}
        muted={proj.cbm == null}
        value={proj.cbm != null ? String(proj.cbm) : ""}
        placeholder="0"
        onCommit={saveCbm}
      />

      {/* Pkgs — integer */}
      <EditableCell
        cellKey={`${card.id}:numPackages`}
        mode="number"
        align="right"
        display={<span className="tabular">{proj.numPackages != null ? String(proj.numPackages) : "—"}</span>}
        muted={proj.numPackages == null}
        value={proj.numPackages != null ? String(proj.numPackages) : ""}
        placeholder="0"
        onCommit={savePackages}
      />

      {/* Mode — enum popover */}
      <ModeCell
        cellKey={`${card.id}:mode`}
        value={proj.shippingMode}
        active={openPicker === "mode"}
        flash={flashFor("mode")}
        onActivate={(el) => { setPickerAnchor(el); setOpenPicker("mode"); }}
        onPick={pickShippingMode}
        open={openPicker === "mode"}
        onClose={() => setOpenPicker(null)}
        anchorEl={pickerAnchor}
      />

      {/* Tracking — opens BottomSheet TrackingEditor; disabled until Mode is set */}
      <TrackingCellTrigger
        value={proj.trackingRef}
        modeSet={!!proj.shippingMode}
        flash={flashFor("trackingRef")}
        onClick={() => proj.shippingMode && setTrackingEditorOpen(true)}
      />

      {/* Rep — multi popover */}
      <EditableCell
        cellKey={`${card.id}:rep`}
        mode="custom"
        align="left"
        display={<span className="tabular">{repInitials(proj.pointPerson)}</span>}
        title={proj.pointPerson}
        active={openPicker === "rep"}
        flash={flashFor("rep")}
        onActivate={(el) => { setPickerAnchor(el); setOpenPicker("rep"); }}
      />

      {/* Deadline — date + urgency dot (combined) */}
      <ReadOnlyCell muted={!card.deadlineDate}>
        {card.deadlineDate ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1.5 truncate">
                {tone === "urgent" || tone === "soon" ? (
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: tone === "urgent" ? "hsl(var(--urgent))" : "hsl(var(--brand-orange))",
                      boxShadow: tone === "urgent" ? "0 0 0 2px hsl(var(--urgent) / 0.18)" : "0 0 0 2px hsl(var(--brand-orange) / 0.18)",
                    }}
                    aria-hidden
                  />
                ) : null}
                <span
                  className="tabular"
                  style={{
                    color: tone === "urgent" ? "hsl(var(--urgent))" : undefined,
                    fontWeight: tone === "urgent" ? 600 : 400,
                  }}
                >
                  {fmtDeadline(card.deadlineDate)}
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{u.text}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="tabular">—</span>
        )}
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

      {/* Tracking editor sheet (mode-gated, format-enforced) */}
      <TrackingEditor
        open={trackingEditorOpen}
        onClose={() => setTrackingEditorOpen(false)}
        shippingMode={proj.shippingMode}
        value={proj.trackingRef ?? ""}
        onSave={saveTracking}
      />

      {/* Mode-change confirmation when tracking would be cleared */}
      <ConfirmDialog
        open={!!modeChangeConfirm}
        title="Change shipping mode?"
        description={
          modeChangeConfirm
            ? `Changing mode from ${modeChangeConfirm.from ?? "—"} to ${modeChangeConfirm.to} will clear the current tracking number (${modeChangeConfirm.tracking}).`
            : ""
        }
        confirmLabel="Confirm and Clear"
        cancelLabel="Cancel"
        onCancel={() => setModeChangeConfirm(null)}
        onConfirm={async () => {
          if (!modeChangeConfirm) return;
          const m = modeChangeConfirm.to;
          setModeChangeConfirm(null);
          try {
            await store.updateProject(proj.id, { shippingMode: m, trackingRef: undefined });
            triggerFlash("mode", "success");
          } catch (err: any) {
            toast.error(err?.message ?? "Save failed");
            triggerFlash("mode", "error");
          }
        }}
      />
    </div>
  );
};

// ── Tracking cell trigger (opens BottomSheet; disabled when no Mode) ──
interface TrackingCellTriggerProps {
  value: string | undefined;
  modeSet: boolean;
  flash: "success" | "error" | null;
  onClick: () => void;
}
const TrackingCellTrigger = ({ value, modeSet, flash, onClick }: TrackingCellTriggerProps) => {
  const ringStyle: React.CSSProperties =
    flash === "success" ? { boxShadow: "inset 0 0 0 2px hsl(var(--brand-navy) / 0.5)", backgroundColor: "hsl(140 50% 50% / 0.12)" }
    : flash === "error" ? { boxShadow: "inset 0 0 0 2px hsl(var(--urgent))", backgroundColor: "hsl(0 70% 50% / 0.10)" }
    : {};
  const cell = (
    <div
      onClick={(e) => { e.stopPropagation(); if (modeSet) onClick(); }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        "relative px-3 py-1.5 truncate transition-colors h-full flex items-center justify-start text-left",
        modeSet ? "hover:bg-[hsl(var(--brand-navy)/0.06)] cursor-pointer" : "cursor-not-allowed",
      )}
      style={{
        ...ringStyle,
        color: !value || !modeSet ? "hsl(var(--brand-navy) / 0.28)" : undefined,
      }}
      title={!modeSet ? undefined : (value ?? "")}
    >
      <span className="truncate w-full tabular">{value ?? "—"}</span>
    </div>
  );
  if (modeSet) return cell;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{cell}</TooltipTrigger>
      <TooltipContent side="top">Set Mode first to enable Tracking</TooltipContent>
    </Tooltip>
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
      "px-3 py-1.5 truncate flex items-center",
      align === "right" ? "justify-end text-right" : "justify-start text-left",
    )}
    style={muted ? { color: "hsl(var(--brand-navy) / 0.28)" } : undefined}
    title={title}
  >
    <span className="truncate w-full">{children}</span>
  </div>
);

// ── Mode cell (Air / Ocean / Local enum popover) ──────────────────────
interface ModeCellProps {
  cellKey: string;
  value: ShippingMode | undefined;
  active: boolean;
  flash: "success" | "error" | null;
  onActivate: (el: HTMLElement) => void;
  onPick: (m: ShippingMode) => void;
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
}
const ModeCell = ({ cellKey, value, active, flash, onActivate, onPick, open, onClose, anchorEl }: ModeCellProps) => {
  return (
    <>
      <EditableCell
        cellKey={cellKey}
        mode="custom"
        align="left"
        display={value ? <ModeBadge mode={value} /> : "—"}
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
                  "w-full text-left px-3 py-2 rounded-md text-[13px] hover:bg-muted/60 transition-colors flex items-center gap-2",
                  value === m && "bg-muted/60 font-medium",
                )}
                style={{ color: "hsl(var(--brand-navy))" }}
              >
                <ModeBadge mode={m} />
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </>
  );
};

// ── Stage · State pill ────────────────────────────────────────────────
// Compact pill: "Sales · Quote". Background tint and text color shade
// from light to full saturation as the stage progresses through its pipeline.
const StageStatePill = ({
  pipeline, stage, accent,
}: { pipeline: PipelineId; stage: StageId; accent: string }) => {
  const pipelineTitle = PIPELINES.find((p) => p.id === pipeline)?.title ?? pipeline;
  const stageTitle = displayStageTitle(pipeline, stage);
  const shade = stageShade(pipeline, stage); // 0..1
  // Background tint stays in 12-15% range; text color stays at full pipeline accent.
  const bgPct = Math.round(12 + shade * 3); // 12% → 15%
  return (
    <span
      className="inline-flex items-center max-w-full truncate rounded-[6px] tabular"
      style={{
        minHeight: 26,
        padding: "4px 8px",
        fontSize: 13,
        fontWeight: 600,
        backgroundColor: `color-mix(in srgb, ${accent} ${bgPct}%, transparent)`,
        color: accent,
        letterSpacing: "0.005em",
      }}
    >
      <span className="truncate">{pipelineTitle} · {stageTitle}</span>
    </span>
  );
};

// ── Mode badge (Air = green plane, Ocean = blue waves, Local = orange pin) ──
const MODE_STYLE: Record<ShippingMode, { hex: string; Icon: typeof Plane; label: string }> = {
  Air:   { hex: "#3F7B4F", Icon: Plane, label: "Air" },     // forest green
  Ocean: { hex: "#2F6BA8", Icon: Waves, label: "Ocean" },   // ocean blue
  Local: { hex: "#E97B2C", Icon: MapPin, label: "Local" },  // brand orange
};
const ModeBadge = ({ mode }: { mode: ShippingMode }) => {
  const { hex, Icon, label } = MODE_STYLE[mode];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[5px]"
      style={{
        height: 22,
        padding: "0 8px",
        fontSize: 11.5,
        fontWeight: 500,
        backgroundColor: `color-mix(in srgb, ${hex} 14%, transparent)`,
        color: hex,
      }}
    >
      <Icon style={{ width: 12, height: 12 }} />
      {label}
    </span>
  );
};


// ── Stage · State cell (inline-editable) ─────────────────────────────
// Three-state EditableCell wrapping the StageStatePill, with a popover
// listing all stages grouped by pipeline. Mirrors the ModeCell pattern.
interface StageCellProps {
  cellKey: string;
  pipeline: PipelineId;
  stage: StageId;
  accent: string;
  active: boolean;
  flash: "success" | "error" | null;
  onActivate: (el: HTMLElement) => void;
  onPick: (target: { pipeline: PipelineId; stage: StageId }) => void;
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
}

// User-facing stage list per pipeline (Shipping collapses to one row).
const STAGE_PICKER_GROUPS: { pipeline: PipelineId; stages: { id: StageId; title: string }[] }[] = [
  { pipeline: "sales",      stages: [{ id: "sourcing", title: "Sourcing" }, { id: "proposal", title: "Proposal" }, { id: "quote", title: "Quote" }, { id: "confirming", title: "Confirming" }] },
  { pipeline: "design",     stages: [{ id: "design", title: "Design" }, { id: "proof", title: "Proof" }] },
  { pipeline: "purchasing", stages: [{ id: "purchasing", title: "Purchasing" }] },
  { pipeline: "production", stages: [{ id: "production", title: "Production" }] },
  { pipeline: "shipping",   stages: [{ id: "shipment_required", title: "Shipping" }] },
  { pipeline: "finance",    stages: [{ id: "invoice_required", title: "To Invoice" }, { id: "invoiced", title: "To Collect" }] },
  { pipeline: "completed",  stages: [{ id: "completed", title: "Completed" }] },
];

const StageCell = ({
  cellKey, pipeline, stage, accent, active, flash, onActivate,
  onPick, open, onClose, anchorEl,
}: StageCellProps) => {
  return (
    <>
      <EditableCell
        cellKey={cellKey}
        mode="custom"
        align="left"
        display={<StageStatePill pipeline={pipeline} stage={stage} accent={accent} />}
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
            className="w-[260px] p-1.5 max-h-[420px] overflow-y-auto"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {STAGE_PICKER_GROUPS.map((grp) => {
              const grpAccent = pipelineAccent(grp.pipeline);
              const grpTitle = PIPELINES.find((p) => p.id === grp.pipeline)?.title ?? grp.pipeline;
              return (
                <div key={grp.pipeline} className="mb-1.5 last:mb-0">
                  <div
                    className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em]"
                    style={{ color: "hsl(var(--brand-navy) / 0.45)" }}
                  >
                    {grpTitle}
                  </div>
                  {grp.stages.map((s) => {
                    const isCurrent = grp.pipeline === pipeline && s.id === stage;
                    return (
                      <button
                        key={s.id}
                        onClick={() => onPick({ pipeline: grp.pipeline, stage: s.id })}
                        className={cn(
                          "w-full text-left px-2 py-1.5 rounded-md text-[13px] hover:bg-muted/60 transition-colors flex items-center gap-2",
                          isCurrent && "bg-muted/60 font-medium",
                        )}
                        style={{ color: "hsl(var(--brand-navy))" }}
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: grpAccent }}
                          aria-hidden
                        />
                        <span className="flex-1 truncate">{s.title}</span>
                        {isCurrent && (
                          <span
                            className="text-[10px] uppercase tracking-wider"
                            style={{ color: "hsl(var(--brand-navy) / 0.5)" }}
                          >
                            Current
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </PopoverContent>
        </Popover>
      )}
    </>
  );
};
