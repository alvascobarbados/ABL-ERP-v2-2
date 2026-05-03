/**
 * Spreadsheet — project-level flat table.
 *
 * Refactored to use shared `SpreadsheetView`. Adds the Buyer column
 * (default-hidden, populated from project.contactPerson when present).
 * Pipeline filter preserved as a secondary dropdown. Footer aggregate
 * shows the total Amount BBD across the currently visible rows.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const { projects } = usePipelineStore();
  const md = useMasterData();
  const [pipelineFilter, setPipelineFilter] = useState<PipelineId | "all">("all");

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
    },
    {
      id: "buyer", label: "Buyer", width: 160, defaultHidden: true,
      render: (r) => r.project.contactPerson ?? "",
    },
    {
      id: "projectName", label: "Project", width: 200,
      render: (r) => r.project.projectName,
    },
    {
      id: "detail", label: "Detail", width: 240, defaultHidden: true,
      render: (r) => r.project.detailSummary ?? "",
    },
    {
      id: "quote", label: "Quote #", width: 110,
      render: (r) => r.project.quoteNumber ?? "",
    },
    {
      id: "po", label: "PO #", width: 110, defaultHidden: true,
      render: (r) => r.project.poNumber ?? "",
    },
    {
      id: "invoice", label: "Invoice #", width: 120, defaultHidden: true,
      render: (r) => r.project.invoiceNumber ?? "",
    },
    {
      id: "supplier", label: "Supplier", width: 170,
      render: (r) => supplierName(r.project.supplierId, r.project.supplierLabel),
    },
    {
      id: "shippingMode", label: "Ship", width: 80,
      render: (r) => r.project.shippingMode ?? "",
    },
    {
      id: "tracking", label: "Tracking", width: 150,
      render: (r) => r.project.trackingRef?.toUpperCase() ?? "",
    },
    {
      id: "deadline", label: "Deadline", width: 110,
      render: (r) => fmtDate(r.project.deadlineDate),
      sortKey: (r) => r.project.deadlineDate.getTime(),
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
    },
    {
      id: "amountBBD", label: "Amount BBD", width: 130, align: "right",
      render: (r) => fmtBBD(r.project.value),
      sortKey: (r) => r.project.value,
    },
  ], [md.suppliers]); // eslint-disable-line react-hooks/exhaustive-deps

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
