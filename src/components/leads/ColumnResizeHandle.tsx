/**
 * Drag handle for resizable column headers. Sits flush at the right edge of
 * the header cell. Hidden under 1024px (table view is desktop-only anyway,
 * but the spreadsheet is sometimes scrolled on smaller screens).
 *
 * Click is swallowed (no header sort fires); double-click resets the column
 * to its default width.
 */
import { useEffect, useRef } from "react";
import { COL_MAX, COL_MIN } from "@/hooks/useColumnWidths";

interface Props {
  startWidth: number;
  onChange: (px: number) => void;
  onReset?: () => void;
}

export const ColumnResizeHandle = ({ startWidth, onChange, onReset }: Props) => {
  const startX = useRef<number | null>(null);
  const startW = useRef<number>(startWidth);
  const dragging = useRef(false);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current || startX.current == null) return;
      const dx = e.clientX - startX.current;
      const next = Math.max(COL_MIN, Math.min(COL_MAX, startW.current + dx));
      onChange(next);
    };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [onChange]);

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        dragging.current = true;
        startX.current = e.clientX;
        startW.current = startWidth;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => { e.stopPropagation(); onReset?.(); }}
      className="hidden lg:block absolute top-0 right-0 h-full"
      style={{
        width: 7,
        cursor: "col-resize",
        // narrow visible bar on hover
        background: "transparent",
        zIndex: 30,
      }}
      title="Drag to resize · double-click to reset"
    />
  );
};
