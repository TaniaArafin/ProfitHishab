import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductDto } from '@ph/shared';
import { kurti, plainProduct } from '@/test/products';
import { ProductPicker } from './ProductPicker';

const product = (id: string, name: string): ProductDto => plainProduct({ id, name });

const results = [product('p1', 'Cotton Saree'), product('p2', 'Silk Saree')];
let found = results;

vi.mock('@/lib/hooks', () => ({
  useProductSearch: (term: string) => ({ results: term.trim() ? found : [], searching: false }),
}));

describe('ProductPicker (WAI-ARIA combobox)', () => {
  beforeEach(() => {
    found = results;
  });

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
    expect(onPick).toHaveBeenCalledWith(results[1], results[1].variants[0]);
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
    expect(onPick).toHaveBeenCalledWith(results[0], results[0].variants[0]);
  });

  it('lists each variant of a product with options, and picks that variant', () => {
    found = [kurti];
    const onPick = vi.fn();
    render(<ProductPicker onPick={onPick} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'kurti' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('Cotton Kurti — M / Red'),
      expect.stringContaining('Cotton Kurti — XL / Red'),
    ]);
    fireEvent.mouseDown(screen.getByRole('option', { name: /XL \/ Red/ }));
    expect(onPick).toHaveBeenCalledWith(kurti, kurti.variants[1]);
  });

  it('hides a product whose stock has all expired and shows only fresh stock', () => {
    const ace = plainProduct({ id: 'ace', name: 'Ace 500mg', unit: 'strip', stock: 60, tracksBatches: true, expiredStock: 60 });
    ace.variants[0] = { ...ace.variants[0], stock: 60, expiredStock: 60 };
    const napa = plainProduct({ id: 'napa', name: 'Napa 500mg', unit: 'strip', stock: 100, tracksBatches: true, expiredStock: 60 });
    napa.variants[0] = { ...napa.variants[0], stock: 100, expiredStock: 60 };
    found = [ace, napa];
    render(<ProductPicker onPick={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'a' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Napa 500mg');
    expect(options[0]).toHaveTextContent('40 strip in stock');
  });
});
