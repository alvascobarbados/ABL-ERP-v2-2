-- Phase 2: Add shipment_number column
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS shipment_number text;

-- Phase 4: Migrate the 28 Ocean rows in a single transaction.
-- For each Ocean project where tracking_ref starts with FCL- or LCL- (digits),
-- copy that value into shipment_number, set tracking_ref to NULL, and write
-- one audit log entry attributed to "System".
DO $$
DECLARE
  r RECORD;
  log_id text;
BEGIN
  FOR r IN
    SELECT id, project_name, tracking_ref
    FROM public.projects
    WHERE shipping_mode = 'Ocean'
      AND tracking_ref ~ '^(FCL|LCL)-[0-9]+$'
  LOOP
    UPDATE public.projects
       SET shipment_number = r.tracking_ref,
           tracking_ref    = NULL
     WHERE id = r.id;

    log_id := 'log_mig_shipnum_' || r.id || '_' || extract(epoch from now())::bigint;

    INSERT INTO public.project_log_entries
      (id, project_id, ts, actor_user_id, actor_display_name, action_type, description, metadata)
    VALUES
      (log_id, r.id, now(), 'system', 'System', 'field_edit',
       'System migrated shipment number from tracking_ref',
       jsonb_build_object('from','tracking_ref','to','shipment_number','value', r.tracking_ref));
  END LOOP;
END $$;