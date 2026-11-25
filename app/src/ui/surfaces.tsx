/**
 * Shared surfaces and states for Stage 1C-2 screens (visual design §6, spec 08): 12 dp cards with a
 * 1 dp Sand border and no elevation; status always with a word; plain taps only; 48 dp targets.
 */
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { colours, radius, space, touch, type } from './theme';
import { TOP_INSET } from './layout';
import { ChevronLeftIcon, SearchIcon } from './icons';
import { FadeIn, PressableScale, Skeleton } from './animated';
import { STOCK_STATE_STYLE, stockState } from './stockStatus';
import { duration, motion } from './motion';
import { useReducedMotion } from './useReducedMotion';

type IconType = ComponentType<{ colour: string; size?: number }>;

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Green header for screens inside a tab, with Back top-left (08 §8 "Back is always top-left"). */
export function ScreenHeader({ title, subtitle, onBack, children }: {
  title: string; subtitle?: string; onBack?: () => void; children?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={8}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <ChevronLeftIcon colour={colours.surface} size={20} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      ) : null}
      <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={2}>{title}</Text>
      {subtitle ? <Text style={styles.headerSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

/** Stock state chip (D-6): colour + word, e.g. "12 · Low". */
export function StockChip({ qty, lowStockLevel, unit }: { qty: number; lowStockLevel: number; unit?: string | null }) {
  const s = STOCK_STATE_STYLE[stockState(qty, lowStockLevel)];
  const amount = `${qty.toLocaleString('en-GB')}${unit ? ` ${unit}` : ''}`;
  return (
    <View style={[styles.chip, { backgroundColor: s.background }]} accessible accessibilityLabel={`Stock ${amount}, ${s.label}`}>
      <View style={[styles.chipDot, { backgroundColor: s.text }]} />
      <Text style={[styles.chipText, { color: s.text }]} numberOfLines={1}>{amount} · {s.label}</Text>
    </View>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: IconType; title: string; body: string; action?: ReactNode }) {
  return (
    <FadeIn>
      <View style={styles.empty}>
        <View style={styles.emptyIcon}><Icon colour={colours.shopGreen} size={30} /></View>
        <Text style={styles.emptyTitle} accessibilityRole="header">{title}</Text>
        <Text style={styles.emptyBody}>{body}</Text>
        {action}
      </View>
    </FadeIn>
  );
}

export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (t: string) => void; placeholder: string }) {
  return (
    <View style={styles.search}>
      <SearchIcon colour={colours.stone} size={20} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colours.stone}
        accessibilityLabel={placeholder}
        autoCorrect={false}
        returnKeyType="search"
        style={styles.searchInput}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChangeText('')} hitSlop={8} style={styles.clear}>
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A filter or option chip: selected state shown with a tick and colour (never colour alone). */
export function FilterChip({ label, selected, onPress, icon: Icon }: { label: string; selected: boolean; onPress: () => void; icon?: IconType }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.filter, selected && styles.filterSelected]}
    >
      {Icon ? <Icon colour={selected ? colours.surface : colours.shopGreen} size={18} /> : null}
      <Text style={[styles.filterText, selected && styles.filterTextSelected]} numberOfLines={1}>{selected ? '✓ ' : ''}{label}</Text>
    </PressableScale>
  );
}

/** Grey offline bar (08 §5 banners) with a way to check again; online-only actions stay disabled. */
export function OfflineBar({ onCheck }: { onCheck: () => void }) {
  return (
    <View style={styles.offline} accessibilityLiveRegion="polite">
      <Text style={styles.offlineText}>You're offline. Saving changes needs internet; your typing is kept.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Check connection" onPress={onCheck} hitSlop={6} style={styles.offlineButton}>
        <Text style={styles.offlineButtonText}>Check again</Text>
      </Pressable>
    </View>
  );
}

/** Placeholder rows while a list loads. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View style={{ gap: space.sm }} accessible accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[styles.card, styles.skeletonRow]}>
          <View style={{ flex: 1, gap: space.sm }}>
            <Skeleton width="60%" height={18} />
            <Skeleton width="35%" height={14} />
          </View>
          <Skeleton width={72} height={26} rounded={radius.pill} />
        </View>
      ))}
    </View>
  );
}

/**
 * Success feedback: a short tint flash card with a check mark that fades out after a moment
 * (visual design §4). Under reduced motion it simply appears and disappears.
 */
export function SuccessFlash({ message, onDone }: { message: string | null; onDone: () => void }) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    setShown(message);
    opacity.setValue(reduced ? 1 : 0);
    const seq = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: duration(motion.emphasis, reduced), useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(opacity, { toValue: 0, duration: duration(motion.standard, reduced), useNativeDriver: true }),
    ]);
    seq.start(({ finished }) => { if (finished) { setShown(null); onDone(); } });
    return () => seq.stop();
  }, [message]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null;
  return (
    <Animated.View style={[styles.success, { opacity }]} accessibilityLiveRegion="polite" accessible accessibilityLabel={shown}>
      <Text style={styles.successTick}>✓</Text>
      <Text style={styles.successText}>{shown}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  card: { backgroundColor: colours.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colours.sand },
  header: { backgroundColor: colours.shopGreen, paddingTop: TOP_INSET + space.md, paddingHorizontal: space.md, paddingBottom: space.lg, gap: space.xs, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  back: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: touch.min, alignSelf: 'flex-start', paddingRight: space.md, marginLeft: -space.xs },
  backText: { color: colours.surface, fontSize: type.body, fontWeight: '700' },
  headerTitle: { color: colours.surface, fontSize: type.title + 4, fontWeight: '800' },
  headerSubtitle: { color: colours.onGreenMuted, fontSize: type.body },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: space.sm + 2, paddingVertical: 4, alignSelf: 'flex-start', maxWidth: '100%' },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: type.caption, fontWeight: '700', fontVariant: ['tabular-nums'] },
  empty: { alignItems: 'center', padding: space.lg, gap: space.sm },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colours.tint, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  emptyTitle: { fontSize: type.section, fontWeight: '800', color: colours.ink, textAlign: 'center' },
  emptyBody: { fontSize: type.body, color: colours.stone, textAlign: 'center', lineHeight: 23 },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: touch.min + 4, backgroundColor: colours.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colours.sand, paddingHorizontal: space.md },
  searchInput: { flex: 1, fontSize: type.body + 1, color: colours.ink, minHeight: touch.min },
  clear: { minHeight: touch.min, justifyContent: 'center', paddingLeft: space.sm },
  clearText: { color: colours.shopGreen, fontWeight: '700', fontSize: type.body },
  filter: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: touch.min - 4, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colours.sand, backgroundColor: colours.surface },
  filterSelected: { backgroundColor: colours.shopGreen, borderColor: colours.shopGreen },
  filterText: { fontSize: type.caption + 1, color: colours.ink, fontWeight: '600' },
  filterTextSelected: { color: colours.surface, fontWeight: '800' },
  offline: { backgroundColor: '#EDECEA', borderRadius: radius.md, padding: space.md, borderLeftWidth: 4, borderLeftColor: colours.neutral, gap: space.xs },
  offlineText: { fontSize: type.body, color: colours.ink },
  offlineButton: { minHeight: touch.min, justifyContent: 'center', alignSelf: 'flex-start' },
  offlineButtonText: { color: colours.shopGreen, fontWeight: '800', fontSize: type.body },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', padding: space.md, gap: space.md },
  success: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colours.tint, borderRadius: radius.md, borderWidth: 1, borderColor: '#B9DFC9', padding: space.md },
  successTick: { fontSize: type.section, color: colours.ok, fontWeight: '900' },
  successText: { flex: 1, fontSize: type.body, color: colours.ink, fontWeight: '700' },
});
