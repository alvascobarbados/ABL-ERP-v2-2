ALTER TABLE public.project_log_entries
DROP CONSTRAINT IF EXISTS project_log_action_chk;

ALTER TABLE public.project_log_entries
ADD CONSTRAINT project_log_action_chk
CHECK (
  action_type = ANY (ARRAY[
    'stage_change'::text,
    'field_edit'::text,
    'flag_toggle'::text,
    'note_added'::text,
    'note_edited'::text,
    'note_deleted'::text,
    'project_created'::text,
    'archive'::text,
    'unarchive'::text,
    'trash'::text,
    'restore'::text,
    'mark_paid'::text,
    'line_item_change'::text,
    'user_signin'::text,
    'user_signout'::text,
    'customer_gate_config_change'::text,
    'customer_gate_config_consequence'::text,
    'artwork_approval_create'::text,
    'artwork_approval_update'::text,
    'artwork_approval_revoke'::text,
    'quotation_approval_create'::text,
    'quotation_approval_update'::text,
    'quotation_approval_revoke'::text,
    'customer_po_approval_create'::text,
    'customer_po_approval_update'::text,
    'customer_po_approval_revoke'::text,
    'email_verbal_approval_set'::text,
    'email_verbal_approval_unset'::text,
    'gate_override_add'::text,
    'gate_override_remove'::text,
    'requirement_override_added'::text,
    'requirement_override_removed'::text,
    'requirement_override_reset'::text
  ])
);