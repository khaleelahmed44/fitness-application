"use client";

import { useState } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import Modal from "./Modal";
import SuggestInput from "./SuggestInput";
import type { Vehicle } from "@/types/database";

interface Props {
  vehicle: Vehicle;
  /** Past "Name" values, most-used first */
  nameSuggestions: string[];
  onConfirm: (collectedBy: string) => Promise<void>;
  onClose: () => void;
}

/** Shown when marking a vehicle Verified: confirm / change who collected it. */
export default function VerifyModal({ vehicle, nameSuggestions, onConfirm, onClose }: Props) {
  const [name, setName] = useState(vehicle.collected_by_or_operator_name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter who collected the vehicle.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Verify vehicle"
      subtitle="A certificate number is generated and the record moves to Verified / Passed."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="rounded-xl bg-slate-50 p-3.5 text-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Vehicle No</p>
          <p className="text-base font-semibold text-slate-900">{vehicle.registration_no}</p>
          {vehicle.document_status && (
            <p className="mt-1 text-slate-600">Documents: {vehicle.document_status}</p>
          )}
        </div>

        <SuggestInput
          label="Name (who collected)"
          value={name}
          onChange={setName}
          suggestions={nameSuggestions}
          placeholder="Person who collected the vehicle"
          maxLength={80}
          required
          autoFocus
        />

        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
            Verify &amp; issue certificate
          </button>
        </div>
      </form>
    </Modal>
  );
}
