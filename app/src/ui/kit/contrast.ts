/**
 * WCAG 2.1 contrast (spec 08 §3.3), as pure functions, so the colour pairs the kit uses are
 * checked by an automated test and shown live in the component gallery's contrast table.
 */
import { color, palette } from './tokens';

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a #RRGGBB colour. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a #RRGGBB colour: ${hex}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => channel(parseInt(h, 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio of two colours (1 – 21), rounded down to 2 decimals so a pass is never overstated. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.floor(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Normal text needs 4.5:1; large text and the outlines of controls need 3:1. */
export type ContrastUse = 'text' | 'large' | 'control';

export function minimumFor(use: ContrastUse): number {
  return use === 'text' ? 4.5 : 3;
}

export type ContrastPair = { label: string; fg: string; bg: string; use: ContrastUse };

/** Every foreground/background pair the kit uses (the gallery's contrast table). */
export const KIT_PAIRS: readonly ContrastPair[] = [
  { label: 'Text on background', fg: color.textPrimary, bg: color.bg, use: 'text' },
  { label: 'Text on card', fg: color.textPrimary, bg: color.surface, use: 'text' },
  { label: 'Secondary text on background', fg: color.textSecondary, bg: color.bg, use: 'text' },
  { label: 'Secondary text on card', fg: color.textSecondary, bg: color.surface, use: 'text' },
  { label: 'Secondary text on success tint', fg: color.textSecondary, bg: color.successBg, use: 'text' },
  { label: 'Title on light header', fg: color.textPrimary, bg: color.headerBg, use: 'text' },
  { label: 'Secondary text on light header', fg: color.textSecondary, bg: color.headerBg, use: 'text' },
  { label: 'Green action on light header', fg: color.brand, bg: color.headerBg, use: 'text' },
  { label: 'Green text on background', fg: color.brand, bg: color.bg, use: 'text' },
  { label: 'Green text on card', fg: color.brand, bg: color.surface, use: 'text' },
  { label: 'White on green button', fg: color.onBrand, bg: color.brand, use: 'text' },
  { label: 'White on pressed green', fg: color.onBrand, bg: color.brandPressed, use: 'text' },
  { label: 'Success on its tint (corrected)', fg: color.success, bg: color.successBg, use: 'text' },
  { label: 'Warning on its tint', fg: color.warning, bg: color.warningBg, use: 'text' },
  { label: 'Danger on its tint', fg: color.danger, bg: color.dangerBg, use: 'text' },
  { label: 'Danger on card', fg: color.danger, bg: color.surface, use: 'text' },
  { label: 'Neutral on card', fg: color.neutral, bg: color.surface, use: 'text' },
  { label: 'Neutral on background', fg: color.neutral, bg: color.bg, use: 'text' },
  { label: 'Neutral on its tint', fg: color.neutral, bg: color.neutralBg, use: 'text' },
  { label: 'Info on card', fg: color.info, bg: color.surface, use: 'text' },
  { label: 'Info on its tint', fg: color.info, bg: color.infoBg, use: 'text' },
  { label: 'Text on Market Gold', fg: color.textPrimary, bg: color.accent, use: 'text' },
  { label: 'Note text on info tint', fg: color.textPrimary, bg: color.infoBg, use: 'text' },
  { label: 'Secondary text on neutral tint', fg: color.textSecondary, bg: color.neutralBg, use: 'text' },
  { label: 'White on toast (ink)', fg: color.onBrand, bg: color.textPrimary, use: 'text' },
  { label: 'Control outline on card', fg: color.controlBorder, bg: color.surface, use: 'control' },
  { label: 'Control outline on background', fg: color.controlBorder, bg: color.bg, use: 'control' },
];

/** Pairs that fail and are therefore never used (spec 08 §3.3), kept to show why. */
export const FAILING_PAIRS: readonly ContrastPair[] = [
  { label: 'White on Market Gold (never used)', fg: palette.white, bg: palette.marketGold, use: 'text' },
  { label: 'Old success green on tint (replaced)', fg: '#1E7F4F', bg: color.successBg, use: 'text' },
  { label: 'Sand as an input outline (replaced)', fg: palette.sand, bg: color.surface, use: 'control' },
];

export function passes(p: ContrastPair): boolean {
  return contrastRatio(p.fg, p.bg) >= minimumFor(p.use);
}
