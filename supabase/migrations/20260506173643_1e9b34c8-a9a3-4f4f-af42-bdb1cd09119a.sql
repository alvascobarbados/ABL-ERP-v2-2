ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS design_brief text,
  ADD COLUMN IF NOT EXISTS completion_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS outstanding_balance numeric;