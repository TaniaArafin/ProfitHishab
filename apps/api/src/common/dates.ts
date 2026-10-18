/** `@db.Date` columns travel as UTC-midnight Date objects; the app speaks YYYY-MM-DD. */
export function toDbDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
