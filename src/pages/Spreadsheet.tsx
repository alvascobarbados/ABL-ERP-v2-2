/**
 * Spreadsheet — project-level flat table with optional inline cell editing.
 *
 * Edit mode is toggled by a lock button in the page header (default LOCKED).
 * When unlocked, editable cells become click-to-edit inputs; commits route
 * through `usePipelineStore.updateProject` so the kanban view, edit panel and
 * detail view all reflect the change without a refresh.
 *
 * Non-editable columns: ID (auto), Δ days (computed from Deadline).
 * Pipeline + Stage are read-only here — moving stage is a stateful
 * pipeline-transition (validation, auto-numbering, gestures) and remains the
 * job of the kanban view / Move-to-stage gesture.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePipelineStore, getStageTitle } from "@/hooks/usePipelineStore";
import { useMasterData } from "@/hooks/useMasterData";
import { PIPELINES, PipelineId, Project, SUPPLIERS } from "@/data/pipelines";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { SpreadsheetView, SpreadsheetColumn } from "@/components/leads/SpreadsheetView";

const PIPELINE_LABEL: Record<PipelineId, string> = {
  sales: "Sales", operations: "Production", shipping: "Shipping", finance: "Finance",
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

export default function Spreadsheet() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projects, updateProject } = usePipelineStore();
  const md = useMasterData();
  const [pipelineFilter, setPipelineFilter] = useState<PipelineId | "all">("all");
  const [editMode, setEditMode] = useState(false);

  // Edit mode auto-disables when navigating away from this page.
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

  // ── Editor option pools (master data) ────────────────────────────────────
  const customerOptions = useMemo(
    () => md.customers.map((c) => ({ value: c.name, label: c.name })),
    [md.customers],
  );
  const supplierOptions = useMemo(() => {
    const meta = [
      { value: "", label: "Unassigned" },
      { value: "__tbd__", label: "TBD" },
      { value: "__various__", label: "Various" },
    ];
    return [
      ...meta,
      ...md.suppliers.map((s) => ({ value: s.id, label: s.name })),
    ];
  }, [md.suppliers]);
  const teamOptions = useMemo(
    () => md.teamMembers.map((t) => ({ value: t.initials, label: `${t.initials} — ${t.full_name}` })),
    [md.teamMembers],
  );
  const shippingModeOptions = [
    { value: "", label: "—" },
    { value: "Air", label: "Air" },
    { value: "Ocean", label: "Ocean" },
    { value: "Local", label: "Local" },
  ];

  const columns: SpreadsheetColumn<Row>[] = useMemo(() => [
    {
      id: "id", label: "ID", width: 80,
      render: (r) => r.displayId,
      sortKey: (r) => r.displayId,
    },
    {
      id: "pipeline", label: "Pipeline", width: 110,
      render: (r) => PIPELINE_LABEL[r.project.pipeline],
    },
    {
      id: "stage", label: "Stage", width: 150,
      render: (r) => getStageTitle(r.project.pipeline, r.project.stage),
    },
    {
      id: "customer", label: "Customer", width: 180,
      render: (r) => r.project.customer,
      editor: { type: "select", options: customerOptions },
      getValue: (r) => r.project.customer,
      validate: (_r, v) => {
        const s = String(v ?? "").trim();
        if (!s) return "Required";
        if (!md.customers.some((c) => c.name === s)) return "Pick from list";
        return null;
      },
      commit: (r, v) => updateProject(r.project.id, { customer: String(v ?? "") }),
    },
    {
      id: "buyer", label: "Buyer", width: 160, defaultHidden: true,
      render: (r) => r.project.contactPerson ?? "",
      editor: { type: "text" },
      getValue: (r) => r.project.contactPerson ?? "",
      commit: (r, v) => updateProject(r.project.id, { contactPerson: String(v ?? "") || undefined }),
    },
    {
      id: "projectName", label: "Project", width: 200,
      render: (r) => r.project.projectName,
      editor: { type: "text" },
      getValue: (r) => r.project.projectName,
      validate: (_r, v) => (String(v ?? "").trim() ? null : "Required"),
      commit: (r, v) => updateProject(r.project.id, { projectName: String(v ?? "").trim() }),
    },
    {
      id: "detail", label: "Detail", width: 240, defaultHidden: true,
      render: (r) => r.project.detailSummary ?? "",
      editor: { type: "text" },
      getValue: (r) => r.project.detailSummary ?? "",
      commit: (r, v) => updateProject(r.project.id, { detailSummary: String(v ?? "") || undefined }),
    },
    {
      id: "quote", label: "Quote #", width: 110,
      render: (r) => r.project.quoteNumber ?? "",
      editor: { type: "text" },
      getValue: (r) => r.project.quoteNumber ?? "",
      commit: (r, v) => updateProject(r.project.id, { quoteNumber: String(v ?? "") || undefined }),
    },
    {
      id: "po", label: "PO #", width: 110, defaultHidden: true,
      render: (r) => r.project.poNumber ?? "",
      editor: { type: "text" },
      getValue: (r) => r.project.poNumber ?? "",
      commit: (r, v) => updateProject(r.project.id, { poNumber: String(v ?? "") || undefined }),
    },
    {
      id: "invoice", label: "Invoice #", width: 120, defaultHidden: true,
      render: (r) => r.project.invoiceNumber ?? "",
      editor: { type: "text" },
      getValue: (r) => r.project.invoiceNumber ?? "",
      commit: (r, v) => updateProject(r.project.id, { invoiceNumber: String(v ?? "") || undefined }),
    },
    {
      id: "supplier", label: "Supplier", width: 170,
      render: (r) => supplierName(r.project.supplierId, r.project.supplierLabel),
      editor: { type: "select", options: supplierOptions },
      getValue: (r) => r.project.supplierId ?? "",
      commit: (r, v) => {
        const raw = String(v ?? "");
        if (raw === "__tbd__") return updateProject(r.project.id, { supplierId: undefined, supplierLabel: "TBD" });
        if (raw === "__various__") return updateProject(r.project.id, { supplierId: undefined, supplierLabel: "Various" });
        if (!raw) return updateProject(r.project.id, { supplierId: undefined, supplierLabel: undefined });
        return updateProject(r.project.id, { supplierId: raw, supplierLabel: undefined });
      },
    },
    {
      id: "shippingMode", label: "Ship", width: 80,
      render: (r) => r.project.shippingMode ?? "",
      editor: { type: "select", options: shippingModeOptions },
      getValue: (r) => r.project.shippingMode ?? "",
      commit: (r, v) => {
        const raw = String(v ?? "");
        const mode = raw === "Air" || raw === "Ocean" || raw === "Local" ? raw : undefined;
        return updateProject(r.project.id, { shippingMode: mode });
      },
    },
    {
      id: "tracking", label: "Tracking", width: 150,
      render: (r) => r.project.trackingRef?.toUpperCase() ?? "",
      editor: { type: "text" },
      getValue: (r) => r.project.trackingRef ?? "",
      commit: (r, v) => updateProject(r.project.id, { trackingRef: String(v ?? "") || undefined }),
    },
    {
      id: "deadline", label: "Deadline", width: 110,
      render: (r) => fmtDate(r.project.deadlineDate),
      sortKey: (r) => r.project.deadlineDate.getTime(),
      editor: { type: "date" },
      getValue: (r) => r.project.deadlineDate,
      validate: (_r, v) => (v instanceof Date && !isNaN(v.getTime()) ? null : "Required"),
      commit: (r, v) => {
        if (!(v instanceof Date)) return;
        updateProject(r.project.id, {
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
      id: "salesRep", label: "Sales Rep", width: 140,
      render: (r) => r.project.pointPerson,
      editor: { type: "select", options: teamOptions, allowFree: true },
      getValue: (r) => r.project.pointPerson,
      commit: (r, v) => updateProject(r.project.id, { pointPerson: String(v ?? "") }),
    },
    {
      id: "amountBBD", label: "Amount BBD", width: 130, align: "right",
      render: (r) => fmtBBD(r.project.value),
      sortKey: (r) => r.project.value,
      editor: { type: "number", min: 0 },
      getValue: (r) => r.project.value,
      validate: (_r, v) => (typeof v === "number" && v >= 0 ? null : "Must be ≥ 0"),
      commit: (r, v) => updateProject(r.project.id, { value: typeof v === "number" ? v : 0 }),
    },
  ], [md.customers, md.suppliers, md.teamMembers, customerOptions, supplierOptions, teamOptions, updateProject]); // eslint-disable-line react-hooks/exhaustive-deps

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
