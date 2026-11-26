import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FadeIn } from '../ui/animated';
import { TOP_INSET } from '../ui/layout';
import { HOME_TAB, TABS, onBackPress, type TabKey } from '../navigation/tabs';
import { appConnectivity, type Connectivity } from '../lib/connectivity';
import { PRODUCTS_HOME, pop as popProducts, type ProductsStack } from '../navigation/productsStack';
import type { ProductsService } from '../services/products';
import { ProductsArea } from './products/ProductsArea';
import { ComponentGallery } from './dev/ComponentGallery';
import { useFreshness } from '../ui/useFreshness';
import { classifyRpcError, looksLikeNetworkFailure } from '../services/rpcErrors';
import type { Business, Device } from '../services/account';
import {
  AppText, Banner, Brand, Button, Card, Column, Divider, EmptyState, Notice, ScreenHeader, ScreenScaffold, SectionHeader,
  SkeletonRow, StatusBadge, TabBar, UpdatedLine, color, control, radius, space, useLayout, type TabItem,
} from '../ui/kit';
import { AlertIcon, BoxIcon, ChartIcon, ForwardIcon, GridIcon, MenuIcon, PersonIcon, PlusIcon, ReceiptIcon, type Icon } from '../ui/kit/icons';
import { Skeleton } from '../ui/animated';
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
  todayUpdatedLabel,
  type ActivityView,
  type DashboardLoad,
} from './dashboardState';

/**
 * S-10 Today, the main navigation and the More tab (Stage 1C-3.3: redesigned on the v2 kit, spec 08
 * rev 2, after the owner approved the component gallery at C-1b on 26 Nov 2026).
 *
 * Every figure is read from the owner's own shop data (DashboardService, read-only); nothing here
 * records or changes business data. Selling (Stage 1D) and Customers are honest previews. Five tabs:
 * owner decisions D-7 and D-8. The data loading, freshness and Back rules are unchanged from
 * increment 2b; only the presentation changed. Light headers (V-2); the brand mark and the avatar
 * initials scale with the text size, and the tab bar has no text-scaling cap (labels wrap).
 */

type Tab = TabKey;
type LaterTab = Exclude<TabKey, 'today' | 'more' | 'products'>;

export function HomeScreen({ business, device, onSignOut, dashboard, products }: {
  business: Business;
  device: Device;
  onSignOut: () => void;
  dashboard: DashboardService;
  products: ProductsService;
}) {
  const [tab, setTabState] = useState<Tab>(HOME_TAB);
  const [productsStack, setProductsStack] = useState<ProductsStack>(PRODUCTS_HOME);
  const [productsOpened, setProductsOpened] = useState(false);
  useEffect(() => { if (tab === 'products') setProductsOpened(true); }, [tab]);
  // One app-wide online/offline state, shared with the Products screens (increment 2)
  const connectivity = appConnectivity;
  const [online, setOnline] = useState<Connectivity>(connectivity.state);
  useEffect(() => connectivity.subscribe(setOnline), [connectivity]);
  const [accountOpen, setAccountOpen] = useState(false);
  /** Stage 1C-3.2: the component gallery, development builds only (__DEV__); never in a release build. */
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [load, setLoad] = useState<DashboardLoad>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  /** When the figures were last loaded or attempted (increment 2b freshness throttle). */
  const [lastAttemptAt, setLastAttemptAt] = useState<number | null>(null);
  const token = useRef(0);
  /**
   * 'initial': first load (skeleton). 'pull': pull-to-refresh or Try again (spinner).
   * 'silent': automatic refresh (increment 2b): nothing changes on screen until the answer.
   * Figures already shown are never replaced by placeholders: a failed refresh keeps them
   * (loadFailed) with "couldn't refresh".
   */
  const fetchOverview = useCallback(async (mode: 'initial' | 'pull' | 'silent' = 'initial') => {
    const mine = ++token.current;
    setLastAttemptAt(Date.now());
    if (mode === 'pull') setRefreshing(true);
    else if (mode === 'initial') setLoad((l) => (l.kind === 'ready' ? l : { kind: 'loading' }));
    try {
      const data = await dashboard.fetchOverview(business.id);
      connectivity.reportServerResponse();
      if (mine === token.current) setLoad(loadSucceeded(data));
    } catch (e) {
      // Only a request with no server response means "offline"; a server error means online
      if (looksLikeNetworkFailure(e as never)) connectivity.reportNoResponse();
      else if (classifyRpcError(e as never).kind === 'definite') connectivity.reportServerResponse();
      // Keep figures that were already shown (with a notice); only show the error state when there are none
      if (mine === token.current) setLoad(loadFailed);
    } finally {
      if (mine === token.current) setRefreshing(false);
    }
  }, [dashboard, business.id, connectivity]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  // Increment 2b: reload when the app returns, when Today is shown again, and every 15 minutes
  useFreshness({
    visible: tab === 'today' && !accountOpen,
    lastLoadedAt: lastAttemptAt,
    refresh: () => fetchOverview(load.kind === 'ready' ? 'silent' : 'initial'),
  });

  // Returning to Today after the Products tab: refresh the figures (product count, low stock)
  const previousTab = useRef<Tab>(HOME_TAB);
  const setTab = useCallback((next: Tab) => {
    if (next === 'today' && previousTab.current === 'products') fetchOverview(load.kind === 'ready' ? 'silent' : 'initial');
    // Tapping Products while already on it returns to the product list
    if (next === 'products' && previousTab.current === 'products') setProductsStack(PRODUCTS_HOME);
    previousTab.current = next;
    setTabState(next);
  }, [fetchOverview, load.kind]);
  const openProducts = useCallback((stack: ProductsStack) => { setProductsStack(stack); previousTab.current = 'products'; setTabState('products'); }, []);

  // Android back: close the account panel, then go back one screen inside Products, then return
  // to the dashboard, then leave the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (galleryOpen) { setGalleryOpen(false); return true; }
      if (!accountOpen && tab === 'products') {
        const previous = popProducts(productsStack);
        if (previous) { setProductsStack(previous); return true; }
      }
      const next = onBackPress({ tab, overlayOpen: accountOpen });
      if (!next) return false;
      setAccountOpen(next.overlayOpen);
      setTab(next.tab);
      return true;
    });
    return () => sub.remove();
  }, [accountOpen, galleryOpen, tab, productsStack, setTab]);

  const ownerName = load.kind === 'ready' ? load.data.ownerName : null;

  if (__DEV__ && galleryOpen) return <ComponentGallery onClose={() => setGalleryOpen(false)} />;

  if (accountOpen) {
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
        <AccountPanel business={business} device={device} ownerName={ownerName} onClose={() => setAccountOpen(false)} onSignOut={onSignOut} />
      </View>
    );
  }

  // The Products area stays mounted once opened, so a half-typed form survives a visit to another tab
  const productsArea = productsOpened || tab === 'products' ? (
    <View style={[styles.root, tab !== 'products' && styles.hidden]} importantForAccessibility={tab === 'products' ? 'auto' : 'no-hide-descendants'}>
      <ProductsArea businessId={business.id} products={products} stack={productsStack} onStackChange={setProductsStack} visible={tab === 'products' && !accountOpen} />
    </View>
  ) : null;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {productsArea}
      {tab === 'products' ? null : (
        <FadeIn animationKey={tab} style={styles.root}>
          {tab === 'today' ? (
            <Dashboard
              business={business}
              ownerName={ownerName}
              load={load}
              offline={online === 'offline'}
              refreshing={refreshing}
              onPull={() => fetchOverview('pull')}
              onRetry={() => fetchOverview(load.kind === 'ready' ? 'pull' : 'initial')}
              onOpenAccount={() => setAccountOpen(true)}
              onNavigate={setTab}
              onAddProduct={() => openProducts([...PRODUCTS_HOME, { name: 'add' }])}
            />
          ) : tab === 'more' ? (
            <AccountPanel business={business} device={device} ownerName={ownerName} onSignOut={onSignOut}
              onOpenGallery={__DEV__ ? () => setGalleryOpen(true) : undefined} />
          ) : (
            <ComingSoon tab={tab} onBack={() => setTab(HOME_TAB)} />
          )}
        </FadeIn>
      )}
      <TabBar items={TAB_ITEMS} selected={tab} onChange={setTab} />
    </View>
  );
}

/* ───────────────────────── Dashboard ───────────────────────── */

function Dashboard({ business, ownerName, load, offline, refreshing, onPull, onRetry, onOpenAccount, onNavigate, onAddProduct }: {
  business: Business;
  ownerName: string | null;
  load: DashboardLoad;
  offline: boolean;
  refreshing: boolean;
  onPull: () => void;
  onRetry: () => void;
  onOpenAccount: () => void;
  onNavigate: (tab: Tab) => void;
  onAddProduct: () => void;
}) {
  const layout = useLayout();
  const now = new Date();
  const name = firstName(ownerName);
  const data = load.kind === 'ready' ? load.data : null;
  const stale = staleNotice(load);
  const activity = activityView(load);
  const dash = '—';
  const loading = load.kind === 'loading';
  const updated = todayUpdatedLabel(load, now);
  const pad = layout.width === 'compact' ? space.md : space.lg;

  return (
    <ScrollView contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPull} colors={[color.brand]} tintColor={color.brand} />}>
      <View style={[styles.todayHeader, { paddingHorizontal: pad }]}>
        <View style={styles.headerTop}>
          <Brand />
          <Pressable accessibilityRole="button" accessibilityLabel="Shop and account settings" onPress={onOpenAccount} hitSlop={4}
            style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}>
            <AppText variant="label" tone="brand">{initials(ownerName, business.name)}</AppText>
          </Pressable>
        </View>
        <AppText variant="body" tone="textSecondary">{greetingFor(now)}{name ? `, ${name}` : ''}</AppText>
        <AppText variant="title" accessibilityRole="header">{business.name}</AppText>
        <View style={styles.tags}>
          <Tag text={formatDayLabel(now)} />
          <Tag text={business.reference_code} />
          <Tag text="Pilot" gold />
        </View>
      </View>

      <View style={{ paddingHorizontal: pad }}>
        <Column>
          <Card style={styles.revenue}>
            <View style={styles.revenueAccent} />
            <View style={styles.revenueBody} accessible accessibilityLabel={revenueAccessibilityLabel(load)}>
              <AppText variant="caption" tone="textSecondary" style={styles.overline}>Today's revenue</AppText>
              {loading ? <Skeleton width="60%" height={36} style={styles.skeletonFigure} /> : (
                <AppText variant="display" number>{data ? formatCedis(data.todayRevenuePesewas) : dash}</AppText>
              )}
              <AppText variant="caption" tone="textSecondary">{revenueCaption(load)}</AppText>
            </View>
            {updated ? (
              <View style={styles.revenueUpdated}>
                <UpdatedLine label={updated} failed={load.kind === 'ready' && load.refreshFailed} onRetry={onRetry} />
              </View>
            ) : null}
          </Card>

          {offline ? <Banner tone="offline" message="You're offline. Figures may be out of date; actions that need internet are paused." /> : null}

          <View style={styles.stats}>
            <StatTile loading={loading} label="Sales today" value={data ? String(data.todaySalesCount) : dash}
              caption={data ? (data.todaySalesCount === 1 ? 'sale' : 'sales') : ' '} icon={ReceiptIcon} />
            <StatTile loading={loading} label="Products" value={data ? String(data.productCount) : dash}
              caption={data ? (data.productCount === 0 ? 'none added yet' : 'in stock list') : ' '} icon={BoxIcon} onPress={() => onNavigate('products')} />
            <StatTile loading={loading} label="Low stock" value={data ? String(data.lowStockCount) : dash}
              caption={data ? (data.lowStockCount > 0 ? 'need restocking' : data.productCount === 0 ? 'nothing to track' : 'all good') : ' '}
              icon={AlertIcon} warn={!!data && data.lowStockCount > 0} />
          </View>

          {load.kind === 'error' || stale ? (
            <View style={styles.gapSm}>
              <Banner tone="danger" message={stale ?? "We couldn't load today's figures. Check your internet connection, then try again. Your account and shop are safe."} />
              <Button label="Try again" kind="secondary" onPress={onRetry} />
            </View>
          ) : null}

          <SectionHeader title="Quick actions" />
          <View style={styles.actions}>
            <ActionTile label="Add a product" caption="Price, cost, stock" icon={PlusIcon} onPress={onAddProduct} />
            <ActionTile label="View products" caption="Search, prices, stock" icon={BoxIcon} onPress={() => onNavigate('products')} />
            <ActionTile label="Record a sale" caption="Coming in Stage 1D" icon={ReceiptIcon} later onPress={() => onNavigate('sell')} />
            <ActionTile label="View reports" caption="Coming later" icon={ChartIcon} later onPress={() => onNavigate('more')} />
          </View>

          <SectionHeader title="Recent activity" />
          <Card padded={false}>
            {activity === 'list' ? (
              (data?.recentSales ?? []).map((sale, i) => (
                <View key={sale.id}>
                  {i > 0 ? <Divider /> : null}
                  <SaleRow sale={sale} />
                </View>
              ))
            ) : activity === 'loading' ? (
              <View style={styles.activityLoading}><SkeletonRow /><SkeletonRow /></View>
            ) : (
              <EmptyActivity view={activity} />
            )}
          </Card>

          <Notice text="Test version: please use made-up data only until the pilot starts." />
        </Column>
      </View>
    </ScrollView>
  );
}

function Tag({ text, gold = false }: { text: string; gold?: boolean }) {
  return (
    <View style={[styles.tag, gold && styles.tagGold]}>
      <AppText variant="caption" style={styles.tagText}>{text}</AppText>
    </View>
  );
}

function StatTile({ label, value, caption, icon: Glyph, warn = false, loading = false, onPress }: {
  label: string; value: string; caption: string; icon: Icon; warn?: boolean; loading?: boolean; onPress?: () => void;
}) {
  return (
    <Card style={styles.stat} onPress={onPress} accessibilityLabel={loading ? `${label}: loading` : `${label}: ${value} ${caption}${onPress ? '. Opens Products.' : ''}`}>
      <View style={[styles.statIcon, { backgroundColor: warn ? color.warningBg : color.successBg }]}>
        <Glyph colour={warn ? color.warning : color.brand} size={20} />
      </View>
      <AppText variant="caption" tone="textSecondary">{label}</AppText>
      {loading ? <Skeleton width={40} height={26} style={styles.skeletonStat} /> : (
        <AppText variant="displaySmall" number tone={warn ? 'warning' : 'textPrimary'}>{value}</AppText>
      )}
      <AppText variant="caption" tone="textSecondary">{caption}</AppText>
    </Card>
  );
}

/** A quick action: a calm card with an icon, a word and a caption (not a heavy button, B-4). */
function ActionTile({ label, caption, icon: Glyph, onPress, later = false }: {
  label: string; caption: string; icon: Icon; onPress: () => void; later?: boolean;
}) {
  return (
    <Card style={styles.action} onPress={onPress} accessibilityLabel={`${label}. ${caption}${later ? '. Opens a preview.' : ''}`}>
      <View style={styles.actionTop}>
        <View style={[styles.actionIcon, later && styles.actionIconLater]}>
          <Glyph colour={later ? color.textSecondary : color.brand} size={22} />
        </View>
        <ForwardIcon colour={color.textSecondary} size={16} />
      </View>
      <AppText variant="label">{label}</AppText>
      <AppText variant="caption" tone="textSecondary">{caption}</AppText>
    </Card>
  );
}

const METHOD_LABEL: Record<RecentSale['paymentMethod'], string> = { cash: 'Cash', momo: 'MoMo', credit: 'Credit' };

function SaleRow({ sale }: { sale: RecentSale }) {
  const voided = sale.status === 'voided';
  return (
    <View style={styles.saleRow} accessible
      accessibilityLabel={`Receipt ${sale.receiptNo}, ${formatTime(sale.occurredAt)}, ${METHOD_LABEL[sale.paymentMethod]}, ${formatCedis(sale.totalPesewas)}${voided ? ', voided' : ''}`}>
      <StatusBadge label={METHOD_LABEL[sale.paymentMethod]} tone={sale.paymentMethod === 'momo' ? 'info' : sale.paymentMethod === 'credit' ? 'warning' : 'success'} />
      <View style={styles.flex}>
        <AppText variant="label">{sale.receiptNo}</AppText>
        <AppText variant="caption" tone="textSecondary">{formatTime(sale.occurredAt)}{voided ? ' · Voided' : ''}</AppText>
      </View>
      <AppText variant="label" number tone={voided ? 'textSecondary' : 'textPrimary'} style={voided ? styles.voided : undefined}>{formatCedis(sale.totalPesewas)}</AppText>
    </View>
  );
}

const ACTIVITY_TEXT: Record<Exclude<ActivityView, 'list' | 'loading'>, { title: string; body: string }> = {
  error: { title: "Activity couldn't be loaded", body: 'Check your internet connection, then try again.' },
  empty: {
    title: 'No sales recorded yet',
    body: 'When selling arrives, your latest sales will appear here with their receipt number, time and payment method.',
  },
};

function EmptyActivity({ view }: { view: Exclude<ActivityView, 'list' | 'loading'> }) {
  const text = ACTIVITY_TEXT[view];
  return (
    <View accessibilityLiveRegion={view === 'error' ? 'polite' : undefined}>
      <EmptyState icon={view === 'error' ? AlertIcon : ReceiptIcon} title={text.title} body={text.body} />
    </View>
  );
}

/* ───────────────────────── Previews of later stages ───────────────────────── */

const PREVIEWS: Record<LaterTab, { title: string; subtitle: string; stage: string; icon: Icon; points: string[] }> = {
  sell: {
    title: 'Sell',
    subtitle: 'Record sales and give receipts',
    stage: 'Coming in a later update (Stage 1D)',
    icon: ReceiptIcon,
    points: [
      'A fast New Sale screen with your product tiles',
      'Cash, MoMo and credit payments',
      'Keeps working without internet and uploads later',
      'Receipts you can share on WhatsApp',
    ],
  },
  customers: {
    title: 'Customers',
    subtitle: 'Your credit book',
    stage: 'Coming in a later update',
    icon: PersonIcon,
    points: [
      'See who owes you, largest amounts first',
      'Record repayments in cash or MoMo',
      'Send a polite balance reminder on WhatsApp',
    ],
  },
};

function ComingSoon({ tab, onBack }: { tab: LaterTab; onBack: () => void }) {
  const p = PREVIEWS[tab];
  const Glyph = p.icon;
  return (
    <ScreenScaffold header={<ScreenHeader title={p.title} subtitle={p.subtitle} />}>
      <Card style={styles.preview}>
        <View style={styles.previewIcon}><Glyph colour={color.brand} size={32} /></View>
        <Tag text={p.stage} gold />
        <AppText variant="heading" align="center">This part of ShopMate isn't ready yet</AppText>
        <AppText variant="body" tone="textSecondary" align="center">Here is what it will let you do:</AppText>
        <View style={styles.points}>
          {p.points.map((point) => (
            <View key={point} style={styles.point}>
              <View style={styles.pointDot} />
              <AppText variant="body" style={styles.flex}>{point}</AppText>
            </View>
          ))}
        </View>
      </Card>
      <Notice text="Nothing has been recorded. This screen only shows what is planned." />
      <Button label="Back to Today" kind="secondary" onPress={onBack} />
    </ScreenScaffold>
  );
}

/* ───────────────────────── Account panel ───────────────────────── */

/** S-70 More items that arrive in later stages (shown so the owner knows where they will be). */
const LATER_MENU = ['Expenses', 'Reports', 'Close the day', 'Export data', 'Settings', 'Subscription', 'Help and support'];

/**
 * Shop and account details with Log out. Opened from the avatar (with Back), and shown as the
 * More tab (S-70; D-8: More keeps Log out), where it also lists the items still to come.
 */
function AccountPanel({ business, device, ownerName, onClose, onSignOut, onOpenGallery }: {
  business: Business; device: Device; ownerName: string | null; onClose?: () => void; onSignOut: () => void;
  /** Development builds only (Stage 1C-3.2): opens the component gallery for the owner's review (C-1b). */
  onOpenGallery?: () => void;
}) {
  const asTab = !onClose;
  return (
    <ScreenScaffold header={<ScreenHeader title={asTab ? 'More' : 'Shop and account'} subtitle={ownerName ? `Signed in as ${ownerName}` : undefined} onBack={onClose} />}>
      <Card padded={false}>
        <InfoRow label="Shop" value={business.name} first />
        <InfoRow label="Shop reference" value={business.reference_code} />
        <InfoRow label="This phone" value={`Device ${device.deviceCode}`} />
        <InfoRow label="Plan" value="Pilot (all features free)" />
      </Card>
      <Notice text="Test version: please use made-up data only until the pilot starts." />
      <AppText variant="caption" tone="textSecondary">Shop details, receipt text and low-stock settings will be editable here in a later stage.</AppText>
      {asTab ? (
        <Card padded={false}>
          {LATER_MENU.map((item, i) => (
            <View key={item}>
              {i > 0 ? <Divider /> : null}
              <View style={styles.infoRow} accessible accessibilityLabel={`${item}: coming in a later update`}>
                <AppText variant="body" style={styles.flex}>{item}</AppText>
                <StatusBadge label="Later" tone="neutral" />
              </View>
            </View>
          ))}
        </Card>
      ) : null}
      {__DEV__ && onOpenGallery ? (
        <Card padded={false} onPress={onOpenGallery} accessibilityLabel="Component gallery. Development only: design review">
          <View style={styles.infoRow}>
            <AppText variant="label" style={styles.flex}>Component gallery</AppText>
            <StatusBadge label="Development only" tone="info" />
          </View>
        </Card>
      ) : null}
      <Button label="Log out" kind="secondary" onPress={onSignOut} />
    </ScreenScaffold>
  );
}

function InfoRow({ label, value, first = false }: { label: string; value: string; first?: boolean }) {
  return (
    <View>
      {first ? null : <Divider />}
      <View style={styles.infoRow} accessible accessibilityLabel={`${label}: ${value}`}>
        <AppText variant="body" tone="textSecondary">{label}</AppText>
        <AppText variant="label" style={styles.infoValue}>{value}</AppText>
      </View>
    </View>
  );
}

/* ───────────────────────── Bottom navigation ───────────────────────── */

const TAB_ICONS: Record<Tab, Icon> = { today: GridIcon, sell: ReceiptIcon, products: BoxIcon, customers: PersonIcon, more: MenuIcon };

const TAB_ITEMS: readonly TabItem<Tab>[] = TABS.map(({ key, label, availability }) => ({
  key, label, icon: TAB_ICONS[key], spokenLabel: availability === 'later' ? `${label}, coming in a later update` : label,
}));

/* ───────────────────────── Styles ───────────────────────── */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  hidden: { display: 'none' },
  flex: { flex: 1 },
  scroll: { paddingBottom: space.xl },
  pressed: { opacity: 0.7 },
  gapSm: { gap: space.xs },

  todayHeader: { backgroundColor: color.headerBg, paddingTop: TOP_INSET + space.xs, paddingBottom: space.lg, gap: space.xxs, borderBottomWidth: control.hairline, borderBottomColor: color.divider, marginBottom: space.md },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginBottom: space.sm, minHeight: control.touchTarget },
  avatar: { minWidth: control.touchTarget, minHeight: control.touchTarget, paddingHorizontal: space.xs, borderRadius: radius.pill, backgroundColor: color.surface, borderWidth: 1.5, borderColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs },
  tag: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 3, backgroundColor: color.surface, borderWidth: control.hairline, borderColor: color.divider },
  tagGold: { backgroundColor: color.accent, borderColor: color.accent },
  tagText: { fontWeight: '600' },

  revenue: { padding: 0, gap: 0, overflow: 'hidden' },
  revenueAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: color.accent },
  revenueBody: { padding: space.md, paddingLeft: space.md + space.xxs, gap: space.xxs },
  revenueUpdated: { paddingHorizontal: space.md + space.xxs, paddingBottom: space.xs, marginTop: -space.xs },
  overline: { fontWeight: '600', letterSpacing: 0.4 },
  skeletonFigure: { marginVertical: space.xxs },
  skeletonStat: { marginVertical: 3 },

  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  stat: { flexGrow: 1, flexBasis: '30%', minWidth: 104, gap: 2 },
  statIcon: { width: 36, height: 36, borderRadius: radius.sm + 2, alignItems: 'center', justifyContent: 'center', marginBottom: space.xxs },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  action: { flexGrow: 1, flexBasis: '45%', minWidth: 148, gap: 2 },
  actionTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: space.xxs },
  actionIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: color.successBg, alignItems: 'center', justifyContent: 'center' },
  actionIconLater: { backgroundColor: color.neutralBg },

  activityLoading: { padding: space.xs, gap: space.xs },
  saleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 56, flexWrap: 'wrap' },
  voided: { textDecorationLine: 'line-through' },

  preview: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  previewIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: color.successBg, alignItems: 'center', justifyContent: 'center' },
  points: { alignSelf: 'stretch', gap: space.xs, marginTop: space.xs },
  point: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  pointDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent, marginTop: 8 },

  infoRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', columnGap: space.md, rowGap: 2, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 56 },
  infoValue: { flexShrink: 1, textAlign: 'right' },
});
