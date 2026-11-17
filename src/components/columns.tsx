import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import type { DocumentsStatus, Vehicle } from "@/types/database";
import type { ExportFormat } from "@/lib/export";

export type TabKey = "pending" | "passed" | "failed";

interface Options {
  canInspect: boolean;
  busyId: string | null;
  onPass: (v: Vehicle) => void;
  onFail: (v: Vehicle) => void;
  onDocsChange: (v: Vehicle, s: DocumentsStatus) => void;
  onExport: (v: Vehicle, format: ExportFormat) => void;
}

const h = createColumnHelper<Vehicle>();

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const DocsBadge = ({ value }: { value: DocumentsStatus }) => (
  <span
    className={`rounded px-2 py-0.5 text-xs font-medium ${
      value === "Verified" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
    }`}
  >
    {value}
  </span>
);

export function buildColumns(tab: TabKey, o: Options): ColumnDef<Vehicle, any>[] {
  const base: ColumnDef<Vehicle, any>[] = [
    h.accessor("registration_no", {
      header: "Number Plate",
      cell: (c) => <span className="font-semibold">{c.getValue()}</span>,
    }),
    h.accessor("chassis_no", { header: "Chassis No" }),
    h.accessor("engine_no", { header: "Engine No" }),
  ];

  const exportCol = h.display({
    id: "export",
    header: "Download",
    enableSorting: false,
    cell: (c) => {
      const v = c.row.original;
      const isCert = v.status === "passed";
      const btn =
        "rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-100";
      return (
        <div className="flex gap-1">
          <button
            className={btn}
            title={isCert ? "Download e-certificate (PDF)" : "Download record (PDF)"}
            onClick={() => o.onExport(v, "pdf")}
          >
            PDF
          </button>
          <button className={btn} title="Download as Excel" onClick={() => o.onExport(v, "xlsx")}>
            XLSX
          </button>
          <button
            className={btn}
            title={isCert ? "Download e-certificate (Word)" : "Download record (Word)"}
            onClick={() => o.onExport(v, "docx")}
          >
            DOCX
          </button>
        </div>
      );
    },
  });

  if (tab === "pending") {
    return [
      ...base,
      h.accessor("documents_status", {
        header: "Documents",
        cell: (c) =>
          o.canInspect ? (
            // Inline, spreadsheet-style editable cell for inspectors
            <select
              value={c.getValue()}
              disabled={o.busyId === c.row.original.id}
              onChange={(e) => o.onDocsChange(c.row.original, e.target.value as DocumentsStatus)}
              className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-gray-300 focus:border-blue-500"
            >
              <option value="Pending">Pending</option>
              <option value="Verified">Verified</option>
            </select>
          ) : (
            <DocsBadge value={c.getValue()} />
          ),
      }),
      h.accessor("created_at", { header: "Entered", cell: (c) => fmtDate(c.getValue()) }),
      ...(o.canInspect
        ? [
            h.display({
              id: "actions",
              header: "Action",
              enableSorting: false,
              cell: (c) => {
                const v = c.row.original;
                const busy = o.busyId === v.id;
                return (
                  <div className="flex gap-2">
                    <button
                      disabled={busy || v.documents_status !== "Verified"}
                      title={
                        v.documents_status !== "Verified"
                          ? "Documents must be Verified before passing"
                          : "Pass and issue certificate"
                      }
                      onClick={() => o.onPass(v)}
                      className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Pass
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => o.onFail(v)}
                      className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40"
                    >
                      Fail
                    </button>
                  </div>
                );
              },
            }),
          ]
        : []),
      exportCol,
    ];
  }

  if (tab === "passed") {
    return [
      ...base,
      h.accessor("certificate_no", {
        header: "Certificate No",
        cell: (c) => <span className="font-mono">{c.getValue() ?? "—"}</span>,
      }),
      h.accessor("inspector_name", { header: "Inspector", cell: (c) => c.getValue() ?? "—" }),
      h.accessor("inspected_at", { header: "Date", cell: (c) => fmtDate(c.getValue()) }),
      h.accessor("remarks", { header: "Remarks", cell: (c) => c.getValue() ?? "—" }),
      h.display({
        id: "certificate",
        header: "Certificate",
        enableSorting: false,
        cell: (c) => (
          <a
            href={`/certificate/${c.row.original.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-blue-600 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
          >
            Print / View Certificate
          </a>
        ),
      }),
      exportCol,
    ];
  }

  // failed
  return [
    ...base,
    h.accessor("remarks", {
      header: "Failure Reason",
      cell: (c) => <span className="whitespace-pre-wrap text-red-700">{c.getValue() ?? "—"}</span>,
    }),
    h.accessor("inspector_name", { header: "Inspector", cell: (c) => c.getValue() ?? "—" }),
    h.accessor("inspected_at", { header: "Date", cell: (c) => fmtDate(c.getValue()) }),
    exportCol,
  ];
}
