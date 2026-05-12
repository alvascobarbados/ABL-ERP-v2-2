/**
 * New Project creation sheet — opened by the persistent FAB. Three fields:
 *   - Customer (required, picker-only — no free text)
 *   - Project name (required, free text, live duplicate hint)
 *   - Detail (optional, free text)
 *
 * On Create: a new Project is added to Sales · Proposal, sales rep is set
 * to the current user (Avinash → "AV"), and the parent navigates into the
 * new project's detail view.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BottomSheet } from "./EditorSheets";
import { EntityPicker } from "./EntityPicker";
import { BuyerPicker } from "./BuyerPicker";
import { ConfirmDialog } from "./ConfirmDialog";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { useMasterData } from "@/hooks/useMasterData";
import { Project, PIPELINES } from "@/data/pipelines";

type InitialStageId = "sourcing" | "proposal" | "quote" | "confirming";
const INITIAL_STAGES: InitialStageId[] = ["sourcing", "proposal", "quote", "confirming"];
import { DEFAULT_USER_INITIALS } from "./UserMenu";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

export const NewProjectSheet = ({ open, onClose, onCreated }: Props) => {
  const store = usePipelineStore();
  const md = useMasterData();
  const [customer, setCustomer] = useState<string>("");
  const [buyerId, setBuyerId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [detail, setDetail] = useState("");
  const [deadline, setDeadline] = useState(""); // yyyy-mm-dd or ""
  const [initialStage, setInitialStage] = useState<InitialStageId>("sourcing");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [buyerPickerOpen, setBuyerPickerOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [debouncedName, setDebouncedName] = useState("");

  useEffect(() => {
    if (open) {
      setCustomer("");
      setBuyerId(null);
      setProjectName("");
      setDetail("");
      setDeadline("");
      setInitialStage("sourcing");
      setPickerOpen(false);
      setBuyerPickerOpen(false);
      setDiscardOpen(false);
      setDebouncedName("");
    }
  }, [open]);

  // Debounce the project name (~250ms) so the duplicate warning doesn't
  // flicker on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(projectName), 250);
    return () => clearTimeout(t);
  }, [projectName]);

  const dirty = !!customer || !!projectName.trim() || !!detail.trim();
  const valid = !!customer && projectName.trim().length >= 2;

  const dupHint = useMemo(() => {
    // Require both a selected customer AND a non-trivial debounced name.
    const trimmed = debouncedName.trim();
    if (!customer || trimmed.length < 2) return null;
    const target = trimmed.toLowerCase();
    const targetCustomer = customer.toLowerCase();
    const existing = store.projects.find(
      (p) =>
        !p.deletedAt &&
        !(p.pipeline === "sales" && p.stage === "archive") &&
        p.customer.toLowerCase() === targetCustomer &&
        p.projectName.trim().toLowerCase() === target,
    );
    if (!existing) return null;
    return `Project "${existing.projectName}" already exists on ${existing.customer}. Editing this name will rename both projects.`;
  }, [debouncedName, customer, store.projects]);

  const handleCancel = () => {
    if (dirty) setDiscardOpen(true);
    else onClose();
  };

  const handleCreate = async () => {
    if (!valid) return;
    const proj = await store.createProject({
      customer,
      projectName: projectName.trim(),
      detailSummary: detail.trim() || undefined,
      pointPerson: DEFAULT_USER_INITIALS,
      initialStage,
      deadlineDate: deadline ? new Date(`${deadline}T00:00:00`) : undefined,
      buyerId: buyerId ?? undefined,
    });
    if (!proj) return;
    toast.success(`Project created · ${proj.customer} · ${proj.projectName}`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          store.hardDeleteProject(proj.id);
          toast("Creation undone", { duration: 1800 });
        },
      },
    });
    onClose();
    onCreated(proj);
  };

  const labelCls = "block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5";
  const inputCls = "w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]";

  return (
    <>
      <BottomSheet
        open={open && !pickerOpen && !buyerPickerOpen}
        onClose={handleCancel}
        title="New Project"
        onSave={handleCreate}
        saveLabel="Create"
        saveDisabled={!valid}
      >
        <div className="space-y-4">
          <div>
            <label className={labelCls}>
              Customer <span style={{ color: "hsl(var(--brand-orange))" }}>*</span>
            </label>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full text-left rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] hover:bg-muted/40 transition-colors"
              style={{ minHeight: 48 }}
            >
              {customer || (
                <span className="text-muted-foreground italic">Pick customer…</span>
              )}
            </button>
          </div>

          <div>
            <label className={labelCls}>Buyer (optional)</label>
            <button
              type="button"
              disabled={!customer}
              onClick={() => setBuyerPickerOpen(true)}
              className="w-full text-left rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] hover:bg-muted/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ minHeight: 48 }}
            >
              {(() => {
                const b = buyerId ? md.buyers.find((x) => x.id === buyerId) : null;
                if (b) return b.name;
                return (
                  <span className="text-muted-foreground italic">
                    {customer ? "Pick buyer…" : "Pick a customer first"}
                  </span>
                );
              })()}
            </button>
          </div>

          <div>
            <label className={labelCls}>
              Project name <span style={{ color: "hsl(var(--brand-orange))" }}>*</span>
            </label>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Welcome Premiums"
              className={inputCls}
              style={{ minHeight: 48 }}
            />
            {dupHint && (
              <p className="text-[11px] mt-1.5 leading-snug" style={{ color: "hsl(var(--brand-orange))" }}>
                {dupHint}
              </p>
            )}
          </div>

          <div>
            <label className={labelCls}>Detail (optional)</label>
            <input
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Short summary"
              className={inputCls}
              style={{ minHeight: 48 }}
            />
          </div>

          <div>
            <label className={labelCls}>Deadline (optional)</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className={inputCls}
              style={{ minHeight: 48 }}
            />
          </div>

          <div>
            <label className={labelCls}>Initial stage</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {(() => {
                const sales = PIPELINES.find((p) => p.id === "sales");
                const stageMap = new Map((sales?.stages ?? []).map((s) => [s.id as string, s.title]));
                return INITIAL_STAGES.map((s) => {
                  const selected = initialStage === s;
                  const title = stageMap.get(s) ?? s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setInitialStage(s)}
                      className="rounded-xl border px-3 py-2.5 text-[14px] transition-colors"
                      style={{
                        minHeight: 48,
                        backgroundColor: selected ? "hsl(var(--brand-navy) / 0.08)" : "hsl(var(--card))",
                        borderColor: selected ? "hsl(var(--brand-navy) / 0.4)" : "hsl(var(--border))",
                        color: selected ? "hsl(var(--brand-navy))" : "hsl(var(--foreground))",
                        fontWeight: selected ? 600 : 400,
                      }}
                    >
                      {title}
                    </button>
                  );
                });
              })()}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
              Sales · {PIPELINES.find((p) => p.id === "sales")?.stages.find((s) => s.id === initialStage)?.title ?? initialStage}
            </p>
          </div>

          <p className="text-[11px] text-muted-foreground italic leading-snug pt-1">
            Need more fields? Create first, then expand from the project.
          </p>
        </div>
      </BottomSheet>

      <EntityPicker
        open={pickerOpen}
        kind="customer"
        selectedId={customer || null}
        onClose={() => setPickerOpen(false)}
        onPick={(name) => setCustomer(name)}
      />

      <ConfirmDialog
        open={discardOpen}
        title="Discard new project?"
        description="The values you've entered will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => { setDiscardOpen(false); onClose(); }}
      />
    </>
  );
};
