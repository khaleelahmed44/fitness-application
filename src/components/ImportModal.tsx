"use client";

import { useRef, useState } from "react";
import Modal from "./Modal";
import { parseVehicleFile, TEMPLATE_CSV, type ParseResult } from "@/lib/import/parse";
import { downloadBlob } from "@/lib/export/download";
import type { ImportResult, ImportRow } from "@/lib/vehicle-actions";

interface Props {
  /** Upper-cased plates already in the pending queue */
  existingPlates: Set<string>;
  onImport: (rows: ImportRow[]) => Promise<ImportResult>;
  onClose: () => void;
}

interface Preview {
  fileName: string;
  valid: ParseResult["valid"];
  invalid: ParseResult["invalid"];
  totalRows: number;
}

export default function ImportModal({ existingPlates, onImport, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<{ inserted: number; failed: ImportResult["failed"] } | null>(
    null
  );

  async function handleFile(file: File | undefined) {
    setError(null);
    setPreview(null);
    setResult(null);
    if (!file) return;
    setBusy(true);
    try {
      const parsed = await parseVehicleFile(file);
      // Skip plates that are already waiting in the queue
      const valid: ParseResult["valid"] = [];
      const invalid = [...parsed.invalid];
      for (const r of parsed.valid) {
        if (existingPlates.has(r.registration_no)) {
          invalid.push({ line: r.line, message: `${r.registration_no} is already in the pending queue` });
        } else valid.push(r);
      }
      invalid.sort((a, b) => a.line - b.line);
      setPreview({ fileName: file.name, valid, invalid, totalRows: parsed.totalRows });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the file.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleImport() {
    if (!preview || preview.valid.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await onImport(preview.valid);
      setResult({ inserted: res.inserted.length, failed: res.failed });
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Import vehicles from file" onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        {!result && (
          <>
            <p className="text-slate-600">
              Upload an Excel (<b>.xlsx</b>) or <b>.csv</b> file with a header row. Columns:{" "}
              <b>Vehicle No</b> (required), <b>Documents Original Submitted</b> (free text), <b>Date of Entry</b>,{" "}
              <b>District</b>, <b>Traffic Station</b> and <b>Name</b>. Valid rows go to the Pending
              queue.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={busy}
                onChange={(e) => handleFile(e.target.files?.[0])}
                className="text-sm file:mr-3 file:rounded file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-700"
              />
              <button
                type="button"
                onClick={() =>
                  downloadBlob(
                    new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" }),
                    "vehicle-import-template.csv"
                  )
                }
                className="text-indigo-600 hover:underline"
              >
                Download template
              </button>
            </div>
          </>
        )}

        {busy && !result && <p className="text-gray-500">Working…</p>}
        {error && <p className="rounded bg-red-50 p-2 text-red-700">{error}</p>}

        {preview && (
          <div className="space-y-3">
            <div className="rounded bg-gray-50 p-3">
              <div className="font-medium">{preview.fileName}</div>
              <div className="mt-1">
                <span className="font-semibold text-green-700">{preview.valid.length} ready to import</span>
                {" · "}
                <span className={preview.invalid.length ? "font-semibold text-red-700" : "text-gray-600"}>
                  {preview.invalid.length} skipped
                </span>
                {" · "}
                {preview.totalRows} data row(s) in file
              </div>
            </div>

            {preview.valid.length > 0 && (
              <div className="max-h-40 overflow-auto rounded border">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 bg-gray-100">
                    <tr>
                      {["Row", "Vehicle No", "Documents Original Submitted", "Date", "District", "Traffic Station", "Name"].map((h) => (
                        <th key={h} className="border-b px-2 py-1 text-left font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.valid.slice(0, 50).map((r) => (
                      <tr key={r.line} className="border-b last:border-0">
                        <td className="px-2 py-1 text-gray-500">{r.line}</td>
                        <td className="px-2 py-1 font-medium">{r.registration_no}</td>
                        <td className="px-2 py-1">{r.document_status}</td>
                        <td className="px-2 py-1">{r.date_of_entry ?? "today"}</td>
                        <td className="px-2 py-1">{r.district}</td>
                        <td className="px-2 py-1">{r.traffic_station}</td>
                        <td className="px-2 py-1">{r.collected_by_or_operator_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.valid.length > 50 && (
                  <p className="p-2 text-xs text-gray-500">
                    Showing the first 50 of {preview.valid.length} rows.
                  </p>
                )}
              </div>
            )}

            {preview.invalid.length > 0 && (
              <details className="rounded border border-red-200 bg-red-50 p-2" open>
                <summary className="cursor-pointer font-medium text-red-800">
                  Skipped rows ({preview.invalid.length})
                </summary>
                <ul className="mt-2 max-h-32 space-y-0.5 overflow-auto text-xs text-red-800">
                  {preview.invalid.slice(0, 100).map((p, i) => (
                    <li key={i}>
                      Row {p.line}: {p.message}
                    </li>
                  ))}
                  {preview.invalid.length > 100 && <li>…and {preview.invalid.length - 100} more</li>}
                </ul>
              </details>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-2">
            <p className="rounded bg-green-50 p-3 font-medium text-green-800">
              Imported {result.inserted} vehicle{result.inserted === 1 ? "" : "s"} into the pending
              queue.
            </p>
            {result.failed.length > 0 && (
              <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                <div className="font-medium">{result.failed.length} row(s) could not be imported:</div>
                <ul className="mt-1 max-h-32 overflow-auto">
                  {result.failed.map((f, i) => (
                    <li key={i}>
                      Row {f.line}: {f.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-50"
          >
            {result ? "Close" : "Cancel"}
          </button>
          {preview && (
            <button
              type="button"
              disabled={busy || preview.valid.length === 0}
              onClick={handleImport}
              className="rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Importing…" : `Import ${preview.valid.length} vehicle${preview.valid.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
