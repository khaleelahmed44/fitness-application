import type { Vehicle } from "@/types/database";
import { fileStamp, safeName, type ExportFormat, type ExportTab } from "./shared";

export type { ExportFormat, ExportTab } from "./shared";

/** Export a whole list (the rows currently shown in a tab). */
export async function exportList(
  format: ExportFormat,
  tab: ExportTab,
  rows: Vehicle[]
): Promise<void> {
  if (rows.length === 0) throw new Error("There are no rows to export.");
  const name = `${tab}-vehicles-${fileStamp()}.${format}`;

  if (format === "xlsx") {
    const { exportXlsx } = await import("./xlsx");
    return exportXlsx(tab, rows, name);
  }
  if (format === "pdf") {
    const { exportListPdf } = await import("./pdf");
    return exportListPdf(tab, rows, name);
  }
  const { exportListDocx } = await import("./docx");
  return exportListDocx(tab, rows, name);
}

/**
 * Export a single record.
 * Passed vehicles -> e-certificate (PDF / Word) ; other records -> record sheet.
 * Excel always exports the record as a one-row sheet.
 */
export async function exportRecord(
  format: ExportFormat,
  tab: ExportTab,
  v: Vehicle
): Promise<void> {
  const plate = safeName(v.registration_no);
  const isCert = v.status === "passed" && !!v.certificate_no;
  const base = isCert ? `${plate}-certificate` : `${plate}-record`;
  const name = `${base}.${format}`;

  if (format === "xlsx") {
    const { exportXlsx } = await import("./xlsx");
    return exportXlsx(tab, [v], name);
  }
  if (format === "pdf") {
    const m = await import("./pdf");
    return isCert ? m.exportCertificatePdf(v, name) : m.exportRecordPdf(v, name);
  }
  const m = await import("./docx");
  return isCert ? m.exportCertificateDocx(v, name) : m.exportRecordDocx(v, name);
}
