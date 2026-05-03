/**
 * Spreadsheet — project-level flat table with Sheets/Excel-style cell
 * selection + inline editing.
 *
 * Lock toggle controls EDITING entry only — selection works in both states.
 * Each editable column declares its own editor (text / prefix-text / select /
 * search-select / date / number). Searchable dropdowns (Customer, Buyer,
 * Supplier, Sales Rep) carry "+ Add new" footers that create the master record
 * AND assign it to the row in one commit.
 *
 * Undo stack: every commit is pushed onto a per-session stack (cap 50). Cmd+Z
 * reverts the last commit; Cmd+Shift+Z (or Cmd+Y) redoes. Customer changes
 * that invalidate Buyer push BOTH field changes as a single atomic entry.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { usePipelineStore, getStageTitle } from "@/hooks/usePipelineStore";
import { useMasterData } from "@/hooks/useMasterData";
import { PIPELINES, PipelineId, Project, ShippingMode, SUPPLIERS, StageId } from "@/data/pipelines";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import {
  SpreadsheetView, SpreadsheetColumn, EditorOption, CreateFormSpec,
} from "@/components/leads/SpreadsheetView";

const PIPELINE_LABEL: Record<PipelineId, string> = {
  sales: "Sales", design: "Design", operations: "Production", shipping: "Shipping", finance: "Finance",
};

// First valid stage when switching pipelines via the cell editor.
const FIRST_STAGE: Record<PipelineId, StageId> = {
  sales: "proposal",
  design: "design",
  operations: "preproduction",
  shipping: "shipment_required",
  finance: "invoice_required",
};

const fmtDate = (d?: Date) =>
  d ? `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleString("en-US", { month: "short" })} ${String(d.getFullYear()).slice(2)}` : "";

const daysFromToday = (d: Date) => Math.round((d.getTime() - Date.now()) / 86_400_000);

const fmtBBD = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

interface Row {
  project: Project;
  displayId: string;
}

// ── Undo entry shape ───────────────────────────────────────────────────────
type FieldPatch = { projectId: string; before: Partial<Project>; after: Partial<Project> };
type UndoEntry = { fieldLabel: string; patches: FieldPatch[] };

const UNDO_CAP = 50;

export default function Spreadsheet() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projects, updateProject } = usePipelineStore();
  const md = useMasterData();
  const [pipelineFilter, setPipelineFilter] = useState<PipelineId | "all">("all");
  const [editMode, setEditMode] = useState(false);

  // Undo / redo session stacks (refs to avoid re-render churn).
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);
  const internalRevert = useRef(false); // set true while applying undo/redo

  useEffect(() => () => setEditMode(false), [location.pathname]);

  const rows = useMemo<Row[]>(() => {
    return projects
      .filter((p) => pipelineFilter === "all" || p.pipeline === pipelineFilter)
      .map((p) => {
        const m = /(\d+)$/.exec(p.id);
        const displayId = m ? String(m[1]).padStart(4, "0") : p.id.slice(-4);
        return { project: p, displayId };
      });
  }, [projects, pipelineFilter]);

  const supplierName = (id?: string, fallback?: string) => {
    if (!id) return fallback ?? "";
    const fromMaster = md.getSupplierByAnyId(id)?.name;
    if (fromMaster) return fromMaster;
    return SUPPLIERS.find((s) => s.id === id)?.name ?? fallback ?? "";
  };

  // ── Buyer suggestions per customer (derived from existing projects) ──────
  const buyersByCustomer = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const p of projects) {
      if (!p.contactPerson) continue;
      const set = m.get(p.customer) ?? new Set<string>();
      set.add(p.contactPerson);
      m.set(p.customer, set);
    }
    return m;
  }, [projects]);

  // ── Commit + undo helpers ────────────────────────────────────────────────
  const commitWithUndo = useCallback(
    (project: Project, fieldLabel: string, patch: Partial<Project>, extraPatches: FieldPatch[] = []) => {
      const before: Partial<Project> = {};
      for (const k of Object.keys(patch) as (keyof Project)[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (before as any)[k] = project[k];
      }
      const entry: UndoEntry = {
        fieldLabel,
        patches: [{ projectId: project.id, before, after: patch }, ...extraPatches],
      };
      // apply
      updateProject(project.id, patch);
      for (const ep of extraPatches) updateProject(ep.projectId, ep.after);
      // push undo (and clear redo stack on a new edit)
      if (!internalRevert.current) {
        undoStack.current.push(entry);
        if (undoStack.current.length > UNDO_CAP) undoStack.current.shift();
        redoStack.current = [];
        toast(`${fieldLabel} updated`, {
          duration: 5000,
          action: { label: "Undo", onClick: () => doUndo() },
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateProject],
  );

  const doUndo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    internalRevert.current = true;
    try {
      for (const p of entry.patches) updateProject(p.projectId, p.before);
      redoStack.current.push(entry);
      toast(`Undid ${entry.fieldLabel}`);
    } finally { internalRevert.current = false; }
  }, [updateProject]);

  const doRedo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    internalRevert.current = true;
    try {
      for (const p of entry.patches) updateProject(p.projectId, p.after);
      undoStack.current.push(entry);
      toast(`Redid ${entry.fieldLabel}`);
    } finally { internalRevert.current = false; }
  }, [updateProject]);

  // Global Cmd/Ctrl+Z / Cmd+Shift+Z (or Cmd+Y) — only when not editing in a text input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) doRedo(); else doUndo();
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault(); doRedo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo, doRedo]);

  // ── Editor option pools ─────────────────────────────────────────────────
  const customerOptions: EditorOption[] = useMemo(
    () => md.customers.map((c) => ({ value: c.name, label: c.name })),
    [md.customers],
  );
  const supplierOptions: EditorOption[] = useMemo(
    () => md.suppliers.map((s) => ({ value: s.id, label: s.name })),
    [md.suppliers],
  );
  const supplierPinned: EditorOption[] = [
    { value: "__unassigned__", label: "Unassigned" },
    { value: "__tbd__", label: "TBD" },
    { value: "__various__", label: "Various" },
  ];
  const teamOptions: EditorOption[] = useMemo(
    () => md.teamMembers.map((t) => ({ value: t.initials, label: `${t.initials} — ${t.full_name}` })),
    [md.teamMembers],
  );

  // ── Create-form factories (for "+ Add new …" footer) ────────────────────
  const customerCreate = (): CreateFormSpec => ({
    title: "Add customer",
    addLabel: "Add new customer",
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "industry", label: "Industry" },
      { key: "country", label: "Country" },
    ],
    onSubmit: async (v) => {
      const c = await md.addCustomer({ name: v.name.trim(), industry: v.industry || undefined });
      return { value: c.name, label: c.name };
    },
  });
  const supplierCreate = (): CreateFormSpec => ({
    title: "Add supplier",
    addLabel: "Add new supplier",
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "country", label: "Country" },
      {
        key: "default_shipping_mode", label: "Default Mode", type: "select", placeholder: "Air",
        options: [{ value: "Air", label: "Air" }, { value: "Ocean", label: "Ocean" }, { value: "Local", label: "Local" }],
      },
    ],
    onSubmit: async (v) => {
      const mode = (v.default_shipping_mode || "Air") as ShippingMode;
      const s = await md.addSupplier({ name: v.name.trim(), country: v.country || undefined, default_shipping_mode: mode });
      return { value: s.id, label: s.name };
    },
  });
  const teamCreate = (): CreateFormSpec => ({
    title: "Add team member",
    addLabel: "Add new team member",
    fields: [
      { key: "initials", label: "Initials", required: true, placeholder: "e.g. AV" },
      { key: "full_name", label: "Full name", required: true },
      { key: "department", label: "Department" },
      { key: "role", label: "Role" },
    ],
    onSubmit: async (v) => {
      const t = await md.addTeamMember({
        initials: v.initials.trim().toUpperCase(),
        full_name: v.full_name.trim(),
        role: (v.role || v.department || undefined) as Parameters<typeof md.addTeamMember>[0]["role"],
      });
      return { value: t.initials, label: `${t.initials} — ${t.full_name}` };
    },
  });
  const buyerCreate = (row: Row): CreateFormSpec | null => ({
    title: `Add buyer for ${row.project.customer}`,
    addLabel: "Add new buyer",
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "tel" },
      { key: "role", label: "Role" },
    ],
    // Buyers are not a separate master table here — the buyer is just stored
    // on the project (contactPerson). Returning the typed value assigns it.
    onSubmit: async (v) => ({ value: v.name.trim(), label: v.name.trim() }),
  });

  const columns: SpreadsheetColumn<Row>[] = useMemo(() => [
    {
      id: "id", label: "ID", width: 80,
      render: (r) => r.displayId,
      sortKey: (r) => r.displayId,
    },
    {
      id: "pipeline", label: "Pipeline", width: 120,
      render: (r) => PIPELINE_LABEL[r.project.pipeline],
      editor: { type: "select", options: PIPELINES.map((p) => ({ value: p.id, label: p.title })) },
      getValue: (r) => r.project.pipeline,
      commit: (r, v) => {
        const next = String(v ?? "") as PipelineId;
        if (next === r.project.pipeline) return;
        commitWithUndo(r.project, "Pipeline", {
          pipeline: next,
          stage: FIRST_STAGE[next],
        });
      },
    },
    {
      id: "stage", label: "Stage", width: 160,
      render: (r) => getStageTitle(r.project.pipeline, r.project.stage),
      editor: {
        type: "select",
        options: (r) => {
          const cfg = PIPELINES.find((p) => p.id === r.project.pipeline);
          return cfg?.stages.map((s) => ({ value: s.id, label: s.title })) ?? [];
        },
      },
      getValue: (r) => r.project.stage,
      commit: (r, v) => {
        const next = String(v ?? "") as StageId;
        if (next === r.project.stage) return;
        commitWithUndo(r.project, "Stage", { stage: next });
      },
    },
    {
      id: "customer", label: "Customer", width: 180,
      render: (r) => r.project.customer,
      editor: { type: "search-select", options: customerOptions, createForm: customerCreate, placeholder: "Customer" },
      getValue: (r) => r.project.customer,
      commit: (r, v) => {
        const name = String(v ?? "").trim();
        if (!name || name === r.project.customer) return;
        // If buyer was scoped to old customer, clear it atomically.
        const oldBuyer = r.project.contactPerson;
        const oldBuyersForOld = buyersByCustomer.get(r.project.customer);
        const oldBuyersForNew = buyersByCustomer.get(name);
        const buyerStillValid = !oldBuyer
          || (oldBuyersForNew && oldBuyersForNew.has(oldBuyer))
          || !oldBuyersForOld; // unknown set → keep
        if (oldBuyer && !buyerStillValid) {
          commitWithUndo(r.project, "Customer", { customer: name, contactPerson: undefined });
        } else {
          commitWithUndo(r.project, "Customer", { customer: name });
        }
      },
    },
    {
      id: "buyer", label: "Buyer", width: 160, defaultHidden: true,
      render: (r) => r.project.contactPerson ?? "",
      editor: {
        type: "search-select",
        options: (r) => {
          const set = buyersByCustomer.get(r.project.customer);
          return set ? Array.from(set).map((b) => ({ value: b, label: b })) : [];
        },
        createForm: buyerCreate,
        placeholder: "Buyer",
      },
      getValue: (r) => r.project.contactPerson ?? "",
      commit: (r, v) => {
        const name = String(v ?? "").trim() || undefined;
        if (name === r.project.contactPerson) return;
        commitWithUndo(r.project, "Buyer", { contactPerson: name });
      },
    },
    {
      id: "projectName", label: "Project", width: 200,
      render: (r) => r.project.projectName,
      editor: { type: "text" },
      getValue: (r) => r.project.projectName,
      validate: (_r, v) => (String(v ?? "").trim() ? null : "Required"),
      commit: (r, v) => {
        const name = String(v ?? "").trim();
        if (name === r.project.projectName) return;
        commitWithUndo(r.project, "Project", { projectName: name });
      },
    },
    {
      id: "detail", label: "Detail", width: 240,
      render: (r) => r.project.detailSummary ?? "",
      editor: { type: "text" },
      getValue: (r) => r.project.detailSummary ?? "",
      commit: (r, v) => {
        const next = String(v ?? "") || undefined;
        if (next === r.project.detailSummary) return;
        commitWithUndo(r.project, "Detail", { detailSummary: next });
      },
    },
    {
      id: "quote", label: "Quote #", width: 120,
      render: (r) => r.project.quoteNumber ?? "",
      editor: { type: "prefix-text", prefix: "Q-" },
      getValue: (r) => r.project.quoteNumber ?? "",
      commit: (r, v) => {
        const next = (v == null || v === "") ? undefined : String(v);
        if (next === r.project.quoteNumber) return;
        commitWithUndo(r.project, "Quote #", { quoteNumber: next });
      },
    },
    {
      id: "po", label: "PO #", width: 120, defaultHidden: true,
      render: (r) => r.project.poNumber ?? "",
      editor: { type: "prefix-text", prefix: "P-" },
      getValue: (r) => r.project.poNumber ?? "",
      commit: (r, v) => {
        const next = (v == null || v === "") ? undefined : String(v);
        if (next === r.project.poNumber) return;
        commitWithUndo(r.project, "PO #", { poNumber: next });
      },
    },
    {
      id: "invoice", label: "Invoice #", width: 130, defaultHidden: true,
      render: (r) => r.project.invoiceNumber ?? "",
      editor: { type: "prefix-text", prefix: "INV-" },
      getValue: (r) => r.project.invoiceNumber ?? "",
      commit: (r, v) => {
        const next = (v == null || v === "") ? undefined : String(v);
        if (next === r.project.invoiceNumber) return;
        commitWithUndo(r.project, "Invoice #", { invoiceNumber: next });
      },
    },
    {
      id: "supplier", label: "Supplier", width: 170,
      render: (r) => supplierName(r.project.supplierId, r.project.supplierLabel),
      editor: {
        type: "search-select",
        options: supplierOptions,
        pinned: supplierPinned,
        createForm: supplierCreate,
        placeholder: "Supplier",
      },
      getValue: (r) => r.project.supplierId ?? "",
      commit: (r, v) => {
        const raw = String(v ?? "");
        let patch: Partial<Project>;
        if (raw === "__tbd__") patch = { supplierId: undefined, supplierLabel: "TBD" };
        else if (raw === "__various__") patch = { supplierId: undefined, supplierLabel: "Various" };
        else if (raw === "__unassigned__" || raw === "") patch = { supplierId: undefined, supplierLabel: undefined };
        else patch = { supplierId: raw, supplierLabel: undefined };
        if (patch.supplierId === r.project.supplierId && patch.supplierLabel === r.project.supplierLabel) return;
        commitWithUndo(r.project, "Supplier", patch);
      },
    },
    {
      id: "shippingMode", label: "Ship", width: 90,
      render: (r) => r.project.shippingMode ?? "",
      editor: {
        type: "select",
        options: [
          { value: "", label: "—" },
          { value: "Air", label: "Air" },
          { value: "Ocean", label: "Ocean" },
          { value: "Local", label: "Local" },
        ],
      },
      getValue: (r) => r.project.shippingMode ?? "",
      commit: (r, v) => {
        const raw = String(v ?? "");
        const mode = raw === "Air" || raw === "Ocean" || raw === "Local" ? raw : undefined;
        if (mode === r.project.shippingMode) return;
        commitWithUndo(r.project, "Ship Mode", { shippingMode: mode });
      },
    },
    {
      id: "tracking", label: "Tracking", width: 150,
      render: (r) => r.project.trackingRef?.toUpperCase() ?? "",
      editor: { type: "text" },
      getValue: (r) => r.project.trackingRef ?? "",
      commit: (r, v) => {
        const next = String(v ?? "") || undefined;
        if (next === r.project.trackingRef) return;
        commitWithUndo(r.project, "Tracking", { trackingRef: next });
      },
    },
    {
      id: "deadline", label: "Deadline", width: 120,
      render: (r) => fmtDate(r.project.deadlineDate),
      sortKey: (r) => r.project.deadlineDate.getTime(),
      editor: { type: "date" },
      getValue: (r) => r.project.deadlineDate,
      validate: (_r, v) => (v instanceof Date && !isNaN(v.getTime()) ? null : "Required"),
      commit: (r, v) => {
        if (!(v instanceof Date)) return;
        if (v.getTime() === r.project.deadlineDate.getTime()) return;
        commitWithUndo(r.project, "Deadline", {
          deadlineDate: v,
          deadline: `${String(v.getDate()).padStart(2, "0")} ${v.toLocaleString("en-US", { month: "short" })}`,
        });
      },
    },
    {
      id: "daysToDeadline", label: "Δ Days", width: 80, align: "right",
      render: (r) => {
        const d = daysFromToday(r.project.deadlineDate);
        return d >= 0 ? `in ${d}d` : `${d}d`;
      },
      sortKey: (r) => daysFromToday(r.project.deadlineDate),
    },
    {
      id: "salesRep", label: "Sales Rep", width: 150,
      render: (r) => r.project.pointPerson,
      editor: { type: "search-select", options: teamOptions, createForm: teamCreate, placeholder: "Sales rep" },
      getValue: (r) => r.project.pointPerson,
      commit: (r, v) => {
        const next = String(v ?? "");
        if (next === r.project.pointPerson) return;
        commitWithUndo(r.project, "Sales Rep", { pointPerson: next });
      },
    },
    {
      id: "amountBBD", label: "Amount BBD", width: 130, align: "right",
      render: (r) => fmtBBD(r.project.value),
      sortKey: (r) => r.project.value,
      editor: { type: "number", min: 0 },
      getValue: (r) => r.project.value,
      validate: (_r, v) => (typeof v === "number" && v >= 0 ? null : "Must be ≥ 0"),
      commit: (r, v) => {
        const n = typeof v === "number" ? v : 0;
        if (n === r.project.value) return;
        commitWithUndo(r.project, "Amount", { value: n });
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [md.customers, md.suppliers, md.teamMembers, customerOptions, supplierOptions, teamOptions, buyersByCustomer, commitWithUndo]);

  const totalBBD = rows.reduce((n, r) => n + (r.project.value || 0), 0);

  return (
    <DesktopAppShell contentScroll={false}>
      <SpreadsheetView<Row>
        title="Spreadsheet"
        subtitle={`${rows.length} of ${projects.length} ${projects.length === 1 ? "project" : "projects"} · all-time`}
        storageKey="projects"
        csvName="alvasco-projects"
        rowKey={(r) => r.project.id}
        columns={columns}
        data={rows}
        onRowClick={(r) => navigate(`/?project=${encodeURIComponent(r.project.id)}`)}
        aggregate={<>Total: BBD {fmtBBD(totalBBD)}</>}
        editMode={editMode}
        onToggleEditMode={() => setEditMode((v) => !v)}
        filters={[{
          key: "pipeline",
          label: "Pipeline",
          value: pipelineFilter,
          onChange: (v) => setPipelineFilter(v as PipelineId | "all"),
          options: [
            { value: "all", label: "All pipelines" },
            ...PIPELINES.map((p) => ({ value: p.id, label: p.title })),
          ],
        }]}
      />
    </DesktopAppShell>
  );
}
