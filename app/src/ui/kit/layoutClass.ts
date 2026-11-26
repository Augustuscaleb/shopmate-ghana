/**
 * Layout classes (Stage 1C-3 plan §6.1; spec 08 §6.2). Pure, so they are unit-tested; the hook is
 * in useLayout.ts. Measured in density-independent pixels (dp; points on iOS), as React Native's
 * useWindowDimensions reports them, and re-evaluated on every rotation and split-screen change.
 *
 * The breakpoints are PROVISIONAL until measured on real devices (plan §6.5); they are kept in this
 * one constant so they can be tuned without touching any screen.
 */
export const BREAKPOINTS = {
  /** Width at or above this is medium (below is compact). */
  medium: 600,
  /** Width at or above this is expanded. */
  expanded: 840,
  /** Height below this is short (phones held sideways). */
  shortHeight: 480,
  /** The narrowest list pane in a two-pane layout. */
  minListPane: 320,
} as const;

export type WidthClass = 'compact' | 'medium' | 'expanded';

export type LayoutClass = {
  width: WidthClass;
  short: boolean;
  /** Width and height in dp, rounded (shown by the gallery's development overlay). */
  dp: { width: number; height: number };
  orientation: 'portrait' | 'landscape';
};

export function widthClass(width: number): WidthClass {
  if (width >= BREAKPOINTS.expanded) return 'expanded';
  if (width >= BREAKPOINTS.medium) return 'medium';
  return 'compact';
}

export function isShort(height: number): boolean {
  return height < BREAKPOINTS.shortHeight;
}

export function layoutClass(width: number, height: number): LayoutClass {
  if (!(width > 0) || !(height > 0)) throw new Error('invalid window size');
  return {
    width: widthClass(width),
    short: isShort(height),
    dp: { width: Math.round(width), height: Math.round(height) },
    orientation: width > height ? 'landscape' : 'portrait',
  };
}

/**
 * Whether a two-pane layout (list and Details side by side) is allowed: expanded width, and not
 * short unless both panes can scroll (plan §6.1: a wide but short phone doesn't get the tablet
 * layout by default).
 */
export function allowsTwoPanes(l: LayoutClass, { panesScroll = false }: { panesScroll?: boolean } = {}): boolean {
  if (l.width !== 'expanded') return false;
  if (l.short && !panesScroll) return false;
  // The list pane is about 40 % of the width and at least 320 dp, leaving the rest for Details
  return Math.max(l.dp.width * 0.4, BREAKPOINTS.minListPane) <= l.dp.width - BREAKPOINTS.minListPane;
}

/** Side-by-side figures stack on compact screens at large text sizes (spec 08 §4). */
export function figuresPerRow(l: LayoutClass, fontScale: number): number {
  if (l.width === 'compact') return fontScale >= 1.3 ? 1 : 2;
  if (l.width === 'medium') return fontScale >= 1.6 ? 2 : 4;
  return 4;
}
