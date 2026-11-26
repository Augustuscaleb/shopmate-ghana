/**
 * App-level kit pieces for the redesigned screens (Stage 1C-3.3): the bottom tab bar, the brand
 * mark, the search field, the stock badge, a "Notice" banner, and the confirmation helper.
 * Same rules as the rest of the kit: v2 tokens only, the system font, no text-scaling cap.
 */
import type { ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { PressableScale } from '../animated';
import { NAV_BAR_ALLOWANCE } from '../layout';
import { STOCK_STATE_STYLE, stockState, type StockState } from '../stockStatus';
import { AppText } from './AppText';
import { SearchIcon, type Icon } from './icons';
import { StatusBadge, type StatusTone } from './surfaces';
import { color, control, radius, space, text } from './tokens';

/* ───────── Tab bar ───────── */

export type TabItem<K extends string> = { key: K; label: string; icon: Icon; spokenLabel?: string };

/**
 * The bottom tab bar (spec 08 §6.3): an icon and a word on every tab, the selected tab in green
 * with a tinted pill. NO text-scaling cap: at large text sizes the labels wrap to two lines and
 * the bar grows taller (owner requirement; plan 1C-3.4 item brought forward).
 */
export function TabBar<K extends string>({ items, selected, onChange }: { items: readonly TabItem<K>[]; selected: K; onChange: (k: K) => void }) {
  return (
    <View style={styles.tabBar} accessibilityRole="tablist">
      {items.map((t) => {
        const on = t.key === selected;
        const Glyph = t.icon;
        return (
          <PressableScale key={t.key} accessibilityRole="tab" accessibilityLabel={t.spokenLabel ?? t.label} accessibilityState={{ selected: on }}
            onPress={() => onChange(t.key)} style={styles.tab}>
            <View style={[styles.tabPill, on && styles.tabPillOn]}>
              <Glyph colour={on ? color.brand : color.textSecondary} size={22} />
            </View>
            <AppText variant="caption" tone={on ? 'brand' : 'textSecondary'} align="center" style={on ? styles.tabLabelOn : styles.tabLabel}>{t.label}</AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

/* ───────── Brand mark ───────── */

/**
 * The ShopMate mark drawn as shapes (spec 08 §7: no letter, so no text-scaling exception): a
 * Market Gold tile holding a deep-green shopping bag. The word mark beside it is ordinary,
 * fully scalable text.
 */
export function BrandMark({ size = 32 }: { size?: number }) {
  const s = Math.max(1.5, size / 16);
  return (
    <View accessible={false} style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.3, height: size * 0.2, borderTopLeftRadius: size, borderTopRightRadius: size, borderWidth: s, borderBottomWidth: 0, borderColor: color.brandPressed, marginBottom: -s / 2 }} />
      <View style={{ width: size * 0.56, height: size * 0.4, borderRadius: s * 1.5, backgroundColor: color.brandPressed }} />
    </View>
  );
}

export function Brand() {
  return (
    <View style={styles.brand} accessible accessibilityRole="header" accessibilityLabel="ShopMate Ghana">
      <BrandMark />
      <AppText variant="label" style={styles.brandText}>ShopMate <AppText variant="label" tone="brand">Ghana</AppText></AppText>
    </View>
  );
}

/* ───────── Search ───────── */

export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (t: string) => void; placeholder: string }) {
  return (
    <View style={styles.search}>
      <SearchIcon colour={color.textSecondary} size={20} />
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={color.textSecondary}
        accessibilityLabel={placeholder} autoCorrect={false} returnKeyType="search" style={styles.searchInput} />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChangeText('')} hitSlop={6} style={styles.clear}>
          <AppText variant="label" tone="brand">Clear</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ───────── Stock badge ───────── */

const STOCK_TONE: Record<StockState, StatusTone> = { ok: 'success', low: 'warning', out: 'danger', negative: 'danger' };

/** "12 sachets · Low": the stock state as a word and a colour (owner decision D-6). */
export function StockBadge({ qty, lowStockLevel, unit }: { qty: number; lowStockLevel: number; unit?: string | null }) {
  const state = stockState(qty, lowStockLevel);
  const amount = `${qty.toLocaleString('en-GB')}${unit ? ` ${unit}` : ''}`;
  return <StatusBadge label={`${amount} · ${STOCK_STATE_STYLE[state].label}`} tone={STOCK_TONE[state]} />;
}

export function stockTone(qty: number, lowStockLevel: number): StatusTone {
  return STOCK_TONE[stockState(qty, lowStockLevel)];
}

/* ───────── Notice ───────── */

/** A quiet note inside a screen (not a full-width banner): info, success or error. */
export function Notice({ text: message, tone = 'info' }: { text: string; tone?: 'info' | 'success' | 'error' | 'warning' }) {
  const fg = tone === 'error' ? 'danger' : tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : 'textPrimary';
  const bg = tone === 'error' ? color.dangerBg : tone === 'success' ? color.successBg : tone === 'warning' ? color.warningBg : color.infoBg;
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityLiveRegion="polite">
      <AppText variant="body" tone={fg}>{message}</AppText>
    </View>
  );
}

/* ───────── Confirmation ───────── */

/**
 * Asks before an action that is destructive, hard to undo or financially consequential (archive,
 * a cost correction that changes stock value, later: voids and deletions). Ordinary navigation,
 * viewing, opening forms and harmless, reversible actions (restore) are NOT confirmed.
 */
export function confirmAction({ title, message, confirmLabel, destructive = false, onConfirm }: {
  title: string; message: string; confirmLabel: string; destructive?: boolean; onConfirm: () => void;
}) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

/** Centred column with the maximum content width, for screens that build their own scroll. */
export function Column({ children, width = 720 }: { children: ReactNode; width?: number }) {
  return <View style={[styles.column, { maxWidth: width }]}>{children}</View>;
}

const styles = StyleSheet.create({
  tabBar: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: color.surface, borderTopWidth: control.hairline, borderTopColor: color.divider, paddingTop: space.xxs, paddingBottom: NAV_BAR_ALLOWANCE, paddingHorizontal: space.xxs },
  tab: { flex: 1, alignItems: 'center', minHeight: 56, paddingVertical: 2, gap: 2 },
  tabPill: { width: 52, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tabPillOn: { backgroundColor: color.successBg },
  tabLabel: { fontWeight: '500' },
  tabLabelOn: { fontWeight: '700' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  brandText: { flexShrink: 1 },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 52, backgroundColor: color.surface, borderRadius: radius.md, borderWidth: control.hairline, borderColor: color.controlBorder, paddingHorizontal: space.sm },
  searchInput: { flex: 1, ...text.body, color: color.textPrimary, minHeight: 48 },
  clear: { minHeight: 48, justifyContent: 'center', paddingLeft: space.xs },
  notice: { borderRadius: radius.md, padding: space.md },
  column: { width: '100%', alignSelf: 'center', gap: space.md },
});
