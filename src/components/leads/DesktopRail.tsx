/**
 * Persistent left navigation rail — desktop only (rendered inside an
 * `hidden lg:flex` wrapper by parents). Width 240px, paper background.
 *
 * Replaces the hamburger drawer at ≥1024px. Mobile (<1024px) keeps the
 * existing HamburgerDrawer untouched.
 */
import { useNavigate, useLocation } from "react-router-dom";
import { Users, Factory, UserCircle2, Package, Ship, Trash2, HelpCircle, LogOut, Table2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Wordmark } from "./Wordmark";

interface Props {
  trashCount: number;
  onOpenShipments?: () => void;
  onOpenTrash?: () => void;
  onOpenSpreadsheet?: () => void;
}

interface Item {
  icon: typeof Users;
  label: string;
  to?: string;
  onClick?: () => void;
  badge?: number;
  dim?: boolean;
  active?: boolean;
}

export const DesktopRail = ({ trashCount, onOpenShipments, onOpenTrash, onOpenSpreadsheet }: Props) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  const masterItems: Item[] = [
    { icon: Users, label: "Customers", to: "/customers", active: isActive("/customers") },
    { icon: Factory, label: "Suppliers", to: "/suppliers", active: isActive("/suppliers") },
    { icon: UserCircle2, label: "Team", to: "/team", active: isActive("/team") },
    { icon: Package, label: "Products", to: "/products", active: isActive("/products") },
  ];
  const utilityItems: Item[] = [
    { icon: Table2, label: "Spreadsheet", onClick: () => onOpenSpreadsheet ? onOpenSpreadsheet() : navigate("/spreadsheet"), active: isActive("/spreadsheet") },
    { icon: Ship, label: "Shipments", onClick: () => onOpenShipments?.() },
    { icon: Trash2, label: "Trash", onClick: () => onOpenTrash?.(), badge: trashCount },
  ];
  const footerItems: Item[] = [
    { icon: HelpCircle, label: "Help", onClick: () => toast("Help docs coming soon") },
    { icon: LogOut, label: "Sign out", onClick: () => toast("Sign out coming soon"), dim: true },
  ];

  const renderItem = (item: Item, key: string) => {
    const handleClick = () => {
      if (item.to) navigate(item.to);
      else item.onClick?.();
    };
    return (
      <button
        key={key}
        onClick={handleClick}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg transition-colors",
          item.active
            ? "bg-[hsl(var(--brand-navy)/0.08)]"
            : "hover:bg-[hsl(var(--brand-navy)/0.05)]",
        )}
      >
        <item.icon
          className="h-4 w-4 shrink-0"
          style={{ color: "hsl(var(--brand-navy))", opacity: item.dim ? 0.55 : 1 }}
        />
        <span
          className="text-[14px] flex-1 truncate"
          style={{
            color: item.dim ? "hsl(var(--muted-foreground))" : "hsl(var(--brand-navy))",
            fontWeight: item.active ? 600 : 500,
          }}
        >
          {item.label}
        </span>
        {item.badge !== undefined && item.badge > 0 && (
          <span
            className="inline-flex items-center justify-center text-[10px] font-semibold tabular px-1.5 rounded-full"
            style={{
              minWidth: 20,
              height: 18,
              backgroundColor: "hsl(var(--brand-navy) / 0.1)",
              color: "hsl(var(--brand-navy))",
            }}
          >
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className="hidden lg:flex flex-col shrink-0 h-screen sticky top-0 border-r"
      style={{
        width: 240,
        backgroundColor: "hsl(36 28% 92%)", /* slightly darker than paper */
        borderColor: "hsl(var(--brand-navy) / 0.12)",
      }}
    >
      {/* Brand */}
      <div className="px-5 pt-6 pb-5">
        <button onClick={() => navigate("/")} className="block" aria-label="Home">
          <Wordmark />
        </button>
      </div>

      <div className="border-t mx-3" style={{ borderColor: "hsl(var(--brand-navy) / 0.1)" }} />

      {/* Master data */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        <div className="px-3 pb-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 font-medium">
          Master data
        </div>
        {masterItems.map((it, i) => renderItem(it, "m" + i))}

        <div className="my-3 mx-2 border-t" style={{ borderColor: "hsl(var(--brand-navy) / 0.1)" }} />

        {utilityItems.map((it, i) => renderItem(it, "u" + i))}
      </nav>

      <div className="border-t mx-3" style={{ borderColor: "hsl(var(--brand-navy) / 0.1)" }} />

      <div className="px-2 py-3 space-y-0.5">
        {footerItems.map((it, i) => renderItem(it, "f" + i))}
      </div>
    </aside>
  );
};
