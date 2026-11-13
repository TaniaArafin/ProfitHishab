import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MissingCostPage from './page';

vi.mock('@/lib/server-api', () => ({ apiGet: vi.fn(() => Promise.resolve({ data: [] })) }));

describe('MissingCostPage', () => {
  it('says a cost added now does not change past (imported) orders', async () => {
    render(await MissingCostPage());
    expect(
      screen.getByText(
        'Products with a cost of 0 make your profit look higher than it is. A cost you add here counts for new orders only; past orders, including imported ones, keep a cost of 0.',
      ),
    ).toBeInTheDocument();
  });
});
