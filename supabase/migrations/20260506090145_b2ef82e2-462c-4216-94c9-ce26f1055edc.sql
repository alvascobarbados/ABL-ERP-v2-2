ALTER TABLE public.projects ALTER COLUMN deadline_date DROP NOT NULL;
ALTER TABLE public.projects ALTER COLUMN deadline_date DROP DEFAULT;