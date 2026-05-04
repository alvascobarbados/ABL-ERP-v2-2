/**
 * Persistent left navigation rail — desktop only.
 * Sections: PROJECTS / MASTER DATA / (unlabeled: Archive, Trash) / Footer.
 */
import { useNavigate, useLocation } from "react-router-dom";
import {
  Users, Factory, UserCircle2, Trash2, HelpCircle, LogOut,
  Archive, KanbanSquare, ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Wordmark } from "./Wordmark";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";

interface Props {
  trashCount: number;
  archiveCount: number;
}

interface Item {
  icon: typeof Users;
  label: string;
  to?: string;
  onClick?: () => void;
  badge?: number;
  dim?: boolean;
}

const SectionLabel = ({ children }: { children: string }) => (
  <div
    className="px-3 pt-3 pb-1 text-[10px] uppercase font-semibold"
    style={{ color: "hsl(var(--brand-navy))", opacity: 0.5, letterSpacing: "0.05em" }}
  >
    {children}
  </div>
);

export const DesktopRail = ({ trashCount, archiveCount }: Props) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isActive = (path: string) =>
    path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(path + "/");

  const projectsItems: Item[] = [
    { icon: KanbanSquare, label: "Pipeline", to: "/" },
  ];
  const masterItems: Item[] = [
    { icon: Users, label: "Customers", to: "/customers" },
    { icon: Factory, label: "Suppliers", to: "/suppliers" },
    { icon: UserCircle2, label: "Team", to: "/team" },
  ];
  const archiveTrashItems: Item[] = [
    { icon: Archive, label: "Archive", to: "/archive", badge: archiveCount },
    { icon: Trash2, label: "Trash", to: "/trash", badge: trashCount },
  ];
  const footerItems: Item[] = [
    { icon: HelpCircle, label: "Help", onClick: () => toast("Help docs coming soon") },
    { icon: LogOut, label: "Sign out", onClick: () => toast("Sign out coming soon"), dim: true },
  ];

  const renderItem = (item: Item, key: string) => {
    const active = item.to ? isActive(item.to) : false;
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
          active
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
            fontWeight: active ? 600 : 500,
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

  const { collapsed, toggle } = useSidebarCollapsed();
  if (collapsed) return null;

  return (
    <aside
      className="hidden lg:flex flex-col shrink-0 h-screen sticky top-0 border-r"
      style={{
        width: 240,
        backgroundColor: "hsl(36 28% 92%)",
        borderColor: "hsl(var(--brand-navy) / 0.12)",
      }}
    >
      <div className="px-5 pt-6 pb-5 flex items-center justify-between gap-2">
        <button onClick={() => navigate("/")} className="block" aria-label="Home">
          <Wordmark />
        </button>
        <button
          onClick={toggle}
          aria-label="Collapse sidebar"
          title="Collapse sidebar (⌘\\)"
          className="inline-flex items-center justify-center rounded-md hover:bg-[hsl(var(--brand-navy)/0.08)] transition-colors"
          style={{ width: 28, height: 28, color: "hsl(var(--brand-navy))" }}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="border-t mx-3" style={{ borderColor: "hsl(var(--brand-navy) / 0.1)" }} />

      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        <SectionLabel>Projects</SectionLabel>
        {projectsItems.map((it, i) => renderItem(it, "p" + i))}

        {/* Shipments parent (toggle) + sub-items */}
        <button
          onClick={() => setShipmentsOpen((o) => !o)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg transition-colors",
            pathname.startsWith("/shipments")
              ? "bg-[hsl(var(--brand-navy)/0.08)]"
              : "hover:bg-[hsl(var(--brand-navy)/0.05)]",
          )}
          aria-expanded={shipmentsOpen}
        >
          <Ship className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--brand-navy))" }} />
          <span
            className="text-[14px] flex-1 truncate"
            style={{
              color: "hsl(var(--brand-navy))",
              fontWeight: pathname.startsWith("/shipments") ? 600 : 500,
            }}
          >
            Shipments
          </span>
          {shipmentsOpen
            ? <ChevronDown className="h-3.5 w-3.5" style={{ color: "hsl(var(--brand-navy) / 0.6)" }} />
            : <ChevronRight className="h-3.5 w-3.5" style={{ color: "hsl(var(--brand-navy) / 0.6)" }} />}
        </button>
        {shipmentsOpen && (
          <div
            className="ml-5 pl-3 border-l space-y-0.5"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.15)" }}
          >
            {shipmentSubItems.map((sub) => {
              const active = pathname === sub.to;
              return (
                <button
                  key={sub.to}
                  onClick={() => navigate(sub.to)}
                  className={cn(
                    "w-full text-left px-2.5 py-1.5 rounded-md transition-colors text-[13px]",
                    active
                      ? "bg-[hsl(var(--brand-navy)/0.08)]"
                      : "hover:bg-[hsl(var(--brand-navy)/0.04)]",
                  )}
                  style={{
                    color: "hsl(var(--brand-navy))",
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {sub.label}
                </button>
              );
            })}
          </div>
        )}

        <SectionLabel>Master Data</SectionLabel>
        {masterItems.map((it, i) => renderItem(it, "m" + i))}

        <div className="my-2 mx-2 border-t" style={{ borderColor: "hsl(var(--brand-navy) / 0.1)" }} />
        {archiveTrashItems.map((it, i) => renderItem(it, "a" + i))}
      </nav>

      <div className="border-t mx-3" style={{ borderColor: "hsl(var(--brand-navy) / 0.1)" }} />

      <div className="px-2 py-3 space-y-0.5">
        {footerItems.map((it, i) => renderItem(it, "f" + i))}
      </div>
    </aside>
  );
};
