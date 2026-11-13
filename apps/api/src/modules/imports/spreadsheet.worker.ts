import { ImportError } from './imports.errors';
import { parseSpreadsheet, type SheetData } from './spreadsheet-parse';

/** What the parse process sends back: the rows, or the code of the ImportError the parse threw. */
export type WorkerReply = { ok: true; data: SheetData } | { ok: false; code: string | null };

/**
 * Entry of the child process `readSpreadsheet` starts: takes the file's bytes from the first IPC
 * message, sends one reply and disconnects, which lets the process end.
 */
process.once('message', ({ file }: { file: Uint8Array }) => {
  let reply: WorkerReply;
  try {
    reply = { ok: true, data: parseSpreadsheet(Buffer.from(file.buffer, file.byteOffset, file.byteLength)) };
  } catch (e) {
    reply = { ok: false, code: e instanceof ImportError ? e.code : null };
  }
  process.send?.(reply, () => process.disconnect());
});
