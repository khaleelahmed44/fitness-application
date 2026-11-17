"use client";

import { ArrowLeft, Printer } from "lucide-react";

export default function PrintButton() {
  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-center gap-4 bg-slate-900 px-4 py-3 shadow-lg">
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
      >
        <Printer className="h-4 w-4" /> Print / Save as PDF
      </button>
      <a href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-300 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </a>
    </div>
  );
}
