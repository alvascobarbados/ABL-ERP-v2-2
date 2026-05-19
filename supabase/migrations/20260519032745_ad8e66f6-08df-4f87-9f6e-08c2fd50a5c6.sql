-- One-shot backfill: mirror quote-level fields across siblings sharing a quote_number.
-- Winner per field = most-recently-updated row (for NOT NULL fields) or
-- most-recently-updated row with a non-null value (for nullable fields).
WITH winners AS (
  SELECT
    quote_number,
    -- NOT NULL fields (most recent wins regardless of value)
    (array_agg(value             ORDER BY updated_at DESC))[1] AS value,
    (array_agg(deposit_required  ORDER BY updated_at DESC))[1] AS deposit_required,
    -- Nullable fields (most recent non-null wins)
    (array_agg(deposit_invoice_number      ORDER BY updated_at DESC) FILTER (WHERE deposit_invoice_number      IS NOT NULL))[1] AS deposit_invoice_number,
    (array_agg(deposit_amount              ORDER BY updated_at DESC) FILTER (WHERE deposit_amount              IS NOT NULL))[1] AS deposit_amount,
    (array_agg(deposit_paid_date           ORDER BY updated_at DESC) FILTER (WHERE deposit_paid_date           IS NOT NULL))[1] AS deposit_paid_date,
    (array_agg(deposit_paid_method         ORDER BY updated_at DESC) FILTER (WHERE deposit_paid_method         IS NOT NULL))[1] AS deposit_paid_method,
    (array_agg(deposit_payment_reference   ORDER BY updated_at DESC) FILTER (WHERE deposit_payment_reference   IS NOT NULL))[1] AS deposit_payment_reference,
    (array_agg(invoice_number              ORDER BY updated_at DESC) FILTER (WHERE invoice_number              IS NOT NULL))[1] AS invoice_number,
    (array_agg(paid_on_date                ORDER BY updated_at DESC) FILTER (WHERE paid_on_date                IS NOT NULL))[1] AS paid_on_date,
    (array_agg(payment_method              ORDER BY updated_at DESC) FILTER (WHERE payment_method              IS NOT NULL))[1] AS payment_method,
    (array_agg(payment_reference           ORDER BY updated_at DESC) FILTER (WHERE payment_reference           IS NOT NULL))[1] AS payment_reference,
    (array_agg(payment_terms               ORDER BY updated_at DESC) FILTER (WHERE payment_terms               IS NOT NULL))[1] AS payment_terms,
    (array_agg(payment_terms_custom_days   ORDER BY updated_at DESC) FILTER (WHERE payment_terms_custom_days   IS NOT NULL))[1] AS payment_terms_custom_days,
    (array_agg(payment_terms_inherited     ORDER BY updated_at DESC) FILTER (WHERE payment_terms_inherited     IS NOT NULL))[1] AS payment_terms_inherited,
    (array_agg(invoice_issued_date         ORDER BY updated_at DESC) FILTER (WHERE invoice_issued_date         IS NOT NULL))[1] AS invoice_issued_date,
    (array_agg(invoice_issued_date_assumed ORDER BY updated_at DESC) FILTER (WHERE invoice_issued_date_assumed IS NOT NULL))[1] AS invoice_issued_date_assumed,
    (array_agg(customer_po_number          ORDER BY updated_at DESC) FILTER (WHERE customer_po_number          IS NOT NULL))[1] AS customer_po_number
  FROM public.projects
  WHERE quote_number IS NOT NULL AND deleted_at IS NULL
  GROUP BY quote_number
  HAVING count(*) > 1
)
UPDATE public.projects p SET
  value                       = w.value,
  deposit_required            = w.deposit_required,
  deposit_invoice_number      = COALESCE(w.deposit_invoice_number,      p.deposit_invoice_number),
  deposit_amount              = COALESCE(w.deposit_amount,              p.deposit_amount),
  deposit_paid_date           = COALESCE(w.deposit_paid_date,           p.deposit_paid_date),
  deposit_paid_method         = COALESCE(w.deposit_paid_method,         p.deposit_paid_method),
  deposit_payment_reference   = COALESCE(w.deposit_payment_reference,   p.deposit_payment_reference),
  invoice_number              = COALESCE(w.invoice_number,              p.invoice_number),
  paid_on_date                = COALESCE(w.paid_on_date,                p.paid_on_date),
  payment_method              = COALESCE(w.payment_method,              p.payment_method),
  payment_reference           = COALESCE(w.payment_reference,           p.payment_reference),
  payment_terms               = COALESCE(w.payment_terms,               p.payment_terms),
  payment_terms_custom_days   = COALESCE(w.payment_terms_custom_days,   p.payment_terms_custom_days),
  payment_terms_inherited     = COALESCE(w.payment_terms_inherited,     p.payment_terms_inherited),
  invoice_issued_date         = COALESCE(w.invoice_issued_date,         p.invoice_issued_date),
  invoice_issued_date_assumed = COALESCE(w.invoice_issued_date_assumed, p.invoice_issued_date_assumed),
  customer_po_number          = COALESCE(w.customer_po_number,          p.customer_po_number)
FROM winners w
WHERE p.quote_number = w.quote_number
  AND p.deleted_at IS NULL;