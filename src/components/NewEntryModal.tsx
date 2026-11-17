"use client";

import { useState } from "react";
import Modal from "./Modal";
import type { DocumentsStatus, NewVehicleInput } from "@/types/database";

interface Props {
  onClose: () => void;
  onSubmit: (input: NewVehicleInput) => Promise<void>;
}

const empty: NewVehicleInput = {
  registration_no: "",
  chassis_no: "",
  engine_no: "",
  documents_status: "Pending",
};

export default function NewEntryModal({ onClose, onSubmit }: Props) {
  const [form, setForm] = useState<NewVehicleInput>(empty);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof NewVehicleInput>(key: K, value: NewVehicleInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.registration_no.trim() || !form.chassis_no.trim() || !form.engine_no.trim()) {
      setError("Number plate, chassis no and engine no are all required.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the entry.");
    } finally {
      setSaving(false);
    }
  }

  const input =
    "mt-1 w-full rounded border border-gray-300 px-3 py-2 uppercase focus:border-blue-500 focus:outline-none";

  return (
    <Modal title="New Vehicle Entry" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm font-medium">
          Number plate
          <input
            autoFocus
            value={form.registration_no}
            onChange={(e) => set("registration_no", e.target.value)}
            placeholder="e.g. LEA-1234"
            className={input}
          />
        </label>
        <label className="block text-sm font-medium">
          Chassis no
          <input
            value={form.chassis_no}
            onChange={(e) => set("chassis_no", e.target.value)}
            className={input}
          />
        </label>
        <label className="block text-sm font-medium">
          Engine no
          <input
            value={form.engine_no}
            onChange={(e) => set("engine_no", e.target.value)}
            className={input}
          />
        </label>
        <label className="block text-sm font-medium">
          Documents status
          <select
            value={form.documents_status}
            onChange={(e) => set("documents_status", e.target.value as DocumentsStatus)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="Pending">Pending</option>
            <option value="Verified">Verified</option>
          </select>
        </label>

        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Add to queue"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
