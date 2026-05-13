-- Extend log action types
ALTER TABLE public.project_log_entries DROP CONSTRAINT project_log_action_chk;
ALTER TABLE public.project_log_entries ADD CONSTRAINT project_log_action_chk CHECK (action_type IN (
  'stage_change','field_edit','flag_toggle','note_added','note_edited','note_deleted',
  'project_created','archive','unarchive','trash','restore','mark_paid','line_item_change'
));

-- Add updated_at to project_notes
ALTER TABLE public.project_notes ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- Trigger to auto-bump updated_at on UPDATE (reuses existing set_updated_at function)
CREATE TRIGGER project_notes_set_updated_at
BEFORE UPDATE ON public.project_notes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();