/**
 * Customer Detail — ORDER CONFIRMATION REQUIREMENTS section (Phase 4).
 *
 * Renders the 4 gates (Email/Verbal, Signed Quotation, Purchase Order, Order
 * Deposit) as 3-pill segmented controls. "Required when…" expands a paper
 * sub-panel with shipping-mode chips + amount-above input. Result preview
 * card recomputes live per shipping mode. Saves on change with debounce.
 *
 * On save, queries open projects for this customer, computes state
 * transitions, and shows a confirm modal when any project's order-confirmation
 * state changes. Cancel reverts; Apply writes per-project consequence audit.
 *
 * Cmd+Z undo: a single inverse restores the prior config (and the next state
 * recompute cascades via Phase 7 triggers when those land).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { SectionHeader, SectionCard } from "@/components/leads/ProjectDetail";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import type { Customer } from "@/hooks/useMasterData";
import {
  computeOrderConfirmationState,
  type GateKey,
  type GateConfig,
  type OrderConfirmationConfig,
  type ApprovalRowsLookup,
} from "@/lib/orderConfirmation";
import { pushUndo, makeUndoId } from "@/hooks/useUndoStack";

type ShipMode = "Air" | "Ocean" | "Local";

const GATE_KEYS: GateKey[] = ["email", "quotation", "po", "deposit"];
const GATE_LABELS: Record<GateKey, string> = {
  email: "Email/Verbal Approval",
  quotation: "Signed Quotation",
  po: "Purchase Order",
  deposit: "Order Deposit",
};
const GATE_SHORT: Record<GateKey, string> = {
  email: "Email/Verbal",
  quotation: "Signed Quotation",
  po: "Purchase Order",
  deposit: "Deposit",
};

const EMPTY_GATE: GateConfig = { mode: "not_required", conditional_modes: [], conditional_amount_above: null };
const DEFAULT_CONFIG: OrderConfirmationConfig = {
  email: { ...EMPTY_GATE }, quotation: { ...EMPTY_GATE }, po: { ...EMPTY_GATE }, deposit: { ...EMPTY_GATE },
};

function normaliseConfig(raw: unknown): OrderConfirmationConfig {
  const out = { ...DEFAULT_CONFIG };
  if (raw && typeof raw === "object") {
    for (const k of GATE_KEYS) {
      const g = (raw as Record<string, GateConfig | undefined>)[k];
      if (g && (g.mode === "required" || g.mode === "not_required" || g.mode === "conditional")) {
        out[k] = {
          mode: g.mode,
          conditional_modes: Array.isArray(g.conditional_modes) ? (g.conditional_modes as ShipMode[]) : [],
          conditional_amount_above: typeof g.conditional_amount_above === "number" ? g.conditional_amount_above : null,
        };
      }
    }
  }
  return out;
}

const navy = "hsl(var(--brand-navy))";
const paperBg = "hsl(var(--paper, 39 28% 95%))";

// ─────────────────────────────────────────────────────────────────────────────

interface Props { customer: Customer; }

export const OrderConfirmationRequirementsSection = ({ customer }: Props) => {
  const user = useCurrentUser();
  const store = usePipelineStore();
  const [config, setConfig] = useState<OrderConfirmationConfig>(() => normaliseConfig(customer.order_confirmation_config));
  const [savedConfig, setSavedConfig] = useState<OrderConfirmationConfig>(config);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pending, setPending] = useState<{ next: OrderConfirmationConfig; gate: GateKey; summary: string; transitions: TransitionSummary } | null>(null);
  const lastConfigRef = useRef(config);

  // Resync if the customer object changes from upstream
  useEffect(() => {
    const fresh = normaliseConfig(customer.order_confirmation_config);
    setConfig(fresh); setSavedConfig(fresh); lastConfigRef.current = fresh;
  }, [customer.id]);

  // Persist + audit + transitions check
  const commit = async (next: OrderConfirmationConfig, gate: GateKey, summary: string) => {
    setConfig(next);
    // Compute state transitions for this customer's open projects
    const transitions = await computeTransitions(customer, savedConfig, next);
    if (transitions.changes.length > 0) {
      // Show modal first — don't persist until user confirms
      setPending({ next, gate, summary, transitions });
      return;
    }
    await persist(next, gate, summary, []);
  };

  const persist = async (
    next: OrderConfirmationConfig,
    gate: GateKey,
    summary: string,
    transitionChanges: TransitionChange[],
  ) => {
    const prev = savedConfig;
    const { error } = await supabase
      .from("customers")
      .update({ order_confirmation_config: next as any })
      .eq("id", customer.id);
    if (error) {
      toast.error(`Couldn't save: ${error.message}`);
      setConfig(prev);
      return;
    }
    setSavedConfig(next);

    // Audit: customer-level entry on __system__ project
    const logId = `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    await supabase.from("project_log_entries").insert({
      id: logId,
      project_id: "__system__",
      ts: new Date().toISOString(),
      actor_user_id: user.userId,
      actor_display_name: user.shortName,
      action_type: "customer_gate_config_change",
      description: `${user.shortName} changed ${customer.name}'s ${GATE_LABELS[gate]} requirement: ${summary}`,
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
      } as any,
    });

    // Per-project consequence audits
    for (const ch of transitionChanges) {
      await supabase.from("project_log_entries").insert({
        id: `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        project_id: ch.projectId,
        ts: new Date().toISOString(),
        actor_user_id: user.userId,
        actor_display_name: user.shortName,
        action_type: "customer_gate_config_consequence",
        description: `Order confirmation state changed: ${ch.oldState} → ${ch.newState} due to ${customer.name} requirements update`,
        metadata: {
          trigger: "customer_gate_config_change",
          customer_id: customer.id,
          gate,
          old_state: ch.oldState,
          new_state: ch.newState,
          parent_log_id: logId,
        } as any,
      });
    }

    // Register undo
    pushUndo({
      id: makeUndoId(),
      timestamp: Date.now(),
      description: `${customer.name} · ${GATE_LABELS[gate]} requirement`,
      originalLogId: logId,
      originalDescription: `Changed ${GATE_LABELS[gate]} requirement`,
      applyInverse: async () => {
        const { error: e2 } = await supabase
          .from("customers")
          .update({ order_confirmation_config: prev as any })
          .eq("id", customer.id);
        if (e2) return { ok: false, reason: "Couldn't restore previous configuration" };
        setConfig(prev); setSavedConfig(prev);
        // Cascade audit (single entry on __system__)
        await supabase.from("project_log_entries").insert({
          id: `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          project_id: "__system__",
          ts: new Date().toISOString(),
          actor_user_id: user.userId,
          actor_display_name: user.shortName,
          action_type: "customer_gate_config_change",
          description: `${user.shortName} undid: ${GATE_LABELS[gate]} requirement on ${customer.name}`,
          metadata: { undo_of: logId, customer_id: customer.id, gate } as any,
        });
        return { ok: true };
      },
    });

    toast.success(`${customer.name} · ${GATE_LABELS[gate]} saved`);
  };

  const confirmModalApply = async () => {
    if (!pending) return;
    await persist(pending.next, pending.gate, pending.summary, pending.transitions.changes);
    setPending(null);
  };
  const confirmModalCancel = () => {
    if (!pending) return;
    setConfig(savedConfig);
    setPending(null);
  };

  // ── Mutators (each one builds `next`, then calls commit) ─────────────────
  const setMode = (gate: GateKey, mode: GateConfig["mode"]) => {
    const next: OrderConfirmationConfig = { ...config, [gate]: { ...config[gate], mode } };
    if (mode !== "conditional") {
      next[gate].conditional_modes = [];
      next[gate].conditional_amount_above = null;
    }
    const summary = `${savedConfig[gate].mode} → ${mode}`;
    void commit(next, gate, summary);
  };
  const toggleConditionalMode = (gate: GateKey, m: ShipMode) => {
    const cur = config[gate].conditional_modes;
    const has = cur.includes(m);
    const newModes = has ? cur.filter((x) => x !== m) : [...cur, m];
    const next: OrderConfirmationConfig = { ...config, [gate]: { ...config[gate], conditional_modes: newModes } };
    void commit(next, gate, `modes: [${cur.join(", ") || "—"}] → [${newModes.join(", ") || "—"}]`);
  };

  // Debounced threshold edit
  const thresholdTimers = useRef<Record<GateKey, ReturnType<typeof setTimeout> | null>>({
    email: null, quotation: null, po: null, deposit: null,
  });
  const setThreshold = (gate: GateKey, raw: string) => {
    const parsed = raw.trim() === "" ? null : Math.max(0, Number(raw));
    const value = parsed != null && Number.isFinite(parsed) ? parsed : null;
    const next: OrderConfirmationConfig = { ...config, [gate]: { ...config[gate], conditional_amount_above: value } };
    setConfig(next); // optimistic, no commit yet
    if (thresholdTimers.current[gate]) clearTimeout(thresholdTimers.current[gate]!);
    thresholdTimers.current[gate] = setTimeout(() => {
      void commit(next, gate, `threshold: $${savedConfig[gate].conditional_amount_above ?? "—"} → $${value ?? "—"} BBD`);
    }, 500);
  };

  // ── Compute transitions for the modal ────────────────────────────────────
  async function computeTransitions(c: Customer, before: OrderConfirmationConfig, after: OrderConfirmationConfig): Promise<TransitionSummary> {
    const openProjects = store.projects.filter(
      (p) => p.customer === c.name && !p.deletedAt && p.stage !== "completed",
    );
    if (openProjects.length === 0) return { changes: [], openCount: 0 };

    // Fetch approval rows so quotation/PO gates resolve accurately
    const qs = Array.from(new Set(openProjects.map((p) => p.quoteNumber).filter(Boolean) as string[]));
    const pos = Array.from(new Set(openProjects.map((p) => p.customerPoNumber).filter(Boolean) as string[]));
    const lookup: ApprovalRowsLookup = { quotation: {}, po: {} };
    if (qs.length) {
      const { data } = await supabase.from("quotation_approvals" as any).select("*").in("q_number", qs);
      for (const r of (data ?? []) as any[]) lookup.quotation[r.q_number] = r;
    }
    if (pos.length) {
      const { data } = await supabase.from("customer_po_approvals" as any).select("*").in("customer_po_number", pos);
      for (const r of (data ?? []) as any[]) lookup.po[r.customer_po_number] = r;
    }

    const changes: TransitionChange[] = [];
    for (const p of openProjects) {
      const oldS = computeOrderConfirmationState(p, { order_confirmation_config: before }, lookup).state;
      const newS = computeOrderConfirmationState(p, { order_confirmation_config: after }, lookup).state;
      if (oldS !== newS) changes.push({ projectId: p.id, projectName: p.projectName, oldState: oldS, newState: newS });
    }
    return { changes, openCount: openProjects.length };
  }

  // ── Result preview (live) ────────────────────────────────────────────────
  const preview = useMemo(() => {
    const fakeLookup: ApprovalRowsLookup = { quotation: {}, po: {} };
    const synthetic = (mode: ShipMode) => ({ shippingMode: mode, value: 999_999_999 });
    return (["Air", "Ocean", "Local"] as ShipMode[]).map((mode) => {
      const st = computeOrderConfirmationState(synthetic(mode), { order_confirmation_config: config }, fakeLookup);
      const labels = st.requiredGates.map((g) => {
        const cfg = config[g];
        const hasThreshold = cfg.mode === "conditional" && cfg.conditional_amount_above != null;
        return hasThreshold ? `${GATE_SHORT[g]} (> $${cfg.conditional_amount_above!.toLocaleString()} BBD)` : GATE_SHORT[g];
      });
      return { mode, label: labels.length ? labels.join(", ") : "no requirements set" };
    });
  }, [config]);

  return (
    <section>
      <SectionHeader>Order Confirmation Requirements</SectionHeader>
      <SectionCard>
        <div className="space-y-0">
          {GATE_KEYS.map((g, i) => (
            <div key={g} style={{ padding: i === 0 ? "0 0 10px 0" : "10px 0", borderTop: i === 0 ? "none" : "0.5px solid rgba(27,42,78,0.06)" }}>
              <GateRow
                gate={g}
                config={config[g]}
                onSetMode={(m) => setMode(g, m)}
                onToggleMode={(m) => toggleConditionalMode(g, m)}
                onSetThreshold={(v) => setThreshold(g, v)}
              />
            </div>
          ))}
        </div>

        {/* Result preview */}
        <div className="mt-4 pt-3" style={{ borderTop: "0.5px solid rgba(27,42,78,0.06)" }}>
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            Result preview
            {previewOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {previewOpen && (
            <div className="mt-2 space-y-1">
              {preview.map((p) => (
                <div key={p.mode} className="text-[12px]" style={{ color: navy }}>
                  <span className="font-semibold">{p.mode} orders:</span>{" "}
                  <span style={{ color: p.label === "no requirements set" ? "hsl(var(--muted-foreground))" : navy }}>{p.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <ConfirmDialog
        open={!!pending}
        title={pending ? `Update affects ${pending.transitions.changes.length} of ${pending.transitions.openCount} open projects` : ""}
        description={pending ? buildTransitionsDescription(pending.transitions, customer.name) : ""}
        confirmLabel="Apply"
        onCancel={confirmModalCancel}
        onConfirm={confirmModalApply}
      />
    </section>
  );
};

interface TransitionChange { projectId: string; projectName: string; oldState: "gray" | "orange" | "green"; newState: "gray" | "orange" | "green"; }
interface TransitionSummary { changes: TransitionChange[]; openCount: number; }

function buildTransitionsDescription(t: TransitionSummary, customerName: string): string {
  const greenToOther = t.changes.filter((c) => c.oldState === "green" && c.newState !== "green").length;
  const otherToGreen = t.changes.filter((c) => c.newState === "green" && c.oldState !== "green").length;
  const other = t.changes.length - greenToOther - otherToGreen;
  const lines: string[] = [];
  if (greenToOther) lines.push(`${greenToOther} fully confirmed → in progress (gate now required)`);
  if (otherToGreen) lines.push(`${otherToGreen} in progress → fully confirmed (gate no longer required)`);
  if (other) lines.push(`${other} other state changes`);
  return `${lines.join("\n")}\n\nContinue updating ${customerName}'s requirements?`;
}

// ─────────────────────────────────────────────────────────────────────────────

const GateRow = ({
  gate, config, onSetMode, onToggleMode, onSetThreshold,
}: {
  gate: GateKey; config: GateConfig;
  onSetMode: (m: GateConfig["mode"]) => void;
  onToggleMode: (m: ShipMode) => void;
  onSetThreshold: (raw: string) => void;
}) => {
  const isConditional = config.mode === "conditional";
  const noConditions = isConditional && config.conditional_modes.length === 0 && config.conditional_amount_above == null;

  return (
    <div>
      <div className="text-[13px] font-medium mb-1.5" style={{ color: navy }}>{GATE_LABELS[gate]}</div>
      <div className="flex gap-1">
        {(["required", "not_required", "conditional"] as const).map((m) => (
          <ModePill key={m} selected={config.mode === m} onClick={() => onSetMode(m)}>
            {m === "required" ? "Required" : m === "not_required" ? "Not required" : "Required when…"}
          </ModePill>
        ))}
      </div>

      {isConditional && (
        <div className="mt-2.5" style={{ background: paperBg, borderRadius: 6, padding: "10px 12px" }}>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.06em] mb-1.5" style={{ color: "#888" }}>Shipping mode</div>
          <div className="flex gap-1.5 flex-wrap">
            {(["Air", "Ocean", "Local"] as ShipMode[]).map((m) => {
              const on = config.conditional_modes.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => onToggleMode(m)}
                  style={{
                    padding: "4px 9px", borderRadius: 5, fontSize: 11, fontWeight: 500,
                    background: on ? navy : "#fff",
                    color: on ? "#fff" : "#888",
                    border: on ? "none" : "0.5px solid #D9D6CC",
                  }}
                >
                  {on ? `✓ ${m}` : m}
                </button>
              );
            })}
          </div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.06em] mt-2.5 mb-1.5" style={{ color: "#888" }}>Amount above</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              defaultValue={config.conditional_amount_above ?? ""}
              onChange={(e) => onSetThreshold(e.target.value)}
              placeholder="—"
              style={{
                width: 140, padding: "5px 8px", borderRadius: 5, fontSize: 12,
                border: "0.5px solid #D9D6CC", background: "#fff", color: navy,
              }}
            />
            <span className="text-[11px]" style={{ color: "#888" }}>BBD</span>
          </div>
          {noConditions && (
            <div className="mt-2 text-[11px] italic" style={{ color: "hsl(var(--muted-foreground))" }}>
              Set at least one condition, or the gate will never apply.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ModePill = ({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      padding: "5px 10px", borderRadius: 5, fontSize: 11, fontWeight: 500,
      background: selected ? navy : "#fff",
      color: selected ? "#fff" : "#888",
      border: selected ? "none" : "0.5px solid #D9D6CC",
    }}
  >
    {children}
  </button>
);
