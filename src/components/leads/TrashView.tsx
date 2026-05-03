import { useMemo, useState } from "react";
import { Trash2, RotateCcw, X, Search, ArrowDownNarrowWide, ArrowUpNarrowWide, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";
import { Sheet } from "./Sheet";
import { ConfirmDialog } from "./ConfirmDialog";
import { Project, PIPELINES } from "@/data/pipelines";
import { usePipelineStore, getStageTitle } from "@/hooks/usePipelineStore";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

const fmtAgo = (d: Date): string => {
  const ms = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(ms / day);
  if (days <= 0) {
    const h = Math.floor(ms / (60 * 60 * 1000));
    if (h <= 0) return "just now";
    if (h === 1) return "an hour ago";
    return `${h} hours ago`;
  }
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "a week ago";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
};

const fmtRemaining = (deletedAt: Date): string => {
  const purgeAt = deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000;
  const days = Math.max(0, Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000)));
  return `auto-deletes in ${days}d`;
};

const pipelineLabel = (id: string) => PIPELINES.find((p) => p.id === id)?.title ?? id;

export const TrashView = ({ open, onClose }: Props) => {
  const store = usePipelineStore();
  const items = store.trashedProjects;

  const [sortDir, setSortDir] = useState<"newest" | "oldest">("newest");
  const [q, setQ] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmHard, setConfirmHard] = useState<{ ids: string[]; label: string } | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = items;
    if (needle) {
      list = list.filter((p) =>
        [p.customer, p.projectName, p.quoteNumber ?? "", p.poNumber ?? "", p.invoiceNumber ?? "", p.detailSummary ?? ""]
          .some((f) => f.toLowerCase().includes(needle)),
      );
    }
    return [...list].sort((a, b) => {
      const ta = a.deletedAt!.getTime();
      const tb = b.deletedAt!.getTime();
      return sortDir === "newest" ? tb - ta : ta - tb;
    });
  }, [items, q, sortDir]);

  const exitSelect = () => { setSelecting(false); setSelected(new Set()); };

  const toggleSel = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const restoreOne = (p: Project) => {
    const result = store.restoreProject(p.id);
    if (!result) return;
    const where = `${pipelineLabel(result.pipeline)} / ${getStageTitle(result.pipeline, result.stage)}`;
    toast.success(`${p.customer} · ${p.projectName} restored to ${where}`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => { store.softDeleteProject(p.id); toast(`Sent back to Trash`, { duration: 1800 }); },
      },
    });
  };

  const restoreSelected = () => {
    const ids = Array.from(selected);
    let n = 0;
    ids.forEach((id) => { if (store.restoreProject(id)) n += 1; });
    toast.success(`${n} ${n === 1 ? "project" : "projects"} restored`, { duration: 4000 });
    exitSelect();
  };

  const purgeOne = (p: Project) => setConfirmHard({ ids: [p.id], label: `${p.customer} · ${p.projectName}` });
  const purgeSelected = () =>
    setConfirmHard({ ids: Array.from(selected), label: `${selected.size} ${selected.size === 1 ? "project" : "projects"}` });

  // ── Long-press to enter multi-select ──
  const lpTimer = useState<{ t: number | null }>({ t: null })[0];
  const startLP = (id: string) => {
    if (selecting) return;
    if (lpTimer.t) window.clearTimeout(lpTimer.t);
    lpTimer.t = window.setTimeout(() => {
      setSelecting(true);
      setSelected(new Set([id]));
      if ("vibrate" in navigator) try { navigator.vibrate(15); } catch { /* noop */ }
    }, 450);
  };
  const cancelLP = () => { if (lpTimer.t) { window.clearTimeout(lpTimer.t); lpTimer.t = null; } };

  return (
    <Sheet open={open} onClose={onClose} title="Trash" eyebrow={`${items.length} project${items.length === 1 ? "" : "s"}`}>
      {/* Sub-header: hint + sort + search */}
      <div className="space-y-3 mb-4">
        <p className="text-xs text-muted-foreground">Items auto-delete after 30 days.</p>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1 rounded-xl border bg-background/60 px-3"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.18)", minHeight: 42 }}>
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search trash"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground py-1.5"
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="Clear" className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => setSortDir(sortDir === "newest" ? "oldest" : "newest")}
            className="inline-flex items-center gap-1.5 px-3 rounded-xl border text-xs font-medium hover:bg-muted/40 transition-colors shrink-0"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.2)", color: "hsl(var(--brand-navy))", minHeight: 42 }}
            aria-label="Toggle sort"
          >
            {sortDir === "newest" ? <ArrowDownNarrowWide className="h-3.5 w-3.5" /> : <ArrowUpNarrowWide className="h-3.5 w-3.5" />}
            {sortDir === "newest" ? "Newest" : "Oldest"}
          </button>
        </div>

        {selecting && (
          <div className="flex items-center justify-between rounded-xl px-3 py-2 border"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.2)", backgroundColor: "hsl(var(--brand-navy) / 0.05)" }}>
            <div className="text-xs font-medium" style={{ color: "hsl(var(--brand-navy))" }}>
              {selected.size} selected
            </div>
            <button onClick={exitSelect} className="text-xs underline underline-offset-2" style={{ color: "hsl(var(--brand-navy))" }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        items.length === 0 ? (
          <div className="text-center py-16">
            <div className="mx-auto inline-flex items-center justify-center rounded-full mb-4"
              style={{ width: 56, height: 56, backgroundColor: "hsl(var(--brand-navy) / 0.06)" }}>
              <Trash2 className="h-6 w-6" style={{ color: "hsl(var(--brand-navy) / 0.55)" }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: "hsl(var(--brand-navy))" }}>Trash is empty</p>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-xs mx-auto leading-snug">
              Deleted projects appear here for 30 days before they're permanently removed.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic text-center py-6">No matches.</p>
        )
      ) : (
        <ul className="space-y-2.5 pb-24">
          {filtered.map((p) => {
            const isSel = selected.has(p.id);
            const ageLabel = `Deleted ${fmtAgo(p.deletedAt!)} · ${fmtRemaining(p.deletedAt!)}`;
            const wasIn = p.deletedFromPipeline && p.deletedFromStage
              ? `${pipelineLabel(p.deletedFromPipeline)} / ${getStageTitle(p.deletedFromPipeline, p.deletedFromStage)}`
              : "Unknown";
            return (
              <li key={p.id}>
                <div
                  className={cn(
                    "rounded-2xl border bg-card/70 transition-colors",
                    isSel && "ring-2",
                  )}
                  style={{
                    borderColor: isSel ? "hsl(var(--brand-orange))" : "hsl(var(--brand-navy) / 0.12)",
                  }}
                  onPointerDown={() => startLP(p.id)}
                  onPointerUp={cancelLP}
                  onPointerCancel={cancelLP}
                  onPointerLeave={cancelLP}
                >
                  <div className="px-4 py-3 flex items-start gap-3">
                    {selecting && (
                      <button
                        onClick={() => toggleSel(p.id)}
                        aria-label={isSel ? "Deselect" : "Select"}
                        className="mt-0.5 shrink-0"
                      >
                        {isSel
                          ? <CheckSquare className="h-5 w-5" style={{ color: "hsl(var(--brand-orange))" }} />
                          : <Square className="h-5 w-5 text-muted-foreground/60" />}
                      </button>
                    )}
                    <div className="flex-1 min-w-0 opacity-60">
                      <div className="text-[15px] font-semibold tracking-tight text-foreground truncate">
                        {p.customer}
                      </div>
                      <div className="text-[13px] truncate" style={{ color: "hsl(var(--brand-navy))" }}>
                        {p.projectName}
                      </div>
                      {p.detailSummary?.trim() && (
                        <div className="text-[12px] text-muted-foreground/85 truncate mt-0.5">
                          {p.detailSummary}
                        </div>
                      )}
                      <div className="text-[11px] text-muted-foreground/80 mt-1.5">
                        {ageLabel}
                      </div>
                      <div className="text-[11px] text-muted-foreground/65">
                        From {wasIn}
                      </div>
                    </div>
                  </div>
                  {!selecting && (
                    <div className="flex items-stretch border-t" style={{ borderColor: "hsl(var(--brand-navy) / 0.08)" }}>
                      <button
                        onClick={() => restoreOne(p)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-medium hover:bg-muted/40 transition-colors"
                        style={{ color: "hsl(var(--brand-navy))" }}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </button>
                      <div className="w-px" style={{ backgroundColor: "hsl(var(--brand-navy) / 0.08)" }} />
                      <button
                        onClick={() => purgeOne(p)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-medium hover:bg-[hsl(var(--urgent)/0.08)] transition-colors"
                        style={{ color: "hsl(var(--urgent))" }}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete forever
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Bulk action bar */}
      {selecting && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 bg-background/95 backdrop-blur-md border-t"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.15)" }}>
          <div className="max-w-md mx-auto flex gap-2">
            <button
              onClick={restoreSelected}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition-colors hover:bg-muted/40"
              style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: 48 }}
            >
              <RotateCcw className="h-4 w-4" /> Restore ({selected.size})
            </button>
            <button
              onClick={purgeSelected}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: "hsl(var(--urgent))", minHeight: 48 }}
            >
              <Trash2 className="h-4 w-4" /> Delete forever
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmHard}
        title="Permanently delete?"
        description={confirmHard
          ? `This will permanently delete ${confirmHard.label}. This cannot be undone.`
          : ""}
        confirmLabel="Delete forever"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setConfirmHard(null)}
        onConfirm={() => {
          if (!confirmHard) return;
          confirmHard.ids.forEach((id) => store.hardDeleteProject(id));
          const msg = confirmHard.ids.length === 1 ? "Project permanently deleted" : `${confirmHard.ids.length} projects permanently deleted`;
          setConfirmHard(null);
          if (selecting) exitSelect();
          toast(msg, { duration: 3000 });
        }}
      />
    </Sheet>
  );
};
