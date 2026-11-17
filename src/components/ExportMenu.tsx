"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, ChevronDown, Download, Layers, Loader2, Truck } from "lucide-react";
import type { ExportFormat } from "@/lib/export";

export type ExportScope = "all" | "verified" | "pending";

interface Props {
  counts: Record<ExportScope, number>;
  onExport: (scope: ExportScope, format: ExportFormat) => Promise<void>;
}

const SCOPES: { scope: ExportScope; label: string; hint: string; Icon: typeof Layers }[] = [
  { scope: "all", label: "Export all", hint: "Complete register, one file", Icon: Layers },
  { scope: "verified", label: "Verified only", hint: "Successfully verified vehicles", Icon: BadgeCheck },
  { scope: "pending", label: "Non-verified only", hint: "Pending / unverified vehicles", Icon: Truck },
];

const FORMATS: { format: ExportFormat; label: string }[] = [
  { format: "xlsx", label: "Excel" },
  { format: "docx", label: "Word" },
  { format: "pdf", label: "PDF" },
];

export default function ExportMenu({ counts, onExport }: Props) {
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

  async function pick(scope: ExportScope, format: ExportFormat) {
    setOpen(false);
    setBusy(true);
    try {
      await onExport(scope, format);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {busy ? "Preparing…" : "Export"}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
          >
            {SCOPES.map(({ scope, label, hint, Icon }) => (
              <div key={scope} className="rounded-xl p-2.5 hover:bg-slate-50">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">
                      {label} <span className="font-normal text-slate-400">({counts[scope]})</span>
                    </p>
                    <p className="truncate text-[11px] text-slate-500">{hint}</p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {FORMATS.map(({ format, label: fl }) => (
                    <button
                      key={format}
                      role="menuitem"
                      disabled={counts[scope] === 0}
                      onClick={() => void pick(scope, format)}
                      className="rounded-lg border border-slate-200 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {fl}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
