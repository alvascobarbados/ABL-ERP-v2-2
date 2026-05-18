/**
 * EditableCell — Row-selection-first cell wrapper for ProjectTable.
 *
 * Interaction model (v2):
 *   - First click on any cell  → row SELECTED, that cell focused (no editor)
 *   - Click different cell same row → focus moves, row stays selected
 *   - Click different row      → previous row deselected, new row selected
 *   - Second click same focused cell (NOT a double-click) → editor opens
 *     (deferred ~250ms; dblclick cancels the pending edit)
 *   - Double-click any cell    → onRowDoubleClick (opens project detail)
 *   - Click outside table body → deselect everything
 *   - Esc while editing        → cancel edit, return to selected
 *   - Esc while only selected  → deselect row (handled by ProjectTable when
 *     no detail page is open)
 *
 * Custom cells (entity / enum) reuse the same state — they "open" their
 * popover on entering Editing rather than rendering an input.
 */
import { useEffect, useRef, useState, KeyboardEvent, MouseEvent as ReactMouseEvent, useContext, createContext, useCallback } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveResult = { ok: true } | { ok: false; reason?: string };

const PENDING_EDIT_MS = 250;

// ── Selection context ─────────────────────────────────────────────────
interface SelectionState {
  selectedRowId: string | null;
  activeKey: string | null;
  editing: boolean;
  /** Click handler: selects cell, schedules edit if same cell re-clicked. */
  selectCell: (rowId: string, key: string, opts?: { noEdit?: boolean }) => void;
  /** Cancel a pending second-click-enters-edit timer (called on dblclick). */
  cancelPendingEdit: () => void;
  /** Force a cell directly into editing (used by custom popover open paths). */
  editCell: (rowId: string, key: string) => void;
  /** Step down from editing → selected (same cell). */
  stopEditing: () => void;
  /** Clear all selection (Esc when only selected, or click outside table). */
  clear: () => void;
}

const SelectionContext = createContext<SelectionState | null>(null);

export const useCellSelection = () => useContext(SelectionContext);

/** Convenience hook for row-level highlight. */
export const useRowSelected = (rowId: string) => {
  const sel = useCellSelection();
  return !!sel && sel.selectedRowId === rowId;
};

/** Convenience hook for focused-cell ring style (focused cell within selected row). */
export const useCellFocused = (cellKey: string) => {
  const sel = useCellSelection();
  return !!sel && sel.activeKey === cellKey;
};

interface ProviderProps {
  children: React.ReactNode;
  /** Optional ref to the table root — when provided, mousedown outside it clears selection. */
  outsideRef?: React.RefObject<HTMLElement>;
}

export const SelectionProvider = ({ children, outsideRef }: ProviderProps) => {
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Refs mirror state for use inside stable callbacks.
  const rowRef = useRef<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const editingRef = useRef(false);
  const pendingTimer = useRef<number | null>(null);

  const cancelPending = useCallback(() => {
    if (pendingTimer.current) {
      window.clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
  }, []);

  const selectCell = useCallback((rowId: string, key: string, opts?: { noEdit?: boolean }) => {
    const sameRow = rowRef.current === rowId;
    const sameKey = keyRef.current === key;
    if (!sameRow || !sameKey) {
      cancelPending();
      rowRef.current = rowId;
      keyRef.current = key;
      editingRef.current = false;
      setSelectedRowId(rowId);
      setActiveKey(key);
      setEditing(false);
      return;
    }
    // Same focused cell — schedule edit unless suppressed or already editing.
    if (editingRef.current || opts?.noEdit) return;
    cancelPending();
    pendingTimer.current = window.setTimeout(() => {
      editingRef.current = true;
      setEditing(true);
      pendingTimer.current = null;
    }, PENDING_EDIT_MS);
  }, [cancelPending]);

  const cancelPendingEdit = useCallback(() => {
    cancelPending();
  }, [cancelPending]);

  const editCell = useCallback((rowId: string, key: string) => {
    cancelPending();
    rowRef.current = rowId;
    keyRef.current = key;
    editingRef.current = true;
    setSelectedRowId(rowId);
    setActiveKey(key);
    setEditing(true);
  }, [cancelPending]);

  const stopEditing = useCallback(() => {
    cancelPending();
    editingRef.current = false;
    setEditing(false);
  }, [cancelPending]);

  const clear = useCallback(() => {
    cancelPending();
    rowRef.current = null;
    keyRef.current = null;
    editingRef.current = false;
    setSelectedRowId(null);
    setActiveKey(null);
    setEditing(false);
  }, [cancelPending]);

  // Outside-click → clear selection. Edits commit on the input's onBlur,
  // which fires before this handler.
  useEffect(() => {
    if (!outsideRef) return;
    const handler = (e: MouseEvent) => {
      const root = outsideRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      // Ignore clicks inside Radix portals (popovers, etc.)
      if (e.target instanceof Element && e.target.closest('[data-radix-popper-content-wrapper]')) return;
      clear();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [outsideRef, clear]);

  // Esc handler at provider level: editing→selected; selected→cleared.
  // ProjectTable's own keydown listener may pre-empt this when a detail
  // page is open.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || (target as any).isContentEditable)) {
        // Editing cells handle their own Esc (cancel + flush).
        return;
      }
      if (editingRef.current) {
        stopEditing();
      } else if (rowRef.current || keyRef.current) {
        clear();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [stopEditing, clear]);

  // Cleanup any pending timer on unmount.
  useEffect(() => () => cancelPending(), [cancelPending]);

  return (
    <SelectionContext.Provider
      value={{
        selectedRowId, activeKey, editing,
        selectCell, cancelPendingEdit, editCell, stopEditing, clear,
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
};

// Optional row context: wrap each table row so cells inherit rowId AND
// a default double-click handler (open detail) without each call site
// having to pass them explicitly.
const RowContext = createContext<string | null>(null);
const RowDoubleClickContext = createContext<(() => void) | null>(null);
export const RowProvider = ({ rowId, onDoubleClick, children }: { rowId: string; onDoubleClick?: () => void; children: React.ReactNode }) => (
  <RowContext.Provider value={rowId}>
    <RowDoubleClickContext.Provider value={onDoubleClick ?? null}>
      {children}
    </RowDoubleClickContext.Provider>
  </RowContext.Provider>
);
export const useRowId = () => useContext(RowContext);
export const useRowDoubleClick = () => useContext(RowDoubleClickContext);

// ── Cell ──────────────────────────────────────────────────────────────
interface BaseProps {
  /** Row id this cell belongs to. Defaults to the surrounding RowProvider. */
  rowId?: string;
  /** Stable identifier for selection (e.g. `${rowId}:projectName`). */
  cellKey: string;
  /** Read-only? (no hover, no click-to-edit) */
  readOnly?: boolean;
  /** Right-align display + input. */
  align?: "left" | "right";
  /** Display value when not editing. */
  display: React.ReactNode;
  /** Tooltip text on the cell. */
  title?: string;
  /** Muted styling (e.g. when value is empty/—). */
  muted?: boolean;
  /** Forced flash state from outside (used by Category B/C cells where save happens after popover close). */
  flash?: "success" | "error" | null;
  /** Double-click handler — opens project detail at the row level. */
  onRowDoubleClick?: () => void;
  /** When true, second-click never schedules edit (used by Stage column). */
  noClickEdit?: boolean;
}

interface TextProps extends BaseProps {
  mode: "text" | "number";
  /** Current raw value to seed the input. */
  value: string;
  /** Placeholder while editing. */
  placeholder?: string;
  /** Optional fixed visual prefix shown left of the input while editing (e.g. "Q-"). Not part of the saved value. */
  prefix?: string;
  /** Optional max input length (characters). No cap when omitted. */
  maxLength?: number;
  /** Called when the user commits (Enter or blur). Return ok=false to flash red. */
  onCommit: (next: string) => Promise<SaveResult> | SaveResult;
}

interface CustomProps extends BaseProps {
  mode: "custom";
  /** Called when this cell enters Editing — open the popover anchored to `anchor`. */
  onActivate: (anchor: HTMLElement) => void;
  /** Whether this cell currently has its popover open (for ring styling). */
  active?: boolean;
}

type Props = TextProps | CustomProps;

const FLASH_MS = 700;

export const EditableCell = (props: Props) => {
  const { cellKey, readOnly, align = "left", display, title, muted, flash: externalFlash, noClickEdit } = props;
  const ctxRowId = useRowId();
  const ctxDouble = useRowDoubleClick();
  const rowId = props.rowId ?? ctxRowId ?? "__no_row__";
  const onRowDoubleClick = props.onRowDoubleClick ?? ctxDouble ?? undefined;
  const sel = useCellSelection();
  const isFocused = sel?.activeKey === cellKey && sel?.selectedRowId === rowId;
  const isEditing = isFocused && !!sel?.editing;
  const isSelectedOnly = isFocused && !sel?.editing;

  const [internalFlash, setInternalFlash] = useState<"success" | "error" | null>(null);
  const flash = externalFlash ?? internalFlash;
  const cellRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const commitGuard = useRef(false);
  const wasEditingRef = useRef(false);

  // Auto-focus input on entering edit mode (text cells only)
  useEffect(() => {
    if (isEditing && props.mode !== "custom" && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing, props.mode]);

  // Custom cells: call onActivate exactly when transitioning into Editing.
  useEffect(() => {
    if (props.mode !== "custom") return;
    if (isEditing && !wasEditingRef.current && cellRef.current) {
      props.onActivate(cellRef.current);
    }
    wasEditingRef.current = isEditing;
  }, [isEditing, props]);

  useEffect(() => {
    if (props.mode !== "custom") return;
    // After a popover closes (active → false) while we're in Editing, step down.
    if (isEditing && (props as CustomProps).active === false) {
      const t = window.setTimeout(() => sel?.stopEditing(), 0);
      return () => window.clearTimeout(t);
    }
  }, [isEditing, (props as CustomProps).active, props.mode, sel]);

  // Clear internal flash after timeout
  useEffect(() => {
    if (!internalFlash) return;
    const t = window.setTimeout(() => setInternalFlash(null), FLASH_MS);
    return () => window.clearTimeout(t);
  }, [internalFlash]);

  const handleCellClick = (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (readOnly) {
      // Read-only cells still participate in row selection.
      sel?.selectCell(rowId, cellKey, { noEdit: true });
      return;
    }
    sel?.selectCell(rowId, cellKey, { noEdit: noClickEdit });
  };

  const handleCellDoubleClick = (e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    sel?.cancelPendingEdit();
    onRowDoubleClick?.();
  };

  const handleCellMouseDown = (e: ReactMouseEvent) => {
    // Block row-level long-press timer so editable cells don't trigger stage picker.
    e.stopPropagation();
  };

  const commit = async (raw: string) => {
    if (commitGuard.current) return;
    commitGuard.current = true;
    if (props.mode === "custom") return;
    const original = props.value;
    if (raw === original) {
      sel?.stopEditing();
      commitGuard.current = false;
      return;
    }
    try {
      const result = await props.onCommit(raw);
      if (result.ok) {
        setInternalFlash("success");
        sel?.stopEditing();
      } else {
        setInternalFlash("error");
      }
    } catch {
      setInternalFlash("error");
    } finally {
      commitGuard.current = false;
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit((e.target as HTMLInputElement).value).then(() => sel?.clear());
    } else if (e.key === "Escape") {
      e.preventDefault();
      sel?.stopEditing();
    }
    e.stopPropagation();
  };

  const ringStyle: React.CSSProperties =
    flash === "success" ? { boxShadow: "inset 0 0 0 2px hsl(var(--brand-navy) / 0.5)", backgroundColor: "hsl(140 50% 50% / 0.12)" }
    : flash === "error" ? { boxShadow: "inset 0 0 0 2px hsl(var(--urgent))", backgroundColor: "hsl(0 70% 50% / 0.10)" }
    : isEditing || (props.mode === "custom" && (props as CustomProps).active)
      ? { boxShadow: "inset 0 0 0 2px hsl(var(--brand-navy) / 0.85)", backgroundColor: "hsl(var(--brand-navy) / 0.04)" }
      : isSelectedOnly
        ? { boxShadow: "inset 0 0 0 1px hsl(var(--brand-navy) / 0.55)" }
        : {};

  return (
    <div
      ref={cellRef}
      onClick={handleCellClick}
      onDoubleClick={handleCellDoubleClick}
      onMouseDown={handleCellMouseDown}
      onContextMenu={(e) => { if (isEditing) e.stopPropagation(); }}
      className={cn(
        "relative px-3 py-1.5 transition-colors min-h-full flex items-start",
        align === "right" ? "justify-end text-right" : "justify-start text-left",
        !readOnly && !isEditing && "hover:bg-[hsl(var(--brand-navy)/0.06)] cursor-pointer group/edit",
        readOnly && "cursor-pointer",
      )}
      style={{
        ...ringStyle,
        color: muted && !isEditing ? "hsl(var(--brand-navy) / 0.28)" : undefined,
      }}
      title={isEditing ? undefined : title}
    >
      {isEditing && props.mode !== "custom" ? (
        <div className="flex items-center w-full" onMouseDown={(e) => e.stopPropagation()}>
          {props.prefix && (
            <span
              aria-hidden
              className="text-[13px] tabular select-none pointer-events-none shrink-0"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              {props.prefix}
            </span>
          )}
          <input
            ref={inputRef}
            type={props.mode === "number" ? "text" : "text"}
            inputMode={props.mode === "number" ? "decimal" : undefined}
            defaultValue={props.value}
            placeholder={props.placeholder}
            maxLength={(props as TextProps).maxLength}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={handleKey}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className={cn(
              "w-full bg-transparent outline-none border-none text-[13px] tabular",
              align === "right" && "text-right",
            )}
            style={{ color: "hsl(var(--brand-navy))", padding: 0 }}
          />
        </div>
      ) : (
        <>
          <span className="truncate w-full">{display}</span>
          {!readOnly && isSelectedOnly && (
            <Pencil
              className="h-3 w-3 ml-1 opacity-50 shrink-0 transition-opacity"
              style={{ color: "hsl(var(--brand-navy))" }}
            />
          )}
        </>
      )}
    </div>
  );
};
