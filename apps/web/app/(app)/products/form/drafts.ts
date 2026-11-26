import { optionValuesKey, toTaka, UNIT_LABELS, variantCombinations, type OptionValues, type ProductDto, type Unit } from '@ph/shared';

/** An option being edited ("Size": S, M, L). */
export type OptionDraft = { id: string; name: string; values: string[] };
/** A variant row being edited; money and stock as typed. */
export type RowDraft = { id?: string; sku: string; price: string; cost: string; stock: string; active: boolean };
export type AttributeDraft = { id: string; label: string; value: string };

export const newId = () => crypto.randomUUID();

export const emptyRow = (): RowDraft => ({ sku: '', price: '', cost: '', stock: '0', active: true });

/** Options with a name and at least one value: the ones that make variants. */
export function usableOptions(options: OptionDraft[]): Array<{ name: string; values: string[] }> {
  return options.filter((o) => o.name.trim() && o.values.length > 0).map((o) => ({ name: o.name.trim(), values: o.values }));
}

/** Every variant the options make, each with its row as typed (a new combination starts empty). */
export function variantRows(options: OptionDraft[], rows: Record<string, RowDraft>) {
  const usable = usableOptions(options);
  if (usable.length === 0) return [];
  return variantCombinations(usable).map((values: OptionValues) => {
    const key = optionValuesKey(values);
    return { key, values, row: rows[key] ?? emptyRow() };
  });
}

export const taka = (poisha: number) => String(toTaka(poisha));

/** The editable state of a stored product. */
export function draftsOf(product: ProductDto | undefined): { options: OptionDraft[]; rows: Record<string, RowDraft> } {
  if (!product || product.options.length === 0) return { options: [], rows: {} };
  const rows: Record<string, RowDraft> = {};
  for (const v of product.variants) {
    rows[optionValuesKey(v.optionValues)] = {
      id: v.id,
      sku: v.sku,
      price: taka(v.sellingPrice),
      cost: taka(v.costPrice),
      stock: String(v.stock),
      active: v.status === 'active',
    };
  }
  return { options: product.options.map((o) => ({ id: newId(), name: o.name, values: [...o.values] })), rows };
}

const WORD_UNITS: ReadonlySet<Unit> = new Set<Unit>(['kg', 'ml']);
export const unitName = (unit: Unit) => (WORD_UNITS.has(unit) ? unit : UNIT_LABELS[unit][0].toUpperCase() + UNIT_LABELS[unit].slice(1));

/** "Selling price (৳)" for a piece, "Price per kg (৳)" otherwise. */
export function moneyLabels(unit: Unit) {
  if (unit === 'piece') return { price: 'Selling price (৳)', cost: 'Product cost (৳)', stock: 'Stock' };
  return { price: `Price per ${UNIT_LABELS[unit]} (৳)`, cost: `Cost per ${UNIT_LABELS[unit]} (৳)`, stock: `Stock (${UNIT_LABELS[unit]})` };
}
