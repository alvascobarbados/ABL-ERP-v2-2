import { Users } from "lucide-react";
import { Sheet } from "./Sheet";

interface Props {
  open: boolean;
  onClose: () => void;
}

export const CustomersView = ({ open, onClose }: Props) => {
  if (!open) return null;
  return (
    <Sheet open onClose={onClose} width="max-w-xl" eyebrow="Master list" title="Customers">
      <div className="flex flex-col items-center text-center py-12 px-4">
        <span className="inline-flex items-center justify-center rounded-full mb-4"
          style={{ width: 56, height: 56, backgroundColor: "hsl(var(--brand-navy) / 0.08)", color: "hsl(var(--brand-navy))" }}>
          <Users className="h-6 w-6" />
        </span>
        <h3 className="text-lg font-semibold mb-2" style={{ color: "hsl(var(--brand-navy))" }}>
          Customer management coming soon
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          This is where you'll add, edit, and merge customers — keeping the master list clean so
          “Bryden Stokes” and “Brydens Stokes” never become two different records again.
        </p>
      </div>
    </Sheet>
  );
};
