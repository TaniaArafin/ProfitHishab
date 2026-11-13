/** `@db.Date` columns travel as UTC-midnight Date objects; the app speaks YYYY-MM-DD. */
export function toDbDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The instant a YYYY-MM-DD day starts in `timezone` (Asia/Dhaka: 18:00 UTC the day before). */
export function startOfDayIn(isoDate: string, timezone: string): Date {
  const utcMidnight = Date.parse(`${isoDate}T00:00:00.000Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(utcMidnight))
      .map((p) => [p.type, Number(p.value)]),
  );
  const wallClock = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return new Date(utcMidnight - (wallClock - utcMidnight));
}
