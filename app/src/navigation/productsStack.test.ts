import { describe, expect, it } from 'vitest';
import { PRODUCTS_HOME, afterFormSaved, current, pop, push, showsNotice } from './productsStack';
import { onBackPress } from './tabs';

describe('Products tab screens and Android Back (increment 2)', () => {
  it('PNAV-01: the list is the bottom of the stack', () => {
    expect(current(PRODUCTS_HOME)).toEqual({ name: 'list' });
    expect(pop(PRODUCTS_HOME)).toBeNull();
  });

  it('PNAV-02: Back pops one screen at a time: cost → edit → list, then the tab rule applies', () => {
    let s = push(PRODUCTS_HOME, { name: 'edit', productId: 'p1' });
    s = push(s, { name: 'cost', productId: 'p1' });
    expect(current(s)).toEqual({ name: 'cost', productId: 'p1' });
    s = pop(s)!;
    expect(current(s)).toEqual({ name: 'edit', productId: 'p1' });
    s = pop(s)!;
    expect(s).toEqual(PRODUCTS_HOME);
    expect(pop(s)).toBeNull();
    // Then Back on the list returns to Today, as for any tab
    expect(onBackPress({ tab: 'products', overlayOpen: false })).toEqual({ tab: 'today', overlayOpen: false });
  });

  it('PNAV-03: categories opened from the add form return to the form; going to the list clears the stack', () => {
    const s = push(push(PRODUCTS_HOME, { name: 'add' }), { name: 'categories' });
    expect(current(pop(s)!)).toEqual({ name: 'add' });
    expect(push(s, { name: 'list' })).toEqual(PRODUCTS_HOME);
  });

  it('PNAV-04: push does not change the previous stack (state is immutable)', () => {
    const before = push(PRODUCTS_HOME, { name: 'add' });
    const copy = [...before];
    push(before, { name: 'categories' });
    expect(before).toEqual(copy);
  });
});

describe('Product Details navigation (Stage 1C-3.1, plan §5.2)', () => {
  const detail = push(PRODUCTS_HOME, { name: 'detail', productId: 'p1' });

  it('PNAV-05: a list row opens Details; Back from Details returns to the list (kept mounted underneath)', () => {
    expect(current(detail)).toEqual({ name: 'detail', productId: 'p1' });
    expect(pop(detail)).toEqual(PRODUCTS_HOME);
  });

  it('PNAV-06: Edit opens the form above Details; Back (Cancel) from the form returns to Details', () => {
    const edit = push(detail, { name: 'edit', productId: 'p1' });
    expect(current(edit)).toEqual({ name: 'edit', productId: 'p1' });
    expect(current(pop(edit)!)).toEqual({ name: 'detail', productId: 'p1' });
  });

  it('PNAV-07: saving the edit (or archiving or restoring from the form) returns to the same Details', () => {
    const edit = push(detail, { name: 'edit', productId: 'p1' });
    expect(afterFormSaved(edit, 'p1')).toEqual([{ name: 'list' }, { name: 'detail', productId: 'p1' }]);
    expect(showsNotice(current(afterFormSaved(edit, 'p1')))).toBe(true);
  });

  it('PNAV-08: after Add, the new product\'s Details replaces the add form (A-1); Back then goes to the list', () => {
    const add = push(PRODUCTS_HOME, { name: 'add' });
    const next = afterFormSaved(add, 'new-1');
    expect(next).toEqual([{ name: 'list' }, { name: 'detail', productId: 'new-1' }]);
    expect(pop(next)).toEqual(PRODUCTS_HOME);
  });

  it('PNAV-09: a form not opened from Details returns to the list after a save', () => {
    const edit = push(PRODUCTS_HOME, { name: 'edit', productId: 'p1' });
    expect(afterFormSaved(edit, 'p1')).toEqual(PRODUCTS_HOME);
  });

  it('PNAV-10: Correct cost price from Details returns to Details; from the form, to the form', () => {
    const fromDetail = push(detail, { name: 'cost', productId: 'p1' });
    expect(current(pop(fromDetail)!)).toEqual({ name: 'detail', productId: 'p1' });
    const fromForm = push(push(detail, { name: 'edit', productId: 'p1' }), { name: 'cost', productId: 'p1' });
    expect(current(pop(fromForm)!)).toEqual({ name: 'edit', productId: 'p1' });
    expect(showsNotice({ name: 'edit', productId: 'p1' })).toBe(false);
  });

  it('PNAV-11: Android Back pops one screen at a time from cost → edit → Details → list', () => {
    let s = push(push(detail, { name: 'edit', productId: 'p1' }), { name: 'cost', productId: 'p1' });
    const seen: string[] = [];
    while (s.length > 1) { s = pop(s)!; seen.push(current(s).name); }
    expect(seen).toEqual(['edit', 'detail', 'list']);
  });
});
