-- Ensure full row payloads are broadcast on UPDATE/DELETE
ALTER TABLE public.projects REPLICA IDENTITY FULL;
ALTER TABLE public.line_items REPLICA IDENTITY FULL;
ALTER TABLE public.project_notes REPLICA IDENTITY FULL;
ALTER TABLE public.project_log_entries REPLICA IDENTITY FULL;
ALTER TABLE public.customers REPLICA IDENTITY FULL;
ALTER TABLE public.suppliers REPLICA IDENTITY FULL;
ALTER TABLE public.team_members REPLICA IDENTITY FULL;
ALTER TABLE public.shipments REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;

-- Add tables to the realtime publication (idempotent: skip if already added)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'projects','line_items','project_notes','project_log_entries',
    'customers','suppliers','team_members','shipments','products'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;