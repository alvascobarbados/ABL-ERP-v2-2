ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS payment_terms text NOT NULL DEFAULT 'Net 30',
  ADD COLUMN IF NOT EXISTS payment_terms_custom_days integer;

UPDATE public.customers SET payment_terms = 'Net 30' WHERE payment_terms IS NULL;