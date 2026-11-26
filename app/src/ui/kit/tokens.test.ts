import { describe, expect, it } from 'vitest';
import { color, control, controlHeight, legacy, MIN_TEXT_SIZE, text, touchTargetFor, type ControlLevel } from './tokens';
import { colours as v1 } from '../theme';
import { FAILING_PAIRS, KIT_PAIRS, contrastRatio, minimumFor, passes } from './contrast';

describe('Design tokens v2 (Stage 1C-3.2, spec 08 rev 2)', () => {
  it('TOK-01: the three V-3 colour corrections are in the colour roles', () => {
    expect(color.success).toBe('#166B3E');
    expect(color.controlBorder).toBe('#857E74');
    expect(color.headerBg).toBe('#EEF6F1');
  });

  it('TOK-02: every kit colour pair meets WCAG 2.1 AA (4.5:1 text, 3:1 controls)', () => {
    for (const p of KIT_PAIRS) {
      expect(contrastRatio(p.fg, p.bg), `${p.label}: ${contrastRatio(p.fg, p.bg)}`).toBeGreaterThanOrEqual(minimumFor(p.use));
    }
  });

  it('TOK-03: the known failing pairs really fail, so they are never used (spec 08 §3.3)', () => {
    for (const p of FAILING_PAIRS) expect(passes(p), p.label).toBe(false);
    expect(contrastRatio('#FFFFFF', '#F4B400')).toBeLessThan(2);
    expect(contrastRatio('#1E7F4F', '#E3F3EA')).toBeLessThan(4.5);
    expect(contrastRatio('#166B3E', '#E3F3EA')).toBeGreaterThanOrEqual(4.5);
  });

  it('TOK-04: the contrast calculation matches spec 08 §3.3 reference values', () => {
    expect(contrastRatio('#1C1B19', '#FFFFFF')).toBeCloseTo(17.2, 0);
    expect(contrastRatio('#FFFFFF', '#0B6B4F')).toBeCloseTo(6.5, 0);
    expect(contrastRatio('#E4DFD5', '#FFFFFF')).toBeCloseTo(1.33, 1);
  });

  it('TOK-05: no text style is smaller than the 14 sp caption; line heights leave room to wrap', () => {
    for (const [name, t] of Object.entries(text)) {
      expect(t.fontSize, name).toBeGreaterThanOrEqual(MIN_TEXT_SIZE);
      expect(t.lineHeight, name).toBeGreaterThan(t.fontSize);
    }
    expect(MIN_TEXT_SIZE).toBe(14);
  });

  it('TOK-06: the B-4 control hierarchy gets lighter from large to icon; every touch target is at least 48 dp', () => {
    const levels: ControlLevel[] = ['icon', 'text', 'medium', 'large'];
    for (const l of levels) expect(touchTargetFor(l), l).toBeGreaterThanOrEqual(48);
    expect(controlHeight('icon')).toBeLessThan(controlHeight('medium'));
    expect(controlHeight('medium')).toBeLessThan(controlHeight('large'));
    expect(control.large.minHeight).toBe(56); // the only 56 dp control (spec 08 §5.1)
    expect(control.icon.visible).toBeLessThan(control.touchTarget);
  });

  it('TOK-07: every v1 colour maps to a v2 role, so redesigned screens can move over mechanically', () => {
    for (const [oldName, role] of Object.entries(legacy)) {
      expect(Object.keys(v1), oldName).toContain(oldName);
      expect(Object.keys(color), role).toContain(role);
    }
  });

  it('TOK-08: the v1 tokens are unchanged, so no existing screen changes appearance in 1C-3.2', () => {
    expect(v1.shopGreen).toBe('#0B6B4F');
    expect(v1.ok).toBe('#1E7F4F');
    expect(v1.sand).toBe('#E4DFD5');
  });
});
