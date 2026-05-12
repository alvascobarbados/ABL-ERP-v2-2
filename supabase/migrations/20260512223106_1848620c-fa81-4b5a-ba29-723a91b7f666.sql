-- Phase 2: Wire Buyer entity into projects
-- Adds projects.buyer_id (FK → buyers.id, ON DELETE SET NULL),
-- backfills from contact_person via case-insensitive name match
-- scoped to the project's customer, and creates an index for joins.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS buyer_id UUID NULL
  REFERENCES public.buyers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_buyer_id_idx ON public.projects(buyer_id);

-- Backfill: match each project's contact_person to a buyer under the
-- same customer (case-insensitive, trimmed). Idempotent — only sets
-- buyer_id where currently NULL.
UPDATE public.projects p
SET buyer_id = sub.buyer_id
FROM (
  SELECT DISTINCT ON (p2.id)
    p2.id AS pid,
    b.id  AS buyer_id
  FROM public.projects p2
  JOIN public.customers c ON LOWER(TRIM(c.name)) = LOWER(TRIM(p2.customer))
  JOIN public.buyers b
    ON b.customer_id = c.id
   AND LOWER(TRIM(b.name)) = LOWER(TRIM(p2.contact_person))
  WHERE p2.contact_person IS NOT NULL
    AND TRIM(p2.contact_person) <> ''
    AND p2.buyer_id IS NULL
  ORDER BY p2.id, b.created_at ASC
) sub
WHERE p.id = sub.pid;
