/**
 * LineItemsGrid — spreadsheet-style inline editor for project line items.
 *
 * Replaces the per-item BottomSheet flow. All editing happens in place.
 * - Click a cell → input takes focus immediately
 * - Tab / Shift+Tab → next/prev cell (auto-creates row past last cell)
 * - Enter → same field, next row (auto-creates row past last)
 * - Esc → revert draft, blur
 * - Blur → commit
 * - Trash icon → immediate delete for blank rows, undo toast for populated ones
 *
 * Audit logging stays as-is (Option B): one project_log_entries row per
 * cell commit, via the existing addLineItem/updateLineItem/removeLineItem
 * store actions.
 */
import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { LineItem } from "@/data/pipelines";
import { cn } from "@/lib/utils";

const FIELDS = ["qty", "description", "unitPrice"] as const;
type Field = typeof FIELDS[number];
type Draft = { qty: string; description: string; unitPrice: string };

interface Props {
  projectId: string;
  items: LineItem[];
  addLineItem: (projectId: string, item: LineItem) => Promise<void>;
  updateLineItem: (projectId: string, index: number, item: LineItem) => Promise<void>;
  removeLineItem: (projectId: string, index: number) => Promise<void>;
}

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sanitizeNum = (s: string) => {
  const cleaned = s.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  return parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("").slice(0, 4)}` : cleaned;
};

const cKey = (i: number) => `c-${i}`;
const pKey = (k: string) => `p-${k}`;

export const LineItemsGrid = ({ projectId, items, addLineItem, updateLineItem, removeLineItem }: Props) => {
  const [pending, setPending] = useState<{ key: string }[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Partial<Draft>>>({});
  const [errors, setErrors] = useState<Record<string, Field | null>>({});
  const inputs = useRef<Map<string, HTMLInputElement>>(new Map());
  const counter = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const allRowKeys: string[] = [
    ...items.map((_, i) => cKey(i)),
    ...pending.map((p) => pKey(p.key)),
  ];

  const getValue = (rowKey: string, f: Field): string => {
    const d = drafts[rowKey];
    if (d && d[f] !== undefined) return d[f]!;
    if (rowKey.startsWith("c-")) {
      const i = Number(rowKey.slice(2));
      const it = items[i];
      if (!it) return "";
      if (f === "qty") return String(it.qty);
      if (f === "description") return it.description;
      return it.unitPrice != null ? String(it.unitPrice) : "";
    }
    return "";
  };

  const setDraft = (rowKey: string, f: Field, v: string) => {
    setDrafts((prev) => ({ ...prev, [rowKey]: { ...(prev[rowKey] ?? {}), [f]: v } }));
    setErrors((prev) => (prev[rowKey] === f ? { ...prev, [rowKey]: null } : prev));
  };

  const clearDraftField = (rowKey: string, f?: Field) => {
    setDrafts((prev) => {
      const cur = prev[rowKey];
      if (!cur) return prev;
      if (!f) {
        const n = { ...prev };
        delete n[rowKey];
        return n;
      }
      const n = { ...cur };
      delete n[f];
      const out = { ...prev };
      if (Object.keys(n).length === 0) delete out[rowKey]; else out[rowKey] = n;
      return out;
    });
  };

  const focusCell = (rowKey: string, f: Field) => {
    requestAnimationFrame(() => {
      const el = inputs.current.get(`${rowKey}:${f}`);
      if (el) { el.focus(); el.select(); }
    });
  };

  const addPendingRow = useCallback(() => {
    const k = `n${++counter.current}`;
    setPending((prev) => [...prev, { key: k }]);
    setDrafts((prev) => ({ ...prev, [pKey(k)]: { qty: "1", description: "", unitPrice: "" } }));
    focusCell(pKey(k), "qty");
    return k;
  }, []);

  // Commit one cell. Returns true if commit succeeded (or was a no-op).
  const commitCell = async (rowKey: string, field: Field): Promise<boolean> => {
    const draft = drafts[rowKey];

    if (rowKey.startsWith("c-")) {
      if (!draft || draft[field] === undefined) return true;
      const i = Number(rowKey.slice(2));
      const cur = items[i]; if (!cur) return true;
      const rawQty = field === "qty" ? draft.qty! : String(cur.qty);
      const rawDesc = field === "description" ? draft.description! : cur.description;
      const rawPrice = field === "unitPrice" ? draft.unitPrice! : (cur.unitPrice != null ? String(cur.unitPrice) : "");
      const qNum = Number(rawQty);
      const desc = rawDesc.trim();
      const price = rawPrice.trim() === "" ? undefined : Number(rawPrice);

      if (field === "qty" && (!Number.isFinite(qNum) || qNum <= 0)) {
        setErrors((p) => ({ ...p, [rowKey]: "qty" })); return false;
      }
      if (field === "description" && desc === "") {
        setErrors((p) => ({ ...p, [rowKey]: "description" })); return false;
      }
      if (field === "unitPrice" && rawPrice.trim() !== "" && (!Number.isFinite(price as number) || (price as number) < 0)) {
        setErrors((p) => ({ ...p, [rowKey]: "unitPrice" })); return false;
      }

      const changed =
        (field === "qty" && qNum !== cur.qty) ||
        (field === "description" && desc !== cur.description) ||
        (field === "unitPrice" && price !== cur.unitPrice);
      if (!changed) { clearDraftField(rowKey, field); return true; }

      const total = price !== undefined && Number.isFinite(price)
        ? +(qNum * (price as number)).toFixed(2)
        : undefined;
      try {
        await updateLineItem(projectId, i, { ...cur, qty: qNum, description: desc, unitPrice: price, total });
        clearDraftField(rowKey, field);
        return true;
      } catch {
        toast.error("Could not save line item");
        return false;
      }
    }

    // Pending row → commit only if all required values present
    const merged = drafts[rowKey] ?? {};
    const desc = (merged.description ?? "").trim();
    const qNum = Number(merged.qty ?? "");
    const rawPrice = (merged.unitPrice ?? "").trim();
    const price = rawPrice === "" ? undefined : Number(rawPrice);

    if (desc === "") return true; // not committable yet — keep pending
    if (!Number.isFinite(qNum) || qNum <= 0) {
      setErrors((p) => ({ ...p, [rowKey]: "qty" })); return false;
    }
    if (rawPrice !== "" && (!Number.isFinite(price as number) || (price as number) < 0)) {
      setErrors((p) => ({ ...p, [rowKey]: "unitPrice" })); return false;
    }

    const total = price !== undefined && Number.isFinite(price)
      ? +(qNum * (price as number)).toFixed(2)
      : undefined;
    try {
      await addLineItem(projectId, { qty: qNum, description: desc, unitPrice: price, total });
      const k = rowKey.slice(2);
      setPending((prev) => prev.filter((x) => x.key !== k));
      clearDraftField(rowKey);
      return true;
    } catch {
      toast.error("Could not save line item");
      return false;
    }
  };

  const navigate = async (rowKey: string, field: Field, dir: "next-field" | "prev-field" | "next-row") => {
    const ok = await commitCell(rowKey, field);
    if (!ok) return;
    // Recompute row keys (may have just added a committed row from a pending commit)
    const rowKeysNow = [
      ...(rowKey.startsWith("p-") && !pending.some((p) => pKey(p.key) === rowKey) ? [] : []),
    ];
    // We just use allRowKeys captured pre-commit; pending→committed transitions
    // simply mean rowKey we were on is gone, in which case we focus the new
    // last committed row's same field.
    const baseKeys = allRowKeys;
    const idx = baseKeys.indexOf(rowKey);

    if (dir === "next-field") {
      const fIdx = FIELDS.indexOf(field);
      if (fIdx < FIELDS.length - 1) return focusCell(rowKey, FIELDS[fIdx + 1]);
      if (idx === baseKeys.length - 1) {
        const nk = addPendingRow();
        focusCell(pKey(nk), "qty");
      } else focusCell(baseKeys[idx + 1], "qty");
    } else if (dir === "prev-field") {
      const fIdx = FIELDS.indexOf(field);
      if (fIdx > 0) return focusCell(rowKey, FIELDS[fIdx - 1]);
      if (idx > 0) focusCell(baseKeys[idx - 1], FIELDS[FIELDS.length - 1]);
    } else {
      if (idx === baseKeys.length - 1) {
        const nk = addPendingRow();
        focusCell(pKey(nk), field);
      } else focusCell(baseKeys[idx + 1], field);
    }
  };

  const handleKey = (rowKey: string, field: Field) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); navigate(rowKey, field, "next-row"); }
    else if (e.key === "Tab") { e.preventDefault(); navigate(rowKey, field, e.shiftKey ? "prev-field" : "next-field"); }
    else if (e.key === "Escape") {
      e.preventDefault();
      clearDraftField(rowKey, field);
      setErrors((p) => ({ ...p, [rowKey]: null }));
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleBlur = (rowKey: string, field: Field) => () => { commitCell(rowKey, field); };

  // Discard untouched pending rows when focus leaves the entire grid
  useEffect(() => {
    const root = containerRef.current; if (!root) return;
    const handler = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && root.contains(next)) return;
      setPending((prev) => prev.filter((p) => {
        const d = drafts[pKey(p.key)] ?? {};
        const keep = (d.description ?? "").trim() !== "";
        if (!keep) clearDraftField(pKey(p.key));
        return keep;
      }));
    };
    root.addEventListener("focusout", handler);
    return () => root.removeEventListener("focusout", handler);
  }, [drafts]);

  const handleDelete = async (rowKey: string) => {
    if (rowKey.startsWith("p-")) {
      const k = rowKey.slice(2);
      setPending((prev) => prev.filter((x) => x.key !== k));
      clearDraftField(rowKey);
      return;
    }
    const i = Number(rowKey.slice(2));
    const it = items[i]; if (!it) return;
    const isBlank = !it.description.trim() && (!it.unitPrice || it.unitPrice === 0);
    if (isBlank) { await removeLineItem(projectId, i); return; }

    const snapshot = it;
    let undone = false;
    await removeLineItem(projectId, i);
    toast(`Deleted "${snapshot.description}"`, {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: () => {
          if (undone) return;
          undone = true;
          addLineItem(projectId, snapshot);
        },
      },
    });
  };

  const totalSum = items.reduce((n, li) => n + (typeof li.total === "number" ? li.total : 0), 0);
  const totalCount = items.length + pending.length;

  if (totalCount === 0) {
    return (
      <div ref={containerRef} className="flex items-center justify-center py-8">
        <button
          onClick={() => addPendingRow()}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline"
          style={{ color: "hsl(var(--brand-orange))" }}
        >
          <Plus className="h-4 w-4" /> Add first line item
        </button>
      </div>
    );
  }

  const inputCls =
    "bg-transparent outline-none text-[13px] tabular px-1.5 py-1 rounded border border-transparent " +
    "hover:border-[hsl(var(--brand-navy)/0.14)] focus:border-[hsl(var(--brand-navy)/0.55)] " +
    "focus:bg-[hsl(var(--brand-navy)/0.03)]";
  const errCls = "border-[hsl(var(--urgent))] bg-[hsl(0_70%_50%/0.08)]";

  const renderRow = (rowKey: string) => {
    const err = errors[rowKey];
    const qtyV = getValue(rowKey, "qty");
    const descV = getValue(rowKey, "description");
    const priceV = getValue(rowKey, "unitPrice");
    const qNum = Number(qtyV);
    const pNum = priceV.trim() === "" ? null : Number(priceV);
    const total = pNum != null && Number.isFinite(pNum) && Number.isFinite(qNum) ? qNum * pNum : null;
    const setRef = (f: Field) => (el: HTMLInputElement | null) => {
      const k = `${rowKey}:${f}`;
      if (el) inputs.current.set(k, el); else inputs.current.delete(k);
    };

    return (
      <li key={rowKey} className="group flex items-center gap-2 py-1">
        <input
          ref={setRef("qty")}
          value={qtyV}
          onChange={(e) => setDraft(rowKey, "qty", sanitizeNum(e.target.value))}
          onKeyDown={handleKey(rowKey, "qty")}
          onBlur={handleBlur(rowKey, "qty")}
          inputMode="decimal"
          placeholder="0"
          className={cn(inputCls, "text-right shrink-0 w-[5ch]", err === "qty" && errCls)}
        />
        <span className="text-muted-foreground/50 select-none">×</span>
        <input
          ref={setRef("description")}
          value={descV}
          onChange={(e) => setDraft(rowKey, "description", e.target.value)}
          onKeyDown={handleKey(rowKey, "description")}
          onBlur={handleBlur(rowKey, "description")}
          placeholder="Description"
          className={cn(inputCls, "flex-1 min-w-0", err === "description" && errCls)}
        />
        <div className="relative shrink-0" style={{ width: 96 }}>
          <span
            className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none"
            style={{ color: "hsl(var(--brand-navy)/0.55)" }}
          >$</span>
          <input
            ref={setRef("unitPrice")}
            value={priceV}
            onChange={(e) => setDraft(rowKey, "unitPrice", sanitizeNum(e.target.value))}
            onKeyDown={handleKey(rowKey, "unitPrice")}
            onBlur={handleBlur(rowKey, "unitPrice")}
            inputMode="decimal"
            placeholder="0.00"
            className={cn(inputCls, "text-right pl-5 w-full", err === "unitPrice" && errCls)}
          />
        </div>
        <span
          className="tabular text-[13px] font-semibold shrink-0 text-right"
          style={{ width: 96, color: "hsl(var(--brand-navy))" }}
        >
          {total != null ? `$${fmt(total)}` : "—"}
        </span>
        <button
          onClick={() => handleDelete(rowKey)}
          className="p-1 rounded hover:bg-[hsl(var(--urgent)/0.1)] transition-opacity opacity-60 md:opacity-0 md:group-hover:opacity-100"
          aria-label="Delete line"
          tabIndex={-1}
        >
          <Trash2 className="h-3.5 w-3.5" style={{ color: "hsl(var(--urgent))" }} />
        </button>
      </li>
    );
  };

  return (
    <div ref={containerRef}>
      <ul className="divide-y" style={{ borderColor: "hsl(var(--brand-navy) / 0.06)" }}>
        {allRowKeys.map(renderRow)}
      </ul>
      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={() => addPendingRow()}
          className="inline-flex items-center gap-1 text-[12px] font-medium hover:underline"
          style={{ color: "hsl(var(--brand-orange))" }}
        >
          <Plus className="h-3.5 w-3.5" /> Add line item
        </button>
        <div className="text-[12px] tabular" style={{ color: "hsl(var(--brand-navy) / 0.65)" }}>
          {totalCount} {totalCount === 1 ? "item" : "items"}
          {totalSum > 0 && ` · $${fmt(totalSum)} BBD`}
        </div>
      </div>
    </div>
  );
};
