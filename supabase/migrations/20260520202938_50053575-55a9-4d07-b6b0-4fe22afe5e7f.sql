ALTER TABLE public.customer_po_approvals ADD COLUMN quote_number text;

WITH ranked AS (
  SELECT cpa.id AS approval_id, p.quote_number,
         ROW_NUMBER() OVER (
           PARTITION BY cpa.id
           ORDER BY (p.deleted_at IS NULL) DESC, p.created_at ASC, p.id ASC
         ) AS rn
  FROM public.customer_po_approvals cpa
  JOIN public.projects p
    ON p.customer_po_number = cpa.customer_po_number
   AND p.quote_number IS NOT NULL
)
UPDATE public.customer_po_approvals cpa
SET quote_number = r.quote_number
FROM ranked r
WHERE r.approval_id = cpa.id AND r.rn = 1;

DELETE FROM public.customer_po_approvals WHERE quote_number IS NULL;

ALTER TABLE public.customer_po_approvals ALTER COLUMN quote_number SET NOT NULL;

ALTER TABLE public.customer_po_approvals DROP CONSTRAINT customer_po_approvals_customer_po_number_key;
ALTER TABLE public.customer_po_approvals
  ADD CONSTRAINT customer_po_approvals_quote_po_key UNIQUE (quote_number, customer_po_number);

DROP INDEX IF EXISTS public.idx_customer_po_approvals_po;
CREATE INDEX idx_customer_po_approvals_quote_po
  ON public.customer_po_approvals (quote_number, customer_po_number);