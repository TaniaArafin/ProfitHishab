import { crc32, deflateRawSync } from 'node:zlib';
import * as XLSX from 'xlsx';

/**
 * A zip bomb shaped like a spreadsheet: `rows` rows of `cols` cells `<c><v>1</v></c>` with no `r=`
 * attribute, deflated with node:zlib (about 500:1). 300 rows × 16,384 cells is ~150 KB on disk and
 * ~5 million cells once parsed. The other parts come from a normal workbook, so the file is valid.
 */
export function makeWideRowXlsx(rows: number, cols = 16_384): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a', 'b']]), 'Sheet1');
  const cfb = XLSX.CFB.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer, { type: 'buffer' });
  const row = `<row>${'<c><v>1</v></c>'.repeat(cols)}</row>`;
  const sheet = Buffer.from(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${row.repeat(rows)}</sheetData></worksheet>`,
  );
  const files = cfb.FileIndex as { type: number; content: unknown }[];
  const entries = (cfb.FullPaths as string[])
    .map((path, i) => ({ path, file: files[i] }))
    .filter(({ file }) => file.type === 2) // 2 = a file, not a directory
    .map(({ path, file }) => {
      const name = path.replace(/^Root Entry\//, '');
      return { name, data: name === 'xl/worksheets/sheet1.xml' ? sheet : Buffer.from(file.content as Uint8Array) };
    });
  return zip(entries);
}

/** A minimal zip writer: deflated entries, a central directory, no zip64. */
function zip(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name);
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, packed);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}
