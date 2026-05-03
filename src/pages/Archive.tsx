/**
 * Routed Archive page — wraps existing ArchiveView (sheet-style) inside the
 * DesktopAppShell so the persistent rail remains visible. Mobile preserves
 * the existing sheet UX.
 *
 * NOTE: Full stage-grammar parity (chevron tabs + filter strip + card list
 * scoped to archived data) is a separate, larger refactor — this page renders
 * the existing Archive list inline so navigation & rail visibility work today.
 */
import { useNavigate } from "react-router-dom";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { ArchiveView } from "@/components/leads/ArchiveView";

export default function ArchivePage() {
  const navigate = useNavigate();
  return (
    <DesktopAppShell>
      <ArchiveView open onClose={() => navigate("/")} />
    </DesktopAppShell>
  );
}
