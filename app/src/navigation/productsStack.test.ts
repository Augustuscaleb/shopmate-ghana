import { describe, expect, it } from 'vitest';
import { PRODUCTS_HOME, current, pop, push } from './productsStack';
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
