/**
 * Single root layout shell for desktop. Renders the persistent left rail
 * (≥1024px) and slots page content in the main column. Mobile (<1024px)
 * falls through transparently — pages still own their mobile chrome.
 */
import { ReactNode } from "react";
import { DesktopRail } from "./DesktopRail";
import { usePipelineStore } from "@/hooks/usePipelineStore";

interface Props {
  children: ReactNode;
  /** Disable internal scroll wrapper when the page (e.g. Index) manages its own. */
  contentScroll?: boolean;
}

export const DesktopAppShell = ({ children, contentScroll = true }: Props) => {
  const store = usePipelineStore();
  return (
    <div className="min-h-dvh lg:flex lg:h-screen lg:min-h-0 lg:overflow-hidden" style={{ backgroundColor: "hsl(var(--background))" }}>
      <DesktopRail
        trashCount={store.trashedProjects.length}
        archiveCount={store.archivedProjects.length}
      />
      <div className={
        contentScroll
          ? "lg:flex-1 lg:min-w-0 lg:h-screen lg:overflow-auto"
          : "contents lg:flex lg:flex-1 lg:min-w-0 lg:flex-col lg:h-screen lg:overflow-hidden"
      }>
        {children}
      </div>
    </div>
  );
};
