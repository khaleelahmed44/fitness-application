import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { BadgeCheck, Download, FileText, Pencil, Trash2 } from "lucide-react";
import type { Vehicle } from "@/types/database";
import type { ExportFormat } from "@/lib/export";

export type TabKey = "pending" | "passed";

interface Options {
  canEdit: (v: Vehicle) => boolean;
  canDelete: (v: Vehicle) => boolean;
  busyId: number | null;
  /** Whether the signed-in user may switch this row's verification */
  canToggle: (v: Vehicle) => boolean;
  onToggleVerify: (v: Vehicle) => void;
  onEdit: (v: Vehicle) => void;
  onDelete: (v: Vehicle) => void;
  onExport: (v: Vehicle, format: ExportFormat) => void;
}

const h = createColumnHelper<Vehicle>();

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

function VerifyToggle({ v, o }: { v: Vehicle; o: Options }) {
  const on = v.status === "passed";
  const allowed = o.canToggle(v);
  const busy = o.busyId === v.id;
  const label = on ? "Verified" : "Not Verified";

  if (!allowed) {
    return (
      <span
        title="Only an authorised inspector or admin can change verification"
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          on ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
        }`}
      >
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${label} – click to change`}
      disabled={busy}
      onClick={() => o.onToggleVerify(v)}
      className="group inline-flex items-center gap-2 disabled:opacity-50"
    >
      <span
        className={`relative h-5 w-9 rounded-full transition-colors ${
          on ? "bg-emerald-500" : "bg-slate-300 group-hover:bg-slate-400"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            on ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
      <span className={`text-xs font-semibold ${on ? "text-emerald-700" : "text-amber-700"}`}>{label}</span>
    </button>
  );
}

const dash = (v: string | null) => v || <span className="text-slate-300">—</span>;

const iconBtn =
  "rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30";

export function buildColumns(tab: TabKey, o: Options): ColumnDef<Vehicle, any>[] {
  const cols: ColumnDef<Vehicle, any>[] = [
    h.accessor("id", {
      header: "S.No",
      cell: (c) => <span className="tabular-nums text-slate-500">{c.getValue()}</span>,
    }),
    h.accessor("registration_no", {
      header: "Vehicle No",
      cell: (c) => <span className="font-semibold text-slate-900">{c.getValue()}</span>,
    }),
    h.accessor("document_status", {
      header: "Documents Original Submitted",
      cell: (c) =>
        c.getValue() ? (
          <span className="block max-w-[260px] whitespace-normal leading-snug">{c.getValue()}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    }),
    h.accessor("date_of_entry", { header: "Date of Entry", cell: (c) => fmtDate(c.getValue()) }),
    h.accessor("district", { header: "District", cell: (c) => dash(c.getValue()) }),
    h.accessor("traffic_station", { header: "Traffic Station", cell: (c) => dash(c.getValue()) }),
    h.accessor("collected_by_or_operator_name", {
      header: "Name",
      cell: (c) => dash(c.getValue()),
    }),
  ];

  cols.push(
    h.accessor("status", {
      header: "Verification",
      cell: (c) => <VerifyToggle v={c.row.original} o={o} />,
    })
  );

  if (tab === "passed") {
    cols.push(
      h.accessor("certificate_no", {
        header: "Certificate No",
        cell: (c) => <span className="font-mono text-xs text-indigo-700">{c.getValue() ?? "—"}</span>,
      }),
      h.accessor("verified_by_name", { header: "Verified By", cell: (c) => dash(c.getValue()) }),
      h.accessor("verified_at", { header: "Verified On", cell: (c) => fmtDate(c.getValue()) })
    );
  }

  cols.push(
    h.display({
      id: "actions",
      header: "Actions",
      enableSorting: false,
      cell: (c) => {
        const v = c.row.original;
        const editable = o.canEdit(v);
        const deletable = o.canDelete(v);
        return (
          <div className="flex items-center gap-1">
            {tab === "pending" && o.canToggle(v) && (
              <button
                onClick={() => o.onToggleVerify(v)}
                disabled={o.busyId === v.id}
                title="Verify this vehicle"
                className="mr-1 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40"
              >
                <BadgeCheck className="h-3.5 w-3.5" />
                Verify
              </button>
            )}
            {tab === "passed" && (
              <a
                href={`/certificate/${v.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mr-1 inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                <FileText className="h-3.5 w-3.5" />
                Certificate
              </a>
            )}
            {editable && (
              <button className={iconBtn} title="Edit" onClick={() => o.onEdit(v)}>
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {deletable && (
              <button
                className={`${iconBtn} hover:!bg-rose-50 hover:!text-rose-600`}
                title="Delete"
                onClick={() => o.onDelete(v)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      },
    }),
    h.display({
      id: "download",
      header: "Download",
      enableSorting: false,
      cell: (c) => {
        const v = c.row.original;
        const btn =
          "rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700";
        return (
          <div className="flex items-center gap-1">
            <Download className="h-3.5 w-3.5 text-slate-300" />
            <button className={btn} onClick={() => o.onExport(v, "pdf")} title="PDF">
              PDF
            </button>
            <button className={btn} onClick={() => o.onExport(v, "xlsx")} title="Excel">
              XLSX
            </button>
            <button className={btn} onClick={() => o.onExport(v, "docx")} title="Word">
              DOCX
            </button>
          </div>
        );
      },
    })
  );

  // Per-row downloads are e-certificates, so only verified rows get them.
  // The Export button gives the single unified file for everything else.
  return tab === "passed" ? cols : cols.filter((c) => c.id !== "download");
}
