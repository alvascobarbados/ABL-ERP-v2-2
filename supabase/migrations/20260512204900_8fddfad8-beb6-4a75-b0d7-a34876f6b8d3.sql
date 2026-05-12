-- Drop redundant case-sensitive unique index. customers_name_lower_unique remains as the sole uniqueness rule.
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_name_key;
DROP INDEX IF EXISTS public.customers_name_key;