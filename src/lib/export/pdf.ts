import type { Vehicle } from "@/types/database";
import {
  authorityName,
  authoritySubtitle,
  certificateDates,
  certificateRows,
  exportColumns,
  fmtLong,
  recordRows,
  TAB_TITLES,
  type ExportTab,
} from "./shared";

const NAVY: [number, number, number] = [30, 58, 138];

/** Table report of the current list (landscape A4). */
export async function exportListPdf(
  tab: ExportTab,
  rows: Vehicle[],
  filename: string
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const cols = exportColumns(tab);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...NAVY);
  doc.text(authorityName(), 14, 15);
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text(TAB_TITLES[tab], 14, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Generated ${new Date().toLocaleString("en-GB")}  |  ${rows.length} record(s)`,
    14,
    27
  );

  autoTable(doc, {
    startY: 31,
    head: [cols.map((c) => c.header)],
    body: rows.map((v) => cols.map((c) => c.get(v))),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: NAVY, textColor: 255 },
    alternateRowStyles: { fillColor: [243, 244, 246] },
    margin: { left: 14, right: 14 },
  });

  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.text(`Page ${i} of ${pages}`, w - 14, h - 8, { align: "right" });
  }

  doc.save(filename);
}

/** A4 e-certificate for a passed vehicle. */
export async function exportCertificatePdf(v: Vehicle, filename: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const { issued } = certificateDates(v);

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1.2);
  doc.rect(10, 10, 190, 277);
  doc.setLineWidth(0.3);
  doc.rect(13, 13, 184, 271);

  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (authoritySubtitle()) doc.text(authoritySubtitle().toUpperCase(), 105, 30, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(authorityName().toUpperCase(), 105, 40, { align: "center", maxWidth: 170 });
  doc.setLineWidth(0.4);
  doc.line(80, 46, 130, 46);

  doc.setTextColor(20, 20, 20);
  doc.setFontSize(26);
  doc.text("Vehicle Fitness Certificate", 105, 64, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("E-Certificate of Roadworthiness", 105, 72, { align: "center" });

  doc.setFontSize(9);
  doc.text("CERTIFICATE NO.", 105, 90, { align: "center" });
  doc.setFont("courier", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...NAVY);
  doc.text(v.certificate_no ?? "", 105, 100, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  doc.text(
    "This is to certify that the vehicle described below has been verified and found FIT for road use as of the date of inspection.",
    105,
    116,
    { align: "center", maxWidth: 150 }
  );

  autoTable(doc, {
    startY: 132,
    body: certificateRows(v),
    theme: "grid",
    margin: { left: 25, right: 25 },
    styles: { fontSize: 11, cellPadding: 3, textColor: 30, lineColor: [150, 150, 150] },
    columnStyles: {
      0: { fontStyle: "normal", fillColor: [249, 250, 251], cellWidth: 75 },
      1: { fontStyle: "bold" },
    },
  });

  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.3);
  doc.line(25, 252, 95, 252);
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text(v.verified_by_name ?? "", 25, 250);
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text("VERIFYING OFFICER", 25, 257);
  doc.text(`Issued electronically on ${fmtLong(issued)}`, 185, 250, { align: "right" });
  doc.text(`Verify using certificate no. ${v.certificate_no ?? ""}`, 185, 256, { align: "right" });

  doc.setFontSize(7.5);
  doc.text(
    "This is a computer-generated certificate. Any alteration renders it invalid.",
    105,
    278,
    { align: "center" }
  );

  doc.save(filename);
}

/** Single-record sheet for a pending vehicle. */
export async function exportRecordPdf(v: Vehicle, filename: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...NAVY);
  doc.text(authorityName(), 20, 22);
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text("Vehicle Inspection Record", 20, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated ${new Date().toLocaleString("en-GB")}`, 20, 35);

  autoTable(doc, {
    startY: 42,
    body: recordRows(v),
    theme: "grid",
    margin: { left: 20, right: 20 },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [243, 244, 246], cellWidth: 55 },
    },
  });

  doc.save(filename);
}
