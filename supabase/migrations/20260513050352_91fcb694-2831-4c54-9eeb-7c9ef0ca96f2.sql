-- Suppliers: enforce country populated with default 'China'
UPDATE public.suppliers SET country = 'China' WHERE country IS NULL;
ALTER TABLE public.suppliers
  ALTER COLUMN country SET DEFAULT 'China',
  ALTER COLUMN country SET NOT NULL;

-- Projects: new finance / purchasing / units columns
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS deposit_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_invoice_number text,
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS deposit_paid_date timestamptz,
  ADD COLUMN IF NOT EXISTS deposit_paid_method text,
  ADD COLUMN IF NOT EXISTS deposit_payment_reference text,
  ADD COLUMN IF NOT EXISTS po_amount_usd numeric(12,2),
  ADD COLUMN IF NOT EXISTS weight_unit text NOT NULL DEFAULT 'kg',
  ADD COLUMN IF NOT EXISTS volume_value numeric,
  ADD COLUMN IF NOT EXISTS volume_unit text NOT NULL DEFAULT 'CBM';

-- Backfill volume_value from legacy cbm where present
UPDATE public.projects
   SET volume_value = cbm
 WHERE volume_value IS NULL AND cbm IS NOT NULL;

-- CHECK constraints
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_payment_method_chk,
  ADD CONSTRAINT projects_payment_method_chk
    CHECK (payment_method IS NULL OR payment_method IN ('Transfer','Cheque','Cash'));

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_deposit_paid_method_chk,
  ADD CONSTRAINT projects_deposit_paid_method_chk
    CHECK (deposit_paid_method IS NULL OR deposit_paid_method IN ('Transfer','Cheque','Cash'));

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_weight_unit_chk,
  ADD CONSTRAINT projects_weight_unit_chk
    CHECK (weight_unit IN ('kg','lbs'));

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_volume_unit_chk,
  ADD CONSTRAINT projects_volume_unit_chk
    CHECK (volume_unit IN ('CBM','CuFt'));

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_deposit_amount_chk,
  ADD CONSTRAINT projects_deposit_amount_chk
    CHECK (deposit_amount IS NULL OR value IS NULL OR deposit_amount <= value);
