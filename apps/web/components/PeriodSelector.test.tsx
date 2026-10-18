import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PeriodSelector } from './PeriodSelector';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams('period=this-month&page=3'),
}));

function choosePeriod(label: string) {
  fireEvent.keyDown(screen.getByLabelText('Period'), { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: label }));
}

describe('PeriodSelector', () => {
  beforeEach(() => push.mockReset());

  it('goes straight to a preset period and drops the page number', () => {
    render(<PeriodSelector preset="this-month" from="2026-10-01" to="2026-10-31" />);
    choosePeriod('Last 7 days');
    expect(push).toHaveBeenCalledWith('/dashboard?period=last-7-days');
  });

  it('opens an inline calendar for a custom range and applies the two chosen days', () => {
    render(<PeriodSelector preset="this-month" from="2026-10-01" to="2026-10-31" />);
    choosePeriod('Custom range');

    const calendar = screen.getByRole('dialog');
    const apply = within(calendar).getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();

    fireEvent.click(within(calendar).getByRole('button', { name: /October 5th/ }));
    fireEvent.click(within(calendar).getByRole('button', { name: /October 15th/ }));
    fireEvent.click(apply);

    expect(push).toHaveBeenCalledWith('/dashboard?from=2026-10-05&to=2026-10-15');
  });
});
