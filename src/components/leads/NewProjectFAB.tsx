import { Plus } from "lucide-react";

interface Props {
  onClick: () => void;
}

export const NewProjectFAB = ({ onClick }: Props) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Create new project"
    className="fixed z-30 inline-flex items-center justify-center rounded-full text-white shadow-[var(--shadow-section)] hover:opacity-95 transition-all active:scale-95"
    style={{
      width: 56,
      height: 56,
      bottom: "max(env(safe-area-inset-bottom), 16px)",
      right: 16,
      backgroundColor: "hsl(var(--brand-navy))",
    }}
  >
    <Plus className="h-7 w-7" strokeWidth={2.5} />
  </button>
);
