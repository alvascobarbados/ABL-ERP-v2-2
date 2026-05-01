// FilterState — used across the app. All multi-select are arrays.
// urgency is single-select. missingOnly is boolean toggle.
import type { ShippingMode, StageId } from "@/data/pipelines";

export type DeadlineUrgency = "overdue" | "this_week" | "this_month" | "no_deadline" | null;

export interface FilterState {
  customers: string[];          // multi
  projectNames: string[];       // multi
  supplierIds: string[];        // multi (supports "__unassigned" sentinel)
  shippingModes: (ShippingMode | "Unassigned")[]; // multi
  salesReps: string[];          // multi
  stages: StageId[];            // multi
  urgency: DeadlineUrgency;     // single
  missingOnly: boolean;
}

export const EMPTY_FILTER: FilterState = {
  customers: [], projectNames: [], supplierIds: [],
  shippingModes: [], salesReps: [], stages: [],
  urgency: null, missingOnly: false,
};

export function filterCount(f: FilterState): number {
  let n = 0;
  if (f.customers.length) n++;
  if (f.projectNames.length) n++;
  if (f.supplierIds.length) n++;
  if (f.shippingModes.length) n++;
  if (f.salesReps.length) n++;
  if (f.stages.length) n++;
  if (f.urgency) n++;
  if (f.missingOnly) n++;
  return n;
}
