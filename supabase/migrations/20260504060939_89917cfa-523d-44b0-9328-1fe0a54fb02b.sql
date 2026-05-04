-- ─────────── Projects schema ───────────
-- Main projects table. id is text (not uuid) to preserve seed IDs like P-2,
-- prj-new-..., prj-dup-... unchanged.

CREATE TABLE public.projects (
  id text PRIMARY KEY,
  customer text NOT NULL,
  contact_person text,
  point_person text NOT NULL,
  project_name text NOT NULL,
  detail_summary text,
  supplier_id text,                      -- legacy "sup-…" id OR suppliers.legacy_id; resolved client-side
  supplier_label text,
  shipping_mode text,
  sales_shipping_label text,
  shipment_id text,
  tracking_ref text,
  pipeline_id text NOT NULL,
  stage_id text NOT NULL,
  deadline text NOT NULL,
  deadline_date timestamptz NOT NULL,
  value numeric(12,2) NOT NULL DEFAULT 0,
  order_type text NOT NULL DEFAULT 'New',
  priority text NOT NULL DEFAULT 'Standard',
  tag text,
  quote_number text,
  po_number text,
  invoice_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_from_pipeline text,
  deleted_from_stage text,
  flagged boolean NOT NULL DEFAULT false,
  payment_terms text,
  payment_terms_custom_days integer,
  payment_terms_inherited boolean,
  invoice_issued_date timestamptz,
  invoice_issued_date_assumed boolean,
  invoice_required_entered_at timestamptz,
  paid_on_date timestamptz,
  payment_method text,
  payment_reference text,
  CONSTRAINT projects_pipeline_chk CHECK (pipeline_id IN ('sales','design','operations','shipping','finance')),
  CONSTRAINT projects_stage_chk CHECK (stage_id IN (
    'proposal','quote','confirming','archive',
    'design','proof',
    'preproduction','in_production',
    'shipment_required','shipment_assigned',
    'invoice_required','invoiced','paid'
  )),
  CONSTRAINT projects_shipping_mode_chk CHECK (shipping_mode IS NULL OR shipping_mode IN ('Air','Ocean','Local')),
  CONSTRAINT projects_supplier_label_chk CHECK (supplier_label IS NULL OR supplier_label IN ('TBD','Various')),
  CONSTRAINT projects_order_type_chk CHECK (order_type IN ('New','Re-order')),
  CONSTRAINT projects_priority_chk CHECK (priority IN ('Standard','Rush')),
  CONSTRAINT projects_tag_chk CHECK (tag IS NULL OR tag IN ('Cold','Lost','Other','Customs Pending'))
);

CREATE INDEX idx_projects_pipeline_stage ON public.projects(pipeline_id, stage_id);
CREATE INDEX idx_projects_deleted_at ON public.projects(deleted_at);
CREATE INDEX idx_projects_shipment_id ON public.projects(shipment_id);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read projects" ON public.projects FOR SELECT USING (true);
CREATE POLICY "Public write projects" ON public.projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update projects" ON public.projects FOR UPDATE USING (true);
CREATE POLICY "Public delete projects" ON public.projects FOR DELETE USING (true);

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─────────── Shipments ───────────
CREATE TABLE public.shipments (
  id text PRIMARY KEY,
  code text NOT NULL,
  mode text NOT NULL,
  carrier text,
  supplier_id text NOT NULL,
  etd timestamptz NOT NULL,
  eta timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'Booked',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipments_mode_chk CHECK (mode IN ('Air','Ocean','Local')),
  CONSTRAINT shipments_status_chk CHECK (status IN ('Booked','In Transit','Customs','Delayed','Delivered'))
);

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read shipments" ON public.shipments FOR SELECT USING (true);
CREATE POLICY "Public write shipments" ON public.shipments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update shipments" ON public.shipments FOR UPDATE USING (true);
CREATE POLICY "Public delete shipments" ON public.shipments FOR DELETE USING (true);

CREATE TRIGGER trg_shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Now wire projects.shipment_id → shipments.id
ALTER TABLE public.projects
  ADD CONSTRAINT projects_shipment_fk
  FOREIGN KEY (shipment_id) REFERENCES public.shipments(id) ON DELETE SET NULL;


-- ─────────── Project notes ───────────
CREATE TABLE public.project_notes (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL DEFAULT now(),
  author text NOT NULL,
  author_user_id text,
  text text NOT NULL,
  auto boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_project_notes_project_id ON public.project_notes(project_id);

ALTER TABLE public.project_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read project_notes" ON public.project_notes FOR SELECT USING (true);
CREATE POLICY "Public write project_notes" ON public.project_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update project_notes" ON public.project_notes FOR UPDATE USING (true);
CREATE POLICY "Public delete project_notes" ON public.project_notes FOR DELETE USING (true);


-- ─────────── Project log entries ───────────
CREATE TABLE public.project_log_entries (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL DEFAULT now(),
  actor_user_id text NOT NULL,
  actor_display_name text NOT NULL,
  action_type text NOT NULL,
  description text NOT NULL,
  metadata jsonb,
  CONSTRAINT project_log_action_chk CHECK (action_type IN (
    'stage_change','field_edit','flag_toggle','note_added','project_created',
    'archive','unarchive','trash','restore','mark_paid','line_item_change'
  ))
);
CREATE INDEX idx_project_log_project_id ON public.project_log_entries(project_id);
CREATE INDEX idx_project_log_ts ON public.project_log_entries(ts DESC);

ALTER TABLE public.project_log_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read project_log" ON public.project_log_entries FOR SELECT USING (true);
CREATE POLICY "Public write project_log" ON public.project_log_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update project_log" ON public.project_log_entries FOR UPDATE USING (true);
CREATE POLICY "Public delete project_log" ON public.project_log_entries FOR DELETE USING (true);


-- ─────────── Line items ───────────
CREATE TABLE public.line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  position integer NOT NULL,
  qty numeric NOT NULL,
  description text NOT NULL,
  unit_price numeric(12,2),
  total numeric(12,2),
  product_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_line_items_project_id ON public.line_items(project_id, position);

ALTER TABLE public.line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read line_items" ON public.line_items FOR SELECT USING (true);
CREATE POLICY "Public write line_items" ON public.line_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update line_items" ON public.line_items FOR UPDATE USING (true);
CREATE POLICY "Public delete line_items" ON public.line_items FOR DELETE USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shipments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_log_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.line_items;