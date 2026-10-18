import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProductDto } from '@ph/shared';
import { ProductPicker } from './ProductPicker';

const product = (id: string, name: string): ProductDto => ({
  id,
  name,
  sku: id.toUpperCase(),
  categoryId: null,
  categoryName: null,
  sellingPrice: 250000,
  costPrice: 135000,
  grossProfit: 115000,
  margin: 46,
  stock: 10,
  status: 'active',
  costMissing: false,
});

const results = [product('p1', 'Cotton Saree'), product('p2', 'Silk Saree')];

vi.mock('@/lib/hooks', () => ({
  useProductSearch: (term: string) => ({ results: term.trim() ? results : [], searching: false }),
}));

describe('ProductPicker (WAI-ARIA combobox)', () => {
  it('moves with the arrow keys and picks with Enter, without submitting the form', () => {
    const onPick = vi.fn();
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    render(
      <form onSubmit={(e) => onSubmit(e.nativeEvent)}>
        <ProductPicker onPick={onPick} />
      </form>,
    );
    const input = screen.getByRole('combobox', { name: 'Add product' });

    fireEvent.change(input, { target: { value: 'saree' } });
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('option')).toHaveLength(2);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /Silk Saree/ })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(results[1]);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue('');
  });

  it('closes the list with Escape', () => {
    render(<ProductPicker onPick={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'saree' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('picks with the mouse', () => {
    const onPick = vi.fn();
    render(<ProductPicker onPick={onPick} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'saree' } });
    fireEvent.mouseDown(screen.getByRole('option', { name: /Cotton Saree/ }));
    expect(onPick).toHaveBeenCalledWith(results[0]);
  });
});
