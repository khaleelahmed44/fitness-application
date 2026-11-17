import type { Vehicle } from "@/types/database";
import { downloadBlob } from "./download";
import { authorityName, exportColumns, TAB_TITLES, type ExportTab } from "./shared";

export async function exportXlsx(
  tab: ExportTab,
  rows: Vehicle[],
  filename: string
): Promise<void> {
  const mod = await import("exceljs");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ExcelJS: any = (mod as any).default ?? mod;

  const wb = new ExcelJS.Workbook();
  wb.creator = authorityName();
  wb.created = new Date();

  const ws = wb.addWorksheet(TAB_TITLES[tab].slice(0, 31));
  const cols = exportColumns(tab);
  ws.columns = cols.map((c) => ({ header: c.header, key: c.header, width: c.width }));

  for (const v of rows) {
    const record: Record<string, string> = {};
    cols.forEach((c) => {
      record[c.header] = c.get(v);
    });
    ws.addRow(record);
  }

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename
  );
}
