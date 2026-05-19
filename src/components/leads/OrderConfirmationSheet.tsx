/**
 * Order Confirmation Sheet (Phase 6).
 *
 * One sheet, four gate sections (Email · Quotation · PO · Deposit).
 * Each renders only if isGateRequired(project, customer, gate) is true.
 * Status strip at top recomputes live after each mutation. Adjust-
 * requirements expander at the bottom lets the user add/remove gates
 * via order_confirmation_overrides (per-project).
 *
 * Phase 6 scope: writes ONE audit on current project per mutation;
 * cross-project audit + bulk toasts land in Phase 7.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, PartyPopper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Sheet } from "./Sheet";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  AffectedProjectsModal,
  SiblingProjectsInline,
  type AffectedProjectEntry,
} from "./AffectedProjectsModal";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useMasterData, type Customer } from "@/hooks/useMasterData";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { pushUndo, makeUndoId } from "@/hooks/useUndoStack";
import type { Project } from "@/data/pipelines";
import {
  computeOrderConfirmationState,
  isGateRequired,
  type GateKey,
  type OrderConfirmationOverrides,
  type QuotationApprovalRow,
  type QuotationEmailVerbalApprovalRow,
  type CustomerPoApprovalRow,
  type ApprovalRowsLookup,
} from "@/lib/orderConfirmation";
import {
  cascadeApprovalChange,
  fireBulkToast,
  type CascadeResult,
} from "@/lib/approvalCascade";
import {
  ApprovalFormFields,
  validateForm,
  emptyForm,
  CHANNEL_OPTIONS,
  type ApprovalFormValue,
  type ViaChannel,
} from "./approvals/ApprovalFormFields";

const navy = "hsl(var(--brand-navy))";
const GREEN = "#2E7D32";
const ORANGE = "#E97B2C";
const GRAY = "#999";

const GATE_LABELS: Record<GateKey, string> = {
  email: "Email/Verbal",
  quotation: "Signed Quotation",
  po: "Purchase Order",
  deposit: "Deposit",
};

const channelLabel = (v: string) => CHANNEL_OPTIONS.find((o) => o.v === v)?.label ?? v;

function showGreenCelebration(message: string) {
  toast.success(message, {
    duration: 4000,
    icon: <PartyPopper className="h-4 w-4" />,
    style: { background: GREEN, color: "#fff", border: "none" },
  });
}

interface Props {
  open: boolean;
  onClose: () => void;
  project: Project;
  customer: Customer | undefined;
  quotationApproval: QuotationApprovalRow | null;
  emailVerbalApproval: QuotationEmailVerbalApprovalRow | null;
  customerPoApproval: CustomerPoApprovalRow | null;
  onSaved: () => void; // parent refetches approval rows
}

export const OrderConfirmationSheet = ({
  open, onClose, project, customer,
  quotationApproval, emailVerbalApproval, customerPoApproval, onSaved,
}: Props) => {
  const user = useCurrentUser();
  const md = useMasterData();
  const store = usePipelineStore();

  // Live project from store (so emailVerbal* updates immediately after mutation)
  const liveProject = store.projects.find((p) => p.id === project.id) ?? project;

  const lookup: ApprovalRowsLookup = useMemo(() => ({
    quotation: liveProject.quoteNumber && quotationApproval ? { [liveProject.quoteNumber]: quotationApproval } : {},
    po: liveProject.customerPoNumber && customerPoApproval ? { [liveProject.customerPoNumber]: customerPoApproval } : {},
    email: liveProject.quoteNumber && emailVerbalApproval ? { [liveProject.quoteNumber]: emailVerbalApproval } : {},
  }), [liveProject.quoteNumber, liveProject.customerPoNumber, quotationApproval, emailVerbalApproval, customerPoApproval]);

  const orderState = useMemo(
    () => computeOrderConfirmationState(
      liveProject,
      customer ? { order_confirmation_config: customer.order_confirmation_config } : { order_confirmation_config: undefined },
      lookup,
    ),
    [liveProject, customer, lookup],
  );
  const priorStateRef = useRef(orderState.state);
  useEffect(() => {
    // When state transitions to green from non-green, celebrate + auto-close.
    if (orderState.state === "green" && priorStateRef.current !== "green" && orderState.required > 0) {
      showGreenCelebration(`🎉 Order confirmed · ${customer?.name ?? project.customer} · ${project.projectName}`);
      const t = setTimeout(onClose, 600);
      priorStateRef.current = orderState.state;
      return () => clearTimeout(t);
    }
    priorStateRef.current = orderState.state;
  }, [orderState.state, orderState.required, customer?.name, project.customer, project.projectName, onClose]);

  const [affectedModal, setAffectedModal] = useState<AffectedProjectEntry[] | null>(null);
  const showAffected = (result: CascadeResult) => {
    setAffectedModal(result.stateTransitions.map((t) => ({
      projectId: t.projectId,
      projectName: t.projectName,
      customerName: t.customerName,
      stateChange: t.orderState ? `${t.orderState.from} → ${t.orderState.to}` : undefined,
    })));
  };

  if (!open) return null;

  const requiredGates: GateKey[] = (["email", "quotation", "po", "deposit"] as GateKey[])
    .filter((g) => isGateRequired(
      liveProject,
      customer ? { order_confirmation_config: customer.order_confirmation_config } : { order_confirmation_config: undefined },
      g,
    ));

  return (
    <Sheet open={open} onClose={onClose} title="Order Confirmation" width="max-w-lg">
      {/* Status strip */}
      <StatusStrip orderState={orderState} requiredGates={requiredGates} />

      <div className="space-y-4 mt-5">
        {requiredGates.includes("email") && (
          <EmailVerbalSection
            project={liveProject} customer={customer}
            approval={emailVerbalApproval} onSaved={onSaved} onCloseSheet={onClose}
            onShowAffected={showAffected}
          />
        )}
        {requiredGates.includes("quotation") && (
          <QuotationSection
            project={liveProject} customer={customer}
            approval={quotationApproval} onSaved={onSaved} onCloseSheet={onClose}
            onShowAffected={showAffected}
          />
        )}
        {requiredGates.includes("po") && (
          <PoSection
            project={liveProject} customer={customer}
            approval={customerPoApproval} onSaved={onSaved}
            onShowAffected={showAffected}
          />
        )}
        {requiredGates.includes("deposit") && (
          <DepositSection project={liveProject} onCloseSheet={onClose} />
        )}
      </div>

      <AdjustRequirementsExpander project={liveProject} customer={customer} onSaved={onSaved} />

      <AffectedProjectsModal
        open={!!affectedModal}
        entries={affectedModal ?? []}
        onClose={() => setAffectedModal(null)}
        onLinkClick={() => { setAffectedModal(null); onClose(); }}
      />
    </Sheet>
  );
};


// ─── Status strip ────────────────────────────────────────────────────────────
const StatusStrip = ({
  orderState, requiredGates,
}: {
  orderState: { satisfiedGates: GateKey[] };
  requiredGates: GateKey[];
}) => (
  <div className="flex gap-1.5 flex-wrap">
    {(["email", "quotation", "po", "deposit"] as GateKey[]).map((g) => {
      const required = requiredGates.includes(g);
      const satisfied = orderState.satisfiedGates.includes(g);
      const color = !required ? GRAY : satisfied ? GREEN : ORANGE;
      const symbol = !required ? "—" : satisfied ? "✓" : "●";
      return (
        <div
          key={g}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10.5px] font-medium"
          style={{ background: `${color}1A`, color }}
        >
          <span>{symbol}</span>
          <span>{GATE_LABELS[g]}</span>
        </div>
      );
    })}
  </div>
);

// ─── Email/Verbal section ────────────────────────────────────────────────────



const SectionCard = ({
  title, statusLabel, statusColor, children,
}: {
  title: string;
  statusLabel: string;
  statusColor: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-lg border p-3.5" style={{ borderColor: "rgba(27,42,78,0.12)", background: "#fff" }}>
    <div className="flex items-center justify-between mb-2.5">
      <div className="text-[14px] font-medium" style={{ color: navy }}>{title}</div>
      <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] px-2 py-0.5 rounded" style={{ background: `${statusColor}1A`, color: statusColor }}>
        {statusLabel}
      </div>
    </div>
    {children}
  </div>
);

const EmailVerbalSection = ({
  project, customer, approval, onSaved, onCloseSheet, onShowAffected,
}: {
  project: Project; customer: Customer | undefined;
  approval: QuotationEmailVerbalApprovalRow | null;
  onSaved: () => void; onCloseSheet: () => void;
  onShowAffected: (result: CascadeResult) => void;
}) => {
  const user = useCurrentUser();
  const md = useMasterData();
  const store = usePipelineStore();

  const q = project.quoteNumber ?? null;

  if (!q) {
    return (
      <SectionCard title="Email/Verbal Approval" statusLabel="Awaiting input" statusColor={GRAY}>
        <div className="text-[12px]" style={{ color: "#555" }}>
          This project needs a Q# before email/verbal approval can be recorded.
        </div>
        <button onClick={onCloseSheet} className="mt-2.5 text-[12px] underline" style={{ color: ORANGE }}>
          Set Q# in Overview →
        </button>
      </SectionCard>
    );
  }

  const siblings = store.projects.filter((p) => p.id !== project.id && !p.deletedAt && p.quoteNumber === q);
  const isSat = !!approval;
  return (
    <ApprovalSubForm
      title="Email/Verbal Approval"
      docLabel="Q#" docValue={`Q-${q}`}
      siblings={siblings.map((s) => ({ id: s.id, name: s.projectName }))}
      existing={approval ? {
        approvedByBuyerId: approval.approved_by_buyer_id ?? null,
        approvedByOtherName: approval.approved_by_other_name ?? null,
        approvedOn: approval.approved_on,
        viaChannel: approval.via_channel as ViaChannel,
        notes: approval.notes ?? "",
      } : null}
      isSat={isSat}
      customer={customer}
      buyerLookup={md.buyers}
      onUpsert={async (form, isEdit) => {
        const prior = approval ? { ...approval } : null;
        const payload = {
          q_number: q,
          approved_by_buyer_id: form.approvedByBuyerId,
          approved_by_other_name: form.approvedByOtherName,
          approved_on: form.approvedOn,
          via_channel: form.viaChannel,
          notes: form.notes.trim() || null,
          recorded_by_user_id: user.userId,
        };
        const { data: nextRow, error } = await supabase
          .from("quotation_email_verbal_approvals")
          .upsert(payload, { onConflict: "q_number" })
          .select().maybeSingle();
        if (error) { toast.error(`Couldn't save: ${error.message}`); return false; }
        const cascadeTs = new Date().toISOString();
        const buyerName = form.approvedByBuyerId
          ? md.buyers.find((b) => b.id === form.approvedByBuyerId)?.name ?? "—"
          : form.approvedByOtherName ?? "—";
        const logId = `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const verb = isEdit ? "updated" : "recorded";
        const desc = `${user.shortName} ${verb} email/verbal approval · Q-${q} from ${buyerName} via ${channelLabel(form.viaChannel)}`;
        await supabase.from("project_log_entries").insert({
          id: logId, project_id: project.id, ts: cascadeTs,
          actor_user_id: user.userId, actor_display_name: user.shortName,
          action_type: "email_verbal_approval_set",
          description: desc,
          metadata: { q_number: q, via_channel: form.viaChannel, approved_on: form.approvedOn } as Json,
        });
        const changeType = isEdit ? "email_verbal_update" as const : "email_verbal_create" as const;
        const result = await cascadeApprovalChange({
          changeType, docNumber: q, triggeringProjectId: project.id,
          approvalRow: (nextRow as QuotationEmailVerbalApprovalRow) ?? null, priorApprovalRow: prior,
          actorUserId: user.userId, actorDisplayName: user.shortName,
          cascadeTs, triggeringLogId: logId,
        });
        fireBulkToast({
          changeType, docNumber: q, approverName: buyerName, result,
          onViewAffected: result.affectedProjectIds.length > 1 ? () => onShowAffected(result) : undefined,
        });
        pushUndo({
          id: makeUndoId(), timestamp: Date.now(),
          description: `${verb === "recorded" ? "Recorded" : "Updated"} email/verbal approval · Q-${q}`,
          originalLogId: logId, originalDescription: desc,
          applyInverse: async () => {
            if (prior) {
              const { error: e2 } = await supabase.from("quotation_email_verbal_approvals").upsert(prior, { onConflict: "q_number" });
              if (e2) return { ok: false, reason: "Couldn't restore email/verbal approval" };
            } else {
              const { error: e2 } = await supabase.from("quotation_email_verbal_approvals").delete().eq("q_number", q);
              if (e2) return { ok: false, reason: "Couldn't undo email/verbal approval" };
            }
            const undoTs = new Date().toISOString();
            const undoResult = await cascadeApprovalChange({
              changeType: prior ? "email_verbal_update" : "email_verbal_revoke",
              docNumber: q, triggeringProjectId: project.id,
              approvalRow: prior, priorApprovalRow: (nextRow as QuotationEmailVerbalApprovalRow) ?? null,
              actorUserId: user.userId, actorDisplayName: user.shortName,
              cascadeTs: undoTs, triggeringLogId: logId, undoOfLogId: logId,
            });
            fireBulkToast({
              changeType: prior ? "email_verbal_update" : "email_verbal_revoke",
              docNumber: q, result: undoResult, isUndo: true,
            });
            onSaved();
            return { ok: true };
          },
        });
        onSaved();
        return true;
      }}
      onRevoke={async () => {
        if (!approval) return;
        const prior = { ...approval };
        const { error } = await supabase.from("quotation_email_verbal_approvals").delete().eq("q_number", q);
        if (error) { toast.error(`Couldn't revoke: ${error.message}`); return; }
        const cascadeTs = new Date().toISOString();
        const logId = `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        await supabase.from("project_log_entries").insert({
          id: logId, project_id: project.id, ts: cascadeTs,
          actor_user_id: user.userId, actor_display_name: user.shortName,
          action_type: "email_verbal_approval_unset",
          description: `${user.shortName} revoked email/verbal approval · Q-${q}`,
          metadata: { q_number: q } as Json,
        });
        const result = await cascadeApprovalChange({
          changeType: "email_verbal_revoke", docNumber: q, triggeringProjectId: project.id,
          approvalRow: null, priorApprovalRow: prior,
          actorUserId: user.userId, actorDisplayName: user.shortName,
          cascadeTs, triggeringLogId: logId,
        });
        fireBulkToast({
          changeType: "email_verbal_revoke", docNumber: q, result,
          onViewAffected: result.affectedProjectIds.length > 1 ? () => onShowAffected(result) : undefined,
        });
        pushUndo({
          id: makeUndoId(), timestamp: Date.now(),
          description: `Revoked email/verbal approval · Q-${q}`,
          originalLogId: logId,
          applyInverse: async () => {
            const { error: e2 } = await supabase.from("quotation_email_verbal_approvals").insert(prior);
            if (e2) {
              if ((e2 as { code?: string }).code === "23505") {
                return { ok: false, reason: "Can't undo — a different approval now exists for this quotation" };
              }
              return { ok: false, reason: "Couldn't restore email/verbal approval" };
            }
            const undoTs = new Date().toISOString();
            const undoResult = await cascadeApprovalChange({
              changeType: "email_verbal_create", docNumber: q, triggeringProjectId: project.id,
              approvalRow: prior, priorApprovalRow: null,
              actorUserId: user.userId, actorDisplayName: user.shortName,
              cascadeTs: undoTs, triggeringLogId: logId, undoOfLogId: logId,
            });
            fireBulkToast({
              changeType: "email_verbal_create", docNumber: q, result: undoResult, isUndo: true,
            });
            onSaved();
            return { ok: true };
          },
        });
        onSaved();
      }}
    />
  );
};



// ─── Quotation section ───────────────────────────────────────────────────────
const QuotationSection = ({
  project, customer, approval, onSaved, onCloseSheet, onShowAffected,
}: {
  project: Project; customer: Customer | undefined;
  approval: QuotationApprovalRow | null;
  onSaved: () => void; onCloseSheet: () => void;
  onShowAffected: (result: CascadeResult) => void;
}) => {
  const user = useCurrentUser();
  const md = useMasterData();
  const store = usePipelineStore();

  const q = project.quoteNumber ?? null;

  if (!q) {
    return (
      <SectionCard title="Signed Quotation" statusLabel="Awaiting input" statusColor={GRAY}>
        <div className="text-[12px]" style={{ color: "#555" }}>
          This project needs a Q# before quotation approval can be recorded.
        </div>
        <button onClick={onCloseSheet} className="mt-2.5 text-[12px] underline" style={{ color: ORANGE }}>
          Set Q# in Overview →
        </button>
      </SectionCard>
    );
  }

  const siblings = store.projects.filter((p) => p.id !== project.id && !p.deletedAt && p.quoteNumber === q);
  const isSat = !!approval;
  return (
    <ApprovalSubForm
      title="Signed Quotation"
      docLabel="Q#" docValue={`Q-${q}`}
      siblings={siblings.map((s) => ({ id: s.id, name: s.projectName }))}
      existing={approval ? {
        approvedByBuyerId: approval.approved_by_buyer_id ?? null,
        approvedByOtherName: approval.approved_by_other_name ?? null,
        approvedOn: approval.approved_on,
        viaChannel: approval.via_channel as ViaChannel,
        notes: approval.notes ?? "",
      } : null}
      isSat={isSat}
      customer={customer}
      buyerLookup={md.buyers}
      onUpsert={async (form, isEdit) => {
        const prior = approval ? { ...approval } : null;
        const payload = {
          q_number: q,
          approved_by_buyer_id: form.approvedByBuyerId,
          approved_by_other_name: form.approvedByOtherName,
          approved_on: form.approvedOn,
          via_channel: form.viaChannel,
          notes: form.notes.trim() || null,
          recorded_by_user_id: user.userId,
        };
        const { data: nextRow, error } = await supabase
          .from("quotation_approvals")
          .upsert(payload, { onConflict: "q_number" })
          .select().maybeSingle();
        if (error) { toast.error(`Couldn't save: ${error.message}`); return false; }
        const cascadeTs = new Date().toISOString();
        const buyerName = form.approvedByBuyerId
          ? md.buyers.find((b) => b.id === form.approvedByBuyerId)?.name ?? "—"
          : form.approvedByOtherName ?? "—";
        const logId = `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const verb = isEdit ? "updated" : "recorded";
        const desc = `${user.shortName} ${verb} quotation approval · Q-${q} from ${buyerName} via ${channelLabel(form.viaChannel)}`;
        await supabase.from("project_log_entries").insert({
          id: logId, project_id: project.id, ts: cascadeTs,
          actor_user_id: user.userId, actor_display_name: user.shortName,
          action_type: isEdit ? "quotation_approval_update" : "quotation_approval_create",
          description: desc,
          metadata: { q_number: q, via_channel: form.viaChannel, approved_on: form.approvedOn } as Json,
        });
        const changeType = isEdit ? "quotation_update" as const : "quotation_create" as const;
        const result = await cascadeApprovalChange({
          changeType, docNumber: q, triggeringProjectId: project.id,
          approvalRow: (nextRow as QuotationApprovalRow) ?? null, priorApprovalRow: prior,
          actorUserId: user.userId, actorDisplayName: user.shortName,
          cascadeTs, triggeringLogId: logId,
        });
        fireBulkToast({
          changeType, docNumber: q, result,
          onViewAffected: result.affectedProjectIds.length > 1 ? () => onShowAffected(result) : undefined,
        });
        pushUndo({
          id: makeUndoId(), timestamp: Date.now(),
          description: `${verb === "recorded" ? "Recorded" : "Updated"} quotation approval · Q-${q}`,
          originalLogId: logId, originalDescription: desc,
          applyInverse: async () => {
            if (prior) {
              const { error: e2 } = await supabase.from("quotation_approvals").upsert(prior, { onConflict: "q_number" });
              if (e2) return { ok: false, reason: "Couldn't restore quotation approval" };
            } else {
              const { error: e2 } = await supabase.from("quotation_approvals").delete().eq("q_number", q);
              if (e2) return { ok: false, reason: "Couldn't undo quotation approval" };
            }
            const undoTs = new Date().toISOString();
            const undoResult = await cascadeApprovalChange({
              changeType: prior ? "quotation_update" : "quotation_revoke",
              docNumber: q, triggeringProjectId: project.id,
              approvalRow: prior, priorApprovalRow: (nextRow as QuotationApprovalRow) ?? null,
              actorUserId: user.userId, actorDisplayName: user.shortName,
              cascadeTs: undoTs, triggeringLogId: logId, undoOfLogId: logId,
            });
            fireBulkToast({
              changeType: prior ? "quotation_update" : "quotation_revoke",
              docNumber: q, result: undoResult, isUndo: true,
            });
            onSaved();
            return { ok: true };
          },
        });
        onSaved();
        return true;
      }}
      onRevoke={async () => {
        if (!approval) return;
        const prior = { ...approval };
        const { error } = await supabase.from("quotation_approvals").delete().eq("q_number", q);
        if (error) { toast.error(`Couldn't revoke: ${error.message}`); return; }
        const cascadeTs = new Date().toISOString();
        const logId = `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        await supabase.from("project_log_entries").insert({
          id: logId, project_id: project.id, ts: cascadeTs,
          actor_user_id: user.userId, actor_display_name: user.shortName,
          action_type: "quotation_approval_revoke",
          description: `${user.shortName} revoked quotation approval · Q-${q}`,
          metadata: { q_number: q } as Json,
        });
        const result = await cascadeApprovalChange({
          changeType: "quotation_revoke", docNumber: q, triggeringProjectId: project.id,
          approvalRow: null, priorApprovalRow: prior,
          actorUserId: user.userId, actorDisplayName: user.shortName,
          cascadeTs, triggeringLogId: logId,
        });
        fireBulkToast({
          changeType: "quotation_revoke", docNumber: q, result,
          onViewAffected: result.affectedProjectIds.length > 1 ? () => onShowAffected(result) : undefined,
        });
        pushUndo({
          id: makeUndoId(), timestamp: Date.now(),
          description: `Revoked quotation approval · Q-${q}`,
          originalLogId: logId,
          applyInverse: async () => {
            const { error: e2 } = await supabase.from("quotation_approvals").insert(prior);
            if (e2) {
              if ((e2 as { code?: string }).code === "23505") {
                return { ok: false, reason: "Can't undo — a different approval now exists for this quotation" };
              }
              return { ok: false, reason: "Couldn't restore quotation approval" };
            }
            const undoTs = new Date().toISOString();
            const undoResult = await cascadeApprovalChange({
              changeType: "quotation_create", docNumber: q, triggeringProjectId: project.id,
              approvalRow: prior, priorApprovalRow: null,
              actorUserId: user.userId, actorDisplayName: user.shortName,
              cascadeTs: undoTs, triggeringLogId: logId, undoOfLogId: logId,
            });
            fireBulkToast({
              changeType: "quotation_create", docNumber: q, result: undoResult, isUndo: true,
            });
            onSaved();
            return { ok: true };
          },
        });
        onSaved();
      }}
    />
  );
};

// ─── PO section ──────────────────────────────────────────────────────────────
const PoSection = ({
  project, customer, approval, onSaved, onShowAffected,
}: {
  project: Project; customer: Customer | undefined;
  approval: CustomerPoApprovalRow | null;
  onSaved: () => void;
  onShowAffected: (result: CascadeResult) => void;
}) => {
  const user = useCurrentUser();
  const md = useMasterData();
  const store = usePipelineStore();
  const [poInput, setPoInput] = useState(project.customerPoNumber ?? "");
  const [savingPo, setSavingPo] = useState(false);

  const savePoNumber = async () => {
    const val = poInput.trim();
    if (!val) { toast.error("Enter a PO number"); return; }
    setSavingPo(true);
    const prior = project.customerPoNumber ?? null;
    const { error } = await supabase.from("projects").update({ customer_po_number: val }).eq("id", project.id);
    if (error) { toast.error(`Couldn't save: ${error.message}`); setSavingPo(false); return; }
    // Mirror to siblings sharing the same quote_number (customer PO # is quote-level).
    if (project.quoteNumber) {
      const dbQn = project.quoteNumber.replace(/^Q-/, "");
      await supabase.from("projects")
        .update({ customer_po_number: val })
        .eq("quote_number", dbQn)
        .neq("id", project.id)
        .is("deleted_at", null);
    }
    const logId = `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    await supabase.from("project_log_entries").insert({
      id: logId, project_id: project.id, ts: new Date().toISOString(),
      actor_user_id: user.userId, actor_display_name: user.shortName,
      action_type: "field_edit",
      description: `${user.shortName} set Customer PO # to ${val}`,
      metadata: { field: "customerPoNumber", fromValue: prior, toValue: val } as Json,
    });
    pushUndo({
      id: makeUndoId(), timestamp: Date.now(),
      description: `Set Customer PO # on ${project.projectName}`,
      originalLogId: logId,
      applyInverse: async () => {
        const { error: e2 } = await supabase.from("projects").update({ customer_po_number: prior }).eq("id", project.id);
        if (e2) return { ok: false, reason: "Couldn't undo" };
        if (project.quoteNumber) {
          const dbQn = project.quoteNumber.replace(/^Q-/, "");
          await supabase.from("projects")
            .update({ customer_po_number: prior })
            .eq("quote_number", dbQn)
            .neq("id", project.id)
            .is("deleted_at", null);
        }
        onSaved();
        return { ok: true };
      },
    });
    setSavingPo(false);
    onSaved();
    toast.success("PO # saved");
  };

  if (!project.customerPoNumber) {
    return (
      <SectionCard title="Purchase Order" statusLabel="Awaiting input" statusColor={GRAY}>
        <div className="text-[12px] mb-2" style={{ color: "#555" }}>
          Enter the customer's PO # to record approval.
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={poInput}
            onChange={(e) => setPoInput(e.target.value)}
            placeholder="e.g. 4501234"
            maxLength={64}
            className="flex-1 rounded-md border px-2.5 py-2 text-[13px]"
            style={{ borderColor: "rgba(27,42,78,0.2)", color: navy }}
          />
          <button
            onClick={savePoNumber}
            disabled={savingPo}
            className="px-3 py-2 rounded-md text-[12.5px] font-semibold text-white"
            style={{ background: navy }}
          >
            Save PO #
          </button>
        </div>
      </SectionCard>
    );
  }

  const po = project.customerPoNumber;
  const siblings = store.projects.filter((p) => p.id !== project.id && !p.deletedAt && p.customerPoNumber === po);
  const isSat = !!approval;

  return (
    <ApprovalSubForm
      title="Purchase Order"
      docLabel="PO #" docValue={po}
      siblings={siblings.map((s) => ({ id: s.id, name: s.projectName }))}
      existing={approval ? {
        approvedByBuyerId: approval.approved_by_buyer_id ?? null,
        approvedByOtherName: approval.approved_by_other_name ?? null,
        approvedOn: approval.approved_on,
        viaChannel: approval.via_channel as ViaChannel,
        notes: approval.notes ?? "",
      } : null}
      isSat={isSat}
      customer={customer}
      buyerLookup={md.buyers}
      onUpsert={async (form, isEdit) => {
        const prior = approval ? { ...approval } : null;
        const payload = {
          customer_po_number: po,
          approved_by_buyer_id: form.approvedByBuyerId,
          approved_by_other_name: form.approvedByOtherName,
          approved_on: form.approvedOn,
          via_channel: form.viaChannel,
          notes: form.notes.trim() || null,
          recorded_by_user_id: user.userId,
        };
        const { data: nextRow, error } = await supabase
          .from("customer_po_approvals")
          .upsert(payload, { onConflict: "customer_po_number" })
          .select().maybeSingle();
        if (error) { toast.error(`Couldn't save: ${error.message}`); return false; }
        const cascadeTs = new Date().toISOString();
        const buyerName = form.approvedByBuyerId
          ? md.buyers.find((b) => b.id === form.approvedByBuyerId)?.name ?? "—"
          : form.approvedByOtherName ?? "—";
        const logId = `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const verb = isEdit ? "updated" : "recorded";
        const desc = `${user.shortName} ${verb} PO approval · PO #${po} from ${buyerName} via ${channelLabel(form.viaChannel)}`;
        await supabase.from("project_log_entries").insert({
          id: logId, project_id: project.id, ts: cascadeTs,
          actor_user_id: user.userId, actor_display_name: user.shortName,
          action_type: isEdit ? "customer_po_approval_update" : "customer_po_approval_create",
          description: desc,
          metadata: { customer_po_number: po, via_channel: form.viaChannel, approved_on: form.approvedOn } as Json,
        });
        const changeType = isEdit ? "customer_po_update" as const : "customer_po_create" as const;
        const result = await cascadeApprovalChange({
          changeType, docNumber: po, triggeringProjectId: project.id,
          approvalRow: (nextRow as CustomerPoApprovalRow) ?? null, priorApprovalRow: prior,
          actorUserId: user.userId, actorDisplayName: user.shortName,
          cascadeTs, triggeringLogId: logId,
        });
        fireBulkToast({
          changeType, docNumber: po, result,
          onViewAffected: result.affectedProjectIds.length > 1 ? () => onShowAffected(result) : undefined,
        });
        pushUndo({
          id: makeUndoId(), timestamp: Date.now(),
          description: `${verb === "recorded" ? "Recorded" : "Updated"} PO approval · ${po}`,
          originalLogId: logId, originalDescription: desc,
          applyInverse: async () => {
            if (prior) {
              const { error: e2 } = await supabase.from("customer_po_approvals").upsert(prior, { onConflict: "customer_po_number" });
              if (e2) return { ok: false, reason: "Couldn't restore PO approval" };
            } else {
              const { error: e2 } = await supabase.from("customer_po_approvals").delete().eq("customer_po_number", po);
              if (e2) return { ok: false, reason: "Couldn't undo PO approval" };
            }
            const undoTs = new Date().toISOString();
            const undoResult = await cascadeApprovalChange({
              changeType: prior ? "customer_po_update" : "customer_po_revoke",
              docNumber: po, triggeringProjectId: project.id,
              approvalRow: prior, priorApprovalRow: (nextRow as CustomerPoApprovalRow) ?? null,
              actorUserId: user.userId, actorDisplayName: user.shortName,
              cascadeTs: undoTs, triggeringLogId: logId, undoOfLogId: logId,
            });
            fireBulkToast({
              changeType: prior ? "customer_po_update" : "customer_po_revoke",
              docNumber: po, result: undoResult, isUndo: true,
            });
            onSaved();
            return { ok: true };
          },
        });
        onSaved();
        return true;
      }}
      onRevoke={async () => {
        if (!approval) return;
        const prior = { ...approval };
        const { error } = await supabase.from("customer_po_approvals").delete().eq("customer_po_number", po);
        if (error) { toast.error(`Couldn't revoke: ${error.message}`); return; }
        const cascadeTs = new Date().toISOString();
        const logId = `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        await supabase.from("project_log_entries").insert({
          id: logId, project_id: project.id, ts: cascadeTs,
          actor_user_id: user.userId, actor_display_name: user.shortName,
          action_type: "customer_po_approval_revoke",
          description: `${user.shortName} revoked PO approval · PO #${po}`,
          metadata: { customer_po_number: po } as Json,
        });
        const result = await cascadeApprovalChange({
          changeType: "customer_po_revoke", docNumber: po, triggeringProjectId: project.id,
          approvalRow: null, priorApprovalRow: prior,
          actorUserId: user.userId, actorDisplayName: user.shortName,
          cascadeTs, triggeringLogId: logId,
        });
        fireBulkToast({
          changeType: "customer_po_revoke", docNumber: po, result,
          onViewAffected: result.affectedProjectIds.length > 1 ? () => onShowAffected(result) : undefined,
        });
        pushUndo({
          id: makeUndoId(), timestamp: Date.now(),
          description: `Revoked PO approval · ${po}`,
          originalLogId: logId,
          applyInverse: async () => {
            const { error: e2 } = await supabase.from("customer_po_approvals").insert(prior);
            if (e2) {
              if ((e2 as { code?: string }).code === "23505") {
                return { ok: false, reason: "Can't undo — a different approval now exists for this PO" };
              }
              return { ok: false, reason: "Couldn't restore PO approval" };
            }
            const undoTs = new Date().toISOString();
            const undoResult = await cascadeApprovalChange({
              changeType: "customer_po_create", docNumber: po, triggeringProjectId: project.id,
              approvalRow: prior, priorApprovalRow: null,
              actorUserId: user.userId, actorDisplayName: user.shortName,
              cascadeTs: undoTs, triggeringLogId: logId, undoOfLogId: logId,
            });
            fireBulkToast({
              changeType: "customer_po_create", docNumber: po, result: undoResult, isUndo: true,
            });
            onSaved();
            return { ok: true };
          },
        });
        onSaved();
      }}
    />
  );
};


// ─── Deposit (read-only) ─────────────────────────────────────────────────────
const DepositSection = ({ project, onCloseSheet }: { project: Project; onCloseSheet: () => void }) => {
  const paid = !!project.depositPaidDate;
  const fmtDate = (d?: Date | null) =>
    d ? new Date(d).toLocaleDateString() : "Not yet paid";
  return (
    <SectionCard title="Order Deposit" statusLabel={paid ? "Satisfied" : "Pending"} statusColor={paid ? GREEN : GRAY}>
      <div className="text-[12px] space-y-0.5" style={{ color: "#555" }}>
        <div>Deposit Required: <b>Yes</b></div>
        <div>Deposit Amount: <b>{project.depositAmount ?? "—"}</b></div>
        <div>Paid Date: <b>{fmtDate(project.depositPaidDate)}</b></div>
        <div>Paid Method: <b>{project.depositPaidMethod ?? "—"}</b></div>
      </div>
      <button
        onClick={() => { onCloseSheet(); setTimeout(() => document.querySelector("[data-section='finance']")?.scrollIntoView({ behavior: "smooth" }), 100); }}
        className="mt-2.5 text-[12px] underline"
        style={{ color: ORANGE }}
      >
        Edit in Finance →
      </button>
    </SectionCard>
  );
};

// ─── Generic approval sub-form (quotation + PO) ──────────────────────────────
const ApprovalSubForm = ({
  title, docLabel, docValue, siblings, existing, isSat, customer, buyerLookup,
  onUpsert, onRevoke,
}: {
  title: string;
  docLabel: string; docValue: string;
  siblings: { id: string; name: string }[];
  existing: ApprovalFormValue | null;
  isSat: boolean;
  customer: Customer | undefined;
  buyerLookup: { id: string; name: string }[];
  onUpsert: (form: ApprovalFormValue, isEdit: boolean) => Promise<boolean>;
  onRevoke: () => Promise<void>;
}) => {
  const [editing, setEditing] = useState(!isSat);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [form, setForm] = useState<ApprovalFormValue>(existing ?? emptyForm());
  const [errors, setErrors] = useState<Partial<Record<keyof ApprovalFormValue, string>>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) setForm(existing ?? emptyForm());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.approvedOn, existing?.approvedByBuyerId]);

  const submit = async () => {
    const errs = validateForm(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const ok = await onUpsert(form, !!existing);
    setBusy(false);
    if (ok) setEditing(false);
  };

  const buyerName = (v: ApprovalFormValue) =>
    v.approvedByBuyerId ? buyerLookup.find((b) => b.id === v.approvedByBuyerId)?.name ?? "—" : v.approvedByOtherName ?? "—";

  if (isSat && !editing && existing) {
    return (
      <SectionCard title={title} statusLabel="Satisfied" statusColor={GREEN}>
        <div className="text-[12px] space-y-0.5" style={{ color: "#555" }}>
          <div>{docLabel} <b>{docValue}</b> · from <b>{buyerName(existing)}</b> via {channelLabel(existing.viaChannel)}</div>
          <div className="text-[11px]" style={{ color: GRAY }}>
            {new Date(existing.approvedOn).toLocaleString()}
          </div>
          {existing.notes && <div className="mt-1 text-[11.5px]">"{existing.notes}"</div>}
        </div>
        <div className="mt-2.5 flex gap-2">
          <button onClick={() => setEditing(true)} className="text-[11.5px] underline" style={{ color: ORANGE }}>Edit</button>
          <button onClick={() => setConfirmRevoke(true)} className="text-[11.5px] px-2 py-1 rounded border" style={{ borderColor: "#C84A4A", color: "#C84A4A" }}>
            Revoke approval
          </button>
        </div>
        <ConfirmDialog
          open={confirmRevoke}
          title={`Revoke approval for ${docLabel} ${docValue}?`}
          description={siblings.length > 0 ? `This will affect ${siblings.length + 1} project(s).` : "This affects only this project."}
          confirmLabel="Revoke" destructive
          onCancel={() => setConfirmRevoke(false)}
          onConfirm={() => { setConfirmRevoke(false); void onRevoke(); }}
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard title={title} statusLabel={isSat ? "Satisfied" : "Pending"} statusColor={isSat ? GREEN : GRAY}>
      <div className="text-[11.5px] mb-2.5" style={{ color: "#555" }}>
        {docLabel} <b style={{ color: navy }}>{docValue}</b>
        {siblings.length > 0 && (
          <>
            <span style={{ color: GRAY }}>{" "}· </span>
            <SiblingProjectsInline
              siblings={siblings}
              prefix={`Approving applies to ${siblings.length} other project(s): `}
            />
          </>
        )}
      </div>
      <ApprovalFormFields value={form} onChange={setForm} customer={customer} errors={errors} />
      <div className="mt-3 flex gap-2">
        {editing && existing && <button onClick={() => { setEditing(false); setForm(existing); }} className="text-[12px]" style={{ color: GRAY }}>Cancel</button>}
        <button onClick={submit} disabled={busy} className="px-3 py-2 rounded-md text-[12.5px] font-semibold text-white" style={{ background: navy }}>
          {existing ? "Update approval" : `Record ${title.toLowerCase()} approval`}
        </button>
      </div>
    </SectionCard>
  );
};

// ─── Adjust requirements expander ────────────────────────────────────────────
const AdjustRequirementsExpander = ({
  project, customer, onSaved,
}: { project: Project; customer: Customer | undefined; onSaved: () => void }) => {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{ gate: GateKey; action: "add" | "remove" } | null>(null);
  const [reason, setReason] = useState("");

  const gates: GateKey[] = ["email", "quotation", "po", "deposit"];
  const cust = customer ? { order_confirmation_config: customer.order_confirmation_config } : { order_confirmation_config: undefined };

  const apply = async () => {
    if (!pending) return;
    const prior: OrderConfirmationOverrides = (project.orderConfirmationOverrides ?? {}) as OrderConfirmationOverrides;
    const nextOverrides: OrderConfirmationOverrides = { ...prior };
    nextOverrides[pending.gate] = {
      action: pending.action,
      reason: reason.trim() || null,
      set_at: new Date().toISOString(),
      set_by_user_id: user.userId,
    };
    const { error } = await supabase.from("projects")
      .update({ order_confirmation_overrides: nextOverrides as unknown as Json })
      .eq("id", project.id);
    if (error) { toast.error(`Couldn't save: ${error.message}`); return; }
    const logId = `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const verb = pending.action === "add" ? "added" : "removed";
    const desc = `${user.shortName} ${verb} ${GATE_LABELS[pending.gate]} requirement on this project · Reason: ${reason.trim() || "—"}`;
    await supabase.from("project_log_entries").insert({
      id: logId, project_id: project.id, ts: new Date().toISOString(),
      actor_user_id: user.userId, actor_display_name: user.shortName,
      action_type: pending.action === "add" ? "gate_override_add" : "gate_override_remove",
      description: desc,
      metadata: { gate: pending.gate, reason: reason.trim() || null } as Json,
    });
    const captured = pending;
    pushUndo({
      id: makeUndoId(), timestamp: Date.now(),
      description: `${verb === "added" ? "Added" : "Removed"} ${GATE_LABELS[captured.gate]} requirement`,
      originalLogId: logId,
      applyInverse: async () => {
        const { error: e2 } = await supabase.from("projects")
          .update({ order_confirmation_overrides: prior as unknown as Json })
          .eq("id", project.id);
        if (e2) return { ok: false, reason: "Couldn't undo override" };
        onSaved();
        return { ok: true };
      },
    });
    setPending(null);
    setReason("");
    onSaved();
    toast.success(`${GATE_LABELS[captured.gate]} requirement ${verb}`);
  };

  return (
    <div className="mt-5 pt-3" style={{ borderTop: "0.5px solid rgba(27,42,78,0.08)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: GRAY }}
      >
        Adjust requirements for this project
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {gates.map((g) => {
            const required = isGateRequired(project, cust, g);
            return (
              <div key={g} className="flex items-center justify-between text-[12px]">
                <span style={{ color: navy }}>{GATE_LABELS[g]}</span>
                <button
                  onClick={() => { setPending({ gate: g, action: required ? "remove" : "add" }); setReason(""); }}
                  className="text-[11px] underline hover:no-underline"
                  style={{ color: ORANGE }}
                >
                  {required ? "Remove this requirement" : "Add this requirement"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {pending && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPending(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-card border p-5" style={{ borderColor: "hsl(var(--brand-navy) / 0.2)" }}>
            <h3 className="text-lg font-semibold tracking-tight" style={{ color: navy }}>
              {pending.action === "remove" ? "Remove" : "Add"} {GATE_LABELS[pending.gate]} requirement?
            </h3>
            <p className="mt-1 text-sm text-foreground/80">
              This affects only this project, not {customer?.name ?? "the customer"}'s defaults.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Reason (optional)"
              className="mt-3 w-full rounded-md border px-2.5 py-2 text-[13px]"
              style={{ borderColor: "rgba(27,42,78,0.2)", color: navy }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPending(null)} className="px-4 py-2 rounded-xl border text-sm font-medium" style={{ borderColor: "rgba(27,42,78,0.3)", color: navy }}>Cancel</button>
              <button onClick={apply} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: ORANGE }}>
                {pending.action === "remove" ? "Remove" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
