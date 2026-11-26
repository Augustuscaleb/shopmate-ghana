/**
 * Text field (spec 08 §5.3): label above, hint below, error below in red with an icon. Money
 * fields show a "GH₵" prefix inside the field. Outline `controlBorder` (V-3, 3:1 contrast);
 * focused outline `brand`, 2 dp. A field never focuses itself (no autoFocus), so the keyboard
 * can't open on its own and push a sheet out of view (the proven iPhone fix). Typed text is never
 * cleared by an error (E-03).
 */
import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { AppText } from './AppText';
import { AlertIcon } from './icons';
import { color, control, radius, space, text } from './tokens';

export type TextFieldProps = Omit<TextInputProps, 'style' | 'autoFocus' | 'maxFontSizeMultiplier' | 'allowFontScaling' | 'editable'> & {
  label: string;
  hint?: string;
  error?: string;
  /** "GH₵" for money fields. */
  prefix?: string;
  disabled?: boolean;
};

export function TextField({ label, hint, error, prefix, disabled = false, onFocus, onBlur, ...input }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const outline = error ? styles.outlineError : focused ? styles.outlineFocused : styles.outline;
  return (
    <View style={styles.field}>
      <AppText variant="label">{label}</AppText>
      <View style={[styles.box, outline, disabled && styles.disabled]}>
        {prefix ? <AppText variant="label" tone="textSecondary" style={styles.prefix}>{prefix}</AppText> : null}
        <TextInput
          {...input}
          editable={!disabled}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          accessibilityState={{ disabled }}
          placeholderTextColor={color.textSecondary}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          style={styles.input}
        />
      </View>
      {error ? (
        <View style={styles.message} accessibilityLiveRegion="polite">
          <AlertIcon colour={color.danger} size={18} />
          <AppText variant="caption" tone="danger" style={styles.flex}>{error}</AppText>
        </View>
      ) : hint ? <AppText variant="caption" tone="textSecondary">{hint}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  // The outline width changes on focus; padding compensates so the text doesn't jump
  box: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderRadius: radius.sm, backgroundColor: color.surface, paddingHorizontal: space.sm },
  outline: { borderWidth: control.hairline, borderColor: color.controlBorder, padding: control.focusRing - control.hairline },
  outlineFocused: { borderWidth: control.focusRing, borderColor: color.brand },
  outlineError: { borderWidth: control.focusRing, borderColor: color.danger },
  disabled: { opacity: 0.5, backgroundColor: color.bg },
  prefix: { marginRight: space.xs },
  input: { flex: 1, ...text.body, color: color.textPrimary, paddingVertical: space.sm, minHeight: 48 },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xxs },
  flex: { flex: 1 },
});
