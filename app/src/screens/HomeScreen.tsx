import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
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
import { AlertIcon, BarsIcon, BoxIcon, ChevronLeftIcon, GridIcon, MenuIcon, PeopleIcon, PlusIcon, ReceiptIcon } from '../ui/icons';
import { FadeIn, PressableScale, Skeleton } from '../ui/animated';
import { HOME_TAB, TABS, onBackPress, type TabKey } from '../navigation/tabs';
import { appConnectivity, type Connectivity } from '../lib/connectivity';
import { PRODUCTS_HOME, pop as popProducts, type ProductsStack } from '../navigation/productsStack';
import type { ProductsService } from '../services/products';
import { ProductsArea } from './products/ProductsArea';
import { ComponentGallery } from './dev/ComponentGallery';
import { UpdatedLine } from '../ui/surfaces';
import { useFreshness } from '../ui/useFreshness';
import { classifyRpcError, looksLikeNetworkFailure } from '../services/rpcErrors';
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
  todayUpdatedLabel,
  type ActivityView,
  type DashboardLoad,
} from './dashboardState';

/**
 * S-10 Today: the owner's business dashboard.
 *
 * Every figure is read from the owner's own shop data (DashboardService, read-only). Selling
 * (Stage 1D) and inventory screens (Stage 1C-2) are not built yet, so today the figures are genuinely
 * zero and the Sell, Products and Customers tabs are honest previews of what is coming. Nothing here
 * records or changes business data. Five tabs: owner decisions D-7 and D-8 (24 Nov 2026).
 */

type Tab = TabKey;
type LaterTab = Exclude<TabKey, 'today' | 'more' | 'products'>;

const TOP_INSET = Platform.OS === 'android' ? (SystemStatusBar.currentHeight ?? 24) : 48;
/**
 * Android 16 draws apps edge to edge, under the system navigation bar, and React Native
 * cannot report that bar's height without a native safe-area library. 48 dp clears the
 * tallest standard bar (three-button navigation). Replace with real insets if a safe-area
 * library is added in a future native build.
 */
const NAV_BAR_ALLOWANCE = Platform.OS === 'android' ? 48 : 24;
const TINT = colours.tint;

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
        <StatusBar style="light" />
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
      <StatusBar style="light" />
      {productsArea}
      {tab === 'products' ? null : <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={tab === 'today'
          ? <RefreshControl refreshing={refreshing} onRefresh={() => fetchOverview('pull')} colors={[colours.shopGreen]} progressViewOffset={TOP_INSET} />
          : undefined}
      >
        <FadeIn animationKey={tab}>
          {tab === 'today' ? (
            <Dashboard
              business={business}
              ownerName={ownerName}
              load={load}
              offline={online === 'offline'}
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
      </ScrollView>}
      <BottomNav tab={tab} onChange={setTab} />
    </View>
  );
}

/* ───────────────────────── Dashboard ───────────────────────── */

function Dashboard({ business, ownerName, load, offline, onRetry, onOpenAccount, onNavigate, onAddProduct }: {
  business: Business;
  ownerName: string | null;
  load: DashboardLoad;
  offline: boolean;
  onRetry: () => void;
  onOpenAccount: () => void;
  onNavigate: (tab: Tab) => void;
  onAddProduct: () => void;
}) {
  const now = new Date();
  const name = firstName(ownerName);
  const data = load.kind === 'ready' ? load.data : null;
  const stale = staleNotice(load);
  const activity = activityView(load);
  const dash = '—';
  const loading = load.kind === 'loading';

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
            {loading ? <Skeleton width="60%" height={36} style={styles.skeletonFigure} /> : (
              <Text style={styles.keyFigure}>{data ? formatCedis(data.todayRevenuePesewas) : dash}</Text>
            )}
            <Text style={styles.cardCaption}>
              {revenueCaption(load)}
            </Text>
            <UpdatedLine label={todayUpdatedLabel(load, now)} failed={load.kind === 'ready' && load.refreshFailed} onRetry={onRetry} />
          </View>
        </View>

        {offline ? (
          <View style={styles.offlineBanner} accessibilityLiveRegion="polite">
            <Text style={styles.offlineText}>You're offline. Figures may be out of date; actions that need internet are paused.</Text>
          </View>
        ) : null}

        <View style={styles.statRow}>
          <Stat loading={loading} label="Sales today" value={data ? String(data.todaySalesCount) : dash} caption={data ? (data.todaySalesCount === 1 ? 'sale' : 'sales') : ' '} icon={ReceiptIcon} />
          <Stat loading={loading} label="Products" value={data ? String(data.productCount) : dash} caption={data ? (data.productCount === 0 ? 'none added yet' : 'in stock list') : ' '} icon={BoxIcon} />
          <Stat
            loading={loading}
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
          <Action label="Record a sale" caption="Coming in Stage 1D" icon={ReceiptIcon} primary onPress={() => onNavigate('sell')} />
          <Action label="View products" caption="Search, prices, stock" icon={BoxIcon} onPress={() => onNavigate('products')} />
          <Action label="Add a product" caption="Price, cost, stock" icon={PlusIcon} onPress={onAddProduct} />
          <Action label="View reports" caption="Coming later" icon={BarsIcon} onPress={() => onNavigate('more')} />
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

function Stat({ label, value, caption, icon: Icon, warn = false, loading = false }: {
  label: string; value: string; caption: string; icon: ComponentType<{ colour: string; size?: number }>; warn?: boolean; loading?: boolean;
}) {
  const tone = warn ? colours.warnText : colours.shopGreen;
  return (
    <View style={[styles.card, styles.stat]} accessible accessibilityLabel={loading ? `${label}: loading` : `${label}: ${value} ${caption}`}>
      <View style={[styles.statIcon, { backgroundColor: warn ? colours.warnBg : TINT }]}>
        <Icon colour={tone} size={20} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      {loading ? <Skeleton width={40} height={26} style={styles.skeletonStat} /> : (
        <Text style={[styles.statValue, warn && { color: colours.warnText }]}>{value}</Text>
      )}
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
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={`${caption}. Opens a preview.`}
      onPress={onPress}
      style={[styles.action, primary && styles.actionPrimary]}
    >
      <View style={[styles.actionIcon, primary && styles.actionIconPrimary]}>
        <Icon colour={primary ? colours.deepGreen : colours.shopGreen} size={22} />
      </View>
      <Text style={[styles.actionLabel, primary && styles.actionLabelPrimary]}>{label}</Text>
      <Text style={[styles.actionCaption, primary && styles.actionCaptionPrimary]}>{caption}</Text>
    </PressableScale>
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

const PREVIEWS: Record<LaterTab, { title: string; subtitle: string; stage: string; icon: ComponentType<{ colour: string; size?: number }>; points: string[] }> = {
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
    icon: PeopleIcon,
    points: [
      'See who owes you, largest amounts first',
      'Record repayments in cash or MoMo',
      'Send a polite balance reminder on WhatsApp',
    ],
  },
};

function ComingSoon({ tab, onBack }: { tab: LaterTab; onBack: () => void }) {
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
        <Button label="Back to Today" kind="secondary" onPress={onBack} />
      </View>
    </>
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
  const body = (
    <>
      <View style={styles.bar}>
        {onClose ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onClose} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <ChevronLeftIcon colour={colours.surface} size={20} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : null}
        <Text style={styles.barTitle} accessibilityRole="header">{asTab ? 'More' : 'Shop and account'}</Text>
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
        {asTab ? (
          <View style={styles.card}>
            {LATER_MENU.map((item, i) => (
              <View key={item} style={[styles.infoRow, i > 0 && styles.saleRowDivider]} accessible accessibilityLabel={`${item}: coming in a later update`}>
                <Text style={styles.infoValue}>{item}</Text>
                <Text style={styles.laterTag}>Later</Text>
              </View>
            ))}
          </View>
        ) : null}
        {__DEV__ && onOpenGallery ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Component gallery. Development only: design review" onPress={onOpenGallery}
            style={({ pressed }) => [styles.card, styles.infoRow, pressed && styles.pressed]}>
            <Text style={styles.infoValue}>Component gallery</Text>
            <Text style={styles.laterTag}>Development only</Text>
          </Pressable>
        ) : null}
        <Button label="Log out" kind="secondary" onPress={onSignOut} />
      </View>
    </>
  );
  return asTab ? body : <ScrollView contentContainerStyle={styles.scroll}>{body}</ScrollView>;
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

const TAB_ICONS: Record<Tab, ComponentType<{ colour: string; size?: number }>> = {
  today: GridIcon,
  sell: ReceiptIcon,
  products: BoxIcon,
  customers: PeopleIcon,
  more: MenuIcon,
};

function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <View style={styles.nav} accessibilityRole="tablist">
      {TABS.map(({ key, label, availability }) => {
        const selected = key === tab;
        const Icon = TAB_ICONS[key];
        return (
          <PressableScale
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={availability === 'later' ? `${label}, coming in a later update` : label}
            accessibilityState={{ selected }}
            onPress={() => onChange(key)}
            style={styles.navItem}
          >
            <View style={[styles.navIcon, selected && styles.navIconSelected]}>
              <Icon colour={selected ? colours.shopGreen : colours.stone} size={22} />
            </View>
            <Text style={[styles.navLabel, selected && styles.navLabelSelected]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{label}</Text>
          </PressableScale>
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
  hidden: { display: 'none' },
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

  skeletonFigure: { marginVertical: space.xs },
  skeletonStat: { marginVertical: 3 },
  offlineBanner: { backgroundColor: '#EDECEA', borderRadius: 12, padding: space.md, borderLeftWidth: 4, borderLeftColor: colours.neutral },
  offlineText: { fontSize: type.body, color: colours.ink },
  laterTag: { fontSize: type.caption, color: colours.stone, fontWeight: '700' },
});
