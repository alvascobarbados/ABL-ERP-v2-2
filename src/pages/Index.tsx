import { StageSection } from "@/components/leads/StageSection";
import { leadsByStage } from "@/components/leads/leadsData";

const Index = () => {
  const total =
    leadsByStage.proposal.length +
    leadsByStage.quotation.length +
    leadsByStage.pending.length;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-5 flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1">
              Sales
            </p>
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
              Leads
            </h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-2xl font-semibold text-foreground tabular-nums">{total}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 sm:px-8 py-6 sm:py-8 space-y-5 sm:space-y-6">
        <StageSection
          title="Proposal Required"
          stage="proposal"
          leads={leadsByStage.proposal}
        />
        <StageSection
          title="Quotation Required"
          stage="quotation"
          leads={leadsByStage.quotation}
        />
        <StageSection
          title="Pending Confirmation"
          stage="pending"
          leads={leadsByStage.pending}
        />
      </main>
    </div>
  );
};

export default Index;
