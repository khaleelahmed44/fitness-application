import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { BadgeCheck, Download, FileText, Pencil, Send, Trash2, Undo2 } from "lucide-react";
import { STATUS_LABEL, type Vehicle } from "@/types/database";
import type { ExportFormat } from "@/lib/export";

export type TabKey = "draft" | "pending" | "passed" | "daily";

interface Options {
  canEdit: (v: Vehicle) => boolean;
  canDelete: (v: Vehicle) => boolean;
  busyId: number | null;
  /** Whether the signed-in user may approve / unverify (inspector, admin) */
  canVerify: boolean;
  /** Whether the signed-in user may request verification for this draft */
  canSend: (v: Vehicle) => boolean;
  onSend: (v: Vehicle) => void;
  onApprove: (v: Vehicle) => void;
  onUnverify: (v: Vehicle) => void;
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

const STATUS_STYLE: Record<Vehicle["status"], string> = {
  draft: "bg-slate-100 text-slate-700",
  pending: "bg-amber-100 text-amber-700",
  passed: "bg-emerald-100 text-emerald-700",
};

function StatusBadge({ v }: { v: Vehicle }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[v.status]}`}>
      {STATUS_LABEL[v.status]}
    </span>
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
    h.accessor("jumper_no", {
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
      header: "Collected By",
      cell: (c) => dash(c.getValue()),
    }),
  ];

  cols.push(
    h.accessor("status", {
      header: "Status",
      cell: (c) => <StatusBadge v={c.row.original} />,
    })
  );

  if (tab === "passed" || tab === "daily") {
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
            {v.status === "draft" && o.canSend(v) && (
              <button
                onClick={() => o.onSend(v)}
                disabled={o.busyId === v.id}
                title="Request verification: moves this entry to Pending for the inspector"
                className="mr-1 inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
                Request Verification
              </button>
            )}
            {v.status === "pending" && o.canVerify && (
              <button
                onClick={() => o.onApprove(v)}
                disabled={o.busyId === v.id}
                title="Approve this record"
                className="mr-1 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40"
              >
                <BadgeCheck className="h-3.5 w-3.5" />
                Approve
              </button>
            )}
            {v.status === "passed" && (
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
            {v.status === "passed" && o.canVerify && (
              <button className={iconBtn} title="Unverify (return to Pending)" onClick={() => o.onUnverify(v)}>
                <Undo2 className="h-4 w-4" />
              </button>
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

  return cols;
}
