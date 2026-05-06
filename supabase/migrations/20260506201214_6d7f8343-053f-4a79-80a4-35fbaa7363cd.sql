
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['projects','customers','suppliers','team_members','products','project_notes','project_log_entries','line_items','shipments'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Public read %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Public write %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Public update %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Public delete %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Public read team" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Public write team" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Public update team" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Public delete team" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Public read project_log" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Public write project_log" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Public update project_log" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Public delete project_log" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can read team members" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Authed read %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Authed write %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Authed update %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Authed delete %1$s" ON public.%1$I', t);

    EXECUTE format('CREATE POLICY "Authed read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "Authed write %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Authed update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "Authed delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (true)', t);
  END LOOP;
END $$;
