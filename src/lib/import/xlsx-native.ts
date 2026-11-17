/**
 * Minimal, dependency-free .xlsx reader (browser + Node 18+).
 * Reads cell text straight from the workbook XML, so it does not depend on optional
 * parts (tables, defined names, absolute relationship targets) that trip up larger libraries.
 */

export interface NativeRow {
  line: number;
  cells: string[];
}

const dec = new TextDecoder("utf-8");

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads every entry of a zip archive into a name -> bytes map. */
async function unzip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a valid .xlsx (zip) file");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("corrupt zip directory");
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(name)) continue;
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(dataStart, dataStart + compSize);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, await inflateRaw(raw));
    else throw new Error("unsupported zip compression");
  }
  return files;
}

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

/** Concatenated <t> text of a fragment, ignoring phonetic runs. */
function textOf(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of clean.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) out += m[1] ?? "";
  return unescapeXml(out);
}

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const attr = (tag: string, name: string) =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

function parseSheet(xml: string, shared: string[]): NativeRow[] {
  const rows: NativeRow[] = [];
  let auto = 0;
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    auto++;
    const line = Number(attr(rm[1], "r")) || auto;
    const cells: string[] = [];
    for (const cm of (rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const idx = colIndex(attr(cm[1], "r") ?? "");
      const type = attr(cm[1], "t") ?? "n";
      const body = cm[2] ?? "";
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
      let value = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = textOf(body);
      else if (type === "str") value = unescapeXml(v);
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (type === "e") value = "";
      else value = unescapeXml(v);
      while (cells.length < idx) cells.push("");
      cells[idx] = value.trim();
    }
    rows.push({ line, cells });
  }
  return rows;
}

/** Returns the rows of the first sheet that contains data. Throws on anything unreadable. */
export async function readXlsxNative(buffer: ArrayBuffer): Promise<NativeRow[]> {
  const files = await unzip(buffer);
  const text = (name: string) => {
    const f = files.get(name);
    return f ? dec.decode(f) : "";
  };

  const shared: string[] = [];
  for (const m of text("xl/sharedStrings.xml").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) {
    shared.push(textOf(m[1] ?? ""));
  }

  // Sheet paths in workbook order, resolved through the relationships file (absolute or relative targets).
  const rels = new Map<string, string>();
  for (const m of text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], "Id");
    const target = attr(m[1], "Target");
    if (id && target) {
      rels.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
    }
  }
  const paths: string[] = [];
  for (const m of text("xl/workbook.xml").matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const rid = attr(m[1], "r:id");
    const path = rid ? rels.get(rid) : undefined;
    if (path && files.has(path)) paths.push(path);
  }
  if (paths.length === 0) {
    paths.push(...[...files.keys()].filter((k) => k.startsWith("xl/worksheets/")).sort());
  }
  if (paths.length === 0) throw new Error("the workbook has no sheets");

  for (const p of paths) {
    const rows = parseSheet(text(p), shared).filter((r) => r.cells.some((c) => c !== ""));
    if (rows.length > 0) return rows;
  }
  return [];
}
