/**
 * Floating hamburger button — visible on desktop only when sidebar is collapsed.
 * Reopens the rail. Sits top-left, fixed so it doesn't shift page layout.
 */
import { Menu } from "lucide-react";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";

export const DesktopSidebarReopen = () => {
  const { collapsed, toggle } = useSidebarCollapsed();
  if (!collapsed) return null;
  return (
    <button
      onClick={toggle}
      aria-label="Open sidebar"
      title="Open sidebar (⌘\)"
      className="hidden lg:inline-flex items-center justify-center fixed top-2 left-2 rounded-md border bg-card/80 hover:bg-card transition-colors"
      style={{
        width: 32,
        height: 32,
        zIndex: 200,
        borderColor: "hsl(var(--brand-navy) / 0.2)",
        color: "hsl(var(--brand-navy))",
      }}
    >
      <Menu className="h-4 w-4" />
    </button>
  );
};
