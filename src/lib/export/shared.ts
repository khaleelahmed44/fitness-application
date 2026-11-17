import type { Vehicle } from "@/types/database";

export type ExportFormat = "pdf" | "xlsx" | "docx";
export type ExportTab = "pending" | "passed";

export interface ExportColumn {
  header: string;
  /** Approximate width in characters (used for Excel) */
  width: number;
  get: (v: Vehicle) => string;
}

export const TAB_TITLES: Record<ExportTab, string> = {
  pending: "Pending Inspection Queue",
  passed: "Verified / Passed Vehicles",
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
    { header: "S.No", width: 8, get: (v) => String(v.id) },
    { header: "Vehicle No", width: 18, get: (v) => v.registration_no },
    { header: "Document (Original Submitted)", width: 18, get: (v) => v.document_status },
    { header: "Date of Entry", width: 15, get: (v) => fmtDate(v.date_of_entry) },
    { header: "District", width: 18, get: (v) => v.district ?? "" },
    { header: "Traffic Station", width: 22, get: (v) => v.traffic_station ?? "" },
    { header: "Name (Collected By)", width: 22, get: (v) => v.collected_by_or_operator_name },
  ];
  if (tab === "pending") return base;
  return [
    ...base,
    { header: "Certificate No", width: 20, get: (v) => v.certificate_no ?? "" },
    { header: "Verified By", width: 22, get: (v) => v.verified_by_name ?? "" },
    { header: "Verified On", width: 15, get: (v) => fmtDate(v.verified_at) },
  ];
}

export function certificateDates(v: Vehicle): { issued: Date; expiry: Date } {
  const issued = new Date(v.verified_at ?? v.created_at);
  const expiry = new Date(issued);
  expiry.setMonth(expiry.getMonth() + validityMonths());
  return { issued, expiry };
}

/** Detail rows shown on the e-certificate (matches the on-screen certificate). */
export function certificateRows(v: Vehicle): [string, string][] {
  const { issued, expiry } = certificateDates(v);
  return [
    ["Vehicle No", v.registration_no],
    ["Original Documents Submitted", v.document_status],
    ["Date of Entry", fmtDate(v.date_of_entry)],
    ["District", v.district ?? "—"],
    ["Traffic Station", v.traffic_station ?? "—"],
    ["Collected By", v.collected_by_or_operator_name || "—"],
    ["Date of Verification", fmtLong(issued)],
    ["Valid Until", fmtLong(expiry)],
  ];
}

/** Key/value rows for a single pending record. */
export function recordRows(v: Vehicle): [string, string][] {
  const rows: [string, string][] = [
    ["S.No", String(v.id)],
    ["Vehicle No", v.registration_no],
    ["Document (Original Submitted)", v.document_status],
    ["Date of Entry", fmtDate(v.date_of_entry)],
    ["District", v.district ?? ""],
    ["Traffic Station", v.traffic_station ?? ""],
    ["Name (Collected By)", v.collected_by_or_operator_name],
    ["Status", v.status.toUpperCase()],
  ];
  if (v.verified_by_name) rows.push(["Verified By", v.verified_by_name]);
  if (v.verified_at) rows.push(["Verified On", fmtDate(v.verified_at)]);
  return rows;
}
