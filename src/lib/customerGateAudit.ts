/**
 * Shared audit helper for customer-level Order Confirmation Requirement edits.
 *
 * When a customer's gate config changes (via the Customer Detail
 * OrderConfirmationRequirementsSection OR the Customers-list inline
 * CustomerGateCell), we need the change to be visible in:
 *   - the global Activity log (single __system__ row)
 *   - every open project's Activity log for that customer (so users who
 *     review a project see why its required gates shifted), and
 *   - any project whose computed state actually transitioned, with a
 *     `customer_gate_config_consequence` row carrying the old → new state.
 *
 * Previously this work lived inline in OrderConfirmationRequirementsSection
 * and was completely missing from the inline pill in CustomerGateCell —
 * which is why users reported "I changed the requirement but nothing
 * showed up in the project's log." This helper centralises the behaviour.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  computeOrderConfirmationState,
  type ApprovalRowsLookup,
  type GateKey,
  type OrderConfirmationConfig,
} from "@/lib/orderConfirmation";
import type { Project } from "@/data/pipelines";

interface WriteArgs {
  customer: { id: string; name: string };
  gate: GateKey;
  gateLabel: string;
  prev: OrderConfirmationConfig;
  next: OrderConfirmationConfig;
  summary: string;
  openProjects: Project[];
  actor: { userId: string; shortName: string };
  /** Returned so callers can wire undo with `parent_log_id`. */
}

const newId = () => `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export interface CustomerGateAuditResult {
  systemLogId: string;
  perProjectIds: string[];
  consequenceProjectIds: string[];
}

export async function writeCustomerGateConfigAudit(
  args: WriteArgs,
): Promise<CustomerGateAuditResult> {
  const { customer, gate, gateLabel, prev, next, summary, openProjects, actor } = args;
  const ts = new Date().toISOString();
  const systemLogId = newId();

  // 1) Customer-level (global Activity feed) entry on __system__
  const sysRow = {
    id: systemLogId,
    project_id: "__system__",
    ts,
    actor_user_id: actor.userId,
    actor_display_name: actor.shortName,
    action_type: "customer_gate_config_change",
    description: `${actor.shortName} changed ${customer.name}'s ${gateLabel} requirement: ${summary}`,
    metadata: {
      gate,
      customer_id: customer.id,
      customer_name: customer.name,
      old_mode: prev[gate].mode,
      new_mode: next[gate].mode,
      old_modes: prev[gate].conditional_modes,
      new_modes: next[gate].conditional_modes,
      old_amount: prev[gate].conditional_amount_above,
      new_amount: next[gate].conditional_amount_above,
    } as Json,
  };

  // 2) Per-project mirror entry on every open project of this customer
  const perProjectRows = openProjects.map((p) => ({
    id: newId(),
    project_id: p.id,
    ts,
    actor_user_id: actor.userId,
    actor_display_name: actor.shortName,
    action_type: "customer_gate_config_change",
    description: `${actor.shortName} changed ${customer.name}'s ${gateLabel} requirement: ${summary}`,
    metadata: {
      gate,
      customer_id: customer.id,
      customer_name: customer.name,
      old_mode: prev[gate].mode,
      new_mode: next[gate].mode,
      parent_log_id: systemLogId,
    } as Json,
  }));

  // 3) Consequence entries — only where computed state transitioned.
  // Approval lookups fetched in one batch.
  const qNumbers = Array.from(new Set(openProjects.map((p) => p.quoteNumber).filter(Boolean) as string[]));
  const poNumbers = Array.from(new Set(openProjects.map((p) => p.customerPoNumber).filter(Boolean) as string[]));
  const lookup: ApprovalRowsLookup = { email: {}, quotation: {}, po: {} };
  if (qNumbers.length) {
    const { data: qa } = await supabase.from("quotation_approvals").select("*").in("q_number", qNumbers);
    for (const r of qa ?? []) lookup.quotation[r.q_number] = r;
    const { data: ea } = await supabase.from("quotation_email_verbal_approvals").select("*").in("q_number", qNumbers);
    for (const r of ea ?? []) lookup.email[r.q_number] = r;
  }
  if (poNumbers.length) {
    const { data: pa } = await supabase.from("customer_po_approvals").select("*").in("customer_po_number", poNumbers);
    for (const r of pa ?? []) lookup.po[`${r.quote_number}|${r.customer_po_number}`] = r;
  }

  const consequenceRows: typeof perProjectRows = [];
  for (const p of openProjects) {
    const oldS = computeOrderConfirmationState(p, { order_confirmation_config: prev }, lookup).state;
    const newS = computeOrderConfirmationState(p, { order_confirmation_config: next }, lookup).state;
    if (oldS === newS) continue;
    consequenceRows.push({
      id: newId(),
      project_id: p.id,
      ts,
      actor_user_id: actor.userId,
      actor_display_name: actor.shortName,
      action_type: "customer_gate_config_consequence",
      description: `Order confirmation state changed: ${oldS} → ${newS} due to ${customer.name} requirements update`,
      metadata: {
        trigger: "customer_gate_config_change",
        customer_id: customer.id,
        gate,
        old_state: oldS,
        new_state: newS,
        parent_log_id: systemLogId,
      } as Json,
    });
  }

  // Single batched insert — fewer round-trips and atomic from the client's POV.
  const allRows = [sysRow, ...perProjectRows, ...consequenceRows];
  const { error } = await supabase.from("project_log_entries").insert(allRows);
  if (error) {
    // Surface a console error so silent failures stop happening — callers
    // can show a toast if they want, but we don't want to fight every
    // import boundary for sonner here.
    console.error("[customerGateAudit] insert failed", error);
    throw error;
  }

  return {
    systemLogId,
    perProjectIds: perProjectRows.map((r) => r.project_id),
    consequenceProjectIds: consequenceRows.map((r) => r.project_id),
  };
}
