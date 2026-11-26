/**
 * Feedback and loading (spec 08 §5.3, §8, §10): bottom Sheet, Toast and Skeleton variants.
 * - Sheet: 20 dp top corners and a grab handle; height-limited and scrollable; never focuses a
 *   field by itself — the proven iPhone price-sheet fix (QPS-D1 – D6), as a reusable component.
 * - Toast: a short success message that fades in and out; under Reduce Motion it simply appears
 *   and disappears. Announced to screen readers.
 * - Skeletons: shaped like the content; they pulse slowly, and are static under Reduce Motion.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Skeleton } from '../animated';
import { duration, motion } from '../motion';
import { useReducedMotion } from '../useReducedMotion';
import { AppText } from './AppText';
import { IconButton } from './controls';
import { CheckIcon, CloseIcon } from './icons';
import { color, control, radius, space } from './tokens';

export function Sheet({ visible, title, subtitle, onClose, children }: {
  visible: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode;
}) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={onClose} />
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" bounces={false}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View style={styles.flex}>
                <AppText variant="title" accessibilityRole="header">{title}</AppText>
                {subtitle ? <AppText variant="body" tone="textSecondary">{subtitle}</AppText> : null}
              </View>
              <IconButton icon={CloseIcon} label="Close" onPress={onClose} />
            </View>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Shows one toast at a time: `show("Milo sachet saved")`, and render `toast` once on the screen. */
export function useToast(): { show: (message: string) => void; toast: ReactNode } {
  const [message, setMessage] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const show = useCallback((m: string) => { setMessage(m); setKey((k) => k + 1); }, []);
  return { show, toast: message ? <Toast key={key} message={message} onDone={() => setMessage(null)} /> : null };
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    const seq = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: duration(motion.emphasis, reduced), useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(opacity, { toValue: 0, duration: duration(motion.standard, reduced), useNativeDriver: true }),
    ]);
    seq.start(({ finished }) => { if (finished) onDone(); });
    return () => seq.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { opacity }]} accessibilityLiveRegion="polite" accessible accessibilityLabel={message}>
      <View style={styles.toastTick}><CheckIcon colour={color.onBrand} size={16} /></View>
      <AppText variant="label" tone="onBrand" style={styles.flex}>{message}</AppText>
    </Animated.View>
  );
}

/** Text lines of placeholder. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <View style={styles.gapXs} accessible accessibilityLabel="Loading">
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} height={14} />)}
    </View>
  );
}

/** A list row of placeholder (title, secondary line, value). */
export function SkeletonRow() {
  return (
    <View style={styles.skelRow} accessible accessibilityLabel="Loading">
      <View style={[styles.flex, styles.gapXs]}>
        <Skeleton width="65%" height={16} />
        <Skeleton width="40%" height={14} />
      </View>
      <Skeleton width={64} height={20} />
    </View>
  );
}

/** A figure card of placeholder. */
export function SkeletonStat() {
  return (
    <View style={styles.skelStat} accessible accessibilityLabel="Loading">
      <Skeleton width="50%" height={14} />
      <Skeleton width="70%" height={26} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gapXs: { gap: space.xs },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: color.scrim },
  sheet: { backgroundColor: color.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, maxHeight: '100%', overflow: 'hidden' },
  sheetContent: { paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.xl + space.md, gap: space.md },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: color.divider, marginBottom: space.xxs },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, marginRight: -space.xs },
  toast: { position: 'absolute', left: space.md, right: space.md, bottom: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: color.textPrimary, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  toastTick: { width: 24, height: 24, borderRadius: 12, backgroundColor: color.brand, alignItems: 'center', justifyContent: 'center' },
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, backgroundColor: color.surface, borderRadius: radius.md, borderWidth: control.hairline, borderColor: color.divider },
  skelStat: { gap: space.xs, padding: space.md, backgroundColor: color.surface, borderRadius: radius.md, borderWidth: control.hairline, borderColor: color.divider },
});
