ALTER TABLE public.projects RENAME COLUMN po_amount_usd TO po_amount;
ALTER TABLE public.projects ADD COLUMN po_amount_currency text NOT NULL DEFAULT 'USD'
  CHECK (po_amount_currency IN ('USD','BBD','HKD','RMB','GBP','EUR'));