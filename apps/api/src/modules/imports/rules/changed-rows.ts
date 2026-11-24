/** JSON with object keys sorted, so a value read back from jsonb (which reorders keys) compares equal. */
function canonical(value: unknown): string {
  return JSON.stringify(value ?? null, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

interface Verdict {
  rowNumber: number;
  status: string;
  groupKey: string | null;
  normalized: unknown;
  errors: unknown;
}

/**
 * The results whose verdict differs from what is stored. Re-checking after an inline fix runs over every
 * row (one fix can change duplicates and order groups elsewhere), but only these need writing.
 */
export function changedRows<T extends Verdict>(stored: ReadonlyArray<Verdict>, results: ReadonlyArray<T>): T[] {
  const before = new Map(stored.map((r) => [r.rowNumber, r]));
  return results.filter((r) => {
    const old = before.get(r.rowNumber);
    return (
      !old ||
      old.status !== r.status ||
      old.groupKey !== r.groupKey ||
      canonical(old.normalized) !== canonical(r.normalized) ||
      canonical(old.errors) !== canonical(r.errors)
    );
  });
}
