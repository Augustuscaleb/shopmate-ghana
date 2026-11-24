import { describe, expect, it } from 'vitest';
import { duration, entranceAction, entranceFrom, motion, shouldLoop } from './motion';

describe('Motion rules (visual design §3)', () => {
  it('MOTION-01: durations are short, and 0 when the phone asks for reduced motion', () => {
    expect(duration(motion.standard, false)).toBe(200);
    expect(duration(motion.standard, true)).toBe(0);
    expect(motion.quick).toBeLessThanOrEqual(150);
    expect(motion.emphasis).toBeLessThanOrEqual(300);
    expect(() => duration(-1, false)).toThrow();
  });

  it('MOTION-02: no looping motion and no entrance offset under reduced motion', () => {
    expect(shouldLoop(true)).toBe(false);
    expect(shouldLoop(false)).toBe(true);
    expect(entranceFrom(true)).toEqual({ opacity: 1, translateY: 0 });
    expect(entranceFrom(false)).toEqual({ opacity: 0, translateY: motion.riseDistance });
  });

  it('MOTION-03: touch feedback stays subtle', () => {
    expect(motion.pressScale).toBeGreaterThanOrEqual(0.95);
    expect(motion.pressScale).toBeLessThan(1);
  });

  it('MOTION-04: an entrance animates only when motion is allowed; otherwise it snaps to the final state', () => {
    expect(entranceAction(false)).toBe('animate');
    expect(entranceAction(true)).toBe('snap');
  });
});
