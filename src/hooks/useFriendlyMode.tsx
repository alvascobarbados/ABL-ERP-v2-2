import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { PipelineId, StageId } from "@/data/pipelines";

const STORAGE_KEY = "alvasco.friendlyMode";
const DISMISS_PREFIX = "alvasco.tip.dismissed:";
const WALKTHROUGH_KEY = "alvasco.walkthrough.completed";

interface FriendlyModeCtx {
  friendly: boolean;
  setFriendly: (v: boolean) => void;
  toggle: () => void;
  isTipDismissed: (id: string) => boolean;
  dismissTip: (id: string) => void;
  walkthroughDone: boolean;
  completeWalkthrough: () => void;
  resetWalkthrough: () => void;
}

const Ctx = createContext<FriendlyModeCtx | null>(null);

export const FriendlyModeProvider = ({ children }: { children: ReactNode }) => {
  const [friendly, setFriendlyState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true; // default ON
    return raw === "true";
  });
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const all = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(DISMISS_PREFIX)) all.add(k.slice(DISMISS_PREFIX.length));
    }
    return all;
  });
  const [walkthroughDone, setWalkthroughDone] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(WALKTHROUGH_KEY) === "true";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (friendly) root.classList.add("friendly"); else root.classList.remove("friendly");
  }, [friendly]);

  const setFriendly = useCallback((v: boolean) => {
    setFriendlyState(v);
    localStorage.setItem(STORAGE_KEY, String(v));
  }, []);
  const toggle = useCallback(() => setFriendly(!friendly), [friendly, setFriendly]);

  const isTipDismissed = useCallback((id: string) => dismissed.has(id), [dismissed]);
  const dismissTip = useCallback((id: string) => {
    localStorage.setItem(DISMISS_PREFIX + id, "true");
    setDismissed((prev) => new Set(prev).add(id));
  }, []);
  const completeWalkthrough = useCallback(() => {
    localStorage.setItem(WALKTHROUGH_KEY, "true");
    setWalkthroughDone(true);
  }, []);
  const resetWalkthrough = useCallback(() => {
    localStorage.removeItem(WALKTHROUGH_KEY);
    setWalkthroughDone(false);
  }, []);

  const value = useMemo<FriendlyModeCtx>(
    () => ({ friendly, setFriendly, toggle, isTipDismissed, dismissTip, walkthroughDone, completeWalkthrough, resetWalkthrough }),
    [friendly, setFriendly, toggle, isTipDismissed, dismissTip, walkthroughDone, completeWalkthrough, resetWalkthrough],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useFriendlyMode = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFriendlyMode must be used inside FriendlyModeProvider");
  return ctx;
};

// ─── Plain-language labels ───
export const FRIENDLY_STAGE_LABELS: Record<StageId, string> = {
  proposal: "Proposal — needs writing",
  quote: "Quote — needs pricing",
  confirming: "Waiting for customer to confirm",
  archive: "Archive — closed or paused",
  preproduction: "Pre-Production — getting ready to make",
  in_production: "In Production — being made at the factory",
  shipment_required: "Awaiting shipment assignment",
  shipment_assigned: "On the way (in transit)",
  invoice_required: "Invoice Required — needs invoicing",
  invoiced: "Invoiced — waiting for payment",
  paid: "Paid — complete",
};

export const FRIENDLY_PIPELINE_SUBTITLES: Record<PipelineId, string> = {
  sales: "Getting new business",
  operations: "Making the goods",
  shipping: "Moving the goods",
  finance: "Invoicing and getting paid",
};

export const FRIENDLY_STAGE_HELP: Record<StageId, string> = {
  proposal: "New enquiries that need a written proposal. Once you've sent the proposal, move forward to Quote.",
  quote: "Projects that need pricing worked out and sent to the customer. Once you've sent the quote, move forward to Confirming.",
  confirming: "Quote sent. Waiting for the customer to say yes. When they confirm, the project splits into items and moves into Production.",
  archive: "Closed or paused projects — cold leads, lost deals, or anything not actively progressing. Tags inside (Cold / Lost / Other) keep the distinction.",
  preproduction: "Order is being prepared internally before the factory starts making it — artwork, sign-offs, factory PO, deposit. Move forward when the factory begins producing.",
  in_production: "The factory has the order and is making it. When production finishes, the item moves to Shipping for shipment assignment.",
  shipment_required: "Production is done — the item is waiting to be assigned to a shipment (Air or Ocean). Tap the banner to assign.",
  shipment_assigned: "On a shipment and in transit. When the whole shipment is delivered, every item on it moves to Finance · Invoice Required.",
  
  invoice_required: "Goods delivered — finance team needs to issue the invoice. Move forward once the invoice has been sent.",
  invoiced: "Invoice has been sent. Move forward when the customer pays.",
  paid: "Project is complete and paid. 🎉",
};
