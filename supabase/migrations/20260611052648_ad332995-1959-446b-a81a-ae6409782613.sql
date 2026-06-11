
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.is_team_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.email IS NOT NULL
      AND lower(tm.email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_team_member() TO authenticated, anon;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'artwork_approvals','buyers','customer_po_approvals','customers',
    'line_items','products','project_log_entries','project_notes',
    'projects','quotation_approvals','quotation_email_verbal_approvals',
    'shipments','suppliers','team_members'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authed read '   || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authed write '  || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authed update ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authed delete ' || t, t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_team_member())',
      'Team read ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_team_member())',
      'Team insert ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_team_member()) WITH CHECK (public.is_team_member())',
      'Team update ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_team_member())',
      'Team delete ' || t, t);
  END LOOP;
END $$;

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can receive realtime" ON realtime.messages;
CREATE POLICY "Team members can receive realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.is_team_member());
