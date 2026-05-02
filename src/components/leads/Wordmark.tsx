/**
 * Brand wordmark — "alvasco" lowercase, navy + orange "co" tail.
 * Replaces the previous uppercase "ALVASCO ERP" lockup.
 */
export const Wordmark = ({ className = "" }: { className?: string }) => (
  <span
    className={`font-display text-[22px] sm:text-[24px] leading-none tracking-tight ${className}`}
    style={{ fontWeight: 600 }}
  >
    <span style={{ color: "hsl(var(--brand-navy))" }}>alvas</span>
    <span style={{ color: "hsl(var(--brand-orange))" }}>co</span>
  </span>
);
