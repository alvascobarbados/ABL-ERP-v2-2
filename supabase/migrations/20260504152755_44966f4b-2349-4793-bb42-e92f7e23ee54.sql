UPDATE projects SET quote_number = NULLIF(regexp_replace(coalesce(quote_number,''), '\D', '', 'g'), '');
UPDATE projects SET po_number = NULLIF(regexp_replace(coalesce(po_number,''), '\D', '', 'g'), '');
UPDATE projects SET invoice_number = NULLIF(regexp_replace(coalesce(invoice_number,''), '\D', '', 'g'), '');