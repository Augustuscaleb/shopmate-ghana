import { useCallback, useEffect, useState, type ComponentType } from 'react';
import {
  BackHandler,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar as SystemStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Notice } from '../ui/components';
import { colours, space, touch, type } from '../ui/theme';
import { AlertIcon, BarsIcon, BoxIcon, ChevronLeftIcon, GridIcon, PlusIcon, ReceiptIcon } from '../ui/icons';
import type { Business, Device } from '../services/account';
import {
  firstName,
  formatCedis,
  formatDayLabel,
  formatTime,
  greetingFor,
  initials,
  type DashboardService,
  type RecentSale,
} from '../services/dashboard';
import {
  activityView,
  loadFailed,
  loadSucceeded,
  revenueAccessibilityLabel,
  revenueCaption,
  staleNotice,
  type ActivityView,
  type DashboardLoad,
} from './dashboardState';

/**
 * S-10 Today: the owner's business dashboard.
 *
 * Every figure is read from the owner's own shop data (DashboardService, read-only). Selling
 * (Stage 1D) and inventory (Stage 1C) are not built yet, so today the figures are genuinely zero
 * and the Sales, Stock and Reports tabs are honest previews of what is coming. Nothing here
 * records or changes business data.
 */

type Tab = 'dashboard' | 'sales' | 'stock' | 'reports';

const TOP_INSET = Platform.OS === 'android' ? (SystemStatusBar.currentHeight ?? 24) : 48;
/**
 * Android 16 draws apps edge to edge, under the system navigation bar, and React Native
 * cannot report that bar's height without a native safe-area library. 48 dp clears the
 * tallest standard bar (three-button navigation). Replace with real insets if a safe-area
 * library is added in a future native build.
 */
const NAV_BAR_ALLOWANCE = Platform.OS === 'android' ? 48 : 24;
const TINT = '#E3F3EA';

export function HomeScreen({ business, device, onSignOut, dashboard }: {
  business: Business;
  device: Device;
  onSignOut: () => void;
  dashboard: DashboardService;
}) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [accountOpen, setAccountOpen] = useState(false);
  const [load, setLoad] = useState<DashboardLoad>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const fetchOverview = useCallback(async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true);
    else setLoad({ kind: 'loading' });
    try {
      const data = await dashboard.fetchOverview(business.id);
      setLoad(loadSucceeded(data));
    } catch {
      // Keep figures that were already shown (with a notice); only show the error state when there are none
      setLoad(loadFailed);
    } finally {
      setRefreshing(false);
    }
  }, [dashboard, business.id]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  // Android back: close the account panel, then return to the dashboard, then leave the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (accountOpen) { setAccountOpen(false); return true; }
      if (tab !== 'dashboard') { setTab('dashboard'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [accountOpen, tab]);

  const ownerName = load.kind === 'ready' ? load.data.ownerName : null;

  if (accountOpen) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <AccountPanel business={business} device={device} ownerName={ownerName} onClose={() => setAccountOpen(false)} onSignOut={onSignOut} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={tab === 'dashboard'
          ? <RefreshControl refreshing={refreshing} onRefresh={() => fetchOverview(true)} colors={[colours.shopGreen]} progressViewOffset={TOP_INSET} />
          : undefined}
      >
        {tab === 'dashboard' ? (
          <Dashboard
            business={business}
            ownerName={ownerName}
            load={load}
            onRetry={() => fetchOverview(load.kind === 'ready')}
            onOpenAccount={() => setAccountOpen(true)}
            onNavigate={setTab}
          />
        ) : (
          <ComingSoon tab={tab} onBack={() => setTab('dashboard')} />
        )}
      </ScrollView>
      <BottomNav tab={tab} onChange={setTab} />
    </View>
  );
}

/* ───────────────────────── Dashboard ───────────────────────── */

function Dashboard({ business, ownerName, load, onRetry, onOpenAccount, onNavigate }: {
  business: Business;
  ownerName: string | null;
  load: DashboardLoad;
  onRetry: () => void;
  onOpenAccount: () => void;
  onNavigate: (tab: Tab) => void;
}) {
  const now = new Date();
  const name = firstName(ownerName);
  const data = load.kind === 'ready' ? load.data : null;
  const stale = staleNotice(load);
  const activity = activityView(load);
  const dash = '—';

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Brand />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Shop and account settings"
            onPress={onOpenAccount}
            style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
            hitSlop={8}
          >
            <Text style={styles.avatarText} maxFontSizeMultiplier={1.2}>{initials(ownerName, business.name)}</Text>
          </Pressable>
        </View>
        <Text style={styles.greeting}>{greetingFor(now)}{name ? `, ${name}` : ''}</Text>
        <Text style={styles.shopName} accessibilityRole="header" numberOfLines={2}>{business.name}</Text>
        <View style={styles.chips}>
          <Chip text={formatDayLabel(now)} />
          <Chip text={business.reference_code} />
          <Chip text="Pilot" gold />
        </View>
      </View>

      <View style={styles.overlap}>
        <View style={[styles.card, styles.revenueCard]} accessible accessibilityLabel={revenueAccessibilityLabel(load)}>
          <View style={styles.revenueAccent} />
          <View style={styles.revenueBody}>
            <Text style={styles.cardLabel}>TODAY'S REVENUE</Text>
            <Text style={styles.keyFigure}>{data ? formatCedis(data.todayRevenuePesewas) : dash}</Text>
            <Text style={styles.cardCaption}>
              {revenueCaption(load)}
            </Text>
          </View>
        </View>

        <View style={styles.statRow}>
          <Stat label="Sales today" value={data ? String(data.todaySalesCount) : dash} caption={data ? (data.todaySalesCount === 1 ? 'sale' : 'sales') : ' '} icon={ReceiptIcon} />
          <Stat label="Products" value={data ? String(data.productCount) : dash} caption={data ? (data.productCount === 0 ? 'none added yet' : 'in stock list') : ' '} icon={BoxIcon} />
          <Stat
            label="Low stock"
            value={data ? String(data.lowStockCount) : dash}
            caption={data ? (data.lowStockCount > 0 ? 'need restocking' : data.productCount === 0 ? 'nothing to track' : 'all good') : ' '}
            icon={AlertIcon}
            warn={!!data && data.lowStockCount > 0}
          />
        </View>

        {load.kind === 'error' || stale ? (
          <View style={styles.errorBlock}>
            <Notice tone="error" text={stale ?? "We couldn't load today's figures. Check your internet connection, then try again. Your account and shop are safe."} />
            <Button label="Try again" kind="secondary" onPress={onRetry} />
          </View>
        ) : null}

        <SectionTitle title="Quick actions" />
        <View style={styles.actions}>
          <Action label="Record a sale" caption="Coming in Stage 1D" icon={ReceiptIcon} primary onPress={() => onNavigate('sales')} />
          <Action label="View inventory" caption="Coming in Stage 1C" icon={BoxIcon} onPress={() => onNavigate('stock')} />
          <Action label="Add a product" caption="Coming in Stage 1C" icon={PlusIcon} onPress={() => onNavigate('stock')} />
          <Action label="View reports" caption="Coming later" icon={BarsIcon} onPress={() => onNavigate('reports')} />
        </View>

        <SectionTitle title="Recent activity" />
        <View style={styles.card}>
          {activity === 'list' ? (
            (data?.recentSales ?? []).map((sale, i) => <SaleRow key={sale.id} sale={sale} first={i === 0} />)
          ) : (
            <EmptyActivity view={activity} />
          )}
        </View>

        <Notice text="Test version: please use made-up data only until the pilot starts." />
      </View>
    </>
  );
}

function Brand() {
  return (
    <View style={styles.brand} accessible accessibilityLabel="ShopMate Ghana">
      <View style={styles.logo}>
        <Text style={styles.logoText} allowFontScaling={false}>S</Text>
      </View>
      <Text style={styles.brandText} maxFontSizeMultiplier={1.2}>
        ShopMate <Text style={styles.brandGold}>Ghana</Text>
      </Text>
    </View>
  );
}

function Chip({ text, gold = false }: { text: string; gold?: boolean }) {
  return (
    <View style={[styles.chip, gold && styles.chipGold]}>
      <Text style={[styles.chipText, gold && styles.chipGoldText]}>{text}</Text>
    </View>
  );
}

function Stat({ label, value, caption, icon: Icon, warn = false }: {
  label: string; value: string; caption: string; icon: ComponentType<{ colour: string; size?: number }>; warn?: boolean;
}) {
  const tone = warn ? colours.warnText : colours.shopGreen;
  return (
    <View style={[styles.card, styles.stat]} accessible accessibilityLabel={`${label}: ${value} ${caption}`}>
      <View style={[styles.statIcon, { backgroundColor: warn ? colours.warnBg : TINT }]}>
        <Icon colour={tone} size={20} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, warn && { color: colours.warnText }]}>{value}</Text>
      <Text style={styles.statCaption}>{caption}</Text>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>;
}

function Action({ label, caption, icon: Icon, onPress, primary = false }: {
  label: string; caption: string; icon: ComponentType<{ colour: string; size?: number }>; onPress: () => void; primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={`${caption}. Opens a preview.`}
      onPress={onPress}
      style={({ pressed }) => [styles.action, primary && styles.actionPrimary, pressed && styles.pressed]}
    >
      <View style={[styles.actionIcon, primary && styles.actionIconPrimary]}>
        <Icon colour={primary ? colours.deepGreen : colours.shopGreen} size={22} />
      </View>
      <Text style={[styles.actionLabel, primary && styles.actionLabelPrimary]}>{label}</Text>
      <Text style={[styles.actionCaption, primary && styles.actionCaptionPrimary]}>{caption}</Text>
    </Pressable>
  );
}

const METHOD_LABEL: Record<RecentSale['paymentMethod'], string> = { cash: 'Cash', momo: 'MoMo', credit: 'Credit' };

function SaleRow({ sale, first }: { sale: RecentSale; first: boolean }) {
  const voided = sale.status === 'voided';
  return (
    <View
      style={[styles.saleRow, !first && styles.saleRowDivider]}
      accessible
      accessibilityLabel={`Receipt ${sale.receiptNo}, ${formatTime(sale.occurredAt)}, ${METHOD_LABEL[sale.paymentMethod]}, ${formatCedis(sale.totalPesewas)}${voided ? ', voided' : ''}`}
    >
      <View style={styles.methodBadge}>
        <Text style={styles.methodText}>{METHOD_LABEL[sale.paymentMethod]}</Text>
      </View>
      <View style={styles.saleMain}>
        <Text style={styles.saleReceipt}>{sale.receiptNo}</Text>
        <Text style={styles.saleMeta}>{formatTime(sale.occurredAt)}{voided ? ' · Voided' : ''}</Text>
      </View>
      <Text style={[styles.saleAmount, voided && styles.saleVoided]}>{formatCedis(sale.totalPesewas)}</Text>
    </View>
  );
}

const ACTIVITY_TEXT: Record<Exclude<ActivityView, 'list'>, { title: string; body: string | null }> = {
  loading: { title: 'Loading activity…', body: null },
  error: { title: "Activity couldn't be loaded", body: 'Check your internet connection, then try again.' },
  empty: {
    title: 'No sales recorded yet',
    body: 'When selling arrives, your latest sales will appear here with their receipt number, time and payment method.',
  },
};

function EmptyActivity({ view }: { view: Exclude<ActivityView, 'list'> }) {
  const text = ACTIVITY_TEXT[view];
  const error = view === 'error';
  return (
    <View style={styles.empty} accessibilityLiveRegion={error ? 'polite' : undefined}>
      <View style={[styles.emptyIcon, error && { backgroundColor: colours.dangerBg }]}>
        {error ? <AlertIcon colour={colours.danger} size={28} /> : <ReceiptIcon colour={colours.shopGreen} size={28} />}
      </View>
      <Text style={styles.emptyTitle}>{text.title}</Text>
      {text.body ? <Text style={styles.emptyBody}>{text.body}</Text> : null}
    </View>
  );
}

/* ───────────────────────── Previews of later stages ───────────────────────── */

const PREVIEWS: Record<Exclude<Tab, 'dashboard'>, { title: string; subtitle: string; stage: string; icon: ComponentType<{ colour: string; size?: number }>; points: string[] }> = {
  sales: {
    title: 'Sales',
    subtitle: 'Record sales and give receipts',
    stage: 'Coming in Stage 1D',
    icon: ReceiptIcon,
    points: [
      'A fast New Sale screen with your product tiles',
      'Cash, MoMo and credit payments',
      'Keeps working without internet and uploads later',
      'Receipts you can share on WhatsApp',
    ],
  },
  stock: {
    title: 'Stock',
    subtitle: 'Products, restocks and low-stock alerts',
    stage: 'Coming in Stage 1C',
    icon: BoxIcon,
    points: [
      'Add products with selling price and cost',
      'Record restocks, including goods bought on credit',
      'A low-stock list you can share with your supplier',
      'Record damaged, expired or missing stock',
    ],
  },
  reports: {
    title: 'Reports',
    subtitle: 'Profit and business performance',
    stage: 'Coming in a later stage, after selling',
    icon: BarsIcon,
    points: [
      "Today's sales and profit, after expenses and losses",
      'Cash, MoMo and credit split',
      'Best-selling products',
      'Money customers owe you',
    ],
  },
};

function ComingSoon({ tab, onBack }: { tab: Exclude<Tab, 'dashboard'>; onBack: () => void }) {
  const p = PREVIEWS[tab];
  const Icon = p.icon;
  return (
    <>
      <View style={styles.bar}>
        <Text style={styles.barTitle} accessibilityRole="header">{p.title}</Text>
        <Text style={styles.barSubtitle}>{p.subtitle}</Text>
      </View>
      <View style={styles.body}>
        <View style={[styles.card, styles.preview]}>
          <View style={styles.previewIcon}>
            <Icon colour={colours.shopGreen} size={36} />
          </View>
          <View style={[styles.chip, styles.chipGold, styles.stageChip]}>
            <Text style={[styles.chipText, styles.chipGoldText]}>{p.stage}</Text>
          </View>
          <Text style={styles.previewTitle}>This part of ShopMate isn't ready yet</Text>
          <Text style={styles.previewBody}>Here is what it will let you do:</Text>
          <View style={styles.points}>
            {p.points.map((point) => (
              <View key={point} style={styles.point}>
                <View style={styles.pointDot} />
                <Text style={styles.pointText}>{point}</Text>
              </View>
            ))}
          </View>
        </View>
        <Notice text="Nothing has been recorded. This screen only shows what is planned." />
        <Button label="Back to dashboard" kind="secondary" onPress={onBack} />
      </View>
    </>
  );
}

/* ───────────────────────── Account panel ───────────────────────── */

function AccountPanel({ business, device, ownerName, onClose, onSignOut }: {
  business: Business; device: Device; ownerName: string | null; onClose: () => void; onSignOut: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onClose} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <ChevronLeftIcon colour={colours.surface} size={20} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.barTitle} accessibilityRole="header">Shop and account</Text>
        {ownerName ? <Text style={styles.barSubtitle}>Signed in as {ownerName}</Text> : null}
      </View>
      <View style={styles.body}>
        <View style={styles.card}>
          <InfoRow label="Shop" value={business.name} first />
          <InfoRow label="Shop reference" value={business.reference_code} />
          <InfoRow label="This phone" value={`Device ${device.deviceCode}`} />
          <InfoRow label="Plan" value="Pilot (all features free)" />
        </View>
        <Notice text="Test version: please use made-up data only until the pilot starts." />
        <Text style={styles.footnote}>Shop details, receipt text and low-stock settings will be editable here in a later stage.</Text>
        <Button label="Log out" kind="secondary" onPress={onSignOut} />
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value, first = false }: { label: string; value: string; first?: boolean }) {
  return (
    <View style={[styles.infoRow, !first && styles.saleRowDivider]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

/* ───────────────────────── Bottom navigation ───────────────────────── */

const TABS: { key: Tab; label: string; icon: ComponentType<{ colour: string; size?: number }> }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: GridIcon },
  { key: 'sales', label: 'Sales', icon: ReceiptIcon },
  { key: 'stock', label: 'Stock', icon: BoxIcon },
  { key: 'reports', label: 'Reports', icon: BarsIcon },
];

function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <View style={styles.nav} accessibilityRole="tablist">
      {TABS.map(({ key, label, icon: Icon }) => {
        const selected = key === tab;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => onChange(key)}
            style={({ pressed }) => [styles.navItem, pressed && styles.pressed]}
          >
            <View style={[styles.navIcon, selected && styles.navIconSelected]}>
              <Icon colour={selected ? colours.shopGreen : colours.stone} size={22} />
            </View>
            <Text style={[styles.navLabel, selected && styles.navLabelSelected]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ───────────────────────── Styles ───────────────────────── */

const shadow = Platform.select({
  android: { elevation: 2 },
  default: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colours.warmWhite },
  scroll: { paddingBottom: space.lg },
  pressed: { opacity: 0.75 },

  hero: { backgroundColor: colours.shopGreen, paddingTop: TOP_INSET + space.md, paddingHorizontal: space.md, paddingBottom: space.xl + space.lg, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, gap: space.xs },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  logo: { width: 32, height: 32, borderRadius: 9, backgroundColor: colours.marketGold, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: colours.deepGreen, fontWeight: '900', fontSize: 19 },
  brandText: { color: colours.surface, fontWeight: '800', fontSize: type.body + 1, letterSpacing: 0.2 },
  brandGold: { color: colours.marketGold },
  avatar: { width: touch.min, height: touch.min, borderRadius: touch.min / 2, backgroundColor: colours.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colours.marketGold },
  avatarText: { color: colours.shopGreen, fontWeight: '800', fontSize: type.body },
  greeting: { color: '#D9EDE3', fontSize: type.body },
  shopName: { color: colours.surface, fontSize: type.title + 6, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  chip: { borderRadius: 999, paddingHorizontal: space.sm + 4, paddingVertical: space.xs, backgroundColor: 'rgba(255,255,255,0.16)' },
  chipText: { color: colours.surface, fontSize: type.caption, fontWeight: '600' },
  chipGold: { backgroundColor: colours.marketGold },
  chipGoldText: { color: colours.deepGreen, fontWeight: '800' },

  overlap: { marginTop: -space.xl - space.sm, paddingHorizontal: space.md, gap: space.md },
  card: { backgroundColor: colours.surface, borderRadius: 16, borderWidth: 1, borderColor: colours.sand, ...shadow },
  revenueCard: { flexDirection: 'row', overflow: 'hidden' },
  revenueAccent: { width: 6, backgroundColor: colours.marketGold },
  revenueBody: { flex: 1, padding: space.md + 4, gap: space.xs },
  cardLabel: { fontSize: type.caption, fontWeight: '700', color: colours.stone, letterSpacing: 0.8 },
  keyFigure: { fontSize: type.keyFigure + 4, fontWeight: '800', color: colours.ink, fontVariant: ['tabular-nums'] },
  cardCaption: { fontSize: type.caption, color: colours.stone },

  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stat: { flexGrow: 1, flexBasis: '30%', minWidth: 104, padding: space.md - 2, gap: 2 },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  statLabel: { fontSize: type.caption, color: colours.stone, fontWeight: '600' },
  statValue: { fontSize: type.title + 2, fontWeight: '800', color: colours.ink, fontVariant: ['tabular-nums'] },
  statCaption: { fontSize: type.caption, color: colours.stone },

  errorBlock: { gap: space.sm },
  sectionTitle: { fontSize: type.section, fontWeight: '800', color: colours.ink, marginTop: space.sm, marginBottom: -space.xs },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  action: { flexGrow: 1, flexBasis: '45%', minWidth: 140, minHeight: 104, borderRadius: 16, padding: space.md, gap: space.xs, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.sand, ...shadow },
  actionPrimary: { backgroundColor: colours.shopGreen, borderColor: colours.shopGreen },
  actionIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: TINT, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  actionIconPrimary: { backgroundColor: colours.marketGold },
  actionLabel: { fontSize: type.body, fontWeight: '800', color: colours.ink },
  actionLabelPrimary: { color: colours.surface },
  actionCaption: { fontSize: type.caption, color: colours.stone },
  actionCaptionPrimary: { color: '#D9EDE3' },

  saleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.md - 2, minHeight: touch.min + 8 },
  saleRowDivider: { borderTopWidth: 1, borderTopColor: colours.sand },
  methodBadge: { minWidth: 64, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: 8, backgroundColor: TINT, alignItems: 'center' },
  methodText: { fontSize: type.caption, fontWeight: '700', color: colours.deepGreen },
  saleMain: { flex: 1 },
  saleReceipt: { fontSize: type.body, fontWeight: '700', color: colours.ink },
  saleMeta: { fontSize: type.caption, color: colours.stone },
  saleAmount: { fontSize: type.body, fontWeight: '800', color: colours.ink, fontVariant: ['tabular-nums'] },
  saleVoided: { textDecorationLine: 'line-through', color: colours.stone },

  empty: { alignItems: 'center', padding: space.lg, gap: space.sm },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: TINT, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  emptyTitle: { fontSize: type.body + 1, fontWeight: '800', color: colours.ink, textAlign: 'center' },
  emptyBody: { fontSize: type.caption + 1, color: colours.stone, textAlign: 'center', lineHeight: 21 },

  bar: { backgroundColor: colours.shopGreen, paddingTop: TOP_INSET + space.md, paddingHorizontal: space.md, paddingBottom: space.lg, gap: space.xs, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  barTitle: { color: colours.surface, fontSize: type.title + 4, fontWeight: '800' },
  barSubtitle: { color: '#D9EDE3', fontSize: type.body },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: touch.min, alignSelf: 'flex-start', paddingRight: space.md, marginLeft: -space.xs },
  backText: { color: colours.surface, fontSize: type.body, fontWeight: '700' },

  body: { padding: space.md, gap: space.md },
  preview: { padding: space.lg, alignItems: 'center', gap: space.sm },
  previewIcon: { width: 72, height: 72, borderRadius: 22, backgroundColor: TINT, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  stageChip: { marginBottom: space.xs },
  previewTitle: { fontSize: type.section, fontWeight: '800', color: colours.ink, textAlign: 'center' },
  previewBody: { fontSize: type.body, color: colours.stone, textAlign: 'center' },
  points: { alignSelf: 'stretch', gap: space.sm, marginTop: space.sm },
  point: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  pointDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colours.marketGold, marginTop: 8 },
  pointText: { flex: 1, fontSize: type.body, color: colours.ink, lineHeight: 23 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, padding: space.md, minHeight: touch.min + 8 },
  infoLabel: { fontSize: type.body, color: colours.stone },
  infoValue: { fontSize: type.body, fontWeight: '700', color: colours.ink, flexShrink: 1, textAlign: 'right' },
  footnote: { fontSize: type.caption, color: colours.stone },

  nav: { flexDirection: 'row', backgroundColor: colours.surface, borderTopWidth: 1, borderTopColor: colours.sand, paddingTop: space.xs, paddingBottom: NAV_BAR_ALLOWANCE },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: touch.min + 12, gap: 2 },
  navIcon: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  navIconSelected: { backgroundColor: TINT },
  navLabel: { fontSize: type.caption, color: colours.stone, fontWeight: '600' },
  navLabelSelected: { color: colours.shopGreen, fontWeight: '800' },
});
