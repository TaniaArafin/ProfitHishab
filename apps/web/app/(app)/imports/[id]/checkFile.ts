import type { ImportDto, ImportMapping } from '@ph/shared';
import { api, type ApiResult } from '@/lib/client-api';

/** A 5,000-row file can take close to 20 s to check or import. */
export const LONG_CALL = { timeoutMs: 60_000 };

/** Saves the mapping, then runs the check. Stops at the first failure. */
export async function saveAndCheck(id: string, mapping: Partial<ImportMapping>): Promise<ApiResult<ImportDto>> {
  const saved = await api<ImportDto>('PUT', `/imports/${id}/mapping`, mapping);
  if (!saved.ok) return saved;
  return checkFile(id);
}

export function checkFile(id: string): Promise<ApiResult<ImportDto>> {
  return api<ImportDto>('POST', `/imports/${id}/validate`, undefined, {}, LONG_CALL);
}
