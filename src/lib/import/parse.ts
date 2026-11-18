import { normaliseField } from "@/lib/normalise";

export const MAX_IMPORT_ROWS = 2000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FIELD_LENGTH = 50;

export interface ParsedRow {
  /** Row number in the source file (1-based, as the user sees it) */
  line: number;
  jumper_no: string;
  registration_no: string;
  document_status: string;
  district: string;
  traffic_station: string;
  collected_by_or_operator_name: string;
  /** YYYY-MM-DD, or undefined to use today's date */
  date_of_entry?: string;
}

export interface ParseResult {
  valid: ParsedRow[];
  invalid: { line: number; message: string }[];
  totalRows: number;
}

interface RawRow {
  line: number;
  cells: string[];
}

// ---- header detection ---------------------------------------------------
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIASES = {
  jumper_no: [
    "vehicleno", "vehiclenumber", "registrationno", "registrationnumber", "regno", "regnumber", "reg",
    "numberplate", "plateno", "platenumber", "plate", "registrationnoplate", "jumperno", "jumpernumber", "jumper",
  ],
  document_status: [
    "documentstatus", "documentsstatus", "documents", "document", "docs", "docstatus",
    "documentsoriginalsubmitted", "documentsubmitoriginal", "documentoriginal", "originaldocument", "originalsubmitted",
  ],
  date_of_entry: ["dateofentry", "entrydate", "date", "dateentry"],
  district: ["district", "dist"],
  traffic_station: ["trafficstation", "station", "ps", "policestation"],
  collected_by_or_operator_name: [
    "name", "collectedby", "collectedbyoperatorname", "operatorname", "operator", "collector",
    "dataentryname", "collectedbyname", "collectedbyassistant", "assistant", "assistantname",
  ],
} as const;

type Field = keyof typeof ALIASES;

function findColumn(headers: string[], field: Field): number {
  const wanted: readonly string[] = ALIASES[field];
  return headers.findIndex((h) => wanted.includes(key(h)));
}

// ---- value helpers ------------------------------------------------------
function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellToString(o.result); // formula cell
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((r) => r.text ?? "").join("").trim();
    }
    if ("text" in o) return cellToString(o.text); // hyperlink cell
  }
  return "";
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY and Excel serial numbers. Returns null if unreadable. */
function parseDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y: number, m: number, d: number;
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    const dmy = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/);
    if (dmy) {
      d = Number(dmy[1]);
      m = Number(dmy[2]);
      y = Number(dmy[3]);
      if (y < 100) y += 2000;
    } else if (/^\d{5}(\.\d+)?$/.test(s)) {
      const dt = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
      return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
    } else return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

// ---- readers ------------------------------------------------------------
function parseCsv(text: string): RawRow[] {
  const t = text.replace(/^﻿/, "");
  const firstLine = t.split(/\r?\n/, 1)[0] ?? "";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const delim = tabs > commas && tabs > semis ? "\t" : semis > commas ? ";" : ",";

  const rows: RawRow[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  const endField = () => {
    row.push(field.trim());
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push({ line: rowStartLine, cells: row });
    row = [];
  };

  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQuotes) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      endField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      endRow();
      line++;
      rowStartLine = line;
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) endRow();
  return rows;
}

async function readXlsxExcelJs(buffer: ArrayBuffer): Promise<RawRow[]> {
  const mod = await import("exceljs");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ExcelJS: any = (mod as any).default ?? mod;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (err) {
    // The Excel library failed on the file's internal structure (not on our column logic).
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `This Excel file could not be read (${detail}). Open it in Excel, use Save As > .xlsx (or .csv) and upload that copy.`
    );
  }
  const ws = wb.worksheets.find((w: { rowCount?: number }) => (w?.rowCount ?? 0) > 0) ?? wb.worksheets[0];
  if (!ws) throw new Error("The workbook has no sheets.");

  const out: RawRow[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
    const raw: unknown = row.values;
    const arr: unknown[] = Array.isArray(raw) ? raw.slice(1) : [];
    out.push({ line: rowNumber, cells: Array.from(arr, (c) => cellToString(c)) });
  });
  return out;
}

/** Primary reader is dependency-free; ExcelJS is only the fallback for unusual workbooks. */
async function readXlsx(buffer: ArrayBuffer): Promise<RawRow[]> {
  try {
    const rows = await (await import("./xlsx-native")).readXlsxNative(buffer);
    if (rows.length > 0) return rows;
  } catch {
    /* fall through to ExcelJS */
  }
  return readXlsxExcelJs(buffer);
}

// ---- main entry ---------------------------------------------------------
export async function parseVehicleFile(file: File | null | undefined): Promise<ParseResult> {
  if (!file || typeof file.name !== "string") {
    throw new Error("No file selected. Choose an .xlsx or .csv file to import.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("File is too large (maximum 5 MB).");
  }
  const name = file.name.toLowerCase();

  let raw: RawRow[];
  if (name.endsWith(".csv")) {
    raw = parseCsv(await file.text());
  } else if (name.endsWith(".xlsx")) {
    raw = await readXlsx(await file.arrayBuffer());
  } else {
    throw new Error(
      "Unsupported file type. Upload a .xlsx or .csv file (older .xls files must be re-saved as .xlsx)."
    );
  }

  const rows = raw.filter((r) => r.cells.some((c) => c !== ""));
  if (rows.length === 0) throw new Error("The file is empty.");

  // The header row is the first of the top rows that contains a Vehicle No column
  // (so a title line above the headers does not break the import).
  let headerIdx = rows.slice(0, 10).findIndex((r) => findColumn(r.cells, "jumper_no") >= 0);
  if (headerIdx < 0) headerIdx = 0;
  const header = rows[headerIdx];
  const data = rows.slice(headerIdx + 1);
  const col = {
    jumper_no: findColumn(header.cells, "jumper_no"),
    document_status: findColumn(header.cells, "document_status"),
    date_of_entry: findColumn(header.cells, "date_of_entry"),
    district: findColumn(header.cells, "district"),
    traffic_station: findColumn(header.cells, "traffic_station"),
    collected_by_or_operator_name: findColumn(header.cells, "collected_by_or_operator_name"),
  };

  if (col.jumper_no < 0) {
    throw new Error(
      "Missing column: Vehicle No. The first row of the file must be a header row with a VEHICLE NO column (see the template)."
    );
  }
  if (col.collected_by_or_operator_name < 0) {
    throw new Error(
      "Missing column: Collected By (the assistant who received the documents). Add a COLLECTED BY column to the header row (see the template)."
    );
  }
  if (data.length > MAX_IMPORT_ROWS) {
    throw new Error(`Too many rows (${data.length}). The maximum per import is ${MAX_IMPORT_ROWS}.`);
  }

  const cell = (r: RawRow, i: number) => (i >= 0 ? (r.cells[i] ?? "").trim() : "");

  const valid: ParsedRow[] = [];
  const invalid: ParseResult["invalid"] = [];
  const seen = new Map<string, number>(); // unique key = Jumper No (each Vehicle No is unique)

  for (const r of data) {
    const jumper = normaliseField(cell(r, col.jumper_no));
    const district = cell(r, col.district);
    const station = cell(r, col.traffic_station);
    const name = cell(r, col.collected_by_or_operator_name);
    const rawDate = cell(r, col.date_of_entry);

    if (!jumper) {
      invalid.push({ line: r.line, message: "Missing vehicle no" });
      continue;
    }
    if (!name) {
      invalid.push({ line: r.line, message: "Missing Collected By" });
      continue;
    }
    if ([jumper, district, station, name].some((v) => v.length > MAX_FIELD_LENGTH)) {
      invalid.push({ line: r.line, message: `A value is longer than ${MAX_FIELD_LENGTH} characters` });
      continue;
    }
    let date: string | undefined;
    if (rawDate) {
      const parsed = parseDate(rawDate);
      if (!parsed) {
        invalid.push({ line: r.line, message: `Unreadable date "${rawDate}" (use DD/MM/YYYY)` });
        continue;
      }
      date = parsed;
    }
    const first = seen.get(jumper);
    if (first !== undefined) {
      invalid.push({ line: r.line, message: `Duplicate vehicle no ${jumper} (first on row ${first})` });
      continue;
    }
    seen.set(jumper, r.line);
    valid.push({
      line: r.line,
      jumper_no: jumper,
      registration_no: jumper,
      document_status: cell(r, col.document_status),
      district,
      traffic_station: station,
      collected_by_or_operator_name: name,
      date_of_entry: date,
    });
  }

  return { valid, invalid, totalRows: data.length };
}

export const TEMPLATE_CSV =
  "Vehicle No,Documents Original Submitted,Date of Entry,District,Traffic Station,Collected By\r\n" +
  'LEA-1234,"CNIC, Original Registration Book",17/11/2026,Lahore,Model Town,Ali Raza\r\n' +
  "LEB-5678,CNIC,17/11/2026,Kasur,City Station,Usman Khan\r\n";
