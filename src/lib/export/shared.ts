import type { Vehicle } from "@/types/database";

export type ExportFormat = "pdf" | "xlsx" | "docx";
export type ExportTab = "pending" | "passed" | "failed";

export interface ExportColumn {
  header: string;
  /** Approximate width in characters (used for Excel) */
  width: number;
  get: (v: Vehicle) => string;
}

export const TAB_TITLES: Record<ExportTab, string> = {
  pending: "Pending Inspection Queue",
  passed: "Passed Vehicles",
  failed: "Failed Vehicles",
};

export const authorityName = () =>
  process.env.NEXT_PUBLIC_AUTHORITY_NAME ?? "Vehicle Fitness Inspection Authority";
export const authoritySubtitle = () => process.env.NEXT_PUBLIC_AUTHORITY_SUBTITLE ?? "";
const validityMonths = () => Number(process.env.NEXT_PUBLIC_CERT_VALIDITY_MONTHS ?? "12");

export const fmtDate = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";

export const fmtLong = (d: Date): string =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

export const fileStamp = (): string => new Date().toISOString().slice(0, 10);

export const safeName = (s: string): string =>
  s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "record";

export function exportColumns(tab: ExportTab): ExportColumn[] {
  const base: ExportColumn[] = [
    { header: "Number Plate", width: 18, get: (v) => v.registration_no },
    { header: "Chassis No", width: 22, get: (v) => v.chassis_no },
    { header: "Engine No", width: 22, get: (v) => v.engine_no },
  ];
  if (tab === "pending") {
    return [
      ...base,
      { header: "Documents", width: 14, get: (v) => v.documents_status },
      { header: "Entered", width: 14, get: (v) => fmtDate(v.created_at) },
    ];
  }
  if (tab === "passed") {
    return [
      ...base,
      { header: "Certificate No", width: 20, get: (v) => v.certificate_no ?? "" },
      { header: "Inspector", width: 22, get: (v) => v.inspector_name ?? "" },
      { header: "Inspection Date", width: 16, get: (v) => fmtDate(v.inspected_at) },
      { header: "Remarks", width: 36, get: (v) => v.remarks ?? "" },
    ];
  }
  return [
    ...base,
    { header: "Failure Reason", width: 40, get: (v) => v.remarks ?? "" },
    { header: "Inspector", width: 22, get: (v) => v.inspector_name ?? "" },
    { header: "Inspection Date", width: 16, get: (v) => fmtDate(v.inspected_at) },
  ];
}

export function certificateDates(v: Vehicle): { issued: Date; expiry: Date } {
  const issued = new Date(v.inspected_at ?? v.created_at);
  const expiry = new Date(issued);
  expiry.setMonth(expiry.getMonth() + validityMonths());
  return { issued, expiry };
}

/** Detail rows shown on the e-certificate (matches the on-screen certificate). */
export function certificateRows(v: Vehicle): [string, string][] {
  const { issued, expiry } = certificateDates(v);
  return [
    ["Registration / Number Plate", v.registration_no],
    ["Chassis Number", v.chassis_no],
    ["Engine Number", v.engine_no],
    ["Documents", v.documents_status],
    ["Date of Inspection", fmtLong(issued)],
    ["Valid Until", fmtLong(expiry)],
  ];
}

/** Key/value rows for a single non-certificate record (pending / failed). */
export function recordRows(v: Vehicle): [string, string][] {
  const rows: [string, string][] = [
    ["Number Plate", v.registration_no],
    ["Chassis No", v.chassis_no],
    ["Engine No", v.engine_no],
    ["Documents", v.documents_status],
    ["Status", v.status.toUpperCase()],
    ["Entered", fmtDate(v.created_at)],
  ];
  if (v.inspector_name) rows.push(["Inspector", v.inspector_name]);
  if (v.inspected_at) rows.push(["Inspection Date", fmtDate(v.inspected_at)]);
  if (v.remarks) rows.push([v.status === "failed" ? "Failure Reason" : "Remarks", v.remarks]);
  return rows;
}
