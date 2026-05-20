/**
 * Cross-project approval cascade (Phase 7).
 *
 * When an approval (artwork / quotation / customer PO) is created, updated, or
 * revoked, the change applies to ALL projects that share the same proof_number,
 * quote_number, or customer_po_number. This module:
 *
 *   1. Queries all affected projects (excluding soft-deleted)
 *   2. Computes prior + next state per project
 *   3. Writes per-sibling project_log_entries for projects whose state changed
 *   4. Fires a bulk toast when >1 project is affected
 *
 * Realtime invalidation: the supabase_realtime publication now includes the
 * three approval tables (Phase 7 migration). Sibling UIs receive the change
 * automatically via the existing usePipelineStore channel + the per-component
 * subscription in ApprovalsSubsection. We do NOT need to invalidate React
 * Query keys manually.
 */
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  computeArtworkState,
  computeOrderConfirmationState,
  type ArtworkApprovalRow,
  type QuotationApprovalRow,
  type QuotationEmailVerbalApprovalRow,
  type CustomerPoApprovalRow,
  type ApprovalRowsLookup,
  type ArtworkApprovalsLookup,
  type ArtworkState,
  type OrderConfirmationConfig,
  type ProjectForGates,
} from "@/lib/orderConfirmation";

export type CascadeChangeType =
  | "artwork_create" | "artwork_update" | "artwork_revoke"
  | "quotation_create" | "quotation_update" | "quotation_revoke"
  | "customer_po_create" | "customer_po_update" | "customer_po_revoke"
  | "email_verbal_create" | "email_verbal_update" | "email_verbal_revoke";

export interface CascadeStateTransition {
  projectId: string;
  projectName: string;
  customerName: string;
  docNumber: string;
  artworkState?: { from: ArtworkState; to: ArtworkState };
  orderState?: { from: "gray" | "orange" | "green"; to: "gray" | "orange" | "green" };
}

export interface CascadeResult {
  affectedProjectIds: string[];
  siblingProjectIds: string[];
  stateTransitions: CascadeStateTransition[];
}

export interface CascadeInput {
  changeType: CascadeChangeType;
  docNumber: string;
  triggeringProjectId: string;
  /** Approval row AFTER mutation. null for revoke. */
  approvalRow:
    | ArtworkApprovalRow
    | QuotationApprovalRow
    | CustomerPoApprovalRow
    | null;
  /** Approval row BEFORE mutation. null for create. Used to reconstruct prior state. */
  priorApprovalRow:
    | ArtworkApprovalRow
    | QuotationApprovalRow
    | CustomerPoApprovalRow
    | null;
  actorUserId: string;
  actorDisplayName: string;
  /** Stable timestamp shared across all sibling audit rows. */
  cascadeTs?: string;
  /** Original audit log id on triggering project (so cascaded rows link back). */
  triggeringLogId?: string;
  /** For undo cascades: id of the original (forward) cascade log to back-reference. */
  undoOfLogId?: string;
  /**
   * Required for customer_po_* cascades only: the triggering project's
   * quote_number. Customer PO approvals are scoped per-(quote, PO) so the
   * cascade only fans out to projects sharing both. If undefined/null on a
   * customer_po cascade, the cascade is skipped entirely (returns empty).
   */
  triggeringQuoteNumber?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type DomainKind = "artwork" | "quotation" | "customer_po" | "email_verbal";

function kindOf(changeType: CascadeChangeType): DomainKind {
  if (changeType.startsWith("artwork")) return "artwork";
  if (changeType.startsWith("quotation")) return "quotation";
  if (changeType.startsWith("email_verbal")) return "email_verbal";
  return "customer_po";
}

function verbOf(changeType: CascadeChangeType): "create" | "update" | "revoke" {
  if (changeType.endsWith("_create")) return "create";
  if (changeType.endsWith("_update")) return "update";
  return "revoke";
}

function actionTypeFor(changeType: CascadeChangeType): string {
  switch (changeType) {
    case "artwork_create": return "artwork_approval_create";
    case "artwork_update": return "artwork_approval_update";
    case "artwork_revoke": return "artwork_approval_revoke";
    case "quotation_create": return "quotation_approval_create";
    case "quotation_update": return "quotation_approval_update";
    case "quotation_revoke": return "quotation_approval_revoke";
    case "customer_po_create": return "customer_po_approval_create";
    case "customer_po_update": return "customer_po_approval_update";
    case "customer_po_revoke": return "customer_po_approval_revoke";
    // Email/Verbal reuses legacy _set/_unset action_type names for audit-log continuity.
    case "email_verbal_create": return "email_verbal_approval_set";
    case "email_verbal_update": return "email_verbal_approval_set";
    case "email_verbal_revoke": return "email_verbal_approval_unset";
  }
}

/** Inverse change type (used by undo cascade caller). */
export function inverseChangeType(c: CascadeChangeType): CascadeChangeType {
  if (c.endsWith("_create")) return c.replace("_create", "_revoke") as CascadeChangeType;
  if (c.endsWith("_revoke")) return c.replace("_revoke", "_create") as CascadeChangeType;
  return c; // update inverse is also update (the caller passes the prior row)
}

/** Map a projects row from supabase into the slim shape compute fns expect. */
function rowToProjectForGates(r: Record<string, unknown>): ProjectForGates & {
  id: string; project_name: string; customer: string;
} {
  return {
    id: r.id as string,
    project_name: r.project_name as string,
    customer: r.customer as string,
    value: r.value as number | null,
    shippingMode: r.shipping_mode as string | null,
    quoteNumber: r.quote_number as string | null,
    proofNumber: r.proof_number as string | null,
    customerPoNumber: r.customer_po_number as string | null,
    depositPaidDate: r.deposit_paid_date as string | null,
    orderConfirmationOverrides: (r.order_confirmation_overrides as ProjectForGates["orderConfirmationOverrides"]) ?? null,
  };
}

// ─── Main cascade ────────────────────────────────────────────────────────────

export async function cascadeApprovalChange(input: CascadeInput): Promise<CascadeResult> {
  const kind = kindOf(input.changeType);
  const verb = verbOf(input.changeType);
  const ts = input.cascadeTs ?? new Date().toISOString();
  const empty: CascadeResult = { affectedProjectIds: [], siblingProjectIds: [], stateTransitions: [] };

  // 1. Find all affected projects (matching doc number, not soft-deleted).
  // Customer PO cascades additionally require quote_number scoping — a PO is
  // implicitly issued against a specific quote, so the cascade only fans out
  // to projects sharing BOTH (quote_number, customer_po_number).
  if (kind === "customer_po" && !input.triggeringQuoteNumber) {
    // No quote scope → cascade is meaningless. Skip entirely.
    return empty;
  }
  const projectsQuery = supabase
    .from("projects")
    .select("*")
    .is("deleted_at", null);
  const filtered = kind === "artwork"
    ? projectsQuery.eq("proof_number", input.docNumber)
    : kind === "quotation" || kind === "email_verbal"
      ? projectsQuery.eq("quote_number", input.docNumber)
      : projectsQuery.eq("customer_po_number", input.docNumber).eq("quote_number", input.triggeringQuoteNumber!);
  const { data: projectRows, error: pe } = await filtered;
  if (pe || !projectRows || projectRows.length === 0) return empty;

  const affectedProjects = projectRows.map((r) => rowToProjectForGates(r as Record<string, unknown>));
  const affectedProjectIds = affectedProjects.map((p) => p.id);
  const siblingProjectIds = affectedProjectIds.filter((id) => id !== input.triggeringProjectId);

  // 2. For non-artwork cascades we need each project's full lookup + customer config.
  let customerByName: Record<string, OrderConfirmationConfig | null> = {};
  let lookupNext: ApprovalRowsLookup = { email: {}, quotation: {}, po: {} };
  let lookupPrior: ApprovalRowsLookup = { email: {}, quotation: {}, po: {} };
  let artworkLookupNext: ArtworkApprovalsLookup = {};
  let artworkLookupPrior: ArtworkApprovalsLookup = {};

  if (kind !== "artwork") {
    const customerNames = Array.from(new Set(affectedProjects.map((p) => p.customer).filter(Boolean)));
    if (customerNames.length) {
      const { data: custRows } = await supabase
        .from("customers")
        .select("name, order_confirmation_config")
        .in("name", customerNames);
      for (const c of custRows ?? []) {
        customerByName[c.name as string] = (c.order_confirmation_config as unknown as OrderConfirmationConfig | null) ?? null;
      }
    }

    const qNums = Array.from(new Set(affectedProjects.map((p) => p.quoteNumber).filter(Boolean) as string[]));
    const poNums = Array.from(new Set(affectedProjects.map((p) => p.customerPoNumber).filter(Boolean) as string[]));
    if (qNums.length) {
      const { data } = await supabase.from("quotation_approvals").select("*").in("q_number", qNums);
      for (const r of data ?? []) lookupNext.quotation[r.q_number] = r as QuotationApprovalRow;
      const { data: edata } = await supabase.from("quotation_email_verbal_approvals").select("*").in("q_number", qNums);
      for (const r of edata ?? []) lookupNext.email[r.q_number] = r as QuotationEmailVerbalApprovalRow;
    }
    if (poNums.length) {
      const { data } = await supabase.from("customer_po_approvals").select("*").in("customer_po_number", poNums);
      for (const r of data ?? []) lookupNext.po[r.customer_po_number] = r as CustomerPoApprovalRow;
    }
    lookupPrior = {
      email: { ...lookupNext.email },
      quotation: { ...lookupNext.quotation },
      po: { ...lookupNext.po },
    };
    if (kind === "quotation") {
      if (input.priorApprovalRow) lookupPrior.quotation[input.docNumber] = input.priorApprovalRow as QuotationApprovalRow;
      else delete lookupPrior.quotation[input.docNumber];
    } else if (kind === "email_verbal") {
      if (input.priorApprovalRow) lookupPrior.email[input.docNumber] = input.priorApprovalRow as QuotationEmailVerbalApprovalRow;
      else delete lookupPrior.email[input.docNumber];
    } else {
      if (input.priorApprovalRow) lookupPrior.po[input.docNumber] = input.priorApprovalRow as CustomerPoApprovalRow;
      else delete lookupPrior.po[input.docNumber];
    }
  } else {
    if (input.approvalRow) artworkLookupNext[input.docNumber] = input.approvalRow as ArtworkApprovalRow;
    if (input.priorApprovalRow) artworkLookupPrior[input.docNumber] = input.priorApprovalRow as ArtworkApprovalRow;
  }

  // 3. Compute prior vs next state per project.
  const transitions: CascadeStateTransition[] = [];
  for (const p of affectedProjects) {
    if (kind === "artwork") {
      const from = computeArtworkState(p, artworkLookupPrior);
      const to = computeArtworkState(p, artworkLookupNext);
      if (from !== to) {
        transitions.push({
          projectId: p.id,
          projectName: p.project_name,
          customerName: p.customer,
          docNumber: input.docNumber,
          artworkState: { from, to },
        });
      }
    } else {
      const cust = { order_confirmation_config: customerByName[p.customer] ?? null };
      const from = computeOrderConfirmationState(p, cust, lookupPrior).state;
      const to = computeOrderConfirmationState(p, cust, lookupNext).state;
      if (from !== to) {
        transitions.push({
          projectId: p.id,
          projectName: p.project_name,
          customerName: p.customer,
          docNumber: input.docNumber,
          orderState: { from, to },
        });
      }
    }
  }

  // 4. Write per-sibling audit entries (only for siblings whose state changed).
  const actionType = actionTypeFor(input.changeType);
  const siblingTransitions = transitions.filter((t) => t.projectId !== input.triggeringProjectId);
  if (siblingTransitions.length > 0) {
    const rows = siblingTransitions.map((t, i) => ({
      id: `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}-${i}`,
      project_id: t.projectId,
      ts,
      actor_user_id: input.actorUserId,
      actor_display_name: input.actorDisplayName,
      action_type: actionType,
      description: cascadeDescription(input, t, verb),
      metadata: {
        cascade_of_project_id: input.triggeringProjectId,
        triggering_log_id: input.triggeringLogId ?? null,
        ...(input.undoOfLogId ? { undo_of: input.undoOfLogId } : {}),
        state_transition: t.artworkState ?? t.orderState,
        ...(kind === "artwork" ? { proof_number: input.docNumber } : {}),
        ...(kind === "quotation" || kind === "email_verbal" ? { q_number: input.docNumber } : {}),
        ...(kind === "customer_po" ? { customer_po_number: input.docNumber } : {}),
      } as Json,
    }));
    await supabase.from("project_log_entries").insert(rows);
  }

  return {
    affectedProjectIds,
    siblingProjectIds,
    stateTransitions: transitions,
  };
}

function cascadeDescription(input: CascadeInput, t: CascadeStateTransition, verb: "create" | "update" | "revoke"): string {
  const undoPrefix = input.undoOfLogId ? "Undid: " : "";
  const kind = kindOf(input.changeType);
  if (kind === "artwork") {
    const a = t.artworkState!;
    return `${undoPrefix}Artwork approval ${verb} cascaded · Proof #${input.docNumber} (${a.from} → ${a.to})`;
  }
  if (kind === "quotation") {
    const o = t.orderState!;
    return `${undoPrefix}Quotation approval ${verb} cascaded · Q-${input.docNumber} (${o.from} → ${o.to})`;
  }
  if (kind === "email_verbal") {
    const o = t.orderState!;
    return `${undoPrefix}Email/verbal approval ${verb} cascaded · Q-${input.docNumber} (${o.from} → ${o.to})`;
  }
  const o = t.orderState!;
  return `${undoPrefix}Customer PO approval ${verb} cascaded · PO #${input.docNumber} (${o.from} → ${o.to})`;
}

// ─── Bulk toast helper ───────────────────────────────────────────────────────

const GREEN = "#2E7D32";

export interface BulkToastOpts {
  changeType: CascadeChangeType;
  docNumber: string;
  /** Display name for the approver (buyer or other). Optional, single-project context. */
  approverName?: string;
  result: CascadeResult;
  /** Set true when this toast represents an undo of a prior cascade. */
  isUndo?: boolean;
  /** Open the affected-projects modal listing siblings as links. */
  onViewAffected?: () => void;
  /** Survivors count for undo with stale targets. */
  survivorsNote?: string;
}

export function fireBulkToast(opts: BulkToastOpts) {
  const { changeType, docNumber, approverName, result, isUndo, onViewAffected, survivorsNote } = opts;
  const kind = kindOf(changeType);
  const verb = verbOf(changeType);
  const n = result.affectedProjectIds.length;
  const anyGreen = result.stateTransitions.some(
    (t) => (t.artworkState?.to === "green") || (t.orderState?.to === "green"),
  );
  const isRevoke = verb === "revoke";
  const isCreate = verb === "create";

  // Build message
  let title: string;
  if (isUndo) {
    title = n > 1
      ? `Undid: approval · ${n} projects reverted${survivorsNote ? ` (${survivorsNote})` : ""}`
      : `Undid: approval · ${docLabel(kind, docNumber)}`;
  } else if (isRevoke) {
    title = n > 1
      ? `Approval revoked · ${n} projects affected`
      : `Approval revoked · ${docLabel(kind, docNumber)}`;
  } else if (isCreate) {
    const prefix = anyGreen ? "🎉 " : "";
    const docMsg = kind === "artwork"
      ? `Artwork approval recorded · ${docNumber}${approverName ? ` from ${approverName}` : ""}`
      : kind === "quotation"
        ? `Quotation Q-${docNumber} approved`
        : kind === "email_verbal"
          ? `Email/verbal approval recorded · Q-${docNumber}${approverName ? ` from ${approverName}` : ""}`
          : `Customer PO ${docNumber} approved`;
    title = n > 1 ? `${prefix}${docMsg} · Applied to ${n} projects` : `${prefix}${docMsg}`;
  } else {
    // update
    title = n > 1 && result.stateTransitions.length > 0
      ? `Approval updated · ${n} projects affected`
      : `Approval updated · ${docLabel(kind, docNumber)}`;
  }

  const celebrate = !isUndo && !isRevoke && anyGreen;
  const baseOpts: Record<string, unknown> = {
    duration: celebrate ? 4500 : 3500,
  };
  if (celebrate) {
    baseOpts.style = { background: GREEN, color: "#fff", border: "none" };
  }
  if (n > 1 && onViewAffected) {
    baseOpts.action = {
      label: "View affected →",
      onClick: onViewAffected,
    };
  }
  if (celebrate) toast.success(title, baseOpts);
  else if (isRevoke || isUndo) toast(title, baseOpts);
  else toast.success(title, baseOpts);
}

function docLabel(kind: DomainKind, doc: string): string {
  if (kind === "artwork") return `Proof #${doc}`;
  if (kind === "quotation") return `Q-${doc}`;
  if (kind === "email_verbal") return `Q-${doc}`;
  return `PO #${doc}`;
}

// ─── Project-link route helper ───────────────────────────────────────────────

/** Single source of truth for project deep-links across approval UIs. */
export function projectDetailHref(projectId: string): string {
  return `/?project=${encodeURIComponent(projectId)}`;
}
