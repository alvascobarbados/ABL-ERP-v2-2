/**
 * One-off seed: copy ABL_PROJECTS + SHIPMENTS from the in-memory seed
 * into Supabase. Idempotent — uses upsert. Run once after the schema
 * migration:
 *
 *   npx tsx scripts/seed-projects.ts
 *
 * Reports per-record success/failure. Coerces any project on a retired
 * shipping stage to finance/invoice_required before insert.
 */
import { createClient } from "@supabase/supabase-js";
import { ABL_PROJECTS } from "../src/data/abl-projects";
import { SHIPMENTS, PIPELINES, type Project, type StageId } from "../src/data/pipelines";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://jswaquvxptpjvvurfgqd.supabase.co";
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzd2FxdXZ4cHRwanZ2dXJmZ3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDQ3OTgsImV4cCI6MjA5MzQyMDc5OH0.d9VP9CmBku3b1LkLwTF0EIalo-1fP4qoiV3gugPzw2k";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const VALID_STAGES = new Set<StageId>([
  "proposal","quote","confirming","archive",
  "design","proof",
  "preproduction","in_production",
  "shipment_required","shipment_assigned",
  "invoice_required","invoiced","paid",
]);

function projectToRow(p: Project) {
  // Coerce retired shipping stages → finance/invoice_required
  let pipeline = p.pipeline;
  let stage = p.stage;
  if (pipeline === "shipping" && stage !== "shipment_required" && stage !== "shipment_assigned") {
    pipeline = "finance";
    stage = "invoice_required";
  }
  return {
    id: p.id,
    customer: p.customer,
    contact_person: p.contactPerson ?? null,
    point_person: p.pointPerson,
    project_name: p.projectName,
    detail_summary: p.detailSummary ?? null,
    supplier_id: p.supplierId ?? null,
    supplier_label: p.supplierLabel ?? null,
    shipping_mode: p.shippingMode ?? null,
    sales_shipping_label: p.salesShippingLabel ?? null,
    shipment_id: p.shipmentId ?? null,
    tracking_ref: p.trackingRef ?? null,
    pipeline_id: pipeline,
    stage_id: stage,
    deadline: p.deadline,
    deadline_date: p.deadlineDate.toISOString(),
    value: p.value,
    order_type: p.orderType,
    priority: p.priority,
    tag: p.tag ?? null,
    quote_number: p.quoteNumber ?? null,
    po_number: p.poNumber ?? null,
    invoice_number: p.invoiceNumber ?? null,
    created_at: p.createdAt.toISOString(),
    updated_at: (p.updatedAt ?? p.createdAt).toISOString(),
    deleted_at: p.deletedAt ? p.deletedAt.toISOString() : null,
    deleted_from_pipeline: p.deletedFromPipeline ?? null,
    deleted_from_stage: p.deletedFromStage ?? null,
    flagged: !!p.flagged,
    payment_terms: p.paymentTerms ?? "Net 30",
    payment_terms_custom_days: p.paymentTermsCustomDays ?? null,
    payment_terms_inherited: p.paymentTermsInherited ?? true,
    invoice_issued_date: p.invoiceIssuedDate ? p.invoiceIssuedDate.toISOString() : null,
    invoice_issued_date_assumed: p.invoiceIssuedDateAssumed ?? null,
    invoice_required_entered_at: p.invoiceRequiredEnteredAt
      ? p.invoiceRequiredEnteredAt.toISOString()
      : null,
    paid_on_date: p.paidOnDate ? p.paidOnDate.toISOString() : null,
    payment_method: p.paymentMethod ?? null,
    payment_reference: p.paymentReference ?? null,
  };
}

async function main() {
  console.log(`Seeding ${SHIPMENTS.length} shipments + ${ABL_PROJECTS.length} projects…\n`);

  // 1. Shipments first (projects FK them)
  const shipRows = SHIPMENTS.map((s) => ({
    id: s.id,
    code: s.code,
    mode: s.mode,
    carrier: s.carrier ?? null,
    supplier_id: s.supplierId,
    etd: s.etd.toISOString(),
    eta: s.eta.toISOString(),
    status: s.status,
  }));
  const { error: shipErr } = await supabase.from("shipments").upsert(shipRows, { onConflict: "id" });
  if (shipErr) {
    console.error("✗ Shipments upsert failed:", shipErr);
    process.exit(1);
  }
  console.log(`✓ ${shipRows.length} shipments upserted\n`);

  // 2. Projects
  let ok = 0, fail = 0, invalidStage = 0;
  const failures: Array<{ id: string; reason: string }> = [];
  for (const p of ABL_PROJECTS) {
    const row = projectToRow(p);
    if (!VALID_STAGES.has(row.stage_id as StageId)) {
      invalidStage++;
      failures.push({ id: p.id, reason: `invalid stage: ${row.stage_id}` });
      continue;
    }
    const { error } = await supabase.from("projects").upsert(row, { onConflict: "id" });
    if (error) {
      fail++;
      failures.push({ id: p.id, reason: error.message });
      console.error(`✗ ${p.id}: ${error.message}`);
    } else {
      ok++;
    }
  }

  // 3. Notes / log / line_items per project
  let notesOK = 0, logOK = 0, itemsOK = 0;
  for (const p of ABL_PROJECTS) {
    if (p.notes?.length) {
      const rows = p.notes.map((n) => ({
        id: n.id,
        project_id: p.id,
        ts: n.ts.toISOString(),
        author: n.author,
        author_user_id: n.authorUserId ?? null,
        text: n.text,
        auto: !!n.auto,
      }));
      const { error } = await supabase.from("project_notes").upsert(rows, { onConflict: "id" });
      if (!error) notesOK += rows.length;
      else console.error(`✗ notes ${p.id}: ${error.message}`);
    }
    if (p.log?.length) {
      const rows = p.log.map((l) => ({
        id: l.id,
        project_id: p.id,
        ts: l.ts.toISOString(),
        actor_user_id: l.actor.userId,
        actor_display_name: l.actor.displayName,
        action_type: l.actionType,
        description: l.description,
        metadata: l.metadata ?? null,
      }));
      const { error } = await supabase.from("project_log_entries").upsert(rows, { onConflict: "id" });
      if (!error) logOK += rows.length;
      else console.error(`✗ log ${p.id}: ${error.message}`);
    }
    if (p.lineItems?.length) {
      // Idempotency for line_items (no stable id): delete + insert.
      await supabase.from("line_items").delete().eq("project_id", p.id);
      const rows = p.lineItems.map((li, i) => ({
        project_id: p.id,
        position: i,
        qty: li.qty,
        description: li.description,
        unit_price: li.unitPrice ?? null,
        total: li.total ?? null,
        product_id: li.productId ?? null,
      }));
      const { error } = await supabase.from("line_items").insert(rows);
      if (!error) itemsOK += rows.length;
      else console.error(`✗ line_items ${p.id}: ${error.message}`);
    }
  }

  console.log(`\n=== SEED RESULTS ===`);
  console.log(`Projects: ${ok} ok, ${fail} failed, ${invalidStage} invalid stage`);
  console.log(`Notes: ${notesOK}, Log entries: ${logOK}, Line items: ${itemsOK}`);
  if (failures.length) {
    console.log(`\nFailures:`);
    for (const f of failures) console.log(`  - ${f.id}: ${f.reason}`);
  }
  process.exit(fail + invalidStage > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
