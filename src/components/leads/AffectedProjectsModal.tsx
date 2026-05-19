/**
 * Modal listing projects affected by a cascade. Project names are hyperlinks
 * to the project detail route. Used by the bulk-toast "View affected →" action
 * and by the Affected-projects warning in OrderConfirmationRequirementsSection.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { projectDetailHref } from "@/lib/approvalCascade";

const navy = "hsl(var(--brand-navy))";

export interface AffectedProjectEntry {
  projectId: string;
  projectName: string;
  customerName: string;
  /** Optional state-change pair to display alongside (e.g. "gray → green"). */
  stateChange?: string;
}

interface Props {
  open: boolean;
  title?: string;
  entries: AffectedProjectEntry[];
  onClose: () => void;
  onLinkClick?: () => void;
}

export const AffectedProjectsModal = ({
  open, title = "Projects affected by this approval change",
  entries, onClose, onLinkClick,
}: Props) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl bg-card shadow-[var(--shadow-section)] border p-5 sm:p-6 animate-fade-in"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.2)" }}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="text-base font-semibold tracking-tight" style={{ color: navy }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-muted/40"
            style={{ color: "#888" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
          {entries.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2">No projects affected.</div>
          ) : (
            <ul className="divide-y" style={{ borderColor: "hsl(var(--brand-navy) / 0.08)" }}>
              {entries.map((e) => (
                <li key={e.projectId} className="py-2 flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={projectDetailHref(e.projectId)}
                      onClick={onLinkClick}
                      className="text-[13px] font-medium hover:underline"
                      style={{ color: navy }}
                    >
                      {e.projectName}
                    </Link>
                    <div className="text-[11px]" style={{ color: "#888" }}>{e.customerName}</div>
                  </div>
                  {e.stateChange && (
                    <div className="text-[10.5px] font-medium uppercase tracking-[0.06em] shrink-0" style={{ color: "#888" }}>
                      {e.stateChange}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border text-sm font-medium hover:bg-muted/40 transition-colors"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: navy }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Sibling-link inline list (used inside sheet warning text) ───────────────

export interface SiblingProject { id: string; name: string; }

export const SiblingProjectsInline = ({
  siblings,
  prefix,
  onLinkClick,
}: {
  siblings: SiblingProject[];
  /** Text shown before the link list. e.g. "Approving applies to 2 other project(s): " */
  prefix: string;
  onLinkClick?: () => void;
}) => {
  if (siblings.length === 0) return null;
  const shown = siblings.slice(0, 3);
  const extra = siblings.length - shown.length;
  return (
    <span style={{ color: "#999" }}>
      {prefix}
      {shown.map((s, i) => (
        <span key={s.id}>
          {i > 0 && ", "}
          <Link
            to={projectDetailHref(s.id)}
            onClick={onLinkClick}
            className="hover:underline"
            style={{ color: navy }}
          >
            {s.name}
          </Link>
        </span>
      ))}
      {extra > 0 && <span> +{extra} more</span>}
    </span>
  );
};
