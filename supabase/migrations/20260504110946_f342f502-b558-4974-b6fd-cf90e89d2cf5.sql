-- Restructure pipelines: add Purchasing pipeline; rename Operations → Production;
-- collapse Production into a single state. Allow legacy stage IDs for historical
-- compatibility on log entries and any not-yet-migrated rows.

-- 1. Drop old CHECK constraints on projects
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_pipeline_chk;
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_stage_chk;

-- 2. Add new CHECK constraints with the expanded value sets
ALTER TABLE public.projects ADD CONSTRAINT projects_pipeline_chk
  CHECK (pipeline_id = ANY (ARRAY[
    'sales', 'design', 'purchasing', 'production', 'shipping', 'finance',
    -- Legacy value kept for back-compat on any not-yet-migrated rows.
    'operations'
  ]::text[]));

ALTER TABLE public.projects ADD CONSTRAINT projects_stage_chk
  CHECK (stage_id = ANY (ARRAY[
    'proposal', 'quote', 'confirming', 'archive',
    'design', 'proof',
    'purchasing',
    'production',
    'shipment_required', 'shipment_assigned',
    'invoice_required', 'invoiced', 'paid',
    -- Legacy values kept for historical project_log_entries rows and
    -- back-compat on any not-yet-migrated project rows.
    'preproduction', 'in_production'
  ]::text[]));