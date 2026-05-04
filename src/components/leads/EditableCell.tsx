/**
 * EditableCell — Google-Sheets-style click-to-edit wrapper for ProjectTable cells.
 *
 * Behaviours:
 *   - Hover: subtle navy tint + pencil affordance (only when `editable`).
 *   - Click: stops row-level handlers (open/flag/long-press) and enters edit mode.
 *   - Edit (text mode): renders an in-place input. Enter/blur saves; Esc cancels.
 *   - Save flash: brief green ring; failure flash: red ring + toast (caller).
 *   - Read-only: renders display content with no hover affordance.
 *
 * For Category B (entity pickers) and Category C (enum selects) the parent
 * supplies its own trigger element via `mode="custom"` and manages opening
 * a popover/select itself — but still uses this wrapper for consistent
 * hover/flash visuals and event-stop behaviour.
 */
import { useEffect, useRef, useState, KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveResult = { ok: true } | { ok: false; reason?: string };

interface BaseProps {
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
  /** Called when the user commits (Enter or blur). Return ok=false to flash red. */
  onCommit: (next: string) => Promise<SaveResult> | SaveResult;
}

interface CustomProps extends BaseProps {
  mode: "custom";
  /** Click handler for entering custom edit mode (e.g. open popover). */
  onActivate: (anchor: HTMLElement) => void;
  /** Whether this cell is currently the active edit target. */
  active?: boolean;
}

type Props = TextProps | CustomProps;

const FLASH_MS = 700;

export const EditableCell = (props: Props) => {
  const { readOnly, align = "left", display, title, muted, flash: externalFlash } = props;
  const [editing, setEditing] = useState(false);
  const [internalFlash, setInternalFlash] = useState<"success" | "error" | null>(null);
  const flash = externalFlash ?? internalFlash;
  const cellRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const commitGuard = useRef(false);

  // Auto-focus input on entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Clear internal flash after timeout
  useEffect(() => {
    if (!internalFlash) return;
    const t = window.setTimeout(() => setInternalFlash(null), FLASH_MS);
    return () => window.clearTimeout(t);
  }, [internalFlash]);

  const handleCellClick = (e: ReactMouseEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    if (props.mode === "custom") {
      if (cellRef.current) props.onActivate(cellRef.current);
      return;
    }
    setEditing(true);
  };

  const handleCellMouseDown = (e: ReactMouseEvent) => {
    // Block row-level long-press timer
    if (!readOnly) e.stopPropagation();
  };

  const commit = async (raw: string) => {
    if (commitGuard.current) return;
    commitGuard.current = true;
    if (props.mode === "custom") return;
    const original = props.value;
    if (raw === original) {
      setEditing(false);
      commitGuard.current = false;
      return;
    }
    try {
      const result = await props.onCommit(raw);
      if (result.ok) {
        setInternalFlash("success");
        setEditing(false);
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
      commit((e.target as HTMLInputElement).value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    }
    e.stopPropagation();
  };

  const ringStyle: React.CSSProperties =
    flash === "success" ? { boxShadow: "inset 0 0 0 2px hsl(var(--brand-navy) / 0.5)", backgroundColor: "hsl(140 50% 50% / 0.12)" }
    : flash === "error" ? { boxShadow: "inset 0 0 0 2px hsl(var(--urgent))", backgroundColor: "hsl(0 70% 50% / 0.10)" }
    : editing || (props.mode === "custom" && props.active)
      ? { boxShadow: "inset 0 0 0 2px hsl(var(--brand-navy) / 0.5)", backgroundColor: "hsl(var(--brand-navy) / 0.04)" }
      : {};

  return (
    <div
      ref={cellRef}
      onClick={handleCellClick}
      onMouseDown={handleCellMouseDown}
      onDoubleClick={(e) => { if (!readOnly) e.stopPropagation(); }}
      onContextMenu={(e) => { if (editing) e.stopPropagation(); }}
      className={cn(
        "relative px-3 py-2 truncate transition-colors h-full flex items-center",
        align === "right" ? "justify-end text-right" : "justify-start text-left",
        !readOnly && !editing && "hover:bg-[hsl(var(--brand-navy)/0.06)] cursor-text group/edit",
        readOnly && "cursor-default",
      )}
      style={{
        ...ringStyle,
        color: muted && !editing ? "hsl(var(--muted-foreground))" : undefined,
      }}
      title={editing ? undefined : title}
    >
      {editing && props.mode !== "custom" ? (
        <input
          ref={inputRef}
          type={props.mode === "number" ? "text" : "text"}
          inputMode={props.mode === "number" ? "decimal" : undefined}
          defaultValue={props.value}
          placeholder={props.placeholder}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={handleKey}
          onClick={(e) => e.stopPropagation()}
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
