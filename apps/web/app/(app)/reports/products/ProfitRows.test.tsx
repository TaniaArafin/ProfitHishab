import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProductProfitDto } from '@ph/shared';
import { ProfitRows } from './ProfitRows';

const kurti: ProductProfitDto = {
  productId: 'kurti',
  name: 'Cotton Kurti',
  sku: 'KUR',
  unit: 'piece',
  unitsSold: 3,
  sales: 385000,
  cost: 216000,
  profit: 169000,
  margin: 43.9,
  unitsReturned: 0,
  variants: [
    { variantId: 'm', label: 'M / Red', unitsSold: 2, sales: 250000, cost: 140000, profit: 110000, margin: 44 },
    { variantId: 'xl', label: 'XL / Red', unitsSold: 1, sales: 135000, cost: 76000, profit: 59000, margin: 43.7 },
  ],
};
const rice: ProductProfitDto = { ...kurti, productId: 'rice', name: 'Miniket Rice', unit: 'kg', unitsSold: 2.5, variants: [] };

describe('ProfitRows', () => {
  it('expands a product to its variants', () => {
    render(
      <table>
        <tbody>
          <ProfitRows rows={[kurti, rice]} />
        </tbody>
      </table>,
    );
    expect(screen.queryByText('M / Red')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 variants of Cotton Kurti' }));
    expect(screen.getByText('M / Red')).toBeInTheDocument();
    expect(screen.getByText('XL / Red')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide variants of Cotton Kurti' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('2.5 kg')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Miniket Rice/ })).not.toBeInTheDocument();
  });
});
