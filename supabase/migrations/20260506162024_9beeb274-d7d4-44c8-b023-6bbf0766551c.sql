ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS weight_kg numeric,
  ADD COLUMN IF NOT EXISTS cbm numeric,
  ADD COLUMN IF NOT EXISTS num_packages integer;