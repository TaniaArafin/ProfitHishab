import { REQUIRED_IMPORT_TARGETS, type ImportDto, type ImportMapping, type OrderStatus } from '@ph/shared';
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

/**
 * What every status text in the file means, from the saved mapping or the API's suggestion. Null when
 * any text is unknown, so the seller must answer; a guess here would put orders in the wrong status.
 */
export function knownStatuses(imp: ImportDto): Record<string, OrderStatus> | null {
  const statuses: Record<string, OrderStatus> = {};
  for (const v of imp.statusValues) {
    const status = imp.mapping?.statuses[v.value] ?? v.suggested;
    if (!status) return null;
    statuses[v.value] = status;
  }
  return statuses;
}

/**
 * After an upload: when the columns and statuses are recognised, saves them and checks the file, so the
 * seller lands on the preview. Otherwise saves what is known and the wizard asks only for the rest. A
 * failure here is not shown: the wizard opens at the step the import reached and the seller can retry.
 */
export async function prepareImport(imp: ImportDto): Promise<void> {
  const start = imp.mapping?.columns ?? imp.suggestedColumns;
  const columns = Object.fromEntries(Object.entries(start).filter(([, col]) => col && imp.headers.includes(col)));
  if (REQUIRED_IMPORT_TARGETS.some((target) => !columns[target])) return;

  const statuses = columns.status ? knownStatuses(imp) : {};
  if (statuses) await saveAndCheck(imp.id, { columns, statuses });
  else await api<ImportDto>('PUT', `/imports/${imp.id}/mapping`, { columns });
}
