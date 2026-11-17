"use client";

import { useState } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import Modal from "./Modal";
import SuggestInput from "./SuggestInput";
import type { Vehicle, VehicleInput } from "@/types/database";
import type { SuggestField } from "@/lib/suggestions";

interface Props {
  mode: "add" | "edit";
  initial?: Vehicle;
  /** Name pre-filled in "Name" for new entries (the signed-in user) */
  defaultName: string;
  suggest: Record<SuggestField, string[]>;
  onSubmit: (input: VehicleInput) => Promise<void>;
  onClose: () => void;
}

const todayLabel = () =>
  new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

export default function EntryModal({ mode, initial, defaultName, suggest, onSubmit, onClose }: Props) {
  const [plate, setPlate] = useState(initial?.registration_no ?? "");
  const [docs, setDocs] = useState(initial?.document_status ?? "");
  const [district, setDistrict] = useState(initial?.district ?? "");
  const [station, setStation] = useState(initial?.traffic_station ?? "");
  const [name, setName] = useState(initial?.collected_by_or_operator_name ?? defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const [plateKey, setPlateKey] = useState(0);

  async function save(another: boolean) {
    if (!plate.trim()) {
      setError("Vehicle No is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        registration_no: plate,
        document_status: docs,
        district,
        traffic_station: station,
        collected_by_or_operator_name: name,
      });
      if (another) {
        // Keep district / station / name / docs for rapid register-style entry
        setPlate("");
        setPlateKey((k) => k + 1);
        setAdded((n) => n + 1);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={mode === "add" ? "New Entry" : `Edit entry #${initial?.id}`}
      subtitle={
        mode === "add"
          ? "Start typing to reuse earlier values, or tap a recent one. List several documents with commas."
          : "Changes are checked against your permissions by the database."
      }
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
        className="space-y-5"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <SuggestInput
            key={plateKey}
            label="Vehicle No"
            value={plate}
            onChange={setPlate}
            suggestions={suggest.registration_no}
            placeholder="e.g. LEA-1234"
            required
            uppercase
            autoFocus
          />

          <SuggestInput
            label="Documents Original Submitted"
            value={docs}
            onChange={setDocs}
            suggestions={suggest.document_status}
            placeholder="e.g. CNIC, Original Registration Book, Fitness Form"
            maxLength={300}
            multi
          />

          <SuggestInput
            label="District"
            value={district}
            onChange={setDistrict}
            suggestions={suggest.district}
            placeholder="e.g. Lahore"
            maxLength={80}
          />
          <SuggestInput
            label="Traffic Station"
            value={station}
            onChange={setStation}
            suggestions={suggest.traffic_station}
            placeholder="e.g. Model Town"
            maxLength={80}
          />
          <div className="sm:col-span-2">
            <SuggestInput
              label="Name (collected by / operator)"
              value={name}
              onChange={setName}
              suggestions={suggest.collected_by_or_operator_name}
              placeholder="Person who collected the vehicle"
              maxLength={80}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-indigo-50 px-3.5 py-2.5 text-sm text-indigo-800">
          <CalendarDays className="h-4 w-4" />
          {mode === "add" ? (
            <span>
              Date of entry is captured automatically: <b>{todayLabel()}</b>
            </span>
          ) : (
            <span>
              Date of entry: <b>{initial?.date_of_entry}</b> (cannot be changed)
            </span>
          )}
        </div>

        {added > 0 && (
          <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
            {added} entr{added === 1 ? "y" : "ies"} saved. Ready for the next vehicle.
          </p>
        )}
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {added > 0 ? "Done" : "Cancel"}
          </button>
          {mode === "add" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save(true)}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
            >
              Save &amp; add next
            </button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "add" ? "Save entry" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
