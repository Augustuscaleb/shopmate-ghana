import { describe, expect, it } from 'vitest';
import { HOME_TAB, TABS, onBackPress, tabDefinition } from './tabs';

describe('Bottom tabs (03 navigation; D-7, D-8)', () => {
  it('NAV-01: five tabs in the specified order, with word labels', () => {
    expect(TABS.map((t) => t.label)).toEqual(['Today', 'Sell', 'Products', 'Customers', 'More']);
    expect(HOME_TAB).toBe('today');
  });

  it('NAV-02: Sell and Customers are "later"; Today and More are ready (More keeps Log out)', () => {
    expect(tabDefinition('sell').availability).toBe('later');
    expect(tabDefinition('customers').availability).toBe('later');
    expect(tabDefinition('today').availability).toBe('ready');
    expect(tabDefinition('more').availability).toBe('ready');
  });

  it('NAV-03: back closes an overlay first, then returns to Today, then lets the app close', () => {
    expect(onBackPress({ tab: 'more', overlayOpen: true })).toEqual({ tab: 'more', overlayOpen: false });
    expect(onBackPress({ tab: 'products', overlayOpen: false })).toEqual({ tab: 'today', overlayOpen: false });
    expect(onBackPress({ tab: 'today', overlayOpen: false })).toBeNull();
  });
});
