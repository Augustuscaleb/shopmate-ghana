import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { colours, space, touch, type } from './theme';

/** Screen wrapper: scrollable, keyboard-aware, warm-white background. */
export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type ButtonProps = { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; kind?: 'primary' | 'secondary' | 'link' };

/** One big primary action per screen (D-08); 56 dp primary, 48 dp minimum touch target. */
export function Button({ label, onPress, busy = false, disabled = false, kind = 'primary' }: ButtonProps) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        kind === 'primary' ? styles.primary : kind === 'secondary' ? styles.secondary : styles.link,
        pressed && !inactive && (kind === 'primary' ? styles.primaryPressed : styles.pressed),
        inactive && styles.inactive,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={kind === 'primary' ? colours.surface : colours.shopGreen} />
      ) : (
        <Text style={kind === 'primary' ? styles.primaryText : styles.secondaryText}>{label}</Text>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & { label: string; error?: string; hint?: string; password?: boolean };

/** Labelled text field with inline error (E-03: input never cleared by errors). */
export function Field({ label, error, hint, password = false, ...input }: FieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          {...input}
          accessibilityLabel={label}
          secureTextEntry={password && !visible}
          autoCorrect={false}
          placeholderTextColor={colours.stone}
          style={[styles.input, error ? styles.inputError : null]}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            onPress={() => setVisible((v) => !v)}
            style={styles.showButton}
          >
            <Text style={styles.showText}>{visible ? 'Hide' : 'Show'}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Choice chips with text (no colour-only meaning, D-06). */
export function Choice<T extends string>({ label, options, value, onChange, error }: {
  label: string; options: readonly { value: T; label: string }[]; value: T | ''; onChange: (v: T) => void; error?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choices}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={o.label}
              onPress={() => onChange(o.value)}
              style={[styles.choice, selected && styles.choiceSelected]}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{selected ? '✓ ' : ''}{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'error' | 'success' }) {
  const toneStyle = tone === 'error' ? styles.noticeError : tone === 'success' ? styles.noticeSuccess : styles.noticeInfo;
  return (
    <View style={[styles.notice, toneStyle]} accessibilityLiveRegion="polite">
      <Text style={[styles.noticeText, tone === 'error' && { color: colours.danger }]}>{text}</Text>
    </View>
  );
}

export function Loading({ message }: { message: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colours.shopGreen} />
      <Text style={styles.subtitle}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colours.warmWhite },
  screen: { padding: space.md, paddingTop: 56, gap: space.md },
  title: { fontSize: type.title + 4, fontWeight: '700', color: colours.shopGreen },
  subtitle: { fontSize: type.body, color: colours.stone },
  primary: { minHeight: touch.primaryButton, borderRadius: 12, backgroundColor: colours.shopGreen, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
  primaryPressed: { backgroundColor: colours.deepGreen },
  secondary: { minHeight: touch.primaryButton, borderRadius: 12, borderWidth: 2, borderColor: colours.shopGreen, backgroundColor: colours.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
  link: { minHeight: touch.min, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  inactive: { opacity: 0.5 },
  primaryText: { color: colours.surface, fontSize: type.body + 1, fontWeight: '700' },
  secondaryText: { color: colours.shopGreen, fontSize: type.body + 1, fontWeight: '700' },
  field: { gap: space.xs },
  label: { fontSize: type.body, fontWeight: '600', color: colours.ink },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, minHeight: touch.min + 4, borderWidth: 1, borderColor: colours.sand, borderRadius: 10, backgroundColor: colours.surface, paddingHorizontal: space.md, fontSize: type.body + 1, color: colours.ink },
  inputError: { borderColor: colours.danger, borderWidth: 2 },
  showButton: { minHeight: touch.min, minWidth: touch.min + 16, alignItems: 'center', justifyContent: 'center', marginLeft: space.sm },
  showText: { color: colours.shopGreen, fontWeight: '700', fontSize: type.body },
  error: { color: colours.danger, fontSize: type.caption + 1 },
  hint: { color: colours.stone, fontSize: type.caption },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choice: { minHeight: touch.min, paddingHorizontal: space.md, borderRadius: 24, borderWidth: 2, borderColor: colours.sand, backgroundColor: colours.surface, justifyContent: 'center' },
  choiceSelected: { borderColor: colours.shopGreen, backgroundColor: '#E3F3EA' },
  choiceText: { fontSize: type.body, color: colours.ink },
  choiceTextSelected: { color: colours.shopGreen, fontWeight: '700' },
  notice: { borderRadius: 10, padding: space.md },
  noticeInfo: { backgroundColor: colours.warnBg },
  noticeError: { backgroundColor: colours.dangerBg },
  noticeSuccess: { backgroundColor: '#E3F3EA' },
  noticeText: { fontSize: type.body, color: colours.ink },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, backgroundColor: colours.warmWhite },
});
