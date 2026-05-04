
-- Allow new "completed" pipeline_id and stage_id (preserve all legacy values).
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_pipeline_chk;
ALTER TABLE public.projects ADD CONSTRAINT projects_pipeline_chk
  CHECK (pipeline_id = ANY (ARRAY['sales','design','purchasing','production','shipping','finance','operations','completed']));

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_stage_chk;
ALTER TABLE public.projects ADD CONSTRAINT projects_stage_chk
  CHECK (stage_id = ANY (ARRAY['proposal','quote','confirming','archive','design','proof','purchasing','production','shipment_required','shipment_assigned','invoice_required','invoiced','paid','preproduction','in_production','completed']));
