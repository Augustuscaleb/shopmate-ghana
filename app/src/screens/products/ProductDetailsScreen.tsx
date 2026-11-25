/**
 * S-37 Product detail, the read-only part (Stage 1C-3.1; plan §5.1 – §5.2; spec 08 rev 2 §9.2 – §9.4).
 * Nothing on this page can be changed by typing. A compact pencil top-right in the header
 * (spoken as "Edit product"; owner decision 25 Nov 2026, replacing the bottom-bar button) opens
 * the existing form; "Change price" opens the existing quick price sheet; "Correct cost
 * price" opens the existing audited screen; Archive / Restore asks for confirmation first.
 *
 * Built with the current components and colours: the new design system and restyling come in
 * 1C-3.2 and 1C-3.3 (owner decisions V-3, C-1b).
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
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Notice } from '../../ui/components';
import { Card, EmptyState, HeaderIconButton, OfflineBar, ScreenHeader, StockChip, SuccessFlash, UpdatedLine } from '../../ui/surfaces';
import { FadeIn, Skeleton } from '../../ui/animated';
import { BoxIcon, PencilIcon } from '../../ui/icons';
import { STOCK_STATE_STYLE, stockState } from '../../ui/stockStatus';
import { colours, radius, space, touch, type } from '../../ui/theme';
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

  const toggleArchive = (product: Product) => {
    const archiving = product.active;
    Alert.alert(
      archiving ? `Archive ${product.name}?` : `Restore ${product.name}?`,
      archiving
        ? 'It will be hidden from your product list. Nothing is deleted, its history is kept, and you can restore it at any time.'
        : 'It will appear in your product list again, and you can change it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: archiving ? 'Archive' : 'Restore',
          style: archiving ? 'destructive' : 'default',
          onPress: async () => {
            setMessage(null);
            setBusy(true);
            const res = await products.setArchived(businessId, product.id, archiving);
            setBusy(false);
            if (res.ok) {
              ownChangeAt.current = Date.now();
              setFlash(archiving ? `${product.name} archived` : `${product.name} restored`);
              onChanged();
            } else setMessage({ tone: outcomeTone(res.kind), text: res.message });
          },
        },
      ],
    );
  };

  const data = state.kind === 'ready' ? state.data : null;
  const product = data?.product ?? null;
  const archived = product !== null && !product.active;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader title={product?.name ?? 'Product'} subtitle={data && product ? categoryLabel(product.categoryId, data.categories) : undefined} onBack={onBack}
          action={product ? (
            <HeaderIconButton icon={PencilIcon} label="Edit product" onPress={() => onEdit(product.id)}
              disabled={archived} disabledReason="Archived. Restore it to make changes." />
          ) : undefined}>
          {product ? (
            <View style={styles.headerMeta}>
              <StockChip qty={product.stockQty} lowStockLevel={product.lowStockLevel} unit={product.unit} />
              {archived ? <View style={styles.archivedTag}><Text style={styles.archivedTagText}>Archived</Text></View> : null}
            </View>
          ) : null}
          {data ? (
            <UpdatedLine label={updatedLabel(data.at, new Date(), refreshFailed)} failed={refreshFailed} onRetry={() => { refreshSilently({ retry: true }); }} onGreen />
          ) : null}
        </ScreenHeader>

        <View style={styles.body}>
          {offline ? <OfflineBar onCheck={() => { products.checkConnection(businessId).then((ok) => { if (ok) refreshSilently({ retry: true }); }); }} /> : null}
          <SuccessFlash message={flash} onDone={() => setFlash(null)} />

          {state.kind === 'loading' ? <DetailsSkeleton /> : state.kind === 'error' ? (
            <FadeIn>
              <View style={styles.gap}>
                <Notice tone="error" text={state.message} />
                <Button label="Try again" onPress={() => { setState({ kind: 'loading' }); load(); }} />
              </View>
            </FadeIn>
          ) : state.kind === 'not_found' ? (
            <EmptyState icon={BoxIcon} title="This product can't be found"
              body="It may have been deleted on another device. Go back to your products; the list will be refreshed."
              action={<View style={styles.emptyAction}><Button label="Back to products" onPress={onBackToList} /></View>} />
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
  const unitWord = product.unit ?? 'unit';

  return (
    <View style={styles.gap}>
      {archived ? (
        <View style={styles.archivedBanner} accessibilityLiveRegion="polite">
          <Text style={styles.archivedBannerTitle}>This product is archived.</Text>
          <Text style={styles.archivedBannerText}>Restore it to make changes. It is hidden from your product list, and its history is kept.</Text>
        </View>
      ) : null}
      {costUnavailable ? (
        <View style={styles.staleBanner} accessibilityLiveRegion="polite">
          <Text style={styles.staleTitle}>Couldn't refresh</Text>
          <Text style={styles.staleText}>
            The price and stock below are from {formatTime(data.at)} and may have changed. Cost and margin are hidden until the figures can be loaded again.
          </Text>
        </View>
      ) : null}
      {changedElsewhere ? <Notice text="This product was changed on another device. The latest details are shown." /> : null}
      {message ? <Notice tone={message.tone} text={message.text} /> : null}

      {/* Selling price: a confirmed value, so no "(about)" */}
      <Card style={styles.hero}>
        <Text style={styles.heroLabel}>Selling price</Text>
        <Text style={styles.heroValue} accessibilityLabel={`Selling price ${formatCedis(product.sellingPrice)} per ${unitWord}`}>
          {formatCedis(product.sellingPrice)}
        </Text>
        <Text style={styles.heroUnit}>per {unitWord}</Text>
      </Card>

      <View style={styles.stats}>
        <Stat label="In stock" value={`${product.stockQty.toLocaleString('en-GB')} ${product.unit ?? (Math.abs(product.stockQty) === 1 ? 'unit' : 'units')}`}
          detail={`${status.label} · Low at ${product.lowStockLevel.toLocaleString('en-GB')}`} detailColour={status.text} />
        <Stat label={costShown.label} value={costShown.value} detail={costShown.detail} note={costShown.note} figure={costShown.figure}
          help={AVERAGE_COST_HELP} helpName="average cost"
          action={cost.state === 'unavailable' ? <Button label="Try again" kind="link" onPress={onRetry} /> : null} />
        <Stat label={margin.label} value={margin.value} detail={margin.detail} figure={margin.figure}
          valueColour={margin.loss ? colours.danger : undefined} detailColour={margin.loss ? colours.danger : undefined}
          help={MARGIN_HELP} helpName="margin" />
        {stockValue !== null ? <Stat label="Stock value (about)" value={formatCedis(stockValue)} detail="Stock × average cost" /> : null}
      </View>
      <Text style={styles.caption}>Average cost is worked out from your stock value; it changes with restocks and corrections.</Text>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Details</Text>
        <InfoRow label="Unit" value={product.unit ?? 'Not set'} />
        <InfoRow label="Category" value={categoryLabel(product.categoryId, categories)} />
        <InfoRow label="Low-stock level" value={`${product.lowStockLevel.toLocaleString('en-GB')}`} hint="Shown as Low at or below this" />
        <InfoRow label="Stock status" value={status.label} valueColour={status.text} last />
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">More actions</Text>
        <Button label="Change price" kind="secondary" onPress={onChangePrice} disabled={archived || offline || busy} />
        <Button label="Correct cost price" kind="secondary" onPress={onCorrectCost} disabled={archived || offline || busy} />
        {archived ? <Text style={styles.caption}>Restore it to make changes.</Text>
          : offline ? <Text style={styles.caption}>Changes need internet.</Text> : null}
        <Text style={styles.caption}>Stock changes only through Restock and Adjust stock, so its history stays complete.</Text>
        <View style={styles.divider} />
        {archived ? (
          <Button label="Restore product" kind="secondary" onPress={onToggleArchive} busy={busy} disabled={offline} />
        ) : (
          <DangerButton label="Archive product" onPress={onToggleArchive} busy={busy} disabled={offline} />
        )}
      </Card>
    </View>
  );
}

/** One figure (spec 08 Stat): label (with an optional ⓘ), value, and a line or two beneath. */
function Stat({ label, value, detail = null, note = null, figure = true, help, helpName, valueColour, detailColour, action }: {
  label: string; value: string; detail?: string | null; note?: string | null; figure?: boolean;
  help?: string; helpName?: string; valueColour?: string; detailColour?: string; action?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card style={styles.stat}>
      <View style={styles.statLabelRow}>
        <Text style={styles.statLabel}>{label}</Text>
        {help ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`How ${helpName ?? label} is worked out`} accessibilityState={{ expanded: open }}
            onPress={() => setOpen((o) => !o)} hitSlop={12} style={({ pressed }) => [styles.infoButton, pressed && styles.pressed]}>
            <Text style={styles.infoButtonText}>i</Text>
          </Pressable>
        ) : null}
      </View>
      <View accessible accessibilityLabel={[label, value, detail, note].filter(Boolean).join('. ')}>
        <Text style={[figure ? styles.statValue : styles.statWords, valueColour ? { color: valueColour } : null]}>{value}</Text>
        {detail ? <Text style={[styles.statDetail, detailColour ? { color: detailColour } : null]}>{detail}</Text> : null}
        {note ? <Text style={styles.statNote}>{note}</Text> : null}
      </View>
      {action}
      {open && help ? <Text style={styles.help} accessibilityLiveRegion="polite">{help}</Text> : null}
    </Card>
  );
}

function InfoRow({ label, value, hint, valueColour, last = false }: { label: string; value: string; hint?: string; valueColour?: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        {hint ? <Text style={styles.caption}>{hint}</Text> : null}
      </View>
      <Text style={[styles.infoValue, valueColour ? { color: valueColour } : null]}>{value}</Text>
    </View>
  );
}

/** The destructive action at the end of the page (spec 08 §9.2), confirmed before anything happens. */
function DangerButton({ label, onPress, busy, disabled }: { label: string; onPress: () => void; busy: boolean; disabled: boolean }) {
  const inactive = busy || disabled;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: inactive, busy }}
      onPress={inactive ? undefined : onPress} style={({ pressed }) => [styles.danger, pressed && !inactive && styles.pressed, inactive && styles.inactive]}>
      <Text style={styles.dangerText}>{busy ? 'Working…' : label}</Text>
    </Pressable>
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
      <Card style={styles.section}>
        <Skeleton width="30%" height={18} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="80%" height={14} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colours.warmWhite },
  scroll: { paddingBottom: space.xl },
  body: { padding: space.md, gap: space.md },
  gap: { gap: space.md },
  headerMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  archivedTag: { borderRadius: radius.pill, paddingHorizontal: space.sm + 2, paddingVertical: 4, backgroundColor: colours.warnBg },
  archivedTagText: { fontSize: type.caption, fontWeight: '800', color: colours.warnText },
  archivedBanner: { backgroundColor: colours.warnBg, borderRadius: radius.md, padding: space.md, borderLeftWidth: 4, borderLeftColor: colours.warnText, gap: space.xs },
  archivedBannerTitle: { fontSize: type.body, fontWeight: '800', color: colours.warnText },
  archivedBannerText: { fontSize: type.body, color: colours.ink },
  staleBanner: { backgroundColor: colours.warnBg, borderRadius: radius.md, padding: space.md, borderLeftWidth: 4, borderLeftColor: colours.warnText, gap: space.xs },
  staleTitle: { fontSize: type.body, fontWeight: '800', color: colours.warnText },
  staleText: { fontSize: type.body, color: colours.ink },
  hero: { padding: space.md + 4, gap: 2 },
  heroLabel: { fontSize: type.caption, fontWeight: '700', color: colours.stone },
  heroValue: { fontSize: type.keyFigure + 4, fontWeight: '800', color: colours.ink, fontVariant: ['tabular-nums'] },
  heroUnit: { fontSize: type.body, color: colours.stone },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // Two per row on phones; one per row when large text makes them narrower than this
  stat: { flexGrow: 1, flexBasis: '45%', minWidth: 150, padding: space.md, gap: space.xs },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 24 },
  statLabel: { flexShrink: 1, fontSize: type.caption, fontWeight: '700', color: colours.stone },
  statValue: { fontSize: type.section + 2, fontWeight: '800', color: colours.ink, fontVariant: ['tabular-nums'] },
  statWords: { fontSize: type.body, fontWeight: '800', color: colours.ink },
  statDetail: { fontSize: type.caption, fontWeight: '600', color: colours.stone, marginTop: 2 },
  statNote: { fontSize: type.caption, color: colours.stone, marginTop: 2 },
  infoButton: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colours.shopGreen, alignItems: 'center', justifyContent: 'center' },
  infoButtonText: { fontSize: type.caption, fontWeight: '800', color: colours.shopGreen, fontStyle: 'italic' },
  help: { fontSize: type.caption, color: colours.ink, backgroundColor: colours.tint, borderRadius: radius.sm, padding: space.sm, lineHeight: 20 },
  caption: { fontSize: type.caption, color: colours.stone },
  section: { padding: space.md, gap: space.md },
  sectionTitle: { fontSize: type.section, fontWeight: '800', color: colours.ink },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch.min, paddingBottom: space.sm },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: colours.sand },
  infoLabel: { fontSize: type.body, color: colours.stone },
  infoValue: { flexShrink: 1, fontSize: type.body, fontWeight: '700', color: colours.ink, textAlign: 'right' },
  divider: { height: 1, backgroundColor: colours.sand },
  danger: { minHeight: touch.primaryButton, borderRadius: 12, borderWidth: 2, borderColor: colours.danger, backgroundColor: colours.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
  dangerText: { color: colours.danger, fontSize: type.body + 1, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  inactive: { opacity: 0.5 },
  emptyAction: { alignSelf: 'stretch', marginTop: space.sm },
});
