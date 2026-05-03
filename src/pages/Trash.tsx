/**
 * Routed Trash page — see ArchivePage.tsx for context.
 */
import { useNavigate } from "react-router-dom";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { TrashView } from "@/components/leads/TrashView";

export default function TrashPage() {
  const navigate = useNavigate();
  return (
    <DesktopAppShell>
      <TrashView open onClose={() => navigate("/")} />
    </DesktopAppShell>
  );
}
