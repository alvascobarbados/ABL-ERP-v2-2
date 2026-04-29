// Re-export from new pipelines module for backwards compat
export type { Project as Lead, StageId as LeadStage } from "@/data/pipelines";
export { allProjects } from "@/data/pipelines";
// Legacy shape no longer used by Index.tsx; kept to avoid breakage if referenced.
export const leadsByStage = {} as Record<string, unknown>;
