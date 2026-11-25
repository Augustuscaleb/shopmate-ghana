/**
 * The five bottom tabs (03 "Navigation"; owner decisions D-7, D-8, 24 Nov 2026).
 * Pure data and logic only, so it can be unit-tested without a device.
 */
export type TabKey = 'today' | 'sell' | 'products' | 'customers' | 'more';

/** `ready`: the tab's screen exists. `later`: a plain "coming in a later update" screen (D-8). */
export type TabAvailability = 'ready' | 'later';

export type TabDefinition = { key: TabKey; label: string; availability: TabAvailability };

export const TABS: readonly TabDefinition[] = [
  { key: 'today', label: 'Today', availability: 'ready' },
  { key: 'sell', label: 'Sell', availability: 'later' },
  { key: 'products', label: 'Products', availability: 'ready' }, // S-30 – S-32 (Stage 1C-2 increment 2)
  { key: 'customers', label: 'Customers', availability: 'later' },
  { key: 'more', label: 'More', availability: 'ready' },
] as const;

export const HOME_TAB: TabKey = 'today';

export function tabDefinition(key: TabKey): TabDefinition {
  const t = TABS.find((x) => x.key === key);
  if (!t) throw new Error(`unknown tab ${key}`);
  return t;
}

export type NavState = { tab: TabKey; overlayOpen: boolean };

/**
 * Android back button: close an open overlay first, then return to Today, then let the
 * system leave the app. Returns the next state, or null when the app should not handle it.
 */
export function onBackPress(state: NavState): NavState | null {
  if (state.overlayOpen) return { ...state, overlayOpen: false };
  if (state.tab !== HOME_TAB) return { tab: HOME_TAB, overlayOpen: false };
  return null;
}
