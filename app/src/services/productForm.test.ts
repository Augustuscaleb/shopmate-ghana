import { describe, expect, it } from 'vitest';
import { checkCategoryName, checkCostCorrection, checkNewProduct, checkProductEdit, checkSellingPrice, type ProductFormValues } from './productForm';

const base: ProductFormValues = { name: 'Milo sachet', categoryId: null, unit: 'sachet', sellingPrice: '1.50', costPrice: '', openingStock: '', lowStockLevel: '5' };

describe('Product form checks (S-31, S-32; mirror the server rules)', () => {
  it('PF-01: a minimal new product: name and selling price; stock 0, no cost', () => {
    expect(checkNewProduct({ ...base, unit: '' })).toEqual({ ok: true, value: {
      name: 'Milo sachet', categoryId: null, unit: null, sellingPrice: 150, lowStockLevel: 5, costPrice: null, openingStock: 0,
    } });
  });

  it('PF-02: names and units are trimmed; cost with opening stock is accepted', () => {
    const r = checkNewProduct({ ...base, name: '  Milo  ', unit: ' pack ', costPrice: '1.10', openingStock: '10', categoryId: 'c1' });
    expect(r).toEqual({ ok: true, value: { name: 'Milo', categoryId: 'c1', unit: 'pack', sellingPrice: 150, lowStockLevel: 5, costPrice: 110, openingStock: 10 } });
  });

  it('PF-03: a cost price needs opening stock (cost_price_needs_opening_stock)', () => {
    const r = checkNewProduct({ ...base, costPrice: '1.10', openingStock: '0' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.costPrice).toMatch(/needs some opening stock/);
    expect(checkNewProduct({ ...base, costPrice: '1.10' }).ok).toBe(false);
    expect(checkNewProduct({ ...base, costPrice: '0', openingStock: '3' })).toMatchObject({ ok: true, value: { costPrice: 0 } });
  });

  it('PF-04: every field error is reported at once, in plain words', () => {
    const r = checkNewProduct({ name: ' ', categoryId: null, unit: 'x'.repeat(31), sellingPrice: '0', costPrice: 'abc', openingStock: '-2', lowStockLevel: '1.5' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['costPrice', 'lowStockLevel', 'name', 'openingStock', 'sellingPrice', 'unit']);
  });

  it('PF-05: limits: name 100, unit 30, price GH₵ 0.01 – 1,000,000, stock and level up to 100,000', () => {
    expect(checkNewProduct({ ...base, name: 'x'.repeat(100) }).ok).toBe(true);
    expect(checkNewProduct({ ...base, name: 'x'.repeat(101) }).ok).toBe(false);
    expect(checkNewProduct({ ...base, unit: 'x'.repeat(30) }).ok).toBe(true);
    expect(checkNewProduct({ ...base, sellingPrice: '0.01' }).ok).toBe(true);
    expect(checkNewProduct({ ...base, sellingPrice: '0.00' }).ok).toBe(false);
    expect(checkNewProduct({ ...base, sellingPrice: '1000000.01' }).ok).toBe(false);
    expect(checkNewProduct({ ...base, openingStock: '100000', lowStockLevel: '100000' }).ok).toBe(true);
    expect(checkNewProduct({ ...base, openingStock: '100001' }).ok).toBe(false);
    expect(checkNewProduct({ ...base, lowStockLevel: '' }).ok).toBe(false);
  });

  it('PF-06: an edit ignores cost and stock (they change only through their own actions)', () => {
    expect(checkProductEdit({ ...base, costPrice: 'abc', openingStock: 'abc' })).toEqual({ ok: true, value: {
      name: 'Milo sachet', categoryId: null, unit: 'sachet', sellingPrice: 150, lowStockLevel: 5,
    } });
    expect(checkProductEdit({ ...base, sellingPrice: '' }).ok).toBe(false);
  });

  it('PF-07: quick price change: above GH₵ 0.00, at most two decimals', () => {
    expect(checkSellingPrice('2')).toEqual({ ok: true, value: 200 });
    expect(checkSellingPrice('0').ok).toBe(false);
    expect(checkSellingPrice('2.555').ok).toBe(false);
  });

  it('PF-08: cost correction: cost 0 or more and a reason of 1–300 characters', () => {
    expect(checkCostCorrection('1.20', ' typo ')).toEqual({ ok: true, value: { cost: 120, reason: 'typo' } });
    expect(checkCostCorrection('0', 'free sample')).toEqual({ ok: true, value: { cost: 0, reason: 'free sample' } });
    const r = checkCostCorrection('', '  ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['cost', 'reason']);
    expect(checkCostCorrection('1', 'x'.repeat(300)).ok).toBe(true);
    expect(checkCostCorrection('1', 'x'.repeat(301)).ok).toBe(false);
  });

  it('PF-09: category names: 1–60 characters after trimming', () => {
    expect(checkCategoryName('  Drinks ')).toEqual({ ok: true, value: 'Drinks' });
    expect(checkCategoryName('   ').ok).toBe(false);
    expect(checkCategoryName('x'.repeat(60)).ok).toBe(true);
    expect(checkCategoryName('x'.repeat(61)).ok).toBe(false);
  });
});
