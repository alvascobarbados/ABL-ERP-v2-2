/**
 * Batched fetch of all artwork / quotation / customer-PO approvals for a set
 * of currently-visible projects. Used by the Pipeline Table's APPROV. column
 * to render Phase 3 state in O(1) per row without N+1 queries.
 *
 * Strategy: collect unique doc numbers from the project list → 3 parallel
 * queries → lookup maps. Re-fetches on:
 *   - The query key changing (visible projects change)
 *   - Realtime INSERT/UPDATE/DELETE on any of the 3 approval tables
 *   - Window focus (React Query default)
 */
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  ApprovalRowsLookup,
  ArtworkApprovalsLookup,
  ArtworkApprovalRow,
  QuotationApprovalRow,
  QuotationEmailVerbalApprovalRow,
  CustomerPoApprovalRow,
} from "@/lib/orderConfirmation";

export interface ApprovalsBundle {
  artwork: ArtworkApprovalsLookup;
  order: ApprovalRowsLookup;
}

const EMPTY: ApprovalsBundle = { artwork: {}, order: { email: {}, quotation: {}, po: {} } };

interface ProjectDocs {
  proofNumber?: string | null;
  quoteNumber?: string | null;
  customerPoNumber?: string | null;
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    if (v && v.trim() !== "") set.add(v);
  }
  return [...set];
}

export function useApprovalLookups(projects: ProjectDocs[]): ApprovalsBundle {
  const proofNumbers = useMemo(
    () => uniqueNonEmpty(projects.map((p) => p.proofNumber)),
    [projects],
  );
  const quoteNumbers = useMemo(
    () => uniqueNonEmpty(projects.map((p) => p.quoteNumber)),
    [projects],
  );
  const poNumbers = useMemo(
    () => uniqueNonEmpty(projects.map((p) => p.customerPoNumber)),
    [projects],
  );

  const queryKey = useMemo(
    () => ["approval-lookups", proofNumbers.sort().join(","), quoteNumbers.sort().join(","), poNumbers.sort().join(",")],
    [proofNumbers, quoteNumbers, poNumbers],
  );

  const queryClient = useQueryClient();

  const { data } = useQuery<ApprovalsBundle>({
    queryKey,
    queryFn: async () => {
      const [artworkRes, quotRes, poRes] = await Promise.all([
        proofNumbers.length
          ? supabase.from("artwork_approvals").select("*").in("proof_number", proofNumbers)
          : Promise.resolve({ data: [], error: null }),
        quoteNumbers.length
          ? supabase.from("quotation_approvals").select("*").in("q_number", quoteNumbers)
          : Promise.resolve({ data: [], error: null }),
        poNumbers.length
          ? supabase.from("customer_po_approvals").select("*").in("customer_po_number", poNumbers)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const artwork: ArtworkApprovalsLookup = {};
      for (const row of (artworkRes.data ?? []) as ArtworkApprovalRow[]) {
        artwork[row.proof_number] = row;
      }
      const quotation: Record<string, QuotationApprovalRow> = {};
      for (const row of (quotRes.data ?? []) as QuotationApprovalRow[]) {
        quotation[row.q_number] = row;
      }
      const po: Record<string, CustomerPoApprovalRow> = {};
      for (const row of (poRes.data ?? []) as CustomerPoApprovalRow[]) {
        po[row.customer_po_number] = row;
      }
      return { artwork, order: { quotation, po } };
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // Realtime: one broad subscription for the table. Any change on any of the
  // 3 approval tables invalidates all approval-lookup queries. The subscription
  // is intentionally global (not per-row filtered) because we don't know which
  // doc numbers will be visible after a refetch — and the volume is low.
  useEffect(() => {
    const channel = supabase
      .channel("pipeline-table-approvals")
      .on("postgres_changes", { event: "*", schema: "public", table: "artwork_approvals" }, () => {
        queryClient.invalidateQueries({ queryKey: ["approval-lookups"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "quotation_approvals" }, () => {
        queryClient.invalidateQueries({ queryKey: ["approval-lookups"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_po_approvals" }, () => {
        queryClient.invalidateQueries({ queryKey: ["approval-lookups"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return data ?? EMPTY;
}
