import { spawn, type ChildProcess } from 'node:child_process';
import { extname, join } from 'node:path';
import { ImportError } from './imports.errors';
import { MAX_IMPORT_ROWS, type SheetData } from './spreadsheet-parse';
import type { WorkerReply } from './spreadsheet.worker';

export { MAX_IMPORT_ROWS, type SheetData, type SheetRow } from './spreadsheet-parse';

/**
 * Bounds for one parse. A 500 KB xlsx can hold millions of tiny cells (rows of 16,384 `<c>`s without
 * `r=`), which takes minutes and gigabytes. The parse runs in a child process with its own heap limit
 * and is killed at the timeout. A worker thread is not enough: when its heap runs out on one large
 * allocation, V8 aborts the whole process, the API included.
 */
export type ParseLimits = { timeoutMs: number; maxOldGenerationSizeMb: number };
export const PARSE_LIMITS: ParseLimits = { timeoutMs: 15_000, maxOldGenerationSizeMb: 512 };

// The built API runs spreadsheet.worker.js beside this file. From TypeScript source (Jest) there is no
// .js, so a small bootstrap compiles the worker's .ts files with the TypeScript compiler as they load.
const FROM_SOURCE = extname(__filename) === '.ts';
const WORKER_FILE = join(__dirname, `spreadsheet.worker${FROM_SOURCE ? '.ts' : '.js'}`);
const TS_BOOTSTRAP = `
const { readFileSync } = require('node:fs');
const [typescript, entry] = process.argv.slice(1);
const ts = require(typescript);
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true };
require.extensions['.ts'] = (module, file) => {
  module._compile(ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: options }).outputText, file);
};
require(entry);
`;

function startWorker(limits: ParseLimits): ChildProcess {
  const heap = `--max-old-space-size=${limits.maxOldGenerationSizeMb}`;
  const args = FROM_SOURCE ? [heap, '-e', TS_BOOTSTRAP, require.resolve('typescript'), WORKER_FILE] : [heap, WORKER_FILE];
  // No stdout/stderr: an out-of-memory abort prints a long V8 trace that would only clutter the log.
  return spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'advanced' });
}

function fromCode(code: string | null): ImportError {
  if (code === 'import_no_header') return ImportError.noHeader();
  if (code === 'import_too_many_rows') return ImportError.tooManyRows(MAX_IMPORT_ROWS);
  return ImportError.unsupportedFile();
}

/**
 * Reads the first sheet of an .xlsx, .xls or .csv in a child process. A file that runs out of time or
 * memory there is `import_file_unsupported`; the API process never blocks or crashes on it.
 */
export function readSpreadsheet(buffer: Buffer, _fileName: string, limits: ParseLimits = PARSE_LIMITS): Promise<SheetData> {
  return new Promise((resolve, reject) => {
    const child = startWorker(limits);
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      finish();
    };
    const timer = setTimeout(() => settle(() => reject(ImportError.unsupportedFile())), limits.timeoutMs);
    child.once('message', (reply: WorkerReply) => settle(() => (reply.ok ? resolve(reply.data) : reject(fromCode(reply.code)))));
    // Could not start the process (a bug or an exhausted host, not the file): a 500 with the detail in the log.
    child.on('error', (error) => settle(() => reject(error)));
    // The channel closed without a reply: killed by its heap limit (or the OS) while parsing. Not 'exit',
    // which can arrive before the last message; 'disconnect' comes after every message on the channel.
    child.once('disconnect', () => settle(() => reject(ImportError.unsupportedFile())));
    child.send({ file: buffer });
  });
}
