// FilterState — used across the app. All multi-select are arrays.
// missingOnly is boolean toggle.
// flagged: null = any, true = only flagged, false = only unflagged.
// orderApproval: multi-select chip set matching computeOrderConfirmationState.
import type { ShippingMode, StageId } from "@/data/pipelines";

// Legacy single-select; retained as a type only so any stale persisted state
// references can be ignored gracefully. URGENCY filter chips were removed.
export type DeadlineUrgency = "overdue" | "this_week" | "this_month" | "no_deadline" | null;

export type OrderApprovalChip = "approved" | "partial" | "not_approved";

export interface FilterState {
  customers: string[];          // multi
  projectNames: string[];       // multi
  supplierIds: string[];        // multi (supports "__unassigned" sentinel)
  shippingModes: (ShippingMode | "Unassigned")[]; // multi
  salesReps: string[];          // multi
  stages: StageId[];            // multi
  orderApproval: OrderApprovalChip[]; // multi (OR within category)
  missingOnly: boolean;
  flagged: boolean | null;      // tri-state: null=any, true=only flagged, false=only unflagged
}

export const EMPTY_FILTER: FilterState = {
  customers: [], projectNames: [], supplierIds: [],
  shippingModes: [], salesReps: [], stages: [],
  orderApproval: [], missingOnly: false, flagged: null,
};

export function filterCount(f: FilterState): number {
  let n = 0;
  if (f.customers.length) n++;
  if (f.projectNames.length) n++;
  if (f.supplierIds.length) n++;
  if (f.shippingModes.length) n++;
  if (f.salesReps.length) n++;
  if (f.stages.length) n++;
  if (f.orderApproval.length) n++;
  if (f.missingOnly) n++;
  if (f.flagged !== null) n++;
  return n;
}
