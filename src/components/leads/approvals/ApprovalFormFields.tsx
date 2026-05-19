/**
 * Shared form fields for approval sheets (artwork / quotation / PO / email).
 * Renders: Approved by (buyer dropdown + "other" toggle) · Approved on
 * (datetime-local) · Via (segmented control) · Notes (textarea).
 */
import { useState } from "react";
import type { Customer } from "@/hooks/useMasterData";
import { useMasterData } from "@/hooks/useMasterData";
import { toast } from "sonner";
import { PartyPopper } from "lucide-react";

export type ViaChannel = "email" | "whatsapp" | "phone" | "in_person" | "other";

export interface ApprovalFormValue {
  approvedByBuyerId: string | null;
  approvedByOtherName: string | null;
  approvedOn: string; // ISO
  viaChannel: ViaChannel;
  notes: string;
}

export const CHANNEL_OPTIONS: { v: ViaChannel; label: string }[] = [
  { v: "email", label: "Email" },
  { v: "whatsapp", label: "WhatsApp" },
  { v: "phone", label: "Phone" },
  { v: "in_person", label: "In Person" },
  { v: "other", label: "Other" },
];

export const emptyForm = (): ApprovalFormValue => ({
  approvedByBuyerId: null,
  approvedByOtherName: null,
  approvedOn: new Date().toISOString(),
  viaChannel: "email",
  notes: "",
});

function toLocalInput(iso: string): string {
  // datetime-local needs YYYY-MM-DDTHH:mm in local tz
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const navy = "hsl(var(--brand-navy))";

export const ApprovalFormFields = ({
  value,
  onChange,
  customer,
  errors,
}: {
  value: ApprovalFormValue;
  onChange: (next: ApprovalFormValue) => void;
  customer: Customer | undefined;
  errors?: Partial<Record<keyof ApprovalFormValue, string>>;
}) => {
  const md = useMasterData();
  const customerBuyers = customer ? md.buyers.filter((b) => b.customer_id === customer.id) : [];
  const usingOther = value.approvedByOtherName !== null;
  const [showOther, setShowOther] = useState(usingOther);

  return (
    <div className="space-y-4">
      {/* Approved by */}
      <div>
        <label className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: "#888" }}>
          Approved by
        </label>
        <select
          value={value.approvedByBuyerId ?? ""}
          disabled={showOther}
          onChange={(e) => onChange({ ...value, approvedByBuyerId: e.target.value || null, approvedByOtherName: null })}
          className="mt-1 w-full rounded-md border px-2.5 py-2 text-[13px]"
          style={{
            borderColor: errors?.approvedByBuyerId ? "#C84A4A" : "rgba(27,42,78,0.2)",
            background: showOther ? "rgba(0,0,0,0.04)" : "#fff",
            color: navy,
          }}
        >
          <option value="">— Select buyer —</option>
          {customerBuyers.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            const nextShow = !showOther;
            setShowOther(nextShow);
            if (nextShow) onChange({ ...value, approvedByBuyerId: null, approvedByOtherName: value.approvedByOtherName ?? "" });
            else onChange({ ...value, approvedByOtherName: null });
          }}
          className="mt-1 text-[11px] underline hover:no-underline"
          style={{ color: "#E97B2C" }}
        >
          {showOther ? "Use buyer dropdown instead" : "Or specify someone else"}
        </button>
        {showOther && (
          <input
            type="text"
            value={value.approvedByOtherName ?? ""}
            onChange={(e) => onChange({ ...value, approvedByOtherName: e.target.value })}
            placeholder="Name of person who approved"
            maxLength={100}
            className="mt-1.5 w-full rounded-md border px-2.5 py-2 text-[13px]"
            style={{
              borderColor: errors?.approvedByOtherName ? "#C84A4A" : "rgba(27,42,78,0.2)",
              color: navy,
            }}
          />
        )}
        {(errors?.approvedByBuyerId || errors?.approvedByOtherName) && (
          <div className="mt-1 text-[11px]" style={{ color: "#C84A4A" }}>
            {errors.approvedByBuyerId || errors.approvedByOtherName}
          </div>
        )}
      </div>

      {/* Approved on */}
      <div>
        <label className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: "#888" }}>
          Approved on
        </label>
        <input
          type="datetime-local"
          value={toLocalInput(value.approvedOn)}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            onChange({ ...value, approvedOn: new Date(v).toISOString() });
          }}
          className="mt-1 w-full rounded-md border px-2.5 py-2 text-[13px]"
          style={{ borderColor: "rgba(27,42,78,0.2)", color: navy }}
        />
      </div>

      {/* Via */}
      <div>
        <label className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: "#888" }}>
          Via
        </label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {CHANNEL_OPTIONS.map((opt) => {
            const on = value.viaChannel === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => onChange({ ...value, viaChannel: opt.v })}
                style={{
                  padding: "5px 10px", borderRadius: 5, fontSize: 11, fontWeight: 500,
                  background: on ? navy : "#fff",
                  color: on ? "#fff" : "#888",
                  border: on ? "none" : "0.5px solid #D9D6CC",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: "#888" }}>
          Notes
        </label>
        <textarea
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          rows={3}
          maxLength={1000}
          placeholder="Optional notes (e.g., 'Approved with color change request')"
          className="mt-1 w-full rounded-md border px-2.5 py-2 text-[13px]"
          style={{ borderColor: "rgba(27,42,78,0.2)", color: navy }}
        />
      </div>
    </div>
  );
};

export function validateForm(v: ApprovalFormValue): Partial<Record<keyof ApprovalFormValue, string>> {
  const errs: Partial<Record<keyof ApprovalFormValue, string>> = {};
  if (!v.approvedByBuyerId && !(v.approvedByOtherName && v.approvedByOtherName.trim())) {
    errs.approvedByBuyerId = "Select a buyer or enter a name";
  }
  if (!v.approvedOn || isNaN(new Date(v.approvedOn).getTime())) {
    errs.approvedOn = "Invalid date";
  }
  if (!v.viaChannel) errs.viaChannel = "Required";
  return errs;
}

export function celebrationToast(message: string) {
  toast.custom((t) => (
    <div className="flex items-center gap-3 rounded-lg bg-[#2E7D32] px-4 py-3 text-white shadow-lg">
      <PartyPopper className="h-5 w-5" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  ), { duration: 4000 });
}
