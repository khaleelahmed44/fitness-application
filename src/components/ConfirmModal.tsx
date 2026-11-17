"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "./Modal";

interface Props {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** If set, the user must type this word before the confirm button works */
  requireText?: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export default function ConfirmModal({ title, message, confirmLabel, danger, requireText, onConfirm, onClose }: Props) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-5">
        <div className="text-sm leading-relaxed text-slate-600">{message}</div>
        {requireText && (
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`Type ${requireText} to confirm`}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-rose-400"
          />
        )}
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={run}
            disabled={busy || (!!requireText && typed.trim() !== requireText)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60 ${
              danger ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
