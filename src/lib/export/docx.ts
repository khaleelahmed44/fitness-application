import {
  AlignmentType,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { Vehicle } from "@/types/database";
import { downloadBlob } from "./download";
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

const NAVY = "1E3A8A";

interface CellOpts {
  bold?: boolean;
  fill?: string;
  color?: string;
  size?: number;
  width?: number;
}

const cell = (text: string, o: CellOpts = {}) =>
  new TableCell({
    width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: o.bold, color: o.color, size: o.size })],
      }),
    ],
  });

const centered = (
  text: string,
  o: { size?: number; bold?: boolean; color?: string; before?: number; after?: number } = {}
) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: o.before ?? 0, after: o.after ?? 0 },
    children: [new TextRun({ text, size: o.size, bold: o.bold, color: o.color })],
  });

const keyValueTable = (rows: [string, string][]) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([k, val]) =>
        new TableRow({
          children: [
            cell(k, { fill: "F3F4F6", bold: false, width: 45 }),
            cell(val, { bold: true, width: 55 }),
          ],
        })
    ),
  });

async function save(doc: Document, filename: string): Promise<void> {
  downloadBlob(await Packer.toBlob(doc), filename);
}

/** Table report of the current list (landscape). */
export async function exportListDocx(
  tab: ExportTab,
  rows: Vehicle[],
  filename: string
): Promise<void> {
  const cols = exportColumns(tab);

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: cols.map((c) => cell(c.header, { bold: true, fill: NAVY, color: "FFFFFF", size: 18 })),
      }),
      ...rows.map(
        (v) =>
          new TableRow({
            children: cols.map((c) => cell(c.get(v), { size: 18 })),
          })
      ),
    ],
  });

  const doc = new Document({
    creator: authorityName(),
    title: TAB_TITLES[tab],
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
        children: [
          new Paragraph({
            children: [new TextRun({ text: authorityName(), bold: true, size: 30, color: NAVY })],
          }),
          new Paragraph({
            children: [new TextRun({ text: TAB_TITLES[tab], bold: true, size: 24 })],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `Generated ${new Date().toLocaleString("en-GB")} | ${rows.length} record(s)`,
                size: 18,
                color: "666666",
              }),
            ],
          }),
          table,
        ],
      },
    ],
  });
  await save(doc, filename);
}

/** E-certificate for a passed vehicle (A4 portrait). */
export async function exportCertificateDocx(v: Vehicle, filename: string): Promise<void> {
  const { issued } = certificateDates(v);

  const doc = new Document({
    creator: authorityName(),
    title: `Fitness Certificate ${v.certificate_no ?? ""}`,
    sections: [
      {
        children: [
          ...(authoritySubtitle()
            ? [centered(authoritySubtitle().toUpperCase(), { size: 20, color: NAVY })]
            : []),
          centered(authorityName().toUpperCase(), { size: 34, bold: true, color: NAVY, after: 300 }),
          centered("Vehicle Fitness Certificate", { size: 52, bold: true, before: 200 }),
          centered("E-Certificate of Roadworthiness", { size: 20, color: "666666", after: 400 }),
          centered("CERTIFICATE NO.", { size: 18, color: "666666" }),
          centered(v.certificate_no ?? "", { size: 44, bold: true, color: NAVY, after: 300 }),
          centered(
            "This is to certify that the vehicle described below has been inspected and found FIT for road use as of the date of inspection.",
            { size: 22, after: 300 }
          ),
          keyValueTable(certificateRows(v)),
          ...(v.remarks
            ? [new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: `Remarks: ${v.remarks}`, size: 20 })] })]
            : []),
          new Paragraph({
            spacing: { before: 900 },
            children: [new TextRun({ text: v.inspector_name ?? "", size: 26 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: "INSPECTING OFFICER", size: 16, color: "666666" })],
          }),
          new Paragraph({
            spacing: { before: 200 },
            children: [
              new TextRun({
                text: `Issued electronically on ${fmtLong(issued)}. Verify using certificate no. ${v.certificate_no ?? ""}.`,
                size: 16,
                color: "666666",
              }),
            ],
          }),
          centered("This is a computer-generated certificate. Any alteration renders it invalid.", {
            size: 15,
            color: "888888",
            before: 400,
          }),
        ],
      },
    ],
  });
  await save(doc, filename);
}

/** Single-record sheet for pending / failed vehicles. */
export async function exportRecordDocx(v: Vehicle, filename: string): Promise<void> {
  const doc = new Document({
    creator: authorityName(),
    title: "Vehicle Inspection Record",
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: authorityName(), bold: true, size: 30, color: NAVY })],
          }),
          new Paragraph({
            children: [new TextRun({ text: "Vehicle Inspection Record", bold: true, size: 24 })],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `Generated ${new Date().toLocaleString("en-GB")}`,
                size: 18,
                color: "666666",
              }),
            ],
          }),
          keyValueTable(recordRows(v)),
        ],
      },
    ],
  });
  await save(doc, filename);
}
