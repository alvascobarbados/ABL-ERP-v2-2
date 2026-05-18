-- Sentinel project for system-level audit entries (user_signin, user_signout,
-- and any other non-project event written via writeSystemLog). Required because
-- project_log_entries.project_id has a FK to projects.id. Soft-deleted so it
-- never appears in any UI; the app additionally filters id != '__system__' as
-- a belt-and-braces guard. DO NOT DELETE.
INSERT INTO public.projects (
  id, customer, point_person, project_name,
  pipeline_id, stage_id, deadline, value,
  order_type, priority, deposit_required,
  weight_unit, volume_unit, po_amount_currency,
  deleted_at, created_at, updated_at
) VALUES (
  '__system__', 'System', 'System', 'System',
  'sales', 'sourcing', '', 0,
  'New', 'Standard', false,
  'kg', 'CBM', 'USD',
  now(), now(), now()
)
ON CONFLICT (id) DO NOTHING;