
CREATE TABLE public.quotation_email_verbal_approvals (
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

CREATE INDEX idx_quotation_email_verbal_approvals_q ON public.quotation_email_verbal_approvals(q_number);

ALTER TABLE public.quotation_email_verbal_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authed read quotation_email_verbal_approvals" ON public.quotation_email_verbal_approvals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write quotation_email_verbal_approvals" ON public.quotation_email_verbal_approvals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update quotation_email_verbal_approvals" ON public.quotation_email_verbal_approvals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete quotation_email_verbal_approvals" ON public.quotation_email_verbal_approvals FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_updated_at_quotation_email_verbal_approvals
BEFORE UPDATE ON public.quotation_email_verbal_approvals
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.quotation_email_verbal_approvals;
ALTER TABLE public.quotation_email_verbal_approvals REPLICA IDENTITY FULL;

-- Data migration: move existing per-project email/verbal records keyed by quote_number.
-- (Zero rows expected; UNIQUE on q_number means ON CONFLICT skip if collision.)
INSERT INTO public.quotation_email_verbal_approvals
  (q_number, approved_by_buyer_id, approved_by_other_name, approved_on, via_channel, notes, recorded_by_user_id, created_at)
SELECT DISTINCT ON (quote_number)
  quote_number,
  email_verbal_approved_by_buyer_id,
  email_verbal_approved_other_name,
  COALESCE(email_verbal_approved_at, now()),
  COALESCE(email_verbal_approved_via_channel, 'email'),
  email_verbal_approved_notes,
  COALESCE(email_verbal_approved_recorded_by_user_id, 'system'),
  COALESCE(email_verbal_approved_at, now())
FROM public.projects
WHERE email_verbal_approved = true AND quote_number IS NOT NULL AND deleted_at IS NULL
ORDER BY quote_number, email_verbal_approved_at ASC NULLS LAST
ON CONFLICT (q_number) DO NOTHING;
