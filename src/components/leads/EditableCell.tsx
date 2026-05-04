/**
 * EditableCell — Google-Sheets-style three-state cell wrapper for ProjectTable.
 *
 * State machine (per cell, single active across the whole table):
 *   Idle       → no border, hover tint on mouseover
 *   Selected   → medium navy ring (~50% opacity), display value still shown
 *   Editing    → strong navy ring + editor (input, popover, etc.) rendered
 *
 * Transitions:
 *   - click idle cell                       → Selected
 *   - click already-selected cell           → Editing
 *   - dblclick any cell                     → Editing (fast path)
 *   - click another cell while editing      → save current, new cell → Selected
 *   - click another cell while selected     → previous → Idle, new → Selected
 *   - Esc while editing                     → Selected (border stays)
 *   - Esc while selected (not editing)      → Idle (border gone)
 *   - click outside the table               → save (if editing), all → Idle
 *
 * Selection state is provided by the parent table via <SelectionProvider>.
 * Custom cells (Category B/C entity / enum) reuse the same state — they
 * "open" their popover on entering Editing rather than rendering an input.
 */
import { useEffect, useRef, useState, KeyboardEvent, MouseEvent as ReactMouseEvent, useContext, createContext, useCallback } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveResult = { ok: true } | { ok: false; reason?: string };

// ── Selection context ─────────────────────────────────────────────────
interface SelectionState {
  activeKey: string | null;
  editing: boolean;
  /** Select a cell (idle → selected, or selected → editing if same key). */
  selectCell: (key: string) => void;
  /** Force a cell directly into editing (dblclick fast-path). */
  editCell: (key: string) => void;
  /** Step down from editing → selected (same key). */
  stopEditing: () => void;
  /** Clear all selection (Esc when only selected, or click outside table). */
  clear: () => void;
}

const SelectionContext = createContext<SelectionState | null>(null);

export const useCellSelection = () => useContext(SelectionContext);

interface ProviderProps {
  children: React.ReactNode;
  /** Optional ref to the table root — when provided, mousedown outside it clears selection. */
  outsideRef?: React.RefObject<HTMLElement>;
}

export const SelectionProvider = ({ children, outsideRef }: ProviderProps) => {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const selectCell = useCallback((key: string) => {
    setActiveKey((prev) => {
      if (prev === key) {
        setEditing(true);
        return key;
      }
      setEditing(false);
      return key;
    });
  }, []);

  const editCell = useCallback((key: string) => {
    setActiveKey(key);
    setEditing(true);
  }, []);

  const stopEditing = useCallback(() => {
    setEditing(false);
  }, []);

  const clear = useCallback(() => {
    setActiveKey(null);
    setEditing(false);
  }, []);

  // Outside-click → clear selection. Edits commit on the input's onBlur,
  // which fires before this handler (React synthetic blur fires first).
  useEffect(() => {
    if (!outsideRef) return;
    const handler = (e: MouseEvent) => {
      const root = outsideRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      // Ignore clicks inside Radix portals (popovers, etc.)
      if (e.target instanceof Element && e.target.closest('[data-radix-popper-content-wrapper]')) return;
      setActiveKey(null);
      setEditing(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [outsideRef]);

  // Esc handler: editing → selected; selected → idle.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!activeKey) return;
      if (editing) {
        // Editing cells handle their own Esc (to cancel + flush input).
        // We only trigger this fallback when the focus is NOT inside a cell input.
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
        setEditing(false);
      } else {
        setActiveKey(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeKey, editing]);

  return (
    <SelectionContext.Provider value={{ activeKey, editing, selectCell, editCell, stopEditing, clear }}>
      {children}
    </SelectionContext.Provider>
  );
};

// ── Cell ──────────────────────────────────────────────────────────────
interface BaseProps {
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
}

interface TextProps extends BaseProps {
  mode: "text" | "number";
  /** Current raw value to seed the input. */
  value: string;
  /** Placeholder while editing. */
  placeholder?: string;
  /** Optional fixed visual prefix shown left of the input while editing (e.g. "Q-"). Not part of the saved value. */
  prefix?: string;
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
  const { cellKey, readOnly, align = "left", display, title, muted, flash: externalFlash } = props;
  const sel = useCellSelection();
  const isActive = sel?.activeKey === cellKey;
  const isEditing = isActive && !!sel?.editing;
  const isSelectedOnly = isActive && !sel?.editing;

  const [internalFlash, setInternalFlash] = useState<"success" | "error" | null>(null);
  const flash = externalFlash ?? internalFlash;
  const cellRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const commitGuard = useRef(false);
  // Track previous editing state — fire onActivate when we transition into Editing for custom cells.
  const wasEditingRef = useRef(false);

  // Auto-focus input on entering edit mode (text cells only)
  useEffect(() => {
    if (isEditing && props.mode !== "custom" && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing, props.mode]);

  // Custom cells: call onActivate exactly when transitioning Idle/Selected → Editing.
  // When `active` (popover-open) flips false while still Editing, drop to Selected.
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
      // Defer one tick so the Radix close + outside-click handler don't race.
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
    if (readOnly) return;
    e.stopPropagation();
    if (!sel) return;
    sel.selectCell(cellKey);
  };

  const handleCellDoubleClick = (e: ReactMouseEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    if (!sel) return;
    sel.editCell(cellKey);
  };

  const handleCellMouseDown = (e: ReactMouseEvent) => {
    // Block row-level long-press timer for editable cells
    if (!readOnly) e.stopPropagation();
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
        // keep editing so user can correct
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
      // Commit then drop selection entirely (Enter = "done").
      commit((e.target as HTMLInputElement).value).then(() => sel?.clear());
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Cancel without saving, return to Selected (border stays).
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
        ? { boxShadow: "inset 0 0 0 2px hsl(var(--brand-navy) / 0.5)" }
        : {};

  return (
    <div
      ref={cellRef}
      onClick={handleCellClick}
      onDoubleClick={handleCellDoubleClick}
      onMouseDown={handleCellMouseDown}
      onContextMenu={(e) => { if (isEditing) e.stopPropagation(); }}
      className={cn(
        "relative px-3 py-2 truncate transition-colors h-full flex items-center",
        align === "right" ? "justify-end text-right" : "justify-start text-left",
        !readOnly && !isEditing && "hover:bg-[hsl(var(--brand-navy)/0.06)] cursor-text group/edit",
        readOnly && "cursor-default",
      )}
      style={{
        ...ringStyle,
        color: muted && !isEditing ? "hsl(var(--muted-foreground))" : undefined,
      }}
      title={isEditing ? undefined : title}
    >
      {isEditing && props.mode !== "custom" ? (
        <input
          ref={inputRef}
          type={props.mode === "number" ? "text" : "text"}
          inputMode={props.mode === "number" ? "decimal" : undefined}
          defaultValue={props.value}
          placeholder={props.placeholder}
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
      ) : (
        <>
          <span className="truncate w-full">{display}</span>
          {!readOnly && (
            <Pencil
              className="h-3 w-3 ml-1 opacity-0 group-hover/edit:opacity-40 shrink-0 transition-opacity"
              style={{ color: "hsl(var(--brand-navy))" }}
            />
          )}
        </>
      )}
    </div>
  );
};
