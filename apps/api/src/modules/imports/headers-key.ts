import { createHash } from 'node:crypto';

/** Identifies a file layout: the same columns in any order, case or spacing give the same key. */
export function headersKey(headers: string[]): string {
  const normalised = headers.map((h) => h.trim().toLowerCase()).sort();
  return createHash('sha256').update(normalised.join('\u0001')).digest('hex');
}
