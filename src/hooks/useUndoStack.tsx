/**
 * Cmd+Z / Ctrl+Z global action-level undo (v1).
 *
 * Design:
 *  - Module-level singleton stack (in-memory, FIFO eviction at MAX=50, no
 *    persistence). Cleared on sign-out and on page refresh by nature.
 *  - Pressing Cmd/Ctrl+Z outside any text input pops the most recent
 *    UndoEntry and invokes its applyInverse(). Inputs/textareas/
 *    contenteditables keep their native browser-level text undo.
 *  - Audit logging: while applyInverse runs we set an undo context flag.
 *    appendLog (in usePipelineStore) consults it to tag the resulting
 *    audit entry's metadata with { undoOfLogId, undoOfDescription }
 *    without rewriting prior history.
 *  - Inverse mutations re-enter the store; pushUndo skips while
 *    `isUndoing()` is true so undoing an undo doesn't endlessly nest.
 *  - Stale targets (record deleted, line item removed, etc.) return
 *    `{ ok: false, reason }` from applyInverse → toast + drop entry.
 */
import { useEffect } from "react";
import { toast } from "sonner";

export interface UndoEntry {
  id: string;
  timestamp: number;
  /** Human-readable for the success toast. e.g. "Changed deadline on Acme Job". */
  description: string;
  /** Original audit-log entry id (for metadata back-reference). */
  originalLogId?: string;
  /** Original audit description (for metadata back-reference). */
  originalDescription?: string;
  /** Reverses the original action. Should return ok=false (not throw) for graceful failures. */
  applyInverse: () => Promise<{ ok: boolean; reason?: string }>;
}

const MAX_STACK = 50;
let stack: UndoEntry[] = [];
let undoing = false;
let undoCtx: { originalLogId?: string; originalDescription?: string } | null = null;
let lastEmptyToast = 0;

export const isUndoing = () => undoing;
export const getUndoContext = () => undoCtx;

export function pushUndo(entry: UndoEntry) {
  // Don't record entries created while applying an inverse (avoids ping-pong).
  if (undoing) return;
  stack.push(entry);
  if (stack.length > MAX_STACK) stack.shift();
}

export function clearUndoStack() {
  stack = [];
}

export function getUndoStackSize() {
  return stack.length;
}

export async function performUndo() {
  if (undoing) return;
  const entry = stack.pop();
  if (!entry) {
    const now = Date.now();
    if (now - lastEmptyToast > 1500) {
      toast("Nothing to undo", { duration: 2000 });
      lastEmptyToast = now;
    }
    return;
  }
  undoing = true;
  undoCtx = { originalLogId: entry.originalLogId, originalDescription: entry.originalDescription };
  try {
    const result = await entry.applyInverse();
    if (result.ok) {
      toast(`Undone: ${entry.description}`, { duration: 3000 });
    } else {
      toast(result.reason ?? "Can't undo — target no longer exists", { duration: 3000 });
      // Stale entry is already off the stack; pointer naturally advances on next press.
    }
  } catch (e: any) {
    // Unexpected exception — keep the entry available so the user can retry.
    stack.push(entry);
    toast.error(`Couldn't undo — ${e?.message ?? "unexpected error"}`, { duration: 5000 });
  } finally {
    undoing = false;
    undoCtx = null;
  }
}

const isEditableTarget = (el: EventTarget | null): boolean => {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  // Walk up — handles cases where focus is inside an editor wrapper that has a child input.
  if (el.closest('input, textarea, select, [contenteditable="true"]')) return true;
  return false;
};

/** Mount once at the root. Installs the Cmd/Ctrl+Z keydown listener. */
export const UndoKeyboardListener = () => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "z") return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey) return; // Shift+Cmd+Z is reserved for future redo.
      if (isEditableTarget(e.target)) return; // let native text-undo run.
      e.preventDefault();
      void performUndo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
};

let nextId = 1;
export const makeUndoId = () => `undo-${Date.now()}-${nextId++}`;
