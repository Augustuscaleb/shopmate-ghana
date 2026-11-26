/**
 * S-37 Product detail, the read-only part (Stage 1C-3.1; plan §5.1 – §5.2; spec 08 rev 2 §9.2 – §9.4).
 * Nothing on this page can be changed by typing. A compact pencil top-right in the header
 * (spoken as "Edit product"; owner decision 25 Nov 2026, replacing the bottom-bar button) opens
 * the existing form; "Change price" opens the existing quick price sheet; "Correct cost
 * price" opens the existing audited screen; Archive / Restore asks for confirmation first.
 *
 * Stage 1C-3.3: redesigned on the v2 kit after the owner's gallery review (C-1b approved, 26 Nov
 * 2026). Confirmation only for the destructive action (Archive); Restore is harmless and
 * reversible, so it runs at once with a short confirmation message.
 *
 * Figures: confirmed values (selling price, stock, low-stock level) have no "(about)"; estimates
 * always do. The average cost has four states and margin is shown only with the current one
 * (rules in costInfo.ts). Freshness as in increment 2b: reloads when the app returns, when shown
 * again and every 15 minutes, never while a change is being saved. An older answer never replaces a
 * newer one (useLatestRequest).
 *
 * Failures (spec 08 rev 2 §9.3 and §10, governing):
 * - first load fails: nothing is shown as if loaded; "We couldn't load this product" (or the
 *   offline message) and Try again;
 * - first load reads the product but not its cost history (needed only with no stock): the
 *   figures are shown and the cost is state 4, "Not available right now", with Try again;
 * - a refresh fails: the confirmed values read earlier (name, price, stock, low-stock level) stay,
 *   marked "Last updated hh:mm · couldn't refresh" with a banner; the average cost becomes
 *   state 4 ("no figure, not even an old one"), and margin and Stock value (about) are hidden.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { FadeIn, Skeleton } from '../../ui/animated';
import {
  AppText, Banner, Button, Card, Divider, EmptyState, IconButton, Notice, ScreenHeader, StatusBadge, StockBadge, UpdatedLine,
  color, confirmAction, control, radius, space, stockTone, useLayout, useToast, type ColorRole,
} from '../../ui/kit';
import { BoxIcon, EditIcon, InfoIcon } from '../../ui/kit/icons';
import { STOCK_STATE_STYLE, stockState } from '../../ui/stockStatus';
import { useConnectivity } from '../../ui/useConnectivity';
import { useFreshness } from '../../ui/useFreshness';
import { useLatestRequest } from '../../ui/useLatestRequest';
import { updatedLabel } from '../../lib/freshness';
import { formatCedis, formatTime } from '../../services/dashboard';
import { outcomeTone, type Outcome } from '../../services/productForm';
import { ReadError, sameProduct, type Category, type Product, type ProductsService } from '../../services/products';
import { categoryLabel, shownCost, costText, marginInfo, marginText, stockValueAbout, type CostHistoryRead } from './costInfo';
import { QuickPriceSheet } from './ProductListScreen';

/** What one successful read shows. */
type Loaded = { product: Product; categories: Category[]; history: CostHistoryRead; at: string };

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'not_found' }
  | { kind: 'ready'; data: Loaded };

/** The history matters only when there's no stock and the cost is still known (cost state 2). */
function needsHistory(p: Product): boolean {
  return p.costKnown && p.stockQty <= 0;
}

/** A change that happened within this long of this device's own change counts as its own. */
const OWN_CHANGE_WINDOW_MS = 10_000;

const AVERAGE_COST_HELP = "Average cost is worked out from your stock value: what the stock you have cost you, divided by how many you have. It changes when you restock or correct a cost. \"About\" means it's an estimate.";
const MARGIN_HELP = "Margin is what you keep from each sale before other costs: the selling price minus the average cost. The percentage is that amount out of the selling price. \"About\" means it's an estimate, because the average cost is one.";

export function ProductDetailsScreen({ productId, businessId, products, visible, refreshKey, notice, onNoticeShown, onBack, onBackToList, onEdit, onCorrectCost, onChanged }: {
  productId: string;
  businessId: string;
  products: ProductsService;
  /** On screen (Products tab selected and nothing on top): automatic refreshes run only then. */
  visible: boolean;
  /** Changes after a save on this tab (an edit, a price change, a cost correction): reload. */
  refreshKey: number;
  /** A success message from the screen that returned here ("… saved"). */
  notice: string | null;
  onNoticeShown: () => void;
  onBack: () => void;
  onBackToList: () => void;
  onEdit: (productId: string) => void;
  onCorrectCost: (productId: string) => void;
  /** This screen saved a change (price, archive or restore): the list and this screen reload. */
  onChanged: () => void;
}) {
  const offline = useConnectivity() === 'offline';
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [lastAttemptAt, setLastAttemptAt] = useState<number | null>(null);
  const [changedElsewhere, setChangedElsewhere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Outcome | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [priceFor, setPriceFor] = useState<Product | null>(null);
  const reads = useLatestRequest();
  const stateRef = useRef(state);
  stateRef.current = state;
  /** When this device last changed this product (from here or a screen opened from here). */
  const ownChangeAt = useRef(0);

  /** Product, categories and the one-row cost history, together. A failed history read is kept as such. */
  const readAll = () => Promise.all([
    products.getProduct(businessId, productId),
    products.listCategories(businessId, { includeArchived: true }),
    products.getLastKnownCost(businessId, productId).then(
      (row): CostHistoryRead => ({ kind: 'ok', row }),
      (): CostHistoryRead => ({ kind: 'failed' }),
    ),
  ]);

  /**
   * A full load: the first one, Try again, and the reload after this device's own change. It
   * replaces any read still running (whose answer may predate the change).
   */
  const load = async ({ own = false } = {}) => {
    const startedAt = Date.now();
    if (own) ownChangeAt.current = startedAt;
    setLastAttemptAt(startedAt);
    await reads.run(readAll, async ([product, categories, history]) => {
      if (!product) { setState({ kind: 'not_found' }); return; }
      const before = stateRef.current.kind === 'ready' ? stateRef.current.data.product : null;
      setState({ kind: 'ready', data: { product, categories, history, at: new Date().toISOString() } });
      // Without the history the cost can't be shown (state 4): say so, with Try again
      setRefreshFailed(needsHistory(product) && history.kind === 'failed');
      if (before && !sameProduct(before, product)) await noteChange(product, startedAt);
    }, (e) => {
      // Confirmed values already on screen stay, marked "couldn't refresh"; the cost becomes state 4
      if (stateRef.current.kind === 'ready') setRefreshFailed(true);
      else setState({ kind: 'error', message: e instanceof ReadError ? e.message : "We couldn't load this product. Please try again." });
    });
  };

  /**
   * A silent refresh (the app returned, shown again, every 15 minutes): keeps everything on screen
   * if it fails, and doesn't start while another read is running (Review-2 finding 3).
   */
  const refreshSilently = async ({ retry = false } = {}) => {
    if (stateRef.current.kind !== 'ready') { if (retry) load(); return; }
    if (reads.running && !retry) return;
    const startedAt = Date.now();
    setLastAttemptAt(startedAt);
    await reads.run(readAll, async ([product, categories, history]) => {
      const was = stateRef.current;
      if (!product) { setState({ kind: 'not_found' }); return; }
      setState({ kind: 'ready', data: { product, categories, history, at: new Date().toISOString() } });
      // Without the history the cost can't be shown (state 4): say so, with Try again
      setRefreshFailed(needsHistory(product) && history.kind === 'failed');
      if (was.kind === 'ready' && !sameProduct(was.data.product, product)) await noteChange(product, startedAt);
    }, () => setRefreshFailed(true));
  };

  /** "Changed on another device" only when it can't be this device's own change (increment 2b rule). */
  const noteChange = async (now: Product, startedAt: number) => {
    if (startedAt - ownChangeAt.current <= OWN_CHANGE_WINDOW_MS) return;
    const own = await Promise.all([products.hasUnconfirmed('update_product', now.id), products.hasUnconfirmed('set_cost', now.id)])
      .then(([a, b]) => a || b, () => true);
    if (!own) setChangedElsewhere(true);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // After a save on this tab (here, or on a screen opened from here): reload, as this device's own change
  const firstKey = useRef(refreshKey);
  useEffect(() => { if (refreshKey !== firstKey.current) load({ own: true }); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Not while a change is being saved, nor while the price sheet is open (it runs when they end)
  useFreshness({ visible, lastLoadedAt: lastAttemptAt, busy: busy || priceFor !== null, refresh: () => { refreshSilently(); } });
  useEffect(() => { if (notice) { setFlash(notice); onNoticeShown(); } }, [notice]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Archive asks first (destructive); Restore is harmless and reversible, so it runs at once. */
  const runArchive = async (product: Product, archiving: boolean) => {
    setMessage(null);
    setBusy(true);
    const res = await products.setArchived(businessId, product.id, archiving);
    setBusy(false);
    if (res.ok) {
      ownChangeAt.current = Date.now();
      setFlash(archiving ? `${product.name} archived` : `${product.name} restored`);
      onChanged();
    } else setMessage({ tone: outcomeTone(res.kind), text: res.message });
  };
  const toggleArchive = (product: Product) => {
    if (!product.active) { runArchive(product, false); return; }
    confirmAction({
      title: `Archive ${product.name}?`,
      message: 'It will be hidden from your product list. Nothing is deleted, its history is kept, and you can restore it at any time.',
      confirmLabel: 'Archive', destructive: true, onConfirm: () => { runArchive(product, true); },
    });
  };

  const { show, toast } = useToast();
  useEffect(() => { if (flash) { show(flash); setFlash(null); } }, [flash]); // eslint-disable-line react-hooks/exhaustive-deps
  const layout = useLayout();
  const pad = layout.width === 'compact' ? space.md : space.lg;

  const data = state.kind === 'ready' ? state.data : null;
  const product = data?.product ?? null;
  const archived = product !== null && !product.active;

  return (
    <View style={styles.root}>
      <ScreenHeader title={product?.name ?? 'Product'} subtitle={data && product ? categoryLabel(product.categoryId, data.categories) : undefined} onBack={onBack}
        action={product ? (
          <IconButton icon={EditIcon} label="Edit product" tone="header" onPress={() => onEdit(product.id)}
            disabled={archived} disabledReason="Archived. Restore it to make changes." />
        ) : undefined}>
        {product ? (
          <View style={styles.headerMeta}>
            <StockBadge qty={product.stockQty} lowStockLevel={product.lowStockLevel} unit={product.unit} />
            {archived ? <StatusBadge label="Archived" tone="neutral" /> : null}
          </View>
        ) : null}
        {data ? (
          <UpdatedLine label={updatedLabel(data.at, new Date(), refreshFailed) ?? ''} failed={refreshFailed} onRetry={() => { refreshSilently({ retry: true }); }} />
        ) : null}
      </ScreenHeader>

      <ScrollView contentContainerStyle={[styles.scroll, { padding: pad }]}>
        <View style={styles.column}>
          {offline ? (
            <Banner tone="offline" message="You're offline. Saving changes needs internet; your typing is kept."
              action={{ label: 'Check again', onPress: () => { products.checkConnection(businessId).then((ok) => { if (ok) refreshSilently({ retry: true }); }); } }} />
          ) : null}

          {state.kind === 'loading' ? <DetailsSkeleton /> : state.kind === 'error' ? (
            <FadeIn>
              <View style={styles.gap}>
                <Banner tone="danger" message={state.message} />
                <Button label="Try again" kind="secondary" onPress={() => { setState({ kind: 'loading' }); load(); }} />
              </View>
            </FadeIn>
          ) : state.kind === 'not_found' ? (
            <EmptyState icon={BoxIcon} title="This product can't be found"
              body="It may have been deleted on another device. Go back to your products; the list will be refreshed."
              action={<Button label="Back to products" onPress={onBackToList} />} />
          ) : (
            <FadeIn>
              <DetailsBody data={state.data} costUnavailable={refreshFailed} offline={offline} busy={busy} message={message} changedElsewhere={changedElsewhere}
                onRetry={() => { refreshSilently({ retry: true }); }}
                onChangePrice={() => setPriceFor(state.data.product)}
                onCorrectCost={() => onCorrectCost(state.data.product.id)}
                onToggleArchive={() => toggleArchive(state.data.product)} />
            </FadeIn>
          )}
        </View>
      </ScrollView>

      <QuickPriceSheet product={priceFor} businessId={businessId} products={products} onClose={() => setPriceFor(null)}
        onSaved={(p, price) => {
          setPriceFor(null);
          ownChangeAt.current = Date.now();
          // Shown at once; the reload that follows (onChanged) brings the server's figures
          setState((s) => (s.kind === 'ready' ? { ...s, data: { ...s.data, product: { ...p, sellingPrice: price } } } : s));
          setFlash(`Price is now ${formatCedis(price)}`);
          onChanged();
        }}
        onRefreshed={(p) => {
          ownChangeAt.current = Date.now();
          setState((s) => (s.kind === 'ready' ? { ...s, data: { ...s.data, product: p } } : s));
        }} />
      {toast}
    </View>
  );
}

function DetailsBody({ data, costUnavailable, offline, busy, message, changedElsewhere, onRetry, onChangePrice, onCorrectCost, onToggleArchive }: {
  /** The latest read failed: the cost, margin and stock value are not shown (state 4, spec 08 §9.3). */
  data: Loaded; costUnavailable: boolean; offline: boolean; busy: boolean; message: Outcome | null; changedElsewhere: boolean;
  onRetry: () => void; onChangePrice: () => void; onCorrectCost: () => void; onToggleArchive: () => void;
}) {
  const { product, categories, history } = data;
  const now = new Date();
  const cost = shownCost(product, history, costUnavailable);
  const costShown = costText(cost, now);
  const margin = marginText(marginInfo(product.sellingPrice, cost));
  const stockValue = stockValueAbout(cost);
  const archived = !product.active;
  const status = STOCK_STATE_STYLE[stockState(product.stockQty, product.lowStockLevel)];
  const statusTone = stockTone(product.stockQty, product.lowStockLevel);
  const unitWord = product.unit ?? 'unit';

  return (
    <View style={styles.gap}>
      {archived ? (
        <Banner tone="warning" title="This product is archived." message="Restore it to make changes. It is hidden from your product list, and its history is kept." />
      ) : null}
      {costUnavailable ? (
        <Banner tone="warning" title="Couldn't refresh"
          message={`The price and stock below are from ${formatTime(data.at)} and may have changed. Cost and margin are hidden until the figures can be loaded again.`} />
      ) : null}
      {changedElsewhere ? <Banner tone="info" message="This product was changed on another device. The latest details are shown." /> : null}
      {message ? <Notice tone={message.tone} text={message.text} /> : null}

      {/* Selling price: a confirmed value, so no "(about)" */}
      <Card style={styles.hero}>
        <AppText variant="caption" tone="textSecondary" style={styles.overline}>Selling price</AppText>
        <AppText variant="display" number accessibilityLabel={`Selling price ${formatCedis(product.sellingPrice)} per ${unitWord}`}>
          {formatCedis(product.sellingPrice)}
        </AppText>
        <AppText variant="body" tone="textSecondary">per {unitWord}</AppText>
      </Card>

      <View style={styles.stats}>
        <Figure label="In stock" value={`${product.stockQty.toLocaleString('en-GB')} ${product.unit ?? (Math.abs(product.stockQty) === 1 ? 'unit' : 'units')}`}
          detail={`${status.label} · Low at ${product.lowStockLevel.toLocaleString('en-GB')}`} detailTone={statusTone} />
        <Figure label={costShown.label} value={costShown.value} detail={costShown.detail} note={costShown.note} figure={costShown.figure}
          help={AVERAGE_COST_HELP} helpName="average cost"
          action={cost.state === 'unavailable' ? <Button label="Try again" kind="quiet" onPress={onRetry} /> : null} />
        <Figure label={margin.label} value={margin.value} detail={margin.detail} figure={margin.figure}
          valueTone={margin.loss ? 'danger' : undefined} detailTone={margin.loss ? 'danger' : undefined}
          help={MARGIN_HELP} helpName="margin" />
        {stockValue !== null ? <Figure label="Stock value (about)" value={formatCedis(stockValue)} detail="Stock × average cost" /> : null}
      </View>
      <AppText variant="caption" tone="textSecondary">Average cost is worked out from your stock value; it changes with restocks and corrections.</AppText>

      <Card padded={false}>
        <View style={styles.cardHead}><AppText variant="heading" accessibilityRole="header">Details</AppText></View>
        <InfoRow label="Unit" value={product.unit ?? 'Not set'} />
        <InfoRow label="Category" value={categoryLabel(product.categoryId, categories)} />
        <InfoRow label="Low-stock level" value={`${product.lowStockLevel.toLocaleString('en-GB')}`} hint="Shown as Low at or below this" />
        <InfoRow label="Stock status" value={status.label} valueTone={statusTone} />
      </Card>

      <Card>
        <AppText variant="heading" accessibilityRole="header">More actions</AppText>
        <View style={styles.actionRow}>
          <Button label="Change price" kind="secondary" onPress={onChangePrice} disabled={archived || offline || busy} />
          <Button label="Correct cost price" kind="secondary" onPress={onCorrectCost} disabled={archived || offline || busy} />
        </View>
        {archived ? <AppText variant="caption" tone="textSecondary">Restore it to make changes.</AppText>
          : offline ? <AppText variant="caption" tone="textSecondary">Changes need internet.</AppText> : null}
        <AppText variant="caption" tone="textSecondary">Stock changes only through Restock and Adjust stock, so its history stays complete.</AppText>
        <Divider />
        {archived ? (
          <Button label="Restore product" kind="secondary" onPress={onToggleArchive} busy={busy} disabled={offline} />
        ) : (
          <Button label="Archive product" kind="destructive" onPress={onToggleArchive} busy={busy} disabled={offline} />
        )}
      </Card>
    </View>
  );
}

/** One figure (spec 08 Stat): label (with an optional ⓘ), value, and a line or two beneath. */
function Figure({ label, value, detail = null, note = null, figure = true, help, helpName, valueTone, detailTone, action }: {
  label: string; value: string; detail?: string | null; note?: string | null; figure?: boolean;
  help?: string; helpName?: string; valueTone?: ColorRole; detailTone?: ColorRole; action?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card style={styles.stat}>
      <View style={styles.statLabelRow}>
        <AppText variant="caption" tone="textSecondary" style={styles.statLabel}>{label}</AppText>
        {help ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`How ${helpName ?? label} is worked out`} accessibilityState={{ expanded: open }}
            onPress={() => setOpen((o) => !o)} hitSlop={14} style={({ pressed }) => [styles.infoButton, pressed && styles.pressed]}>
            <InfoIcon colour={color.brand} size={18} />
          </Pressable>
        ) : null}
      </View>
      <View accessible accessibilityLabel={[label, value, detail, note].filter(Boolean).join('. ')}>
        <AppText variant={figure ? 'displaySmall' : 'label'} number={figure} tone={valueTone ?? 'textPrimary'}>{value}</AppText>
        {detail ? <AppText variant="caption" tone={detailTone ?? 'textSecondary'} style={styles.detail}>{detail}</AppText> : null}
        {note ? <AppText variant="caption" tone="textSecondary">{note}</AppText> : null}
      </View>
      {action}
      {open && help ? <View style={styles.help} accessibilityLiveRegion="polite"><AppText variant="caption">{help}</AppText></View> : null}
    </Card>
  );
}

function InfoRow({ label, value, hint, valueTone }: { label: string; value: string; hint?: string; valueTone?: ColorRole }) {
  return (
    <View>
      <Divider />
      <View style={styles.infoRow} accessible accessibilityLabel={`${label}: ${value}`}>
        <View style={styles.infoText}>
          <AppText variant="body" tone="textSecondary">{label}</AppText>
          {hint ? <AppText variant="caption" tone="textSecondary">{hint}</AppText> : null}
        </View>
        <AppText variant="label" tone={valueTone ?? 'textPrimary'} style={styles.infoValue}>{value}</AppText>
      </View>
    </View>
  );
}

/** A placeholder shaped like the page while it loads. */
function DetailsSkeleton() {
  return (
    <View style={styles.gap} accessible accessibilityLabel="Loading the product">
      <Card style={styles.hero}>
        <Skeleton width="35%" height={14} />
        <Skeleton width="55%" height={34} />
        <Skeleton width="25%" height={14} />
      </Card>
      <View style={styles.stats}>
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} style={styles.stat}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="70%" height={22} />
            <Skeleton width="45%" height={14} />
          </Card>
        ))}
      </View>
      <Card>
        <Skeleton width="30%" height={18} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="80%" height={14} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  scroll: { paddingBottom: space.xxl },
  column: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: space.md },
  gap: { gap: space.md },
  pressed: { opacity: 0.6 },
  headerMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs, marginTop: space.xxs },
  hero: { gap: 2 },
  overline: { fontWeight: '600', letterSpacing: 0.4 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  // Two per row on phones; one per row when large text makes them narrower than this
  stat: { flexGrow: 1, flexBasis: '45%', minWidth: 150, gap: space.xxs },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, minHeight: 24 },
  statLabel: { flexShrink: 1, fontWeight: '600' },
  infoButton: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  detail: { fontWeight: '600', marginTop: 2 },
  help: { backgroundColor: color.successBg, borderRadius: radius.sm, padding: space.xs },
  cardHead: { paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.xs },
  infoRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.md, rowGap: 2, minHeight: control.touchTarget + 8, paddingHorizontal: space.md, paddingVertical: space.xs },
  infoText: { flexGrow: 1, flexShrink: 1, gap: 2 },
  infoValue: { flexShrink: 1, textAlign: 'right' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
