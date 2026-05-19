/**
 * Artwork Approval Sheet (Phase 6).
 *
 * Creates / updates / revokes an artwork_approvals row keyed by proof_number.
 * Phase 6 scope: writes ONE audit entry on the current project only.
 * Cross-project audit propagation lands in Phase 7.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Sheet } from "./Sheet";
import { ConfirmDialog } from "./ConfirmDialog";
import { AffectedProjectsModal, SiblingProjectsInline, type AffectedProjectEntry } from "./AffectedProjectsModal";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useMasterData } from "@/hooks/useMasterData";
import { pushUndo, makeUndoId } from "@/hooks/useUndoStack";
import type { Project } from "@/data/pipelines";
import type { ArtworkApprovalRow } from "@/lib/orderConfirmation";
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

const channelLabel = (v: string) =>
  CHANNEL_OPTIONS.find((o) => o.v === v)?.label ?? v;

interface Props {
  open: boolean;
  onClose: () => void;
  project: Project;
  existing: ArtworkApprovalRow | null;
  onSaved: () => void; // parent refetches approval rows
}

export const ArtworkApprovalSheet = ({ open, onClose, project, existing, onSaved }: Props) => {
  const user = useCurrentUser();
  const md = useMasterData();
  const customer = md.customers.find((c) => c.name === project.customer);
  const proofNumber = project.proofNumber ?? "";

  const isEdit = !!existing;

  const initialForm = (): ApprovalFormValue =>
    existing
      ? {
          approvedByBuyerId: existing.approved_by_buyer_id ?? null,
          approvedByOtherName: existing.approved_by_other_name ?? null,
          approvedOn: existing.approved_on,
          viaChannel: (existing.via_channel as ViaChannel) ?? "email",
          notes: existing.notes ?? "",
        }
      : emptyForm();

  const [form, setForm] = useState<ApprovalFormValue>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof ApprovalFormValue, string>>>({});
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [affectedModal, setAffectedModal] = useState<AffectedProjectEntry[] | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initialForm());
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.id]);

  // Sibling projects with this proof_number
  const siblings = useMemo(() => {
    if (!proofNumber) return [];
    return []; // resolved via store at render below
  }, [proofNumber]);
  void siblings;

  // We need pipeline store projects to compute siblings; lazy via window event isn't needed — useMasterData doesn't expose projects. Import inline:
  const siblingProjects = useSiblingsByProof(project.id, proofNumber);

  const buyerNameFor = (v: ApprovalFormValue): string =>
    v.approvedByBuyerId
      ? md.buyers.find((b) => b.id === v.approvedByBuyerId)?.name ?? "—"
      : (v.approvedByOtherName ?? "—");

  const showAffected = (result: CascadeResult) => {
    const entries: AffectedProjectEntry[] = result.stateTransitions.map((t) => ({
      projectId: t.projectId,
      projectName: t.projectName,
      customerName: t.customerName,
      stateChange: t.artworkState ? `${t.artworkState.from} → ${t.artworkState.to}` : undefined,
    }));
    setAffectedModal(entries);
  };

  const submit = async () => {
    const errs = validateForm(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (!proofNumber) return;

    setBusy(true);
    const prior: ArtworkApprovalRow | null = existing ? { ...existing } : null;

    const payload = {
      proof_number: proofNumber,
      approved_by_buyer_id: form.approvedByBuyerId,
      approved_by_other_name: form.approvedByOtherName,
      approved_on: form.approvedOn,
      via_channel: form.viaChannel,
      notes: form.notes.trim() || null,
      recorded_by_user_id: user.userId,
    };

    const { data: nextRow, error } = await supabase
      .from("artwork_approvals")
      .upsert(payload, { onConflict: "proof_number" })
      .select()
      .maybeSingle();

    if (error) {
      toast.error(`Couldn't save: ${error.message}`);
      setBusy(false);
      return;
    }

    // Audit on current project (matches existing format/text)
    const cascadeTs = new Date().toISOString();
    const logId = `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const verb = isEdit ? "updated" : "recorded";
    const desc = `${user.shortName} ${verb} artwork approval · Proof #${proofNumber} from ${buyerNameFor(form)} via ${channelLabel(form.viaChannel)}`;
    await supabase.from("project_log_entries").insert({
      id: logId,
      project_id: project.id,
      ts: cascadeTs,
      actor_user_id: user.userId,
      actor_display_name: user.shortName,
      action_type: isEdit ? "artwork_approval_update" : "artwork_approval_create",
      description: desc,
      metadata: {
        proof_number: proofNumber,
        approved_by_buyer_id: form.approvedByBuyerId,
        approved_by_other_name: form.approvedByOtherName,
        approved_on: form.approvedOn,
        via_channel: form.viaChannel,
        notes_present: !!form.notes.trim(),
      } as Json,
    });

    // Cross-project cascade: per-sibling audits + bulk toast
    const changeType = isEdit ? "artwork_update" as const : "artwork_create" as const;
    const result = await cascadeApprovalChange({
      changeType,
      docNumber: proofNumber,
      triggeringProjectId: project.id,
      approvalRow: (nextRow as ArtworkApprovalRow) ?? null,
      priorApprovalRow: prior,
      actorUserId: user.userId,
      actorDisplayName: user.shortName,
      cascadeTs,
      triggeringLogId: logId,
    });
    fireBulkToast({
      changeType,
      docNumber: proofNumber,
      approverName: buyerNameFor(form),
      result,
      onViewAffected: result.affectedProjectIds.length > 1 ? () => showAffected(result) : undefined,
    });

    // Undo (with cascade inverse)
    pushUndo({
      id: makeUndoId(),
      timestamp: Date.now(),
      description: `${verb === "recorded" ? "Recorded" : "Updated"} artwork approval · ${proofNumber}`,
      originalLogId: logId,
      originalDescription: desc,
      applyInverse: async () => {
        if (prior) {
          const { error: e2 } = await supabase.from("artwork_approvals").upsert(prior, { onConflict: "proof_number" });
          if (e2) return { ok: false, reason: "Couldn't restore previous approval" };
        } else {
          const { error: e2 } = await supabase.from("artwork_approvals").delete().eq("proof_number", proofNumber);
          if (e2) return { ok: false, reason: "Couldn't undo approval" };
        }
        const undoTs = new Date().toISOString();
        await supabase.from("project_log_entries").insert({
          id: `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          project_id: project.id,
          ts: undoTs,
          actor_user_id: user.userId,
          actor_display_name: user.shortName,
          action_type: prior ? "artwork_approval_update" : "artwork_approval_revoke",
          description: `${user.shortName} undid: artwork approval on Proof #${proofNumber}`,
          metadata: { undo_of: logId, proof_number: proofNumber } as Json,
        });
        const undoResult = await cascadeApprovalChange({
          changeType: prior ? "artwork_update" : "artwork_revoke",
          docNumber: proofNumber,
          triggeringProjectId: project.id,
          approvalRow: prior,
          priorApprovalRow: (nextRow as ArtworkApprovalRow) ?? null,
          actorUserId: user.userId,
          actorDisplayName: user.shortName,
          cascadeTs: undoTs,
          triggeringLogId: logId,
          undoOfLogId: logId,
        });
        fireBulkToast({
          changeType: prior ? "artwork_update" : "artwork_revoke",
          docNumber: proofNumber,
          result: undoResult,
          isUndo: true,
        });
        onSaved();
        return { ok: true };
      },
    });

    setBusy(false);
    onSaved();

    // Auto-close on create (state transitioned somewhere green)
    if (!isEdit) setTimeout(onClose, 600);
  };

  const revoke = async () => {
    if (!existing) return;
    setBusy(true);
    const prior = { ...existing };
    const { error } = await supabase.from("artwork_approvals").delete().eq("proof_number", proofNumber);
    if (error) {
      toast.error(`Couldn't revoke: ${error.message}`);
      setBusy(false);
      return;
    }
    const cascadeTs = new Date().toISOString();
    const logId = `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    await supabase.from("project_log_entries").insert({
      id: logId,
      project_id: project.id,
      ts: cascadeTs,
      actor_user_id: user.userId,
      actor_display_name: user.shortName,
      action_type: "artwork_approval_revoke",
      description: `${user.shortName} revoked artwork approval · Proof #${proofNumber}`,
      metadata: { proof_number: proofNumber } as Json,
    });
    const result = await cascadeApprovalChange({
      changeType: "artwork_revoke",
      docNumber: proofNumber,
      triggeringProjectId: project.id,
      approvalRow: null,
      priorApprovalRow: prior,
      actorUserId: user.userId,
      actorDisplayName: user.shortName,
      cascadeTs,
      triggeringLogId: logId,
    });
    fireBulkToast({
      changeType: "artwork_revoke",
      docNumber: proofNumber,
      result,
      onViewAffected: result.affectedProjectIds.length > 1 ? () => showAffected(result) : undefined,
    });
    pushUndo({
      id: makeUndoId(),
      timestamp: Date.now(),
      description: `Revoked artwork approval · ${proofNumber}`,
      originalLogId: logId,
      originalDescription: `Revoked artwork approval · Proof #${proofNumber}`,
      applyInverse: async () => {
        const { error: e2 } = await supabase.from("artwork_approvals").insert(prior);
        if (e2) {
          if ((e2 as { code?: string }).code === "23505") {
            return { ok: false, reason: "Can't undo — a different approval now exists for this proof" };
          }
          return { ok: false, reason: "Couldn't restore approval" };
        }
        const undoTs = new Date().toISOString();
        const undoResult = await cascadeApprovalChange({
          changeType: "artwork_create",
          docNumber: proofNumber,
          triggeringProjectId: project.id,
          approvalRow: prior,
          priorApprovalRow: null,
          actorUserId: user.userId,
          actorDisplayName: user.shortName,
          cascadeTs: undoTs,
          triggeringLogId: logId,
          undoOfLogId: logId,
        });
        fireBulkToast({
          changeType: "artwork_create",
          docNumber: proofNumber,
          result: undoResult,
          isUndo: true,
        });
        onSaved();
        return { ok: true };
      },
    });
    setBusy(false);
    onSaved();
    onClose();
  };


  if (!open) return null;

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Artwork Approval" width="max-w-md">
        <div className="space-y-5">
          {/* Proof # display */}
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: "#888" }}>
              Proof #
            </div>
            <div className="mt-1 inline-flex items-center px-2.5 py-1 rounded text-[13px] font-medium" style={{ background: "rgba(27,42,78,0.08)", color: navy }}>
              {proofNumber || "—"}
            </div>
            {siblingProjects.length > 0 && (
              <div className="mt-1.5 text-[11px]" style={{ color: "#888" }}>
                Recording approval here applies to {siblingProjects.length} other project(s) sharing this proof number:{" "}
                <SiblingProjectsInline siblings={siblingProjects} prefix="" onLinkClick={onClose} />
              </div>
            )}
          </div>

          <ApprovalFormFields value={form} onChange={setForm} customer={customer} errors={errors} />
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between gap-2">
          {isEdit ? (
            <button
              type="button"
              onClick={() => setConfirmRevoke(true)}
              disabled={busy}
              className="px-3 py-2 rounded-md text-[12.5px] font-medium border"
              style={{ borderColor: "#C84A4A", color: "#C84A4A" }}
            >
              Revoke approval
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-md text-[12.5px] font-medium border"
              style={{ borderColor: "rgba(27,42,78,0.25)", color: navy }}
            >
              Cancel
            </button>
          )}
          <div className="flex items-center gap-2">
            {isEdit && (
              <button
                type="button"
                onClick={onClose}
                className="text-[12px]"
                style={{ color: "#888" }}
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="px-4 py-2 rounded-md text-[12.5px] font-semibold text-white"
              style={{ background: navy }}
            >
              {isEdit ? "Update approval" : "Record approval"}
            </button>
          </div>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmRevoke}
        title={`Revoke approval for Proof #${proofNumber}?`}
        description={
          siblingProjects.length > 0
            ? `This will affect ${siblingProjects.length + 1} project(s):\n${[project.projectName, ...siblingProjects.map((s) => s.name)].slice(0, 5).join(", ")}${siblingProjects.length + 1 > 5 ? "…" : ""}`
            : "This affects only this project."
        }
        confirmLabel="Revoke"
        destructive
        onCancel={() => setConfirmRevoke(false)}
        onConfirm={() => { setConfirmRevoke(false); void revoke(); }}
      />

      <AffectedProjectsModal
        open={!!affectedModal}
        entries={affectedModal ?? []}
        onClose={() => setAffectedModal(null)}
        onLinkClick={() => { setAffectedModal(null); onClose(); }}
      />
    </>
  );
};

// ─── small hook reading the pipeline store to find sibling projects ──────────
import { usePipelineStore } from "@/hooks/usePipelineStore";
function useSiblingsByProof(currentProjectId: string, proofNumber: string) {
  const store = usePipelineStore();
  if (!proofNumber) return [];
  return store.projects
    .filter((p) => p.id !== currentProjectId && !p.deletedAt && p.proofNumber === proofNumber)
    .map((p) => ({ id: p.id, name: p.projectName }));
}
