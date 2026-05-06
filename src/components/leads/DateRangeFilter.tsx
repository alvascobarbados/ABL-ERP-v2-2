/**
 * DateRangeFilter — popover with quick presets + custom calendar range.
 *
 * Returns a controlled value: { from, to, presetKey, label }.
 * presetKey === "all" represents "no filter".
 */
import { useState } from "react";
import {
  startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths, format,
} from "date-fns";
import { Calendar as CalendarIcon, X as XIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DateRangeValue {
  from: Date | null;
  to: Date | null;
  presetKey: string;
  label: string;
}

export const ALL_TIME: DateRangeValue = { from: null, to: null, presetKey: "all", label: "All time" };

interface Preset { key: string; label: string; build: () => DateRangeValue }

function fmtRange(from: Date, to: Date): string {
  const sameYear = from.getFullYear() === to.getFullYear();
  const sameDay = from.toDateString() === to.toDateString();
  if (sameDay) return format(from, "MMM d, yyyy");
  if (sameYear) return `${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`;
  return `${format(from, "MMM d, yyyy")} – ${format(to, "MMM d, yyyy")}`;
}

const PRESETS: Preset[] = [
  { key: "today", label: "Today", build: () => {
    const d = new Date();
    return { from: startOfDay(d), to: endOfDay(d), presetKey: "today", label: "Today" };
  }},
  { key: "yesterday", label: "Yesterday", build: () => {
    const d = subDays(new Date(), 1);
    return { from: startOfDay(d), to: endOfDay(d), presetKey: "yesterday", label: "Yesterday" };
  }},
  { key: "7d", label: "Last 7 days", build: () => {
    const to = endOfDay(new Date());
    const from = startOfDay(subDays(new Date(), 6));
    return { from, to, presetKey: "7d", label: "Last 7 days" };
  }},
  { key: "30d", label: "Last 30 days", build: () => {
    const to = endOfDay(new Date());
    const from = startOfDay(subDays(new Date(), 29));
    return { from, to, presetKey: "30d", label: "Last 30 days" };
  }},
  { key: "this_month", label: "This month", build: () => {
    const now = new Date();
    return { from: startOfMonth(now), to: endOfDay(now), presetKey: "this_month", label: "This month" };
  }},
  { key: "last_month", label: "Last month", build: () => {
    const ref = subMonths(new Date(), 1);
    return { from: startOfMonth(ref), to: endOfMonth(ref), presetKey: "last_month", label: "Last month" };
  }},
  { key: "all", label: "All time", build: () => ALL_TIME },
];

interface Props {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
}

export function DateRangeFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [draftFrom, setDraftFrom] = useState<Date | undefined>(value.from ?? undefined);
  const [draftTo, setDraftTo] = useState<Date | undefined>(value.to ?? undefined);

  const isActive = value.presetKey !== "all";

  const applyPreset = (p: Preset) => {
    onChange(p.build());
    setOpen(false);
    setCustomMode(false);
  };

  const applyCustom = () => {
    if (!draftFrom || !draftTo) return;
    let f = draftFrom, t = draftTo;
    if (f.getTime() > t.getTime()) { [f, t] = [t, f]; }
    const from = startOfDay(f), to = endOfDay(t);
    onChange({ from, to, presetKey: "custom", label: fmtRange(from, to) });
    setOpen(false);
    setCustomMode(false);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(ALL_TIME);
    setDraftFrom(undefined);
    setDraftTo(undefined);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setCustomMode(false); }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "h-9 inline-flex items-center gap-1.5 px-2.5 rounded-md border bg-white text-[13px] outline-none whitespace-nowrap",
          )}
          style={{
            width: 160,
            borderColor: "hsl(var(--brand-navy) / 0.15)",
            color: "hsl(var(--brand-navy))",
          }}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" style={{ color: "hsl(var(--brand-navy) / 0.6)" }} />
          <span className="flex-1 text-left truncate" style={{ fontWeight: isActive ? 600 : 400 }}>
            {value.label}
          </span>
          {isActive && (
            <span
              role="button"
              tabIndex={0}
              onClick={clear}
              className="inline-flex items-center justify-center rounded-full hover:bg-[hsl(var(--brand-navy)/0.08)]"
              style={{ width: 16, height: 16 }}
              aria-label="Clear date filter"
            >
              <XIcon className="h-3 w-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="p-0 w-auto" style={{ minWidth: 220 }}>
        {!customMode ? (
          <div className="p-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-[13px] hover:bg-muted",
                  value.presetKey === p.key && "bg-muted font-semibold",
                )}
                style={{ color: "hsl(var(--brand-navy))" }}
              >
                {p.label}
              </button>
            ))}
            <div className="my-1 border-t" style={{ borderColor: "hsl(var(--brand-navy) / 0.08)" }} />
            <button
              onClick={() => setCustomMode(true)}
              className="w-full text-left px-3 py-2 rounded-md text-[13px] hover:bg-muted"
              style={{ color: "hsl(var(--brand-navy))" }}
            >
              Custom range…
            </button>
          </div>
        ) : (
          <div className="p-2">
            <Calendar
              mode="range"
              selected={{ from: draftFrom, to: draftTo }}
              onSelect={(r: any) => { setDraftFrom(r?.from); setDraftTo(r?.to); }}
              numberOfMonths={2}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
            <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
              <button
                onClick={() => setCustomMode(false)}
                className="text-[12px] underline"
                style={{ color: "hsl(var(--brand-navy) / 0.6)" }}
              >
                Back
              </button>
              <Button size="sm" onClick={applyCustom} disabled={!draftFrom || !draftTo}>
                Apply
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
