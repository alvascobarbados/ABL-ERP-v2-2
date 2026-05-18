/**
 * Project Detail — APPROVALS subsection (Phase 5, read-only display).
 *
 * Lives inside the STATUS card, below the Move Forward / Flag row.
 * Renders two rows (Artwork + Order Confirmation), driven by Phase 3
 * compute functions. Click handlers are stubs except the "Configure now"
 * nav to the customer page; Phase 6 will wire real approval sheets.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Palette, Handshake, type LucideIcon } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMasterData, type Customer } from "@/hooks/useMasterData";
import type { Project } from "@/data/pipelines";
import {
  computeArtworkState,
  computeOrderConfirmationState,
  type ArtworkApprovalRow,
  type QuotationApprovalRow,
  type CustomerPoApprovalRow,
  type GateKey,
} from "@/lib/orderConfirmation";

const NAVY = "hsl(var(--brand-navy))";
const ORANGE = "#E97B2C";
const GREEN = "#2E7D32";
const GRAY_ICON = "#C8C5BC";
const CHEVRON = "#C8C5BC";
const MUTED = "#999";
const SUB = "#555";

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  phone: "Phone",
  in_person: "In Person",
  other: "Other",
};

const GATE_FRIENDLY: Record<GateKey, string> = {
  email: "Email/Verbal",
  quotation: "Signed Quotation",
  po: "Purchase Order",
  deposit: "Deposit",
};

function fmtTs(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    return format(new Date(ts), "d MMM yyyy, h:mm a");
  } catch {
    return "—";
  }
}

export const ApprovalsSubsection = ({ project }: { project: Project }) => {
  const navigate = useNavigate();
  const md = useMasterData();

  const customer: Customer | undefined = md.customers.find((c) => c.name === project.customer);

  const [artworkApproval, setArtworkApproval] = useState<ArtworkApprovalRow | null>(null);
  const [quotationApproval, setQuotationApproval] = useState<QuotationApprovalRow | null>(null);
  const [customerPoApproval, setCustomerPoApproval] = useState<CustomerPoApprovalRow | null>(null);

  const proofNumber = project.proofNumber ?? null;
  const quoteNumber = project.quoteNumber ?? null;
  const customerPoNumber = project.customerPoNumber ?? null;

  const refetch = useMemo(
    () => async () => {
      const [a, q, p] = await Promise.all([
        proofNumber
          ? supabase.from("artwork_approvals").select("*").eq("proof_number", proofNumber).maybeSingle()
          : Promise.resolve({ data: null }),
        quoteNumber
          ? supabase.from("quotation_approvals").select("*").eq("q_number", quoteNumber).maybeSingle()
          : Promise.resolve({ data: null }),
        customerPoNumber
          ? supabase.from("customer_po_approvals").select("*").eq("customer_po_number", customerPoNumber).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setArtworkApproval((a.data as ArtworkApprovalRow | null) ?? null);
      setQuotationApproval((q.data as QuotationApprovalRow | null) ?? null);
      setCustomerPoApproval((p.data as CustomerPoApprovalRow | null) ?? null);
    },
    [proofNumber, quoteNumber, customerPoNumber],
  );

  useEffect(() => {
    void refetch();
    const onFocus = () => void refetch();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

  // ── Compute state ──────────────────────────────────────────────────────────
  const artworkState = useMemo(() => {
    const lookup = proofNumber && artworkApproval ? { [proofNumber]: artworkApproval } : {};
    return computeArtworkState(project, lookup);
  }, [project, proofNumber, artworkApproval]);

  const orderState = useMemo(() => {
    const lookup = {
      quotation: quoteNumber && quotationApproval ? { [quoteNumber]: quotationApproval } : {},
      po: customerPoNumber && customerPoApproval ? { [customerPoNumber]: customerPoApproval } : {},
    };
    const cust = customer
      ? { order_confirmation_config: customer.order_confirmation_config }
      : { order_confirmation_config: { email: { mode: "not_required" as const, conditional_modes: [], conditional_amount_above: null }, quotation: { mode: "not_required" as const, conditional_modes: [], conditional_amount_above: null }, po: { mode: "not_required" as const, conditional_modes: [], conditional_amount_above: null }, deposit: { mode: "not_required" as const, conditional_modes: [], conditional_amount_above: null } } };
    return computeOrderConfirmationState(project, cust, lookup);
  }, [project, customer, quoteNumber, quotationApproval, customerPoNumber, customerPoApproval]);

  // ── Click handlers ─────────────────────────────────────────────────────────
  const handleOpenArtworkSheet = () => {
    console.log({ project_id: project.id, action: "open_artwork_sheet" });
    toast.info("Approval editor opens in next phase");
  };
  const handleOpenOrderSheet = () => {
    console.log({ project_id: project.id, action: "open_order_sheet" });
    toast.info("Approval editor opens in next phase");
  };
  const handleConfigureCustomer = () => {
    if (!customer) return;
    navigate(`/customers?customer=${customer.id}#order-confirmation-requirements`);
    setTimeout(() => {
      document
        .getElementById("order-confirmation-requirements")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // ── Artwork row content ────────────────────────────────────────────────────
  const artworkRow = (() => {
    if (!proofNumber) {
      return {
        iconColor: GRAY_ICON,
        chevron: false,
        cursor: "default" as const,
        onClick: undefined,
        line1: { text: "Artwork not yet approved", color: NAVY, weight: 500 },
        line2: { text: "Set a Proof # first", color: MUTED },
        line3: null as { text: string; color: string } | null,
      };
    }
    if (artworkState === "gray") {
      return {
        iconColor: GRAY_ICON,
        chevron: true,
        cursor: "pointer" as const,
        onClick: handleOpenArtworkSheet,
        line1: { text: "Artwork not yet approved", color: NAVY, weight: 500 },
        line2: { text: "Tap to record", color: ORANGE, weight: 500 },
        line3: null,
      };
    }
    // green
    const buyerName = artworkApproval?.approved_by_buyer_id
      ? md.buyers.find((b) => b.id === artworkApproval.approved_by_buyer_id)?.name ?? "—"
      : artworkApproval?.approved_by_other_name ?? "—";
    const channelLabel = CHANNEL_LABEL[artworkApproval!.via_channel] ?? artworkApproval!.via_channel;
    const recorder = md.teamMembers.find((t) => t.id === artworkApproval!.recorded_by_user_id);
    const recorderName = recorder
      ? recorder.full_name.split(/\s+/)[0]
      : artworkApproval!.recorded_by_user_id;
    return {
      iconColor: GREEN,
      chevron: true,
      cursor: "pointer" as const,
      onClick: handleOpenArtworkSheet,
      line1: { text: "Artwork approved", color: NAVY, weight: 500 },
      line2: { text: `Proof #${artworkApproval!.proof_number} from ${buyerName} via ${channelLabel}`, color: SUB },
      line3: { text: `${fmtTs(artworkApproval!.approved_on)} · by ${recorderName}`, color: MUTED },
    };
  })();

  // ── Order row content ──────────────────────────────────────────────────────
  const orderRow = (() => {
    if (orderState.required === 0) {
      return {
        iconColor: GRAY_ICON,
        chevron: true,
        cursor: "pointer" as const,
        onClick: handleConfigureCustomer,
        line1: { text: "Order confirmation pending", color: NAVY, weight: 500 },
        line2: {
          text: `Configure ${customer?.name ?? "customer"}'s requirements →`,
          color: ORANGE,
          weight: 500,
        },
        line3: null as { text: string; color: string } | null,
      };
    }
    if (orderState.state === "gray") {
      return {
        iconColor: GRAY_ICON,
        chevron: true,
        cursor: "pointer" as const,
        onClick: handleOpenOrderSheet,
        line1: { text: "Order not yet confirmed", color: NAVY, weight: 500 },
        line2: { text: "Tap to record", color: ORANGE, weight: 500 },
        line3: null,
      };
    }
    if (orderState.state === "orange") {
      const missing = orderState.requiredGates
        .filter((g) => !orderState.satisfiedGates.includes(g))
        .map((g) => GATE_FRIENDLY[g])
        .join(", ");
      return {
        iconColor: ORANGE,
        chevron: true,
        cursor: "pointer" as const,
        onClick: handleOpenOrderSheet,
        line1: { text: "Order confirmation in progress", color: ORANGE, weight: 500 },
        line2: {
          text: `${orderState.satisfied} of ${orderState.required} satisfied · awaiting ${missing}`,
          color: SUB,
        },
        line3: null,
      };
    }
    // green
    const tsCandidates: (string | null | undefined)[] = [];
    for (const g of orderState.requiredGates) {
      if (g === "email") tsCandidates.push(project.emailVerbalApprovedAt);
      else if (g === "quotation") tsCandidates.push(quotationApproval?.approved_on);
      else if (g === "po") tsCandidates.push(customerPoApproval?.approved_on);
      else if (g === "deposit") tsCandidates.push(project.depositPaidDate);
    }
    const valid = tsCandidates.filter((x): x is string => !!x);
    const latest = valid.length
      ? valid.reduce<string>((a, b) => (new Date(a).getTime() > new Date(b).getTime() ? a : b))
      : null;
    return {
      iconColor: GREEN,
      chevron: true,
      cursor: "pointer" as const,
      onClick: handleOpenOrderSheet,
      line1: { text: "Order confirmed", color: NAVY, weight: 500 },
      line2: { text: `All ${orderState.required} requirements satisfied`, color: SUB },
      line3: { text: `Latest: ${fmtTs(latest)}`, color: MUTED },
    };
  })();

  return (
    <>
      <div style={{ borderTop: "0.5px solid rgba(27,42,78,0.08)", margin: "14px -14px 0" }} />
      <div
        style={{
          fontSize: 9.5,
          letterSpacing: "0.1em",
          color: MUTED,
          textTransform: "uppercase",
          fontWeight: 500,
          padding: "4px 0 10px",
        }}
      >
        Approvals
      </div>

      <ApprovalRow icon={Palette} content={artworkRow} divider />
      <ApprovalRow icon={Handshake} content={orderRow} extraPadding />
    </>
  );
};

const ApprovalRow = ({
  icon: Icon,
  content,
  divider,
  extraPadding,
}: {
  icon: LucideIcon;
  content: {
    iconColor: string;
    chevron: boolean;
    cursor: "pointer" | "default";
    onClick?: () => void;
    line1: { text: string; color: string; weight?: number };
    line2: { text: string; color: string; weight?: number };
    line3: { text: string; color: string } | null;
  };
  divider?: boolean;
  extraPadding?: boolean;
}) => (
  <div
    onClick={content.onClick}
    role={content.cursor === "pointer" ? "button" : undefined}
    tabIndex={content.cursor === "pointer" ? 0 : undefined}
    onKeyDown={(e) => {
      if (content.cursor === "pointer" && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        content.onClick?.();
      }
    }}
    style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      padding: extraPadding ? "10px 0" : "8px 0",
      cursor: content.cursor,
      borderBottom: divider ? "0.5px solid rgba(27,42,78,0.06)" : undefined,
    }}
  >
    <div style={{ flexShrink: 0, marginTop: 1, color: content.iconColor, lineHeight: 0 }}>
      <Icon size={22} color={content.iconColor} strokeWidth={1.75} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12.5, color: content.line1.color, fontWeight: content.line1.weight ?? 400, lineHeight: 1.35 }}>
        {content.line1.text}
      </div>
      <div style={{ fontSize: 11, color: content.line2.color, fontWeight: content.line2.weight ?? 400, marginTop: 2, lineHeight: 1.35 }}>
        {content.line2.text}
      </div>
      {content.line3 && (
        <div style={{ fontSize: 10.5, color: content.line3.color, marginTop: 2, lineHeight: 1.35 }}>
          {content.line3.text}
        </div>
      )}
    </div>
    {content.chevron && (
      <ChevronRight size={14} color={CHEVRON} style={{ marginTop: 2, flexShrink: 0 }} />
    )}
  </div>
);
