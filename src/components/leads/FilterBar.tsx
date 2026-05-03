// FilterState — used across the app. All multi-select are arrays.
// urgency is single-select. missingOnly is boolean toggle.
// flagged: null = any, true = only flagged, false = only unflagged.
import type { ShippingMode, StageId } from "@/data/stages";

export type DeadlineUrgency = "overdue" | "this_week" | "this_month" | "no_deadline" | null;

export interface FilterState {
  customers: string[];          // multi
  projectNames: string[];       // multi
  supplierIds: string[];        // multi (supports "__unassigned" sentinel)
  shippingModes: (ShippingMode | "Unassigned")[]; // multi
  salesReps: string[];          // multi
  states: StageId[];            // multi
  urgency: DeadlineUrgency;     // single
  missingOnly: boolean;
  flagged: boolean | null;      // tri-state: null=any, true=only flagged, false=only unflagged
}

export const EMPTY_FILTER: FilterState = {
  customers: [], projectNames: [], supplierIds: [],
  shippingModes: [], salesReps: [], states: [],
  urgency: null, missingOnly: false, flagged: null,
};

export function filterCount(f: FilterState): number {
  let n = 0;
  if (f.customers.length) n++;
  if (f.projectNames.length) n++;
  if (f.supplierIds.length) n++;
  if (f.shippingModes.length) n++;
  if (f.salesReps.length) n++;
  if (f.states.length) n++;
  if (f.urgency) n++;
  if (f.missingOnly) n++;
  if (f.flagged !== null) n++;
  return n;
}
