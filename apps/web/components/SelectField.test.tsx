import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SelectField } from './SelectField';

const COURIERS = [
  { value: '', label: 'All couriers' },
  { value: 'c1', label: 'Pathao' },
  { value: 'c2', label: 'Steadfast' },
];

function choose(trigger: HTMLElement, option: string) {
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: option }));
}

describe('SelectField', () => {
  it('submits the chosen value with its form, including "" for the All option', () => {
    const { container } = render(
      <form>
        <label htmlFor="courierId">Courier</label>
        <SelectField id="courierId" name="courierId" defaultValue="c1" options={COURIERS} />
      </form>,
    );
    const hidden = () => container.querySelector<HTMLInputElement>('input[name="courierId"]')!;
    const trigger = screen.getByLabelText('Courier');

    expect(trigger).toHaveTextContent('Pathao');
    expect(hidden().value).toBe('c1');

    choose(trigger, 'All couriers');
    expect(trigger).toHaveTextContent('All couriers');
    expect(hidden().value).toBe('');
  });

  it('reports changes when controlled and shows the placeholder while unset', () => {
    const onValueChange = vi.fn();
    render(
      <SelectField aria-label="Business type" value="" placeholder="Choose…" onValueChange={onValueChange} options={COURIERS.slice(1)} />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Business type' });

    expect(trigger).toHaveTextContent('Choose…');
    choose(trigger, 'Steadfast');
    expect(onValueChange).toHaveBeenCalledWith('c2');
  });
});
