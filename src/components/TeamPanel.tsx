"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import UserManager from "./UserManager";

export default function TeamPanel({ name }: { name: string }) {
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const flash = useCallback((kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4500);
  }, []);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-slate-900 to-indigo-950 px-4 py-4 text-white sm:px-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-indigo-200/70">Inspector</p>
          <h1 className="text-xl font-semibold">My Team</h1>
          <p className="text-xs text-indigo-200/70">Assistants / data-entry users managed by {name}</p>
        </div>
        <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-sm font-medium hover:bg-white/20">
          <ArrowLeft className="h-4 w-4" /> Register
        </Link>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-8">
        <UserManager viewerRole="inspector" flash={flash} />
      </main>
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className={`fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl ${
              toast.kind === "ok" ? "bg-emerald-600" : "bg-rose-600"
            }`}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
