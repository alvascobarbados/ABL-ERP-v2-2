// Centralized brand & stage + supplier color tokens.
// Hex values map to the Alvasco identity defined in index.css.
import { PipelineId } from "@/data/stages";

export const PIPELINE_ACCENT: Record<PipelineId, { hex: string; name: string }> = {
  sales:      { hex: "#E97B2C", name: "orange" },   // Alvasco Orange — getting new business
  design:     { hex: "#8B3A62", name: "magenta" },  // Deep magenta — design & proofing
  operations: { hex: "#1B2A4E", name: "navy" },     // Alvasco Navy — making
  shipping:   { hex: "#3D7B86", name: "teal" },     // Soft navy / teal — moving the goods
  finance:    { hex: "#B8884D", name: "gold" },     // muted gold — getting paid
};

// Supplier chip colors — small 8px square next to supplier name.
// Extend by adding new entries; unknown suppliers fall back to neutral grey.
export const SUPPLIER_COLOR: Record<string, string> = {
  "sup-freedom":  "#2A6F6B", // deep teal
  "sup-admax":    "#B85C3D", // warm rust
  "sup-yiwu":     "#6B5B8E", // muted purple
  "sup-shenzhen": "#3E6B4A", // forest green
  "sup-ningbo":   "#C58B85", // dusty rose
};

export const supplierColor = (id?: string) =>
  (id && SUPPLIER_COLOR[id]) || "#A8A29E";

export const pipelineAccent = (id: PipelineId) => PIPELINE_ACCENT[id].hex;
