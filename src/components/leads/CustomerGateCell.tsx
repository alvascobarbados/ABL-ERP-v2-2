/**
 * Customers list — inline Order Confirmation gate cell.
 *
 * Renders one pill per gate (Email/Verbal, Signed Quotation, Customer PO,
 * Deposit). Click cycles Required → Not Required → Conditional → Required.
 * Entering Conditional auto-opens a popover with shipping-mode chips and
 * an optional amount-above threshold; both commit immediately on change.
 * Conditional config (modes + threshold) is preserved across cycles, so
 * fast click-throughs don't destroy a configured Conditional setup.
 *
 * Writes directly to `customers.order_confirmation_config` (jsonb). Realtime
 * subscription on `customers` in useMasterData reflows the cell when the
 * row updates from another tab. The Customer Detail page's
 * OrderConfirmationRequirementsSection writes to the same field, so both
 * surfaces stay in sync.
 */
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { Customer } from "@/hooks/useMasterData";
import type { GateKey, GateConfig, OrderConfirmationConfig } from "@/lib/orderConfirmation";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { writeCustomerGateConfigAudit } from "@/lib/customerGateAudit";

type ShipMode = "Air" | "Ocean" | "Local";
const SHIP_MODES: ShipMode[] = ["Air", "Ocean", "Local"];
const GATES: GateKey[] = ["email", "quotation", "po", "deposit"];
const EMPTY_GATE: GateConfig = { mode: "not_required", conditional_modes: [], conditional_amount_above: null };

const GATE_LABELS: Record<GateKey, string> = {
  email: "Email/Verbal",
  quotation: "Signed Quotation",
  po: "Purchase Order",
  deposit: "Deposit",
};

function normalise(raw: unknown): OrderConfirmationConfig {
  const out: OrderConfirmationConfig = {
    email: { ...EMPTY_GATE }, quotation: { ...EMPTY_GATE }, po: { ...EMPTY_GATE }, deposit: { ...EMPTY_GATE },
  };
  if (raw && typeof raw === "object") {
    for (const k of GATES) {
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

interface Props { customer: Customer; gate: GateKey; }

export const CustomerGateCell = ({ customer, gate }: Props) => {
  const user = useCurrentUser();
  const cfg = normalise(customer.order_confirmation_config);
  const g = cfg[gate];
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const save = async (nextGate: GateConfig, summary: string): Promise<boolean> => {
    const prev = cfg;
    const next: OrderConfirmationConfig = { ...cfg, [gate]: nextGate };
    setBusy(true);
    const { error } = await supabase
      .from("customers")
      .update({ order_confirmation_config: next as unknown as Json })
      .eq("id", customer.id);
    // Brief perceptible feedback (~200ms) so fast clickers see saves register.
    setTimeout(() => setBusy(false), 200);
    if (error) {
      toast.error("Failed to update — please retry.");
      return false;
    }
    // Audit (fire-and-forget; mirrors the customer-detail audit shape with a source tag).
    void supabase.from("project_log_entries").insert({
      id: `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
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
        new_mode: nextGate.mode,
        old_modes: prev[gate].conditional_modes,
        new_modes: nextGate.conditional_modes,
        old_amount: prev[gate].conditional_amount_above,
        new_amount: nextGate.conditional_amount_above,
        source: "customers_list_inline",
      } as Json,
    });
    return true;
  };

  const cycle = async () => {
    if (busy) return;
    const order: GateConfig["mode"][] = ["required", "not_required", "conditional"];
    const idx = order.indexOf(g.mode);
    const nextMode = order[(idx + 1) % order.length];
    // Preserve conditional config across cycles so users can flip back.
    const nextGate: GateConfig = {
      mode: nextMode,
      conditional_modes: g.conditional_modes,
      conditional_amount_above: g.conditional_amount_above,
    };
    const ok = await save(nextGate, `${g.mode} → ${nextMode}`);
    if (ok && nextMode === "conditional") setOpen(true);
    else setOpen(false);
  };

  const updateConditional = (
    patch: Partial<Pick<GateConfig, "conditional_modes" | "conditional_amount_above">>,
    summary: string,
  ) => {
    const nextGate: GateConfig = {
      mode: "conditional",
      conditional_modes: patch.conditional_modes ?? g.conditional_modes,
      conditional_amount_above:
        patch.conditional_amount_above !== undefined ? patch.conditional_amount_above : g.conditional_amount_above,
    };
    void save(nextGate, summary);
  };

  const ariaState =
    g.mode === "required" ? "Required" : g.mode === "not_required" ? "Not Required" : "Conditional";

  return (
    <Popover open={open && g.mode === "conditional"} onOpenChange={(o) => setOpen(o)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          tabIndex={0}
          aria-label={`${GATE_LABELS[gate]}: ${ariaState} for ${customer.name}. Press to change.`}
          onClick={(e) => { e.stopPropagation(); void cycle(); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              void cycle();
            }
          }}
          className={cn(
            "inline-flex items-center justify-center gap-1 rounded-full text-[11px] font-semibold border transition-all",
            busy && "opacity-60 scale-[0.97]",
          )}
          style={{ ...pillStyle(g.mode), minWidth: 80, minHeight: 28, padding: "0 10px" }}
        >
          {pillLabel(g.mode)}
          {g.mode === "conditional" && <ChevronDown className="h-3 w-3" />}
        </button>
      </PopoverTrigger>
      {g.mode === "conditional" && (
        <PopoverContent
          align="start"
          className="w-72 p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-2"
            style={{ color: "hsl(var(--brand-navy) / 0.65)" }}
          >
            {GATE_LABELS[gate]} · Conditional
          </div>
          <div className="text-[12px] mb-1.5" style={{ color: "hsl(var(--brand-navy))" }}>
            Required when shipping mode is
          </div>
          <div className="flex gap-1.5 mb-3">
            {SHIP_MODES.map((m) => {
              const active = g.conditional_modes.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    const next = active
                      ? g.conditional_modes.filter((x) => x !== m)
                      : [...g.conditional_modes, m];
                    updateConditional(
                      { conditional_modes: next },
                      `modes: [${g.conditional_modes.join(", ") || "—"}] → [${next.join(", ") || "—"}]`,
                    );
                  }}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors"
                  style={active
                    ? { background: "hsl(var(--brand-navy))", color: "white", borderColor: "hsl(var(--brand-navy))" }
                    : { borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))" }}
                >
                  {m}
                </button>
              );
            })}
          </div>
          <div className="text-[12px] mb-1.5" style={{ color: "hsl(var(--brand-navy))" }}>
            AND/OR amount above (BBD)
          </div>
          <input
            type="number"
            min={0}
            defaultValue={g.conditional_amount_above ?? ""}
            placeholder="—"
            onBlur={(e) => {
              const raw = e.target.value.trim();
              const parsed = raw === "" ? null : Math.max(0, Number(raw));
              const value = parsed != null && Number.isFinite(parsed) ? parsed : null;
              if (value !== g.conditional_amount_above) {
                updateConditional(
                  { conditional_amount_above: value },
                  `threshold: $${g.conditional_amount_above ?? "—"} → $${value ?? "—"} BBD`,
                );
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setOpen(false);
            }}
            className="w-full px-2 py-1.5 rounded border text-[13px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.25)" }}
          />
          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1 rounded-full text-[12px] font-semibold"
              style={{ background: "hsl(var(--brand-navy))", color: "white" }}
            >
              Done
            </button>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
};

function pillLabel(mode: GateConfig["mode"]) {
  if (mode === "required") return "Req.";
  if (mode === "not_required") return "Not Req.";
  return "Cond.";
}
function pillStyle(mode: GateConfig["mode"]): React.CSSProperties {
  if (mode === "required") {
    return { background: "hsl(var(--brand-navy))", color: "white", borderColor: "hsl(var(--brand-navy))" };
  }
  if (mode === "not_required") {
    return {
      background: "transparent",
      color: "hsl(var(--muted-foreground))",
      borderColor: "hsl(var(--brand-navy) / 0.15)",
    };
  }
  return {
    background: "hsl(var(--brand-orange) / 0.08)",
    color: "hsl(var(--brand-orange))",
    borderColor: "hsl(var(--brand-orange) / 0.4)",
    fontStyle: "italic",
  };
}
