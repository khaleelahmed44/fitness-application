"use client";

export default function PrintButton() {
  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-center gap-3 bg-gray-800 px-4 py-2">
      <button
        onClick={() => window.print()}
        className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
      >
        Print / Save as PDF
      </button>
      <a href="/" className="text-sm text-gray-200 hover:underline">
        ← Back to dashboard
      </a>
    </div>
  );
}
