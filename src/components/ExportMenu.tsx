"use client";

import { useEffect, useRef, useState } from "react";
import type { ExportFormat } from "@/lib/export";

interface Props {
  disabled?: boolean;
  count: number;
  onExport: (format: ExportFormat) => Promise<void>;
}

const OPTIONS: { format: ExportFormat; label: string }[] = [
  { format: "pdf", label: "PDF report (.pdf)" },
  { format: "xlsx", label: "Excel (.xlsx)" },
  { format: "docx", label: "Word (.docx)" },
];

export default function ExportMenu({ disabled, count, onExport }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function pick(format: ExportFormat) {
    setOpen(false);
    setBusy(true);
    try {
      await onExport(format);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled || busy || count === 0}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Preparing…" : `Export (${count}) ▾`}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-48 rounded border border-gray-200 bg-white py-1 shadow-lg"
        >
          {OPTIONS.map((o) => (
            <button
              key={o.format}
              role="menuitem"
              onClick={() => pick(o.format)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
