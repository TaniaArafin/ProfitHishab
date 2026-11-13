import { startOfDayIn } from './dates';

describe('startOfDayIn', () => {
  it('starts a Dhaka day at 18:00 UTC the day before', () => {
    expect(startOfDayIn('2026-10-05', 'Asia/Dhaka').toISOString()).toBe('2026-10-04T18:00:00.000Z');
  });

  it('is UTC midnight in UTC and follows negative offsets', () => {
    expect(startOfDayIn('2026-01-01', 'UTC').toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(startOfDayIn('2026-01-15', 'America/New_York').toISOString()).toBe('2026-01-15T05:00:00.000Z');
  });
});
