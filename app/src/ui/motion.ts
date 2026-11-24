/**
 * Motion tokens and rules (docs/stages/STAGE-1C-2-VISUAL-DESIGN.md §3). Pure values and helpers,
 * so they can be unit-tested; the React hook lives in useReducedMotion.ts.
 */
export const motion = {
  instant: 0,
  quick: 120,
  standard: 200,
  emphasis: 280,
  pulse: 900,
  /** Touch feedback: the pressed scale (subtle; never below 0.95). */
  pressScale: 0.97,
  /** Entrance: content rises this many dp while fading in. */
  riseDistance: 8,
} as const;

/** Every duration becomes 0 when the phone's "Remove animations" setting is on. */
export function duration(ms: number, reducedMotion: boolean): number {
  if (!Number.isFinite(ms) || ms < 0) throw new Error('invalid duration');
  return reducedMotion ? 0 : ms;
}

/** Pulsing placeholders and other looping motion stop entirely under reduced motion. */
export function shouldLoop(reducedMotion: boolean): boolean {
  return !reducedMotion;
}

/** Entrance start values: no offset under reduced motion (the content simply appears). */
export function entranceFrom(reducedMotion: boolean): { opacity: number; translateY: number } {
  return reducedMotion ? { opacity: 1, translateY: 0 } : { opacity: 0, translateY: motion.riseDistance };
}

export type EntranceAction = 'animate' | 'snap';

/**
 * What an entrance does when it starts (a new screen or tab): animate only when motion is allowed;
 * otherwise snap straight to the final state. A change of the reduce-motion setting itself never
 * starts an entrance (content already shown must not disappear and fade back in).
 */
export function entranceAction(reducedMotion: boolean): EntranceAction {
  return reducedMotion ? 'snap' : 'animate';
}
