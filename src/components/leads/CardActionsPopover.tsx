import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  PencilLine, FolderOpen, ArrowRightLeft, Copy, Archive, Trash2, Flag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export interface CardActionsPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  flagged?: boolean;
  onToggleFlag?: () => void;
  onEdit: () => void;
  onOpenProject: () => void;
  onMoveStage: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

interface RowProps {
  icon: typeof PencilLine;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

const Row = ({ icon: Icon, label, onClick, destructive }: RowProps) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-3 py-2.5 text-[14px] text-left rounded-lg transition-colors",
      "hover:bg-muted/60",
      destructive ? "text-[hsl(var(--urgent))]/85 hover:text-[hsl(var(--urgent))]" : "text-foreground",
    )}
    style={{ minHeight: 40 }}
  >
    <Icon className="h-4 w-4 shrink-0 opacity-80" />
    <span className="font-medium">{label}</span>
  </button>
);

export const CardActionsPopover = ({
  open, onOpenChange, trigger, flagged, onToggleFlag,
  onEdit, onOpenProject, onMoveStage, onDuplicate, onArchive, onDelete,
}: CardActionsPopoverProps) => {
  const wrap = (fn: () => void) => () => { onOpenChange(false); fn(); };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-56 p-1.5 rounded-xl shadow-lg bg-card"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.15)" }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {onToggleFlag && (
          <Row icon={Flag} label={flagged ? "Unflag" : "Flag"} onClick={wrap(onToggleFlag)} />
        )}
        <Row icon={PencilLine} label="Edit" onClick={wrap(onEdit)} />
        <Row icon={FolderOpen} label="Open project" onClick={wrap(onOpenProject)} />
        <Row icon={ArrowRightLeft} label="Move to stage…" onClick={wrap(onMoveStage)} />
        <Row icon={Copy} label="Duplicate" onClick={wrap(onDuplicate)} />
        <div className="my-1 h-px bg-border/70" />
        <Row icon={Archive} label="Archive" onClick={wrap(onArchive)} destructive />
        <Row icon={Trash2} label="Delete" onClick={wrap(onDelete)} destructive />
      </PopoverContent>
    </Popover>
  );
};
