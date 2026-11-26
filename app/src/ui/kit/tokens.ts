/**
 * Design tokens v2 (Stage 1C-3.2; spec 08 revision 2, approved at C-1a; owner decisions V-3, B-3
 * and B-4). The ONE place where the v2 look is defined: kit components and the component gallery
 * use these roles, never raw colours or one-off sizes.
 *
 * Existing screens still use ui/theme.ts (the v1 tokens, unchanged), so nothing in the app changes
 * appearance in 1C-3.2. Screens move to these tokens only when they are redesigned in 1C-3.3 and
 * 1C-3.4, after the owner's gallery review (C-1b). `legacy` below maps each old name to its v2
 * role, so that move is mechanical.
 */

/** Brand palette (spec 08 §3.1; values unchanged from revision 1). */
export const palette = {
  shopGreen: '#0B6B4F',
  deepGreen: '#084C38',
  marketGold: '#F4B400',
  warmWhite: '#FAF8F3',
  white: '#FFFFFF',
  ink: '#1C1B19',
  stone: '#5A5550',
  sand: '#E4DFD5',
} as const;

/** Meaning-based colour roles (spec 08 §3.2), including the three V-3 corrections. */
export const color = {
  bg: palette.warmWhite,
  surface: palette.white,
  /** V-3: the light header (V-2), replacing the green header fill. */
  headerBg: '#EEF6F1',
  textPrimary: palette.ink,
  textSecondary: palette.stone,
  brand: palette.shopGreen,
  brandPressed: palette.deepGreen,
  onBrand: palette.white,
  /** Market Gold: dark text only (white on gold fails contrast). */
  accent: palette.marketGold,
  /** Decorative dividers and card borders ONLY (fails as a control outline). */
  divider: palette.sand,
  /** V-3: outlines of inputs and other controls (Sand fails 3:1). */
  controlBorder: '#857E74',
  /** V-3: corrected success text (the old #1E7F4F fails on its tint). */
  success: '#166B3E',
  successBg: '#E3F3EA',
  warning: '#8A5300',
  warningBg: '#FFF4D6',
  danger: '#B42318',
  dangerBg: '#FDECEA',
  neutral: '#6B6B6B',
  neutralBg: '#EDECEA',
  info: '#3949AB',
  infoBg: '#E8EAF6',
  /** Scrim behind sheets. */
  scrim: 'rgba(28,27,25,0.45)',
} as const;

export type ColorRole = keyof typeof color;

/** The v1 token names (ui/theme.ts) and the v2 role each becomes when a screen is redesigned. */
export const legacy = {
  shopGreen: 'brand', deepGreen: 'brandPressed', marketGold: 'accent', warmWhite: 'bg', surface: 'surface',
  ink: 'textPrimary', stone: 'textSecondary', sand: 'divider', ok: 'success', warnText: 'warning',
  warnBg: 'warningBg', danger: 'danger', dangerBg: 'dangerBg', tint: 'successBg', neutral: 'neutral',
} as const satisfies Record<string, ColorRole>;

/** Spacing steps (spec 08 §5.1): 4, 8, 12, 16, 24, 32, 48 dp. */
export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/** Radii (spec 08 §5.1). */
export const radius = { sm: 8, md: 12, sheet: 20, pill: 999 } as const;

/** Screen padding by width class (spec 08 §5.1). */
export const screenPadding = { compact: space.md, medium: space.lg, expanded: space.lg } as const;

/** Maximum content widths (spec 08 §6.3). */
export const maxWidth = { content: 720, form: 640 } as const;

/**
 * Typography (spec 08 §4): the native system font only (no fontFamily anywhere), weight gives the
 * hierarchy. Sizes are sp/pt and SCALE with the phone's text-size setting, with no cap.
 * Line heights are generous so wrapped lines stay readable at large text sizes.
 */
export const text = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  displaySmall: { fontSize: 24, lineHeight: 31, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 29, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  label: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
} as const;

export type TextVariant = keyof typeof text;

/** The smallest text size anywhere (spec 08 §4: caption, never smaller). */
export const MIN_TEXT_SIZE = text.caption.fontSize;

/**
 * Control hierarchy (owner decision B-4), lightest to heaviest. Every level keeps a touch target of
 * at least 48 × 48 dp (spec 08 §5.1); what changes is the visible size and weight.
 *  1. icon     — compact icon-only action, only where the meaning is universally clear
 *                (edit, close, back, add); always with a spoken label.
 *  2. text     — a small text action (no box), where an icon alone would be ambiguous.
 *  3. medium   — an ordinary button.
 *  4. large    — a primary button, only for a genuinely important action (save a sale, a product).
 */
export const control = {
  touchTarget: 48,
  icon: { visible: 40, glyph: 22 },
  text: { minHeight: 48, paddingX: space.xxs },
  medium: { minHeight: 48, paddingX: space.md, radius: radius.md },
  large: { minHeight: 56, paddingX: space.lg, radius: radius.md },
  focusRing: 2,
  hairline: 1,
} as const;

export type ControlLevel = 'icon' | 'text' | 'medium' | 'large';

/** The visible height of each level (the touch target never goes below 48 dp). */
export function controlHeight(level: ControlLevel): number {
  switch (level) {
    case 'icon': return control.icon.visible;
    case 'text': return control.text.minHeight;
    case 'medium': return control.medium.minHeight;
    case 'large': return control.large.minHeight;
  }
}

/** The touch target of each level: never smaller than 48 dp. */
export function touchTargetFor(level: ControlLevel): number {
  return Math.max(control.touchTarget, controlHeight(level));
}
