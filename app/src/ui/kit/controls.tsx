/**
 * Controls, on the owner's control hierarchy (decision B-4), lightest to heaviest:
 *  1. IconButton — compact, icon-only, ONLY where the meaning is universally clear (edit, close,
 *     add); it always has a spoken label. 40 dp visible, 48 dp touch target.
 *  2. TextAction — a small text action with no box, where an icon alone would be ambiguous.
 *  3. Button size "medium" — ordinary actions (48 dp).
 *  4. Button size "large" — a primary button for a genuinely important action only (56 dp).
 * Kinds (spec 08 §5.3): primary, secondary, quiet, destructive (always behind a confirmation).
 * States: normal, pressed (a 97 % press scale), disabled WITH a reason, busy.
 * Text never has a scaling cap: labels wrap and buttons grow taller at large text sizes.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { PressableScale } from '../animated';
import { AppText } from './AppText';
import { color, control, radius, space, type ColorRole } from './tokens';
import type { Icon } from './icons';

export type ButtonKind = 'primary' | 'secondary' | 'quiet' | 'destructive';

export function Button({ label, onPress, kind = 'primary', size = 'medium', icon: Glyph, busy = false, disabled = false, disabledReason, fullWidth = false }: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  /** "large" is for the one genuinely important action on a screen (B-4). */
  size?: 'medium' | 'large';
  icon?: Icon;
  busy?: boolean;
  disabled?: boolean;
  /** Shown under the button, and spoken, when it is disabled (spec 08: "disabled with a reason"). */
  disabledReason?: string;
  fullWidth?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const inactive = disabled || busy;
  const box = kind === 'primary'
    ? { backgroundColor: pressed && !inactive ? color.brandPressed : color.brand, borderColor: 'transparent' }
    : kind === 'secondary'
      ? { backgroundColor: pressed && !inactive ? color.successBg : color.surface, borderColor: color.brand }
      : kind === 'destructive'
        ? { backgroundColor: pressed && !inactive ? color.dangerBg : color.surface, borderColor: color.danger }
        : { backgroundColor: pressed && !inactive ? color.successBg : 'transparent', borderColor: 'transparent' };
  const tone: ColorRole = kind === 'primary' ? 'onBrand' : kind === 'destructive' ? 'danger' : 'brand';
  const dims = size === 'large' ? control.large : control.medium;
  return (
    <View style={[fullWidth ? styles.full : styles.auto, styles.gapXxs]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: inactive, busy }}
        accessibilityHint={disabled ? disabledReason : undefined}
        onPress={inactive ? undefined : onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        disabled={inactive}
        style={[styles.button, { minHeight: dims.minHeight, paddingHorizontal: dims.paddingX, borderRadius: dims.radius }, box,
          kind !== 'primary' && kind !== 'quiet' && styles.outlined, disabled && styles.disabled]}
      >
        {busy ? <ActivityIndicator color={color[tone]} /> : (
          <View style={styles.row}>
            {Glyph ? <Glyph colour={color[tone]} size={20} /> : null}
            <AppText variant="label" tone={tone} align="center" style={styles.shrink}>{label}</AppText>
          </View>
        )}
      </PressableScale>
      {disabled && disabledReason ? <AppText variant="caption" tone="textSecondary" align={fullWidth ? 'center' : undefined}>{disabledReason}</AppText> : null}
    </View>
  );
}

/** Level 2: a small text action, no box. 48 dp touch target. */
export function TextAction({ label, onPress, tone = 'brand', disabled = false, accessibilityLabel }: {
  label: string; onPress: () => void; tone?: 'brand' | 'danger'; disabled?: boolean; accessibilityLabel?: string;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress} hitSlop={{ left: 4, right: 4 }}
      style={({ pressed }) => [styles.textAction, pressed && !disabled && styles.pressed, disabled && styles.disabled]}>
      <AppText variant="label" tone={tone}>{label}</AppText>
    </Pressable>
  );
}

export type IconButtonTone = 'plain' | 'tonal' | 'header';

/** Level 1: a compact icon-only action. Only for universally clear icons; always a spoken label. */
export function IconButton({ icon: Glyph, label, onPress, tone = 'plain', disabled = false, disabledReason }: {
  icon: Icon; label: string; onPress: () => void; tone?: IconButtonTone; disabled?: boolean; disabledReason?: string;
}) {
  const circle = tone === 'tonal' ? styles.circleTonal : tone === 'header' ? styles.circleHeader : styles.circlePlain;
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
      accessibilityHint={disabled ? disabledReason : undefined} onPress={disabled ? undefined : onPress} disabled={disabled}
      style={[styles.iconTarget, disabled && styles.disabled]}>
      <View style={[styles.circle, circle]}>
        <Glyph colour={color.brand} size={control.icon.glyph} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  auto: { alignSelf: 'flex-start', maxWidth: '100%' },
  full: { alignSelf: 'stretch' },
  gapXxs: { gap: space.xxs },
  button: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xs, borderWidth: control.hairline },
  outlined: { borderWidth: 1.5 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, flexShrink: 1 },
  shrink: { flexShrink: 1 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.6 },
  textAction: { minHeight: control.text.minHeight, justifyContent: 'center', paddingHorizontal: control.text.paddingX, alignSelf: 'flex-start' },
  iconTarget: { width: control.touchTarget, height: control.touchTarget, alignItems: 'center', justifyContent: 'center' },
  circle: { width: control.icon.visible, height: control.icon.visible, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  circlePlain: { backgroundColor: 'transparent' },
  circleTonal: { backgroundColor: color.successBg },
  circleHeader: { backgroundColor: color.surface, borderWidth: control.hairline, borderColor: color.divider },
});
