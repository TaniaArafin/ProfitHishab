import * as XLSX from 'xlsx';
import { ImportError } from './imports.errors';
import { makeWideRowXlsx } from '../../../test/fixtures/make-wide-row-xlsx';
import { PARSE_LIMITS, readSpreadsheet } from './spreadsheet';
import { buildTemplate, TEMPLATE_HEADERS } from './template';

const xlsxBuffer = (aoa: unknown[][], tweak?: (ws: XLSX.WorkSheet) => void): Buffer => {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  tweak?.(ws);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

const code = (read: Promise<unknown>): Promise<string> =>
  read.then(
    () => 'no error',
    (e: unknown) => (e instanceof ImportError ? e.code : String(e)),
  );

describe('readSpreadsheet', () => {
  it('reads the first sheet of an xlsx', async () => {
    const out = await readSpreadsheet(
      xlsxBuffer([
        ['Phone', 'Product'],
        ['01712345678', 'Saree'],
      ]),
      'a.xlsx',
    );
    expect(out.headers).toEqual(['Phone', 'Product']);
    expect(out.rows).toEqual([{ rowNumber: 2, raw: { Phone: '01712345678', Product: 'Saree' } }]);
  });

  it('reads a CSV with a UTF-8 BOM and Bangla headers, keeping leading zeros', async () => {
    const csv = '﻿ফোন,পণ্য\n01712345678,শাড়ি\n';
    const out = await readSpreadsheet(Buffer.from(csv, 'utf8'), 'a.csv');
    expect(out.headers).toEqual(['ফোন', 'পণ্য']);
    expect(out.rows[0].raw).toEqual({ ফোন: '01712345678', পণ্য: 'শাড়ি' });
  });

  it('uses the first row with 2+ cells as the header and skips blank rows', async () => {
    const out = await readSpreadsheet(
      xlsxBuffer([['My Shop'], [], ['Phone', 'Product'], ['01712345678', 'Saree'], [], ['01812345678', 'Panjabi']]),
      'a.xlsx',
    );
    expect(out.headers).toEqual(['Phone', 'Product']);
    expect(out.rows.map((r) => r.rowNumber)).toEqual([4, 6]);
  });

  it('falls back to the first non-empty row when no row has 2 cells', async () => {
    const out = await readSpreadsheet(Buffer.from('Phone\n017\n'), 'a.csv');
    expect(out.headers).toEqual(['Phone']);
    expect(out.rows).toHaveLength(1);
  });

  it('names empty headers and de-duplicates repeated ones', async () => {
    const out = await readSpreadsheet(Buffer.from('Name,,Name\na,b,c\n'), 'a.csv');
    expect(out.headers).toEqual(['Name', 'Column 2', 'Name (2)']);
  });

  it('keeps big phone numbers as digits and date cells as Excel serials', async () => {
    const buf = xlsxBuffer(
      [
        ['Phone', 'Date'],
        [1712345678, 0],
      ],
      (ws) => {
        ws.B2 = { t: 'n', v: 46115, z: 'dd/mm/yyyy' };
      },
    );
    const row = (await readSpreadsheet(buf, 'a.xlsx')).rows[0].raw;
    expect(row.Phone).toBe('1712345678');
    expect(row.Date).toBe('46115');
  });

  it('rejects a PNG renamed to .xlsx with import_file_unsupported', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    expect(await code(readSpreadsheet(png, 'a.xlsx'))).toBe('import_file_unsupported');
  });

  it('rejects text with NUL bytes', async () => {
    expect(await code(readSpreadsheet(Buffer.from('a,b\n1,2\u0000\n'), 'a.csv'))).toBe('import_file_unsupported');
  });

  it('rejects an empty file with import_no_header', async () => {
    expect(await code(readSpreadsheet(Buffer.from(''), 'a.csv'))).toBe('import_no_header');
  });

  it('accepts 5,000 data rows and rejects 5,001 with import_too_many_rows', async () => {
    const rows = (n: number) => 'a,b\n' + Array.from({ length: n }, (_, i) => `${i},x`).join('\n');
    expect((await readSpreadsheet(Buffer.from(rows(5000)), 'a.csv')).rows).toHaveLength(5000);
    expect(await code(readSpreadsheet(Buffer.from(rows(5001)), 'a.csv'))).toBe('import_too_many_rows');
  });
});

describe('readSpreadsheet never drops rows silently', () => {
  // 4,900 orders with a blank row after every 15: 5,226 physical rows, 4,900 data rows.
  const withBlanks = (orders: number): string[][] => {
    const lines = [['Phone', 'Product', 'Qty', 'Price']];
    for (let i = 0; i < orders; i++) {
      lines.push([`017${10_000_000 + i}`, 'Saree', '1', '100']);
      if (i % 15 === 14) lines.push([]);
    }
    return lines;
  };

  it('reads all 4,900 orders of a CSV with a blank row every 15 rows', async () => {
    const csv = withBlanks(4900)
      .map((l) => l.join(','))
      .join('\n');
    const out = await readSpreadsheet(Buffer.from(csv), 'a.csv');
    expect(out.rows).toHaveLength(4900);
    expect(out.rows.at(-1)?.raw.Phone).toBe('01710004899');
  });

  it('reads all 4,900 orders of an xlsx with a blank row every 15 rows', async () => {
    const out = await readSpreadsheet(xlsxBuffer(withBlanks(4900)), 'a.xlsx');
    expect(out.rows).toHaveLength(4900);
    expect(out.rows.at(-1)?.rowNumber).toBe(5227);
  });

  it('refuses 5,001 orders spread over blank rows instead of cutting them', async () => {
    expect(await code(readSpreadsheet(xlsxBuffer(withBlanks(5001)), 'a.xlsx'))).toBe('import_too_many_rows');
  });

  it('reads a data row far below the others (row 200,001) instead of cutting the sheet', async () => {
    const buf = xlsxBuffer(
      [
        ['Phone', 'Product'],
        ['01712345678', 'Saree'],
      ],
      (ws) => {
        ws.A200001 = { t: 's', v: '01812345678' };
        ws['!ref'] = 'A1:B200001';
      },
    );
    const out = await readSpreadsheet(buf, 'a.xlsx');
    expect(out.rows.map((r) => [r.rowNumber, r.raw.Phone])).toEqual([
      [2, '01712345678'],
      [200001, '01812345678'],
    ]);
  });
});

describe('readSpreadsheet against a wide-row zip bomb', () => {
  // 300 rows × 16,384 cells without r=: ~150 KB on disk, ~5 million cells once parsed.
  const bomb = makeWideRowXlsx(300);

  /** Runs the read while counting timer ticks on this thread: a blocked event loop would count none. */
  async function readWhileTicking(limits: typeof PARSE_LIMITS) {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 50);
    const started = Date.now();
    const result = await code(readSpreadsheet(bomb, 'bomb.xlsx', limits));
    clearInterval(timer);
    return { result, ms: Date.now() - started, ticks };
  }

  it('is under the upload limit and refuses at the time limit without blocking this thread', async () => {
    expect(bomb.length).toBeLessThan(500 * 1024);
    const { result, ms, ticks } = await readWhileTicking({ timeoutMs: 1000, maxOldGenerationSizeMb: 4096 });
    expect(result).toBe('import_file_unsupported');
    expect(ms).toBeLessThan(2500);
    expect(ticks).toBeGreaterThan(10);
  }, 10_000);

  it('refuses at the memory limit without taking this process down', async () => {
    const { result, ms, ticks } = await readWhileTicking({ timeoutMs: 20_000, maxOldGenerationSizeMb: 64 });
    expect(result).toBe('import_file_unsupported');
    expect(ms).toBeLessThan(20_000); // the heap limit, not the timeout, ended it
    expect(ticks).toBeGreaterThan(0);
    // This process still parses files afterwards.
    expect((await readSpreadsheet(Buffer.from('Phone,Product\n017,Saree\n'), 'a.csv')).rows).toHaveLength(1);
  }, 30_000);

  it('uses a 15 s, 512 MB bound by default', () => {
    expect(PARSE_LIMITS).toEqual({ timeoutMs: 15_000, maxOldGenerationSizeMb: 512 });
  });
});

describe('readSpreadsheet with hostile dimensions', () => {
  it('ignores a forged A1:XFD1048576 dimension and reads fast', async () => {
    // XLSX.write would loop over the forged range itself, so write a normal file and patch the dimension in the zip.
    const cfb = XLSX.CFB.read(
      xlsxBuffer([
        ['Phone', 'Product'],
        ['01712345678', 'Saree'],
      ]),
      { type: 'buffer' },
    );
    const sheet = (cfb.FileIndex as { name: string; content: unknown }[]).find((f) => f.name === 'sheet1.xml');
    if (!sheet) throw new Error('sheet1.xml missing');
    const xml = Buffer.from(sheet.content as Uint8Array).toString('utf8');
    expect(xml).toContain('<dimension ref="A1:B2"/>');
    sheet.content = Buffer.from(xml.replace('<dimension ref="A1:B2"/>', '<dimension ref="A1:XFD1048576"/>'));
    const buf = Buffer.from(XLSX.CFB.write(cfb, { type: 'buffer', fileType: 'zip' }) as Uint8Array);
    expect(buf.includes(Buffer.from('A1:XFD1048576'))).toBe(true);
    const started = Date.now();
    const out = await readSpreadsheet(buf, 'a.xlsx');
    expect(out.headers).toEqual(['Phone', 'Product']);
    expect(out.rows).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(2000);
  }, 5000);

  it('rejects real data in more than 200 columns with import_file_unsupported', async () => {
    const wide = Array.from({ length: 201 }, (_, i) => `h${i}`);
    expect(await code(readSpreadsheet(xlsxBuffer([wide, wide]), 'a.xlsx'))).toBe('import_file_unsupported');
  });
});

describe('buildTemplate', () => {
  it('round-trips through readSpreadsheet with 16 headers and two rows', async () => {
    const out = await readSpreadsheet(buildTemplate(), 'template.xlsx');
    expect(out.headers).toEqual([...TEMPLATE_HEADERS]);
    expect(out.headers).toHaveLength(16);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0].raw.Phone).toBe('01712345678');
    expect(out.rows[1].raw.Status).toBe('Returned');
  });
});
