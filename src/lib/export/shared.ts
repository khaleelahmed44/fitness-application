import type { Vehicle } from "@/types/database";

export type ExportFormat = "pdf" | "xlsx" | "docx";
export type ExportTab = "all" | "pending" | "passed";

export interface ExportColumn {
  header: string;
  /** Approximate width in characters (used for Excel) */
  width: number;
  get: (v: Vehicle) => string;
}

export const TAB_TITLES: Record<ExportTab, string> = {
  all: "CFX – Complete Report",
  pending: "CFX – Non-Verified Records (Working + Verification Queue)",
  passed: "CFX – Verified Records",
};

/** Neutral brand name (fixed on purpose: no organisation / government naming in any output). */
export const authorityName = () => "CFX";
export const authoritySubtitle = () => "";
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

const statusText = (v: Vehicle) =>
  v.status === "passed" ? "Verified" : v.status === "pending" ? "In Verification Queue" : "Working";

/** One unified column set: every record, verified or not, in a single table. */
export function exportColumns(_tab?: ExportTab): ExportColumn[] {
  return [
    { header: "S.No", width: 8, get: (v) => String(v.id) },
    { header: "Jumper No", width: 16, get: (v) => v.jumper_no },
    { header: "Vehicle No", width: 18, get: (v) => v.registration_no },
    { header: "Documents Original Submitted", width: 38, get: (v) => v.document_status },
    { header: "Date of Entry", width: 15, get: (v) => fmtDate(v.date_of_entry) },
    { header: "District", width: 18, get: (v) => v.district ?? "" },
    { header: "Traffic Station", width: 22, get: (v) => v.traffic_station ?? "" },
    { header: "Collected By", width: 22, get: (v) => v.collected_by_or_operator_name },
    { header: "Verification Status", width: 22, get: statusText },
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
    ["Jumper No", v.jumper_no],
    ["Vehicle No", v.registration_no],
    ["Documents Original Submitted", v.document_status || "—"],
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
    ["Jumper No", v.jumper_no],
    ["Vehicle No", v.registration_no],
    ["Documents Original Submitted", v.document_status],
    ["Date of Entry", fmtDate(v.date_of_entry)],
    ["District", v.district ?? ""],
    ["Traffic Station", v.traffic_station ?? ""],
    ["Collected By", v.collected_by_or_operator_name],
    ["Verification Status", statusText(v)],
  ];
  if (v.verified_by_name) rows.push(["Verified By", v.verified_by_name]);
  if (v.verified_at) rows.push(["Verified On", fmtDate(v.verified_at)]);
  return rows;
}
