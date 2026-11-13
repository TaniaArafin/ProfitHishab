import * as XLSX from 'xlsx';
import { ImportError } from './imports.errors';

// The synchronous parse. It runs only inside the parse process (`spreadsheet.worker.ts`); callers use
// `readSpreadsheet` from `spreadsheet.ts`, which bounds its time and memory.

export const MAX_IMPORT_ROWS = 5000;
const MAX_COLUMNS = 200;

export type SheetRow = { rowNumber: number; raw: Record<string, string> };
export type SheetData = { headers: string[]; rows: SheetRow[] };

type Kind = 'xlsx' | 'xls' | 'csv';

/** The kind comes from the bytes, never the extension (a PNG renamed .xlsx is refused). */
function sniffKind(buf: Buffer): Kind | null {
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'xlsx';
  if (buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return 'xls';
  return buf.subarray(0, 8192).includes(0) ? null : 'csv';
}

function readWorkbook(buf: Buffer, kind: Kind): XLSX.WorkBook {
  try {
    if (kind === 'csv') {
      // Read in full: the 5 MB upload limit bounds it. Decode as UTF-8 ourselves (drops the BOM).
      // raw keeps "01712…" as text, not the number 1712….
      const text = buf.toString('utf8').replace(/^\u{FEFF}/u, '');
      return XLSX.read(text, { type: 'string', raw: true });
    }
    // No sheetRows: it would cut a sheet silently (blank rows count, and `!fullref` cannot tell a cut
    // sheet from a forged or missing dimension). The whole sheet is read; the parse process's time and memory
    // limits bound a hostile one, and the 5,000-data-row check below refuses a long one.
    return XLSX.read(buf, { type: 'buffer', cellDates: false });
  } catch {
    throw ImportError.unsupportedFile();
  }
}

/**
 * The declared dimension in the file can be forged (A1:XFD1048576) and would make sheet_to_json allocate
 * a million rows. Replace it with the range of the cells that really exist. False when there are none.
 */
function useRealRange(ws: XLSX.WorkSheet): boolean {
  let minR = Infinity;
  let minC = Infinity;
  let maxR = -1;
  let maxC = -1;
  for (const key of Object.keys(ws)) {
    if (key.startsWith('!')) continue;
    const { r, c } = XLSX.utils.decode_cell(key);
    if (r < minR) minR = r;
    if (c < minC) minC = c;
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  if (maxR < 0) return false;
  if (maxC - minC + 1 > MAX_COLUMNS) throw ImportError.unsupportedFile();
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: minR, c: minC }, e: { r: maxR, c: maxC } });
  return true;
}

const cellText = (cell: string | number | boolean | null | undefined): string =>
  (cell === null || cell === undefined ? '' : String(cell)).trim();

function uniqueHeaders(cells: string[]): string[] {
  const seen = new Map<string, number>();
  return cells.map((cell, i) => {
    const base = cell || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

export function parseSpreadsheet(buffer: Buffer): SheetData {
  const kind = sniffKind(buffer);
  if (!kind) throw ImportError.unsupportedFile();

  const wb = readWorkbook(buffer, kind);
  const ws = wb.Sheets[wb.SheetNames[0] ?? ''];
  if (!ws) throw ImportError.noHeader();
  if (!useRealRange(ws)) throw ImportError.noHeader();

  // Numbers stay numbers (phones as digits, dates as Excel serials); String() below makes them text.
  const grid = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(ws, { header: 1, defval: '', raw: true, blankrows: true });
  const firstRow = XLSX.utils.decode_range(ws['!ref'] ?? 'A1').s.r; // sheet_to_json starts at the used range
  const lines = grid.map((r) => r.map(cellText));
  const filled = (r: string[]) => r.filter((c) => c !== '').length;

  let headerIdx = lines.findIndex((r) => filled(r) >= 2);
  if (headerIdx < 0) headerIdx = lines.findIndex((r) => filled(r) >= 1);
  if (headerIdx < 0) throw ImportError.noHeader();

  const headers = uniqueHeaders(lines[headerIdx]);
  const rows: SheetRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (filled(lines[i]) === 0) continue;
    if (rows.length >= MAX_IMPORT_ROWS) throw ImportError.tooManyRows(MAX_IMPORT_ROWS);
    const raw: Record<string, string> = {};
    headers.forEach((h, c) => {
      raw[h] = lines[i][c] ?? '';
    });
    rows.push({ rowNumber: firstRow + i + 1, raw });
  }
  return { headers, rows };
}
