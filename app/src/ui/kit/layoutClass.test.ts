import { describe, expect, it } from 'vitest';
import { BREAKPOINTS, allowsTwoPanes, figuresPerRow, isShort, layoutClass, widthClass } from './layoutClass';

describe('Layout classes (plan §6.1; provisional breakpoints)', () => {
  it('LAY-01: width classes: compact < 600, medium 600 – 839, expanded ≥ 840', () => {
    expect(widthClass(599)).toBe('compact');
    expect(widthClass(600)).toBe('medium');
    expect(widthClass(839)).toBe('medium');
    expect(widthClass(840)).toBe('expanded');
  });

  it('LAY-02: short is a height below 480 dp; 480 and above is not', () => {
    expect(isShort(479)).toBe(true);
    expect(isShort(480)).toBe(false);
  });

  it('LAY-03: the reference phones in both orientations', () => {
    // Galaxy A06 about 360 × 800; iPhone 13 Pro Max 428 × 926
    expect(layoutClass(360, 800)).toMatchObject({ width: 'compact', short: false, orientation: 'portrait' });
    expect(layoutClass(800, 360)).toMatchObject({ width: 'medium', short: true, orientation: 'landscape' });
    expect(layoutClass(428, 926)).toMatchObject({ width: 'compact', short: false, orientation: 'portrait' });
    expect(layoutClass(926, 428)).toMatchObject({ width: 'expanded', short: true, orientation: 'landscape' });
  });

  it('LAY-04: the class changes when width and height swap on rotation', () => {
    const portrait = layoutClass(428, 926);
    const landscape = layoutClass(926, 428);
    expect(portrait.width).not.toBe(landscape.width);
    expect(portrait.short).not.toBe(landscape.short);
  });

  it('LAY-05: a wide but short screen gets two panes only if each pane scrolls', () => {
    const wideShort = layoutClass(926, 428);
    expect(allowsTwoPanes(wideShort)).toBe(false);
    expect(allowsTwoPanes(wideShort, { panesScroll: true })).toBe(true);
    expect(allowsTwoPanes(layoutClass(1024, 768))).toBe(true);   // tablet landscape
    expect(allowsTwoPanes(layoutClass(800, 1280))).toBe(false);  // medium
  });

  it('LAY-06: side-by-side figures stack on a compact screen at large text', () => {
    const phone = layoutClass(360, 800);
    expect(figuresPerRow(phone, 1)).toBe(2);
    expect(figuresPerRow(phone, 1.3)).toBe(1);
    expect(figuresPerRow(layoutClass(800, 1280), 1)).toBe(4);
  });

  it('LAY-07: the breakpoints live in one constant and invalid sizes are refused', () => {
    expect(BREAKPOINTS).toEqual({ medium: 600, expanded: 840, shortHeight: 480, minListPane: 320 });
    expect(() => layoutClass(0, 100)).toThrow();
    expect(() => layoutClass(Number.NaN, 100)).toThrow();
  });
});
