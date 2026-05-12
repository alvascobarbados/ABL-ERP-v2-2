
ALTER TABLE public.customers DROP COLUMN IF EXISTS industry;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS incoterms text;

UPDATE public.customers SET country = 'Local' WHERE country IS NULL;

ALTER TABLE public.customers
  ALTER COLUMN country SET DEFAULT 'Local',
  ALTER COLUMN country SET NOT NULL,
  ADD CONSTRAINT customers_country_check CHECK (country IN ('Local','Regional')),
  ADD CONSTRAINT customers_incoterms_check CHECK (incoterms IS NULL OR incoterms IN ('FOB','CIF','LDP','LDF'));

CREATE UNIQUE INDEX IF NOT EXISTS customers_name_lower_unique ON public.customers (LOWER(name));

CREATE TABLE public.buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  contact text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX buyers_customer_id_idx ON public.buyers (customer_id);

ALTER TABLE public.buyers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authed read buyers" ON public.buyers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authed write buyers" ON public.buyers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authed update buyers" ON public.buyers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authed delete buyers" ON public.buyers FOR DELETE TO authenticated USING (true);

CREATE TRIGGER buyers_set_updated_at
  BEFORE UPDATE ON public.buyers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.buyers;

INSERT INTO public.buyers (customer_id, name)
SELECT DISTINCT c.id, p.contact_person
FROM public.projects p
JOIN public.customers c ON c.name = p.customer
WHERE p.contact_person IS NOT NULL AND p.contact_person <> '';

INSERT INTO public.project_log_entries (id, project_id, ts, actor_user_id, actor_display_name, action_type, description, metadata)
SELECT
  'sys-buyer-migration-' || extract(epoch from now())::bigint,
  (SELECT id FROM public.projects ORDER BY created_at LIMIT 1),
  now(),
  'system',
  'System',
  'field_edit',
  'System migrated ' || COUNT(*)::text || ' historical contact persons into Buyer records',
  jsonb_build_object('buyers_created', COUNT(*), 'system_wide', true)
FROM public.buyers;
