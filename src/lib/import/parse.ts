import type { DocumentsStatus } from "@/types/database";
import { normaliseField } from "@/lib/normalise";

export const MAX_IMPORT_ROWS = 2000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FIELD_LENGTH = 50;

export interface ParsedRow {
  /** Row number in the source file (1-based, as the user sees it) */
  line: number;
  registration_no: string;
  chassis_no: string;
  engine_no: string;
  documents_status: DocumentsStatus;
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
  registration_no: [
    "registrationno", "registrationnumber", "registration", "regno", "regnumber",
    "reg", "numberplate", "plateno", "platenumber", "plate", "vehicleno",
    "vehiclenumber", "registrationnoplate",
  ],
  chassis_no: ["chassisno", "chassisnumber", "chassis", "chasisno", "chasisnumber", "chasis"],
  engine_no: ["engineno", "enginenumber", "engine"],
  documents_status: [
    "documentsstatus", "documentstatus", "documents", "document", "docs",
    "docstatus", "docsstatus",
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

function normaliseDocs(v: string): DocumentsStatus {
  const s = v.trim().toLowerCase();
  return ["verified", "yes", "y", "true", "ok", "done", "1"].includes(s)
    ? "Verified"
    : "Pending";
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

async function readXlsx(buffer: ArrayBuffer): Promise<RawRow[]> {
  const mod = await import("exceljs");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ExcelJS: any = (mod as any).default ?? mod;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
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

// ---- main entry ---------------------------------------------------------
export async function parseVehicleFile(file: File): Promise<ParseResult> {
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

  const [header, ...data] = rows;
  const col = {
    registration_no: findColumn(header.cells, "registration_no"),
    chassis_no: findColumn(header.cells, "chassis_no"),
    engine_no: findColumn(header.cells, "engine_no"),
    documents_status: findColumn(header.cells, "documents_status"),
  };

  const missing: string[] = [];
  if (col.registration_no < 0) missing.push("Registration No / Number Plate");
  if (col.chassis_no < 0) missing.push("Chassis No");
  if (col.engine_no < 0) missing.push("Engine No");
  if (missing.length) {
    throw new Error(
      `Missing column(s): ${missing.join(", ")}. The first row of the file must be a header row.`
    );
  }
  if (data.length > MAX_IMPORT_ROWS) {
    throw new Error(`Too many rows (${data.length}). The maximum per import is ${MAX_IMPORT_ROWS}.`);
  }

  const valid: ParsedRow[] = [];
  const invalid: ParseResult["invalid"] = [];
  const seen = new Map<string, number>();

  for (const r of data) {
    const reg = normaliseField(r.cells[col.registration_no] ?? "");
    const chassis = normaliseField(r.cells[col.chassis_no] ?? "");
    const engine = normaliseField(r.cells[col.engine_no] ?? "");
    const docs =
      col.documents_status >= 0 ? normaliseDocs(r.cells[col.documents_status] ?? "") : "Pending";

    const absent: string[] = [];
    if (!reg) absent.push("number plate");
    if (!chassis) absent.push("chassis no");
    if (!engine) absent.push("engine no");
    if (absent.length) {
      invalid.push({ line: r.line, message: `Missing ${absent.join(", ")}` });
      continue;
    }
    if ([reg, chassis, engine].some((v) => v.length > MAX_FIELD_LENGTH)) {
      invalid.push({ line: r.line, message: `A value is longer than ${MAX_FIELD_LENGTH} characters` });
      continue;
    }
    const first = seen.get(reg);
    if (first !== undefined) {
      invalid.push({ line: r.line, message: `Duplicate plate ${reg} (first on row ${first})` });
      continue;
    }
    seen.set(reg, r.line);
    valid.push({
      line: r.line,
      registration_no: reg,
      chassis_no: chassis,
      engine_no: engine,
      documents_status: docs,
    });
  }

  return { valid, invalid, totalRows: data.length };
}

export const TEMPLATE_CSV =
  "Registration No,Chassis No,Engine No,Documents Status\r\n" +
  "LEA-1234,CH0012345,EN0012345,Verified\r\n" +
  "LEB-5678,CH0067890,EN0067890,Pending\r\n";
