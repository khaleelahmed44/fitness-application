"use client";

import { useState } from "react";
import Modal from "./Modal";
import type { Vehicle } from "@/types/database";

interface Props {
  vehicle: Vehicle;
  decision: "passed" | "failed";
  onClose: () => void;
  onConfirm: (remarks: string) => Promise<void>;
}

export default function InspectModal({ vehicle, decision, onClose, onConfirm }: Props) {
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isFail = decision === "failed";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isFail && !remarks.trim()) {
      setError("A failure reason is required.");
      return;
    }
    setSaving(true);
    try {
      await onConfirm(remarks);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isFail ? "Fail vehicle" : "Pass vehicle & issue certificate"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded bg-gray-50 p-3 text-sm">
          <div className="font-semibold">{vehicle.registration_no}</div>
          <div className="text-gray-600">
            Chassis {vehicle.chassis_no} · Engine {vehicle.engine_no}
          </div>
        </div>

        <label className="block text-sm font-medium">
          {isFail ? "Reason for failure (required)" : "Remarks (optional)"}
          <textarea
            autoFocus
            rows={4}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-normal"
          />
        </label>

        {!isFail && (
          <p className="text-xs text-gray-500">
            A certificate number is generated automatically and the record moves to
            “Passed”. This cannot be undone.
          </p>
        )}
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            className={`rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
              isFail ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {saving ? "Saving…" : isFail ? "Confirm fail" : "Confirm pass"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
