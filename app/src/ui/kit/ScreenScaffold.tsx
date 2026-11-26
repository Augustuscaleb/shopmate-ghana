/**
 * Screen scaffold (spec 08 §5.3, §6): the light header (V-2: `headerBg` with an ink title; green
 * kept for actions), Back top-left (always with the word), an optional compact action top-right
 * (the B-3 pattern, e.g. the Edit pencil), the "Updated" line, banners, and a scrolling content
 * area with a maximum width, centred on wider screens. Padding follows the width class; on a
 * short (sideways) screen the header tightens. Text is never capped: titles wrap.
 */
import type { ReactElement, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native';
import { TOP_INSET } from '../layout';
import { AppText } from './AppText';
import { BackIcon } from './icons';
import { color, control, maxWidth, screenPadding, space } from './tokens';
import { useLayout } from './useLayout';

/** Back, always top-left and always with the word (spec 08 §5.2, §12). */
export function BackButton({ onPress, accessibilityLabel = 'Back' }: { onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} hitSlop={4}
      style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
      <BackIcon colour={color.brand} size={20} />
      <AppText variant="label" tone="brand">Back</AppText>
    </Pressable>
  );
}

export function ScreenHeader({ title, subtitle, onBack, action, children }: {
  title: string; subtitle?: string; onBack?: () => void; action?: ReactNode; children?: ReactNode;
}) {
  const layout = useLayout();
  const pad = screenPadding[layout.width];
  return (
    <View style={[styles.header, { paddingHorizontal: pad, paddingTop: TOP_INSET + (layout.short ? space.xxs : space.xs), paddingBottom: layout.short ? space.sm : space.md }]}>
      {onBack || action ? (
        <View style={styles.topRow}>
          {onBack ? <BackButton onPress={onBack} /> : <View />}
          {action}
        </View>
      ) : null}
      <AppText variant="title" accessibilityRole="header">{title}</AppText>
      {subtitle ? <AppText variant="body" tone="textSecondary">{subtitle}</AppText> : null}
      {children}
    </View>
  );
}

export function ScreenScaffold({ header, banners, children, width = 'content', footer, keyboard = false, refreshControl }: {
  header: ReactNode;
  banners?: ReactNode;
  children: ReactNode;
  /** "form" for forms and sheets (at most 640 dp); "content" for other screens (720 dp). */
  width?: 'content' | 'form';
  /** A bar under the content (e.g. Save on forms); with `keyboard` it stays above the keyboard. */
  footer?: ReactNode;
  /** A screen with fields: on iPhone the content and footer move up with the keyboard. */
  keyboard?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
}) {
  const layout = useLayout();
  const pad = screenPadding[layout.width];
  const body = (
    <>
      <ScrollView contentContainerStyle={[styles.scroll, { padding: pad }]} keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>
        <View style={[styles.column, { maxWidth: maxWidth[width] }]}>
          {banners}
          {children}
        </View>
      </ScrollView>
      {footer ? <View style={[styles.footer, { paddingHorizontal: pad }]}><View style={[styles.column, { maxWidth: maxWidth[width] }]}>{footer}</View></View> : null}
    </>
  );
  return (
    <View style={styles.root}>
      {header}
      {keyboard ? <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{body}</KeyboardAvoidingView> : body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  header: { backgroundColor: color.headerBg, gap: space.xxs, borderBottomWidth: control.hairline, borderBottomColor: color.divider },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: control.touchTarget },
  back: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, minHeight: control.touchTarget, paddingRight: space.sm, marginLeft: -space.xxs },
  pressed: { opacity: 0.6 },
  scroll: { paddingBottom: space.xxl, flexGrow: 1 },
  column: { width: '100%', alignSelf: 'center', gap: space.md },
  footer: { backgroundColor: color.surface, borderTopWidth: control.hairline, borderTopColor: color.divider, paddingVertical: space.sm },
});
