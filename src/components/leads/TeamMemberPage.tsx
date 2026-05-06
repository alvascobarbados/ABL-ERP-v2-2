/**
 * Team Member detail page. Mounted under /team via MasterList.tsx
 * when ?team_member=ID is present in the URL.
 *
 * Mirrors the ProjectDetail visual structure: sticky header + stacked
 * white cards. Sections: Profile · Permissions · Assigned Projects · Activity.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import {
  SectionHeader, SectionCard, DetailRow,
} from "@/components/leads/ProjectDetail";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { BottomSheet } from "@/components/leads/EditorSheets";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMasterData, parseInitials, type TeamMember } from "@/hooks/useMasterData";
import { usePipelineStore } from "@/hooks/usePipelineStore";


const ROLE_OPTIONS = ["Sales", "Mixed", "Production", "Finance", "Design", "Other"] as const;
type RoleOption = typeof ROLE_OPTIONS[number];

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

interface LogRow {
  id: string;
  project_id: string;
  ts: string;
  actor_user_id: string;
  actor_display_name: string;
  action_type: string;
  description: string;
  metadata: any;
}

type EditorKind = "fullName" | "initials" | "email" | "role" | null;

export const TeamMemberPage = ({ memberId }: { memberId: string }) => {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const md = useMasterData();
  const store = usePipelineStore();

  const member = md.teamMembers.find((t) => t.id === memberId);

  const [editor, setEditor] = useState<EditorKind>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activity, setActivity] = useState<LogRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  // Refs for scroll-to-section
  const profileRef = useRef<HTMLDivElement | null>(null);
  const permsRef = useRef<HTMLDivElement | null>(null);
  const projectsRef = useRef<HTMLDivElement | null>(null);
  const activityRef = useRef<HTMLDivElement | null>(null);

  // Honour ?section= deep-link
  const [params] = useSearchParams();
  const sectionParam = params.get("section");
  useEffect(() => {
    if (!sectionParam || !member) return;
    const map: Record<string, React.RefObject<HTMLDivElement>> = {
      profile: profileRef, permissions: permsRef,
      projects: projectsRef, activity: activityRef,
    };
    const ref = map[sectionParam];
    if (ref?.current) {
      setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, [sectionParam, member]);

  // Fetch activity (last 25 entries by this member's display name)
  useEffect(() => {
    if (!member) return;
    let cancel = false;
    setActivityLoading(true);
    (async () => {
      const { data } = await supabase
        .from("project_log_entries")
        .select("*")
        .eq("actor_display_name", member.full_name)
        .order("ts", { ascending: false })
        .limit(25);
      if (!cancel) {
        setActivity((data ?? []) as LogRow[]);
        setActivityLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [member?.id, member?.full_name]);

  // Assigned projects (where member is on point_person)
  const assignedProjects = useMemo(() => {
    if (!member) return [];
    const I = member.initials.toUpperCase();
    return store.projects.filter(
      (p) => parseInitials(p.pointPerson).map((s) => s.toUpperCase()).includes(I),
    );
  }, [store.projects, member]);

  if (!member) {
    return (
      <DesktopAppShell>
        <div className="min-h-dvh p-8 text-center text-muted-foreground">
          Team member not found.{" "}
          <button onClick={() => navigate("/team")} className="underline">
            Back to team list
          </button>
        </div>
      </DesktopAppShell>
    );
  }

  const closeDetail = () => {
    setSearchParams({});
  };

  const handleDelete = async () => {
    try {
      await md.deleteTeamMember(member.id);
      toast.success(`${member.full_name} removed from team`);
      setConfirmDelete(false);
      navigate("/team");
    } catch (err: any) {
      toast.error(err?.message ?? "Delete failed");
    }
  };

  return (
    <DesktopAppShell>
      <div className="min-h-dvh" style={{ backgroundColor: "hsl(var(--background))" }}>
        {/* Sticky header */}
        <header
          className="sticky top-0 z-20 backdrop-blur-md border-b"
          style={{ backgroundColor: "hsl(var(--background) / 0.92)", borderColor: "hsl(var(--brand-navy) / 0.12)" }}
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center gap-3">
            <button
              onClick={closeDetail}
              aria-label="Back"
              className="p-2 -ml-2 rounded-full hover:bg-muted/50"
            >
              <ArrowLeft className="h-5 w-5" style={{ color: "hsl(var(--brand-navy))" }} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">Team member</div>
              <h1
                className="text-[22px] leading-tight font-light tracking-tight truncate"
                style={{ color: "hsl(var(--brand-navy))", fontWeight: 300 }}
              >
                {member.full_name}
              </h1>
              <div className="text-[12px] text-muted-foreground">{member.role ?? "—"}</div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  aria-label="More"
                  className="p-2 rounded-full hover:bg-muted/50"
                >
                  <MoreVertical className="h-5 w-5" style={{ color: "hsl(var(--brand-navy))" }} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 p-1">
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm hover:bg-muted/50"
                  style={{ color: "hsl(var(--urgent))" }}
                >
                  <Trash2 className="h-4 w-4" /> Remove from team
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-8">
          {/* PROFILE */}
          <section ref={profileRef}>
            <SectionHeader>Profile</SectionHeader>
            <SectionCard>
              <DetailRow label="Full Name" value={member.full_name} onClick={() => setEditor("fullName")} />
              <DetailRow label="Initials" value={member.initials} onClick={() => setEditor("initials")} />
              <DetailRow label="Email" value={member.email ?? undefined} onClick={() => setEditor("email")} />
              <DetailRow label="Role" value={member.role ?? undefined} onClick={() => setEditor("role")} />
            </SectionCard>
          </section>

          {/* PERMISSIONS */}
          <section ref={permsRef}>
            <SectionHeader>Permissions</SectionHeader>
            <SectionCard>
              <div className="space-y-3">
                <div className="text-[14px]" style={{ color: "hsl(var(--brand-navy))" }}>
                  <span className="text-muted-foreground">Role: </span>
                  <span className="font-semibold">{member.role ?? "—"}</span>
                </div>
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  A full role-based permission system is coming soon. Currently all team members can view
                  and edit all projects. Roles above are for organizational reference only.
                </p>
              </div>
            </SectionCard>
          </section>

          {/* ASSIGNED PROJECTS */}
          <section ref={projectsRef}>
            <SectionHeader>Assigned Projects · {assignedProjects.length}</SectionHeader>
            <SectionCard>
              {assignedProjects.length === 0 ? (
                <div className="text-[13px] italic text-muted-foreground py-2">
                  Not currently assigned to any projects
                </div>
              ) : (
                <ul className="divide-y" style={{ borderColor: "hsl(var(--brand-navy) / 0.08)" }}>
                  {assignedProjects.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => navigate(`/?project=${encodeURIComponent(p.id)}`)}
                        className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-muted/30 -mx-2 px-2 rounded-md"
                      >
                        <span className="min-w-0 truncate text-[14px]" style={{ color: "hsl(var(--brand-navy))" }}>
                          <span className="font-semibold">{p.customer}</span>
                          <span className="text-muted-foreground"> · {p.projectName}</span>
                        </span>
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wide"
                          style={{
                            backgroundColor: "hsl(var(--brand-navy) / 0.08)",
                            color: "hsl(var(--brand-navy))",
                          }}
                        >
                          {p.pipeline} · {p.stage}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </section>

          {/* ACTIVITY */}
          <section ref={activityRef}>
            <SectionHeader>Activity</SectionHeader>
            <SectionCard>
              {activityLoading ? (
                <div className="text-[13px] text-muted-foreground py-2">Loading…</div>
              ) : activity.length === 0 ? (
                <div className="text-[13px] italic text-muted-foreground py-2">No activity recorded yet</div>
              ) : (
                <>
                  <ul className="space-y-2.5">
                    {activity.map((r) => (
                      <li key={r.id} className="flex items-start gap-3 text-[13px]">
                        <span
                          className="shrink-0 text-[11px] tabular-nums w-24"
                          style={{ color: "hsl(var(--brand-navy) / 0.5)" }}
                        >
                          {new Date(r.ts).toLocaleString(undefined, {
                            month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                          })}
                        </span>
                        <span className="flex-1 min-w-0" style={{ color: "hsl(var(--brand-navy))" }}>
                          {r.description}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 pt-3 border-t" style={{ borderColor: "hsl(var(--brand-navy) / 0.08)" }}>
                    <button
                      onClick={() => navigate(`/activity?member=${encodeURIComponent(member.initials)}`)}
                      className="text-[13px] font-medium"
                      style={{ color: "hsl(var(--brand-orange))" }}
                    >
                      View all in Activity Log →
                    </button>
                  </div>
                </>
              )}
            </SectionCard>
          </section>
        </main>

        {/* Edit sheets */}
        <FieldEditor
          open={editor !== null}
          kind={editor}
          member={member}
          onClose={() => setEditor(null)}
        />

        {/* Confirm delete */}
        <ConfirmDialog
          open={confirmDelete}
          onCancel={() => setConfirmDelete(false)}
          title={`Remove ${member.full_name} from team?`}
          description={
            assignedProjects.length > 0
              ? `Their historical activity will remain in the audit log. This cannot be undone. ${member.full_name} is assigned to ${assignedProjects.length} active project${assignedProjects.length === 1 ? "" : "s"}. Their assignment will remain — you'll need to reassign manually.`
              : "Their historical activity will remain in the audit log. This cannot be undone."
          }
          confirmLabel="Remove"
          destructive
          onConfirm={handleDelete}
        />
      </div>
    </DesktopAppShell>
  );
};

// ─── Field editor sheet (inline single-field) ────────────────────────────
const FieldEditor = ({
  open, kind, member, onClose,
}: {
  open: boolean;
  kind: EditorKind;
  member: TeamMember;
  onClose: () => void;
}) => {
  const md = useMasterData();
  const [value, setValue] = useState("");
  const [roleSelect, setRoleSelect] = useState<RoleOption | "">("");
  const [roleCustom, setRoleCustom] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !kind) return;
    if (kind === "fullName") setValue(member.full_name);
    else if (kind === "initials") setValue(member.initials);
    else if (kind === "email") setValue(member.email ?? "");
    else if (kind === "role") {
      const current = member.role ?? "";
      if ((ROLE_OPTIONS as readonly string[]).includes(current)) {
        setRoleSelect(current as RoleOption);
        setRoleCustom("");
      } else if (current) {
        setRoleSelect("Other");
        setRoleCustom(current);
      } else {
        setRoleSelect(""); setRoleCustom("");
      }
    }
  }, [open, kind, member]);

  if (!kind) return null;

  const titles: Record<NonNullable<EditorKind>, string> = {
    fullName: "Edit full name",
    initials: "Edit initials",
    email: "Edit email",
    role: "Edit role",
  };

  const submit = async () => {
    setSaving(true);
    try {
      if (kind === "fullName") {
        const v = value.trim();
        if (!v) { toast.error("Full name is required"); setSaving(false); return; }
        await md.updateTeamMember(member.id, { full_name: v });
      } else if (kind === "initials") {
        const v = value.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
        if (!v) { toast.error("Initials required"); setSaving(false); return; }
        const dup = md.teamMembers.find((t) => t.id !== member.id && t.initials.toUpperCase() === v);
        if (dup) { toast.error(`Initials "${v}" already used by ${dup.full_name}`); setSaving(false); return; }
        await md.updateTeamMember(member.id, { initials: v });
      } else if (kind === "email") {
        const v = value.trim().toLowerCase();
        if (v && !emailOk(v)) { toast.error("Invalid email format"); setSaving(false); return; }
        await md.updateTeamMember(member.id, { email: v || null } as any);
      } else if (kind === "role") {
        const final = roleSelect === "Other" ? (roleCustom.trim() || "Other") : (roleSelect || null);
        await md.updateTeamMember(member.id, { role: final as any });
      }
      onClose();
    } catch (err: any) {
      const msg: string = err?.message ?? "Save failed";
      if (/duplicate|unique/i.test(msg)) toast.error("That email is already used by another team member");
      else toast.error(msg);
    }
    setSaving(false);
  };

  const inputCls = "w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]";

  return (
    <BottomSheet open={open} onClose={onClose} title={titles[kind]} onSave={submit} saveDisabled={saving} saveLabel="Save">
      <div className="space-y-3">
        {kind === "role" ? (
          <>
            <select
              value={roleSelect}
              onChange={(e) => setRoleSelect(e.target.value as any)}
              className={inputCls}
              style={{ minHeight: 48 }}
            >
              <option value="">— None —</option>
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {roleSelect === "Other" && (
              <input
                value={roleCustom}
                onChange={(e) => setRoleCustom(e.target.value)}
                placeholder="Custom role (e.g. Operations)"
                className={inputCls}
                style={{ minHeight: 48 }}
                autoFocus
              />
            )}
          </>
        ) : (
          <input
            value={value}
            onChange={(e) => {
              if (kind === "initials") setValue(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3));
              else setValue(e.target.value);
            }}
            type={kind === "email" ? "email" : "text"}
            className={inputCls}
            style={{ minHeight: 48 }}
            autoFocus
          />
        )}
      </div>
    </BottomSheet>
  );
};
