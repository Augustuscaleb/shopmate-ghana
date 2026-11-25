import { describe, expect, it } from 'vitest';
import { expectedValues, mergeEdit, type Product } from './products';
import { outcomeTone, rebaseValues, valuesFrom } from './productForm';

const loaded: Product = {
  id: 'p1', name: 'Milo sachet', categoryId: 'c1', unit: 'sachet', sellingPrice: 150,
  stockQty: 10, stockValue: 1100, costKnown: true, lowStockLevel: 5, active: true,
};
const fieldsOf = (p: Product) => ({ name: p.name, categoryId: p.categoryId, unit: p.unit, sellingPrice: p.sellingPrice, lowStockLevel: p.lowStockLevel });

describe('Concurrent edits: three-way merge (update_product sets all five fields)', () => {
  it('MERGE-01: nobody else changed anything: the owner\'s edit is sent as typed', () => {
    expect(mergeEdit(loaded, loaded, { ...fieldsOf(loaded), sellingPrice: 200 })).toEqual({ kind: 'ok', fields: { ...fieldsOf(loaded), sellingPrice: 200 } });
  });

  it('MERGE-02: a newer change by someone else to a field the owner did NOT touch is kept, not overwritten', () => {
    const current = { ...loaded, name: 'Milo sachet 20g', lowStockLevel: 8, unit: 'pack', categoryId: null };
    expect(mergeEdit(loaded, current, { ...fieldsOf(loaded), sellingPrice: 200 })).toEqual({
      kind: 'ok', fields: { name: 'Milo sachet 20g', categoryId: null, unit: 'pack', sellingPrice: 200, lowStockLevel: 8 },
    });
  });

  it('MERGE-03: both changed the same field to different values: conflict, nothing to send', () => {
    const current = { ...loaded, sellingPrice: 180, name: 'Milo 20g' };
    expect(mergeEdit(loaded, current, { ...fieldsOf(loaded), sellingPrice: 200, name: 'Milo big' })).toEqual({ kind: 'conflict', changed: ['name', 'sellingPrice'] });
  });

  it('MERGE-04: both made the SAME change (or a lost reply already applied mine): no conflict, same values', () => {
    const current = { ...loaded, sellingPrice: 200 };
    expect(mergeEdit(loaded, current, { ...fieldsOf(loaded), sellingPrice: 200 })).toEqual({ kind: 'ok', fields: { ...fieldsOf(loaded), sellingPrice: 200 } });
  });

  it('MERGE-05: after a conflict, re-basing on the current copy lets the owner deliberately replace the value', () => {
    const current = { ...loaded, sellingPrice: 180 };
    expect(mergeEdit(current, current, { ...fieldsOf(current), sellingPrice: 200 })).toMatchObject({ kind: 'ok', fields: { sellingPrice: 200 } });
  });

  it('MERGE-06: names compare after trimming, as the server stores them', () => {
    expect(mergeEdit(loaded, { ...loaded, name: 'Other' }, { ...fieldsOf(loaded), name: '  Milo sachet ' })).toMatchObject({ kind: 'ok', fields: { name: 'Other' } });
  });
});

describe('Form re-basing and outcome tone', () => {
  it('REBASE-01: untouched fields take the new values; typed fields are kept', () => {
    const typed = { ...valuesFrom(loaded), sellingPrice: '2.00' };
    const now = { ...loaded, sellingPrice: 180, lowStockLevel: 9, name: 'Milo 20g' };
    expect(rebaseValues(typed, loaded, now)).toEqual({ ...valuesFrom(now), sellingPrice: '2.00' });
  });

  it('OUTCOME-01: definitely not saved is an error; "may have been saved" and conflicts are information', () => {
    expect(outcomeTone('refused')).toBe('error');
    expect(outcomeTone('not_sent')).toBe('error');
    expect(outcomeTone('no_response')).toBe('info');
    expect(outcomeTone('unconfirmed')).toBe('info');
    expect(outcomeTone('conflict')).toBe('info');
  });
});

describe('update_product expected values (migration 20261125000300)', () => {
  it('EXP-01: the five editable fields, with the server\'s names, exactly as read', () => {
    expect(expectedValues(loaded)).toEqual({ name: 'Milo sachet', selling_price: 150, category_id: 'c1', unit: 'sachet', low_stock_level: 5 });
    expect(expectedValues({ ...loaded, categoryId: null, unit: null })).toMatchObject({ category_id: null, unit: null });
  });
});
