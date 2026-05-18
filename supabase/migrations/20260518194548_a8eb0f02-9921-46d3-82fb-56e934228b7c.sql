CREATE INDEX IF NOT EXISTS idx_projects_quote_number ON public.projects (quote_number) WHERE quote_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_po_number ON public.projects (po_number) WHERE po_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_invoice_number ON public.projects (invoice_number) WHERE invoice_number IS NOT NULL;