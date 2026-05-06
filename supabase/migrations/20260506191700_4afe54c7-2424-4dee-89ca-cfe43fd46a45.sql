CREATE POLICY "Authenticated users can read team members"
ON public.team_members
FOR SELECT
TO authenticated
USING (true);