/**
 * Client-side checks for the product form (S-31) and quick price change (S-32). They mirror the
 * server's rules (create_product / update_product, D6) so the owner gets instant feedback; the
 * server still checks everything again and remains authoritative.
 */
import { MAX_QTY, parseCedis, parseWholeNumber, pesewasToInput } from '../lib/money';
import type { Product } from './products';

export const UNIT_SUGGESTIONS = ['piece', 'pack', 'bottle', 'sachet', 'kg-bag', 'tin', 'carton'] as const;

export type ProductFormValues = {
  name: string;
  categoryId: string | null;
  unit: string;
  sellingPrice: string;
  /** New products only (S-31: cost and stock are set only when the product is created). */
  costPrice: string;
  openingStock: string;
  lowStockLevel: string;
};

export type ProductFields = {
  name: string;
  categoryId: string | null;
  unit: string | null;
  sellingPrice: number;
  lowStockLevel: number;
};

export type NewProductFields = ProductFields & { costPrice: number | null; openingStock: number };

export type FormErrors = Partial<Record<keyof ProductFormValues, string>>;

export type Checked<T> = { ok: true; value: T } | { ok: false; errors: FormErrors };

function common(v: ProductFormValues, errors: FormErrors): ProductFields | null {
  const name = v.name.trim();
  if (!name) errors.name = 'Enter a name.';
  else if (name.length > 100) errors.name = 'That name is too long. Please shorten it (100 characters at most).';
  const unit = v.unit.trim();
  if (unit.length > 30) errors.unit = 'That unit is too long. Please shorten it (30 characters at most).';
  const price = parseCedis(v.sellingPrice);
  if (!price.ok) errors.sellingPrice = price.error;
  else if (price.value < 1) errors.sellingPrice = 'Enter a selling price above GH₵ 0.00.';
  const level = parseWholeNumber(v.lowStockLevel, { max: MAX_QTY });
  if (!level.ok) errors.lowStockLevel = level.error;
  if (Object.keys(errors).length > 0 || !price.ok || !level.ok) return null;
  return { name, categoryId: v.categoryId, unit: unit || null, sellingPrice: price.value, lowStockLevel: level.value };
}

/** Checks a new product. A cost price needs opening stock (server rule cost_price_needs_opening_stock). */
export function checkNewProduct(v: ProductFormValues): Checked<NewProductFields> {
  const errors: FormErrors = {};
  const base = common(v, errors);
  const stockText = v.openingStock.trim();
  const stock = stockText === '' ? ({ ok: true, value: 0 } as const) : parseWholeNumber(stockText, { max: MAX_QTY });
  if (!stock.ok) errors.openingStock = stock.error;
  let cost: number | null = null;
  if (v.costPrice.trim() !== '') {
    const c = parseCedis(v.costPrice);
    if (!c.ok) errors.costPrice = c.error;
    else cost = c.value;
  }
  if (cost !== null && stock.ok && stock.value === 0) {
    errors.costPrice = 'A cost price needs some opening stock. Enter the stock you have, or leave the cost empty for now.';
  }
  if (!base || Object.keys(errors).length > 0 || !stock.ok) return { ok: false, errors };
  return { ok: true, value: { ...base, costPrice: cost, openingStock: stock.value } };
}

/** Checks an edit of an existing product (name, category, unit, price, low-stock level). */
export function checkProductEdit(v: ProductFormValues): Checked<ProductFields> {
  const errors: FormErrors = {};
  const base = common(v, errors);
  if (!base) return { ok: false, errors };
  return { ok: true, value: base };
}

/** Checks a new selling price for the quick price change (S-32). */
export function checkSellingPrice(text: string): { ok: true; value: number } | { ok: false; error: string } {
  const p = parseCedis(text);
  if (!p.ok) return p;
  if (p.value < 1) return { ok: false, error: 'Enter a selling price above GH₵ 0.00.' };
  return p;
}

/** Checks a cost correction (set_cost, T4): cost 0 or more, reason 1–300 characters. */
export function checkCostCorrection(costText: string, reason: string):
  { ok: true; value: { cost: number; reason: string } } | { ok: false; errors: { cost?: string; reason?: string } } {
  const errors: { cost?: string; reason?: string } = {};
  const c = parseCedis(costText);
  if (!c.ok) errors.cost = c.error;
  const r = reason.trim();
  if (!r) errors.reason = 'Please give a short reason.';
  else if (r.length > 300) errors.reason = 'That reason is too long. Please shorten it (300 characters at most).';
  if (!c.ok || errors.reason) return { ok: false, errors };
  return { ok: true, value: { cost: c.value, reason: r } };
}

/** Category name rules (categories table: 1–60 characters after trimming). */
export function checkCategoryName(text: string): { ok: true; value: string } | { ok: false; error: string } {
  const name = text.trim();
  if (!name) return { ok: false, error: 'Enter a category name.' };
  if (name.length > 60) return { ok: false, error: 'That name is too long. Please shorten it (60 characters at most).' };
  return { ok: true, value: name };
}

/** The form's text for an existing product (cost and stock are not edited here). */
export function valuesFrom(p: Product): ProductFormValues {
  return { name: p.name, categoryId: p.categoryId, unit: p.unit ?? '', sellingPrice: pesewasToInput(p.sellingPrice), costPrice: '', openingStock: '', lowStockLevel: String(p.lowStockLevel) };
}

/**
 * The product changed on the server while the form was open: fields the owner hasn't touched take
 * the new values; what the owner typed is kept (E-03).
 */
export function rebaseValues(values: ProductFormValues, was: Product, now: Product): ProductFormValues {
  const before = valuesFrom(was);
  const after = valuesFrom(now);
  const out = { ...values };
  for (const k of ['name', 'categoryId', 'unit', 'sellingPrice', 'lowStockLevel'] as const) {
    if (values[k] === before[k]) (out as Record<string, unknown>)[k] = after[k];
  }
  return out;
}

export type Outcome = { tone: 'error' | 'info'; text: string };

/** "Definitely not saved" is an error; "may have been saved" and "changed by someone else" are information. */
export function outcomeTone(kind: 'refused' | 'not_sent' | 'no_response' | 'unconfirmed' | 'conflict'): 'error' | 'info' {
  return kind === 'refused' || kind === 'not_sent' ? 'error' : 'info';
}
