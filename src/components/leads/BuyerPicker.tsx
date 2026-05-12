/**
 * Dedicated picker for selecting a Buyer scoped to a specific Customer.
 * Visually mirrors EntityPicker (search + filtered list + inline add via
 * AddBuyerSheet). Two presentations: "sheet" (mobile/default) and
 * "popover" (desktop inline-editing).
 *
 * Selecting a buyer commits the buyer's UUID via onPick. Selecting "Clear"
 * sends null. The "+ Add buyer" CTA opens AddBuyerSheet pre-scoped to the
 * customer; on success the new buyer auto-selects.
 */
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./EditorSheets";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMasterData } from "@/hooks/useMasterData";
import { AddBuyerSheet } from "./CustomerListPage";

type Presentation = "sheet" | "popover";

interface Props {
  open: boolean;
  onClose: () => void;
  customerId: string | null | undefined;
  selectedId?: string | null;
  onPick: (buyerId: string | null) => void;
  presentation?: Presentation;
  anchorEl?: HTMLElement | null;
}

const PickerBody = ({
  customerId, selectedId, onPick, onClose, onStartAdd, compact,
}: {
  customerId: string | null | undefined;
  selectedId?: string | null;
  onPick: (id: string | null) => void;
  onClose: () => void;
  onStartAdd: () => void;
  compact?: boolean;
}) => {
  const md = useMasterData();
  const [q, setQ] = useState("");
  useEffect(() => { setQ(""); }, [customerId]);

  const rows = useMemo(() => {
    if (!customerId) return [];
    const all = md.buyersByCustomer(customerId);
    const term = q.trim().toLowerCase();
    return all
      .filter((b) => !term ||
        b.name.toLowerCase().includes(term) ||
        (b.email ?? "").toLowerCase().includes(term) ||
        (b.contact ?? "").toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [md, customerId, q]);

  const minRow = compact ? 36 : 48;

  if (!customerId) {
    return (
      <div className="text-xs text-muted-foreground italic px-3 py-6 text-center">
        Pick a customer first to choose a buyer.
      </div>
    );
  }

  return (
    <>
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search buyers…"
          className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-navy)/0.4)]"
          style={{ minHeight: compact ? 36 : 48 }}
          autoFocus
        />
      </div>

      {selectedId && (
        <button
          onClick={() => { onPick(null); onClose(); }}
          className="mb-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium hover:bg-muted/40 transition-colors"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.2)", color: "hsl(var(--brand-navy) / 0.7)", minHeight: minRow }}
        >
          <X className="h-3.5 w-3.5" /> Clear buyer
        </button>
      )}

      <ul className={cn("space-y-1 overflow-y-auto", compact && "max-h-[260px]")}>
        {rows.map((b) => (
          <li key={b.id}>
            <button
              onClick={() => { onPick(b.id); onClose(); }}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg border transition-colors hover:bg-muted/40",
                selectedId === b.id ? "bg-muted/60" : "bg-card border-border/60",
              )}
              style={{ minHeight: minRow, borderColor: selectedId === b.id ? "hsl(var(--brand-navy) / 0.35)" : undefined }}
            >
              <div className="text-[13px] font-medium text-foreground truncate">{b.name}</div>
              {(b.email || b.contact) && (
                <div className="text-[11px] text-muted-foreground truncate">
                  {[b.email, b.contact].filter(Boolean).join(" · ")}
                </div>
              )}
            </button>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-xs text-muted-foreground italic px-3 py-3 text-center">
            {q ? "No matches." : "No buyers yet for this customer."}
          </li>
        )}
      </ul>

      <button
        onClick={onStartAdd}
        className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed text-xs font-medium hover:bg-muted/40 transition-colors"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: minRow }}
      >
        <Plus className="h-3.5 w-3.5" /> Add new buyer
      </button>
    </>
  );
};

export const BuyerPicker = ({
  open, onClose, customerId, selectedId, onPick, presentation = "sheet", anchorEl,
}: Props) => {
  const [adding, setAdding] = useState(false);
  useEffect(() => { if (!open) setAdding(false); }, [open]);

  if (adding && customerId) {
    return (
      <AddBuyerSheet
        open={open}
        fixedCustomerId={customerId}
        onClose={() => setAdding(false)}
        onCreated={(buyerId) => {
          setAdding(false);
          onPick(buyerId);
          onClose();
        }}
      />
    );
  }

  if (presentation === "popover") {
    return (
      <Popover open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <PopoverTrigger asChild>
          <span
            style={{
              position: "fixed",
              left: anchorEl?.getBoundingClientRect().left ?? 0,
              top: anchorEl?.getBoundingClientRect().bottom ?? 0,
              width: anchorEl?.getBoundingClientRect().width ?? 0,
              height: 0,
              pointerEvents: "none",
            }}
          />
        </PopoverTrigger>
        <PopoverContent
          align="start" side="bottom" sideOffset={2}
          className="w-[320px] p-3"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold mb-2">
            Pick buyer
          </div>
          <PickerBody
            customerId={customerId}
            selectedId={selectedId}
            onPick={onPick}
            onClose={onClose}
            onStartAdd={() => setAdding(true)}
            compact
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Pick buyer">
      <PickerBody
        customerId={customerId}
        selectedId={selectedId}
        onPick={onPick}
        onClose={onClose}
        onStartAdd={() => setAdding(true)}
      />
    </BottomSheet>
  );
};
