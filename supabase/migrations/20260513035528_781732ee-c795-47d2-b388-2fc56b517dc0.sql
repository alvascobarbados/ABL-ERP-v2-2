
-- Phase 1: Sub-stage migration (Sales/Design/Production/Shipping)
-- Per-project audit log entries written BEFORE the UPDATEs

-- Audit log entries (one per migrated project)
INSERT INTO project_log_entries (id, project_id, ts, actor_user_id, actor_display_name, action_type, description, metadata)
SELECT
  'mig-substage-pending-' || id,
  id, now(), 'system', 'System', 'field_edit',
  'System renamed stage Confirming → Pending',
  jsonb_build_object('migration','sub_stages_2026_05_13','from','confirming','to','pending')
FROM projects WHERE stage_id = 'confirming';

INSERT INTO project_log_entries (id, project_id, ts, actor_user_id, actor_display_name, action_type, description, metadata)
SELECT
  'mig-substage-artwork-' || id,
  id, now(), 'system', 'System', 'field_edit',
  'System renamed stage Design → Artwork Creation',
  jsonb_build_object('migration','sub_stages_2026_05_13','from','design','to','artwork_creation')
FROM projects WHERE pipeline_id = 'design' AND stage_id = 'design';

INSERT INTO project_log_entries (id, project_id, ts, actor_user_id, actor_display_name, action_type, description, metadata)
SELECT
  'mig-substage-readytoship-' || id,
  id, now(), 'system', 'System', 'stage_change',
  'System moved this from Shipping · Awaiting Shipment to Production · Ready to Ship',
  jsonb_build_object('migration','sub_stages_2026_05_13','fromPipeline','shipping','fromStage','shipment_required','toPipeline','production','toStage','ready_to_ship')
FROM projects WHERE stage_id = 'shipment_required';

-- Replace stage CHECK constraint to include new + legacy ids
ALTER TABLE projects DROP CONSTRAINT projects_stage_chk;
ALTER TABLE projects ADD CONSTRAINT projects_stage_chk CHECK (stage_id = ANY (ARRAY[
  -- sales (active)
  'sourcing','proposal','quote','pending','stalled','archive',
  -- design (active)
  'client_artwork','artwork_creation','proof','internal',
  -- purchasing (active)
  'purchasing',
  -- production (active)
  'production','ready_to_ship',
  -- shipping (active)
  'shipment_assigned','arrived',
  -- finance (active)
  'invoice_required','invoiced',
  -- completed
  'completed',
  -- legacy / deprecated (kept for historical audit log readability)
  'confirming','design','shipment_required','preproduction','in_production','paid'
]));

-- Migrate rows
UPDATE projects SET stage_id = 'pending' WHERE stage_id = 'confirming';
UPDATE projects SET stage_id = 'artwork_creation' WHERE pipeline_id = 'design' AND stage_id = 'design';
UPDATE projects SET pipeline_id = 'production', stage_id = 'ready_to_ship' WHERE stage_id = 'shipment_required';
