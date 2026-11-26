/**
 * Surfaces and content blocks (spec 08 §5.3): Card, ListRow, StatusBadge, Chip, Banner, Stat,
 * SectionHeader, EmptyState, Divider and UpdatedLine. Depth is shown by tone and a hairline
 * border, never shadows (cheap to draw on the Galaxy A06). Status always has a word, never colour
 * alone. Everything wraps and grows at large text sizes; nothing is cut off.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { PressableScale } from '../animated';
import { AppText } from './AppText';
import { TextAction } from './controls';
import { AlertIcon, CheckIcon, InfoIcon, type Icon } from './icons';
import { color, control, radius, space, type ColorRole } from './tokens';

export function Card({ children, onPress, accessibilityLabel, padded = true, style }: {
  children: ReactNode; onPress?: () => void; accessibilityLabel?: string; padded?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const body = [styles.card, padded && styles.cardPadded, style];
  if (!onPress) return <View style={body}>{children}</View>;
  return <PressableScale accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={body}>{children}</PressableScale>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';
const TONE: Record<StatusTone, { fg: ColorRole; bg: ColorRole }> = {
  success: { fg: 'success', bg: 'successBg' },
  warning: { fg: 'warning', bg: 'warningBg' },
  danger: { fg: 'danger', bg: 'dangerBg' },
  neutral: { fg: 'neutral', bg: 'neutralBg' },
  info: { fg: 'info', bg: 'infoBg' },
};

/** A dot plus a word in the role colour, e.g. "In stock", "Low", "Out of stock", "Archived". */
export function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  const t = TONE[tone];
  return (
    <View style={[styles.badge, { backgroundColor: color[t.bg] }]} accessible accessibilityLabel={label}>
      <View style={[styles.dot, { backgroundColor: color[t.fg] }]} />
      <AppText variant="caption" tone={t.fg} style={styles.badgeText}>{label}</AppText>
    </View>
  );
}

/** Filter and choice chips: a tick and a tint when selected (never colour alone). */
export function Chip({ label, selected, onPress, icon: Glyph }: { label: string; selected: boolean; onPress: () => void; icon?: Icon }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label} onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }} style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}>
      {selected ? <CheckIcon colour={color.brand} size={16} /> : Glyph ? <Glyph colour={color.textSecondary} size={16} /> : null}
      <AppText variant="caption" tone={selected ? 'brand' : 'textPrimary'} style={selected ? styles.chipTextSelected : styles.chipText}>{label}</AppText>
    </PressableScale>
  );
}

export type BannerTone = 'offline' | 'warning' | 'danger' | 'info' | 'success';
const BANNER: Record<BannerTone, { fg: ColorRole; bg: ColorRole; icon: Icon }> = {
  offline: { fg: 'neutral', bg: 'neutralBg', icon: InfoIcon },
  warning: { fg: 'warning', bg: 'warningBg', icon: AlertIcon },
  danger: { fg: 'danger', bg: 'dangerBg', icon: AlertIcon },
  info: { fg: 'info', bg: 'infoBg', icon: InfoIcon },
  success: { fg: 'success', bg: 'successBg', icon: CheckIcon },
};

/** Full-width message under the header: grey offline, amber warning or "couldn't refresh", red failure. */
export function Banner({ tone, title, message, action }: { tone: BannerTone; title?: string; message: string; action?: { label: string; onPress: () => void } }) {
  const b = BANNER[tone];
  const Glyph = b.icon;
  return (
    <View style={[styles.banner, { backgroundColor: color[b.bg], borderLeftColor: color[b.fg] }]} accessibilityLiveRegion="polite">
      <Glyph colour={color[b.fg]} size={20} />
      <View style={styles.bannerBody}>
        {title ? <AppText variant="label" tone={b.fg}>{title}</AppText> : null}
        <AppText variant="body">{message}</AppText>
        {action ? <TextAction label={action.label} onPress={action.onPress} /> : null}
      </View>
    </View>
  );
}

/** A label above a figure, e.g. "In stock / 24 sachets". */
export function Stat({ label, value, detail, tone = 'textPrimary', detailTone = 'textSecondary', help }: {
  label: string; value: string; detail?: string; tone?: ColorRole; detailTone?: ColorRole; help?: ReactNode;
}) {
  return (
    <View style={styles.stat}>
      <View style={styles.statLabel}>
        <AppText variant="caption" tone="textSecondary" style={styles.flexShrink}>{label}</AppText>
        {help}
      </View>
      <View accessible accessibilityLabel={[label, value, detail].filter(Boolean).join('. ')}>
        <AppText variant="displaySmall" tone={tone} number>{value}</AppText>
        {detail ? <AppText variant="caption" tone={detailTone}>{detail}</AppText> : null}
      </View>
    </View>
  );
}

/**
 * One tappable row (spec 08 §5.3): a title, a secondary line, a right-hand value, a badge and an
 * optional quiet action. At large text sizes the value moves under the title instead of
 * squeezing it.
 */
export function ListRow({ title, subtitle, value, badge, onPress, action, accessibilityLabel }: {
  title: string; subtitle?: string; value?: string; badge?: ReactNode; onPress?: () => void;
  action?: { label: string; onPress: () => void; accessibilityLabel?: string; disabled?: boolean }; accessibilityLabel?: string;
}) {
  const { fontScale } = useWindowDimensions();
  const stack = fontScale >= 1.5;
  const main = (
    <View style={[styles.rowMain, stack && styles.rowStacked]}>
      <View style={styles.rowText}>
        <AppText variant="label">{title}</AppText>
        {subtitle ? <AppText variant="caption" tone="textSecondary">{subtitle}</AppText> : null}
        {badge}
      </View>
      {value ? <AppText variant="heading" number align={stack ? undefined : 'right'}>{value}</AppText> : null}
    </View>
  );
  return (
    <View style={styles.row}>
      {onPress ? (
        <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', ')}
          onPress={onPress} style={({ pressed }) => [pressed && styles.rowPressed]}>
          {main}
        </Pressable>
      ) : main}
      {action ? (
        <View style={styles.rowAction}>
          <TextAction label={action.label} onPress={action.onPress} accessibilityLabel={action.accessibilityLabel} disabled={action.disabled} />
        </View>
      ) : null}
    </View>
  );
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.section}>
      <View style={styles.flexShrink}>
        <AppText variant="heading" accessibilityRole="header">{title}</AppText>
        {subtitle ? <AppText variant="caption" tone="textSecondary">{subtitle}</AppText> : null}
      </View>
      {action ? <TextAction label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

/** An icon in a tinted circle, a title, one sentence, and one action where useful. */
export function EmptyState({ icon: Glyph, title, body, action }: { icon: Icon; title: string; body: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Glyph colour={color.brand} size={28} /></View>
      <AppText variant="heading" align="center" accessibilityRole="header">{title}</AppText>
      <AppText variant="body" tone="textSecondary" align="center">{body}</AppText>
      {action}
    </View>
  );
}

/** "Updated 10:42", or "Last updated 10:42 · couldn't refresh" with Try again (spec 08 §5.3). */
export function UpdatedLine({ label, failed, onRetry }: { label: string; failed: boolean; onRetry?: () => void }) {
  return (
    <View style={styles.updated} accessibilityLiveRegion={failed ? 'polite' : 'none'}>
      <AppText variant="caption" tone={failed ? 'warning' : 'textSecondary'} style={styles.flexShrink}>{label}</AppText>
      {failed && onRetry ? <TextAction label="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.surface, borderRadius: radius.md, borderWidth: control.hairline, borderColor: color.divider },
  cardPadded: { padding: space.md, gap: space.sm },
  divider: { height: control.hairline, backgroundColor: color.divider },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: space.xs + 2, paddingVertical: 3, maxWidth: '100%' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { fontWeight: '600', flexShrink: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: space.sm + 2, paddingVertical: space.xxs, borderRadius: radius.pill, borderWidth: control.hairline, maxWidth: '100%' },
  chipIdle: { backgroundColor: color.surface, borderColor: color.controlBorder },
  chipSelected: { backgroundColor: color.successBg, borderColor: color.brand },
  chipText: { fontWeight: '500', flexShrink: 1 },
  chipTextSelected: { fontWeight: '700', flexShrink: 1 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, borderRadius: radius.md, borderLeftWidth: 4, padding: space.md },
  bannerBody: { flex: 1, gap: 2 },
  stat: { gap: space.xxs },
  statLabel: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, minHeight: 24 },
  flexShrink: { flexShrink: 1 },
  row: { backgroundColor: color.surface },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 56 },
  rowStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: space.xxs },
  rowText: { flex: 1, gap: 2, alignSelf: 'stretch' },
  rowPressed: { backgroundColor: color.bg },
  rowAction: { borderTopWidth: control.hairline, borderTopColor: color.divider, paddingHorizontal: space.sm },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, flexWrap: 'wrap' },
  empty: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg, paddingHorizontal: space.md },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: color.successBg, alignItems: 'center', justifyContent: 'center', marginBottom: space.xxs },
  updated: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: space.xs },
});
