-- DO NOT revoke EXECUTE from PUBLIC/anon on this function.
-- RLS policies on projects/line_items/project_notes/shipments call it, and
-- Supabase Realtime evaluates those policies to authorize postgres_changes
-- broadcasts. Revoking the grant fails Realtime closed → cross-user live sync
-- silently breaks (rows only appear on manual refresh). anon executing this
-- returns false and leaks nothing; the grant to authenticated + anon is required.
-- Incident: 2026-06-16. Baseline: migration 20260611052648.
COMMENT ON FUNCTION public.is_team_member() IS
$$DO NOT revoke EXECUTE from PUBLIC/anon on this function.
RLS policies on projects/line_items/project_notes/shipments call it, and
Supabase Realtime evaluates those policies to authorize postgres_changes
broadcasts. Revoking the grant fails Realtime closed -> cross-user live sync
silently breaks (rows only appear on manual refresh). anon executing this
returns false and leaks nothing; the grant to authenticated + anon is required.
Incident: 2026-06-16. Baseline: migration 20260611052648.$$;

-- Note: the EXECUTE grant restored in migration 20260616173709 (GRANT EXECUTE
-- ON FUNCTION public.is_team_member() TO authenticated, anon) must remain in
-- place for the reasons above. See COMMENT ON FUNCTION attached in this migration.
