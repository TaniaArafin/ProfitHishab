import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MonthPicker } from './MonthPicker';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

describe('MonthPicker', () => {
  beforeEach(() => push.mockReset());

  it('shows the chosen month by name', () => {
    render(<MonthPicker value="2026-10" basePath="/reports/expenses" />);
    expect(screen.getByRole('combobox', { name: 'Up to month' })).toHaveTextContent('Oct 2026');
  });

  it('goes to the report ending at the month picked', () => {
    render(<MonthPicker value="2026-10" basePath="/reports/expenses" />);
    fireEvent.keyDown(screen.getByLabelText('Up to month'), { key: 'Enter' });
    fireEvent.click(screen.getByRole('option', { name: 'Sep 2026' }));
    expect(push).toHaveBeenCalledWith('/reports/expenses?to=2026-09');
  });
});
