export type LeadStage = "proposal" | "quotation" | "pending";

export interface Lead {
  id: string;
  customer: string;
  pointPerson: string;
  projectName: string;
  summary: string;
  deadline: string; // display string e.g. "16 May"
  deadlineDate: Date;
}

const d = (month: number, day: number) => new Date(2026, month - 1, day);
const fmt = (date: Date) =>
  `${date.getDate()} ${date.toLocaleString("en-US", { month: "short" })}`;

const make = (
  id: string,
  customer: string,
  pointPerson: string,
  projectName: string,
  summary: string,
  date: Date,
): Lead => ({
  id,
  customer,
  pointPerson,
  projectName,
  summary,
  deadline: fmt(date),
  deadlineDate: date,
});

export const leadsByStage: Record<LeadStage, Lead[]> = {
  proposal: [
    make("p1", "BTMI", "Melissa McGeary", "Connect Barbados", "Welcome Party Premiums", d(5, 16)),
    make("p2", "Aether Dynamics", "Anya Sharma", "Quantum Sim", "Phase 2 Engagement Proposal", d(5, 18)),
    make("p3", "Stellar Navigators", "Kenji Tanaka", "Deep Space Array", "Site Survey & Scoping", d(5, 22)),
    make("p4", "Alpha Industries", "David Chen", "Aurora", "Industrial Automation Upgrade", d(5, 10)),
    make("p5", "Beta Solutions", "Sarah Kim", "Nova", "Cloud Migration Strategy", d(5, 12)),
    make("p6", "Gamma Engineering", "Mike Lee", "Orion", "Renewable Energy Feasibility", d(5, 27)),
    make("p7", "Delta Group", "Emily Rodriguez", "Cygnus", "Supply Chain Optimization", d(5, 9)),
    make("p8", "Epsilon Tech", "Carlos Gomez", "Lyra", "AI Integration for CRM", d(5, 24)),
    make("p9", "Zeta Systems", "Priya Sharma", "Draco", "Data Analytics Platform", d(5, 13)),
    make("p10", "Helios Media", "Jenna Park", "Sunrise", "Brand Refresh Campaign", d(5, 29)),
  ],
  quotation: [
    make("q1", "Navi Corp", "Rachel Green", "Phoenix", "Enterprise Resource Planning", d(5, 18)),
    make("q2", "Odin Services", "Kenji Tanaka", "Hydra", "Cybersecurity Audit", d(5, 16)),
    make("q3", "Pallas Ventures", "Maria Garcia", "Cerberus", "Financial Modeling Software", d(5, 20)),
    make("q4", "Rhea Logistics", "Sam Jones", "Chimera", "Warehouse Management System", d(5, 17)),
    make("q5", "Titan Manufacturing", "Li Wei", "Typhon", "Production Line Automation", d(5, 19)),
    make("q6", "Uranus Holdings", "Anna Petrova", "Griffin", "Asset Management Solution", d(5, 21)),
    make("q7", "BioGenesis Labs", "Evelyn Reed", "Helix", "Gene Therapy Bulk Production", d(5, 26)),
    make("q8", "Oceanic Explorers", "Maria Garcia", "Abyss", "Submersible AI Mapping", d(5, 25)),
  ],
  pending: [
    make("c1", "Vesta Industries", "Omar Hassan", "Pegasus", "Logistics Optimization", d(5, 28)),
    make("c2", "Xylo Tech", "Isabelle Dubois", "Sphinx", "Data Visualization Tool", d(5, 23)),
    make("c3", "Aura Energy", "Lena Petrova", "Solstice", "Fusion Reactor Safety Protocols", d(6, 2)),
    make("c4", "MetaScape VR", "Javier Rodriguez", "Mirage", "Virtual World Server Upgrades", d(5, 30)),
    make("c5", "Nimbus Cloud", "Tom Becker", "Atlas", "Multi-region Deployment", d(6, 5)),
    make("c6", "Orbit Media", "Hana Yusuf", "Echo", "Podcast Studio Build-out", d(6, 8)),
  ],
};
