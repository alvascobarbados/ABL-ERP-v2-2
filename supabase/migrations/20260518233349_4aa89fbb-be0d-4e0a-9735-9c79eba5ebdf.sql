-- Phase 2a: Approval tables (document-keyed)

CREATE TABLE public.artwork_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_number text NOT NULL UNIQUE,
  approved_by_buyer_id uuid REFERENCES public.buyers(id) ON DELETE SET NULL,
  approved_by_other_name text,
  approved_on timestamptz NOT NULL,
  via_channel text NOT NULL CHECK (via_channel IN ('email','whatsapp','phone','in_person','other')),
  notes text,
  recorded_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_artwork_approvals_proof ON public.artwork_approvals(proof_number);

CREATE TABLE public.quotation_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  q_number text NOT NULL UNIQUE,
  approved_by_buyer_id uuid REFERENCES public.buyers(id) ON DELETE SET NULL,
  approved_by_other_name text,
  approved_on timestamptz NOT NULL,
  via_channel text NOT NULL CHECK (via_channel IN ('email','whatsapp','phone','in_person','other')),
  notes text,
  recorded_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_quotation_approvals_q ON public.quotation_approvals(q_number);

CREATE TABLE public.customer_po_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_po_number text NOT NULL UNIQUE,
  approved_by_buyer_id uuid REFERENCES public.buyers(id) ON DELETE SET NULL,
  approved_by_other_name text,
  approved_on timestamptz NOT NULL,
  via_channel text NOT NULL CHECK (via_channel IN ('email','whatsapp','phone','in_person','other')),
  notes text,
  recorded_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_customer_po_approvals_po ON public.customer_po_approvals(customer_po_number);

ALTER TABLE public.artwork_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_po_approvals ENABLE ROW LEVEL SECURITY;

-- Authed * policies (matching existing convention)
CREATE POLICY "Authed read artwork_approvals" ON public.artwork_approvals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write artwork_approvals" ON public.artwork_approvals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update artwork_approvals" ON public.artwork_approvals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete artwork_approvals" ON public.artwork_approvals FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authed read quotation_approvals" ON public.quotation_approvals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write quotation_approvals" ON public.quotation_approvals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update quotation_approvals" ON public.quotation_approvals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete quotation_approvals" ON public.quotation_approvals FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authed read customer_po_approvals" ON public.customer_po_approvals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write customer_po_approvals" ON public.customer_po_approvals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update customer_po_approvals" ON public.customer_po_approvals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete customer_po_approvals" ON public.customer_po_approvals FOR DELETE TO authenticated USING (true);

-- updated_at triggers
CREATE TRIGGER trg_artwork_approvals_updated_at BEFORE UPDATE ON public.artwork_approvals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_quotation_approvals_updated_at BEFORE UPDATE ON public.quotation_approvals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_customer_po_approvals_updated_at BEFORE UPDATE ON public.customer_po_approvals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Phase 2b: Project additions

ALTER TABLE public.projects
  ADD COLUMN customer_po_number text,
  ADD COLUMN email_verbal_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN email_verbal_approved_at timestamptz,
  ADD COLUMN email_verbal_approved_by_buyer_id uuid REFERENCES public.buyers(id) ON DELETE SET NULL,
  ADD COLUMN email_verbal_approved_via_channel text
    CHECK (email_verbal_approved_via_channel IN ('email','whatsapp','phone','in_person','other')),
  ADD COLUMN email_verbal_approved_notes text,
  ADD COLUMN email_verbal_approved_recorded_by_user_id text,
  ADD COLUMN order_confirmation_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX idx_projects_customer_po ON public.projects(customer_po_number);

-- Phase 2c: Customer config

ALTER TABLE public.customers
  ADD COLUMN order_confirmation_config jsonb NOT NULL DEFAULT '{
    "email":     {"mode":"not_required","conditional_modes":[],"conditional_amount_above":null},
    "quotation": {"mode":"not_required","conditional_modes":[],"conditional_amount_above":null},
    "po":        {"mode":"not_required","conditional_modes":[],"conditional_amount_above":null},
    "deposit":   {"mode":"not_required","conditional_modes":[],"conditional_amount_above":null}
  }'::jsonb;