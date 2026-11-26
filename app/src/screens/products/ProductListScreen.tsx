/**
 * S-30 Products (online-only in 1C-2, D-3) with S-32 Quick price change — redesigned on the v2 kit
 * (Stage 1C-3.3). Server-paginated (range + exact count); search, category filter (with "Manage
 * categories"), sort A–Z or "Lowest stock" (a sort by stock quantity, fewest first: NOT a low-stock
 * filter; owner-accepted as temporary, 25 Nov 2026; the true low-stock list is S-35), and archived
 * products. Stock state always as a word and a colour (D-6). Loading, refresh, paging and the
 * spinner rules are unchanged from increment 2b; only the presentation changed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFreshness } from '../../ui/useFreshness';
import { updatedLabel } from '../../lib/freshness';
import { FadeIn } from '../../ui/animated';
import {
  AppText, Banner, Button, Card, Chip, EmptyState, ListRow, Notice, ScreenHeader, SearchField, Sheet, SkeletonRow,
  StockBadge, TextAction, TextField, UpdatedLine, color, space, useLayout, useToast,
} from '../../ui/kit';
import { BoxIcon, PlusIcon, SearchIcon, TagIcon } from '../../ui/kit/icons';
import { useConnectivity } from '../../ui/useConnectivity';
import { formatCedis } from '../../services/dashboard';
import { pesewasToInput } from '../../lib/money';
import { checkSellingPrice } from '../../services/productForm';
import { PAGE_SIZE, ReadError, type Category, type CategoryFilter, type Product, type ProductSort, type ProductsService } from '../../services/products';
import {
  canLoadMore, filterLoadFailed, filterLoadStarted, listLoaded, loadMoreFailed, loadMoreStarted, loadMoreSucceeded,
  planRefresh, refreshFailed, refreshSucceeded, spinnerOnDone, spinnerOnPull, spinnerOnSupersede, type ListState, type SpinnerOwner,
} from './productListState';

export function ProductListScreen({ businessId, products, onAdd, onOpen, onManageCategories, notice, onNoticeShown, refreshKey, visible }: {
  businessId: string;
  /** On screen (Products tab selected and nothing on top): automatic refreshes run only then. */
  visible: boolean;
  /** Changes after a save on another screen of the tab: the list and categories reload. */
  refreshKey: number;
  products: ProductsService;
  onAdd: () => void;
  onOpen: (productId: string) => void;
  onManageCategories: () => void;
  notice: string | null;
  onNoticeShown: () => void;
}) {
  const online = useConnectivity();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>({ kind: 'all' });
  const [sort, setSort] = useState<ProductSort>('name');
  const [archived, setArchived] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [state, setState] = useState<ListState>({ kind: 'loading' });
  /** The request that owns the pull-down spinner (rules in productListState.ts). */
  const [spinnerOwner, setSpinnerOwner] = useState<SpinnerOwner>(null);
  const refreshing = spinnerOwner !== null;
  const [priceFor, setPriceFor] = useState<Product | null>(null);
  const [flash, setFlash] = useState<string | null>(notice);
  const token = useRef(0);
  /** The token of the first-page load now running, if any (no duplicate first load; Review-2 finding 3). */
  const loadInFlight = useRef<number | null>(null);

  // Search runs 300 ms after typing stops
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const [lastAttemptAt, setLastAttemptAt] = useState<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  /** Categories for the filter chips; a failed reload keeps the chips already shown. */
  const loadCategories = useCallback(async () => {
    try { setCategories(await products.listCategories(businessId)); } catch { /* keep the chips already shown */ }
  }, [products, businessId]);

  /** A new search, filter or sort: the first page of the new list. */
  const load = useCallback(async () => {
    const mine = ++token.current;
    loadInFlight.current = mine;
    setLastAttemptAt(Date.now());
    setState(filterLoadStarted);
    // Replacing a pull-to-refresh: this load now owns its spinner, and turns it off when it ends
    setSpinnerOwner((o) => spinnerOnSupersede(o, mine));
    try {
      const page = await products.listProducts(businessId, { search: query, category, archived, sort, offset: 0, limit: PAGE_SIZE });
      if (mine === token.current) setState(listLoaded(page, new Date()));
    } catch (e) {
      if (mine === token.current) setState(filterLoadFailed(e instanceof ReadError ? e.message : "We couldn't load your products. Please try again."));
    } finally {
      if (loadInFlight.current === mine) loadInFlight.current = null;
      setSpinnerOwner((o) => spinnerOnDone(o, mine));
    }
  }, [products, businessId, query, category, archived, sort]);

  /** The token of the silent refresh now running, if any (one at a time; review finding 5). */
  const refreshInFlight = useRef<number | null>(null);

  /**
   * Refresh the SAME list (same search, filters and sort) without disturbing the screen
   * (increment 2b): the rows already loaded are reloaded in place, so scroll position survives.
   * A failed refresh keeps every row on screen and shows "couldn't refresh"; it never replaces a
   * populated list with an empty or error state. Pull-to-refresh uses this too, with the spinner.
   */
  const refreshList = useCallback(async ({ spinner = false, afterSave = false } = {}) => {
    const plan = planRefresh(stateRef.current, refreshInFlight.current !== null && refreshInFlight.current === token.current, PAGE_SIZE,
      loadInFlight.current !== null && loadInFlight.current === token.current);
    // A first load that started before this device's own save may miss it: replace it
    if (plan.kind === 'load' || (plan.kind === 'skip' && plan.why === 'first_loading' && afterSave)) { load(); loadCategories(); return; }
    if (plan.kind === 'skip') {
      // A refresh is already running, or a new search, filter or sort is loading (its answer is
      // the fresh list): a pull-down shows the spinner until that request answers.
      // Either way the running request (refresh, or the new search/filter load) owns the spinner
      if (spinner) setSpinnerOwner(spinnerOnPull(token.current));
      return;
    }
    const mine = ++token.current;
    refreshInFlight.current = mine;
    setLastAttemptAt(Date.now());
    setSpinnerOwner((o) => (spinner ? spinnerOnPull(mine) : spinnerOnSupersede(o, mine)));
    loadCategories();
    try {
      const page = await products.listProducts(businessId, { search: query, category, archived, sort, offset: 0, limit: plan.limit });
      if (mine === token.current) setState((s) => refreshSucceeded(s, page, new Date()));
    } catch {
      if (mine === token.current) setState(refreshFailed);
    } finally {
      if (refreshInFlight.current === mine) refreshInFlight.current = null;
      setSpinnerOwner((o) => spinnerOnDone(o, mine));
    }
  }, [products, businessId, query, category, archived, sort, load, loadCategories]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCategories(); }, [loadCategories]);
  // After a save on another screen of this tab: refresh in place
  const firstRefreshKey = useRef(refreshKey);
  useEffect(() => { if (refreshKey !== firstRefreshKey.current) refreshList({ afterSave: true }); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Increment 2b: when the app returns, when the list is shown again, and every 15 minutes
  useFreshness({ visible, lastLoadedAt: lastAttemptAt, refresh: () => { refreshList(); } });
  useEffect(() => { if (notice) { setFlash(notice); onNoticeShown(); } }, [notice]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async () => {
    const current = stateRef.current;
    if (current.kind !== 'ready' || !canLoadMore(current)) return;
    // A refresh or new filter that starts meanwhile changes the token: this answer is then
    // dropped, and that load clears "loading more" whether it succeeds or fails.
    const mine = token.current;
    setState(loadMoreStarted);
    try {
      const page = await products.listProducts(businessId, { search: query, category, archived, sort, offset: current.rows.length, limit: PAGE_SIZE });
      if (mine === token.current) setState((s) => loadMoreSucceeded(s, page));
    } catch (e) {
      if (mine === token.current) setState((s) => loadMoreFailed(s, e instanceof ReadError ? e.message : 'Could not load more.'));
    }
  }, [products, businessId, query, category, archived, sort]);

  const categoryName = useCallback((id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? null : null), [categories]);
  const filtered = !!query.trim() || category.kind !== 'all';
  const subtitle = state.kind === 'ready'
    ? `${state.total.toLocaleString('en-GB')} ${archived ? 'archived ' : ''}product${state.total === 1 ? '' : 's'}${filtered ? ' found' : ''}`
    : archived ? 'Archived products' : 'Your shop catalogue';
  const layout = useLayout();
  const pad = layout.width === 'compact' ? space.md : space.lg;
  const { show, toast } = useToast();
  // A message from another screen of the tab ("… saved") is shown once as a toast
  useEffect(() => { if (flash) { show(flash); setFlash(null); } }, [flash]); // eslint-disable-line react-hooks/exhaustive-deps

  const controls = (
    <View style={styles.controls}>
      {online === 'offline' ? (
        <Banner tone="offline" message="You're offline. Saving changes needs internet; your typing is kept."
          action={{ label: 'Check again', onPress: () => { products.checkConnection(businessId).then((ok) => { if (ok) refreshList(); }); } }} />
      ) : null}
      <SearchField value={search} onChangeText={setSearch} placeholder="Search products" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
        <Chip label="All" selected={category.kind === 'all'} onPress={() => setCategory({ kind: 'all' })} />
        {categories.map((c) => (
          <Chip key={c.id} label={c.name} selected={category.kind === 'category' && category.id === c.id} onPress={() => setCategory({ kind: 'category', id: c.id })} />
        ))}
        <Chip label="No category" selected={category.kind === 'none'} onPress={() => setCategory({ kind: 'none' })} />
        <Chip label="Manage categories" icon={TagIcon} selected={false} onPress={onManageCategories} />
      </ScrollView>
      <View style={styles.sortRow}>
        <AppText variant="caption" tone="textSecondary" style={styles.sortLabel}>Sort</AppText>
        <Chip label="A–Z" selected={sort === 'name'} onPress={() => setSort('name')} />
        <Chip label="Lowest stock" selected={sort === 'lowest_stock'} onPress={() => setSort('lowest_stock')} />
        <View style={styles.flex} />
        <Chip label={archived ? 'Showing archived' : 'Archived'} selected={archived} onPress={() => setArchived((a) => !a)} />
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <ScreenHeader title="Products" subtitle={subtitle}
        action={<Button label="Add product" icon={PlusIcon} onPress={onAdd} disabled={online === 'offline'} />}>
        {state.kind === 'ready' ? (
          <UpdatedLine label={updatedLabel(state.updatedAt, new Date(), state.refreshFailed) ?? ''} failed={state.refreshFailed}
            onRetry={() => refreshList({ spinner: true })} />
        ) : null}
      </ScreenHeader>
      <FlatList
        data={state.kind === 'ready' ? state.rows : []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <>
            {controls}
            {state.kind === 'ready' && state.reloading ? <ActivityIndicator color={color.brand} style={styles.reloading} /> : null}
          </>
        }
        contentContainerStyle={[styles.list, { paddingHorizontal: pad }]}
        renderItem={({ item, index }) => (
          <ProductRow product={item} categoryName={categoryName(item.categoryId)} index={index}
            onOpen={() => onOpen(item.id)} onChangePrice={() => setPriceFor(item)} priceDisabled={online === 'offline' || !item.active} />
        )}
        ItemSeparatorComponent={Separator}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { refreshList({ spinner: true }); }} colors={[color.brand]} tintColor={color.brand} />}
        ListEmptyComponent={
          state.kind === 'loading' ? <View style={styles.skeletons}>{[0, 1, 2, 3, 4, 5].map((k) => <SkeletonRow key={k} />)}</View> :
          state.kind === 'error' ? (
            <FadeIn>
              <View style={styles.footer}>
                <Banner tone="danger" message={state.message} />
                <Button label="Try again" kind="secondary" onPress={() => load()} />
              </View>
            </FadeIn>
          ) : filtered ? (
            <EmptyState icon={SearchIcon} title="No products match" body="Try a different search or category." />
          ) : archived ? (
            <EmptyState icon={BoxIcon} title="No archived products" body="Products you archive appear here, and you can restore them." />
          ) : (
            <EmptyState icon={BoxIcon} title="No products yet" body="Add the items you sell, with their selling price, and optionally their cost and the stock you have now."
              action={<Button label="Add your first product" icon={PlusIcon} onPress={onAdd} disabled={online === 'offline'} />} />
          )
        }
        ListFooterComponent={
          state.kind !== 'ready' ? undefined
            : state.loadingMore ? <ActivityIndicator color={color.brand} style={styles.more} />
            : state.moreError ? <View style={styles.footer}><Notice tone="error" text={state.moreError} /><Button label="Try again" kind="secondary" onPress={loadMore} /></View>
            : state.rows.length > 0 && state.rows.length >= state.total ? <AppText variant="caption" tone="textSecondary" align="center" style={styles.endText}>{state.total === 1 ? 'That is your only product.' : `All ${state.total.toLocaleString('en-GB')} shown.`}</AppText>
            : <View style={styles.footerSpace} />
        }
      />
      <QuickPriceSheet product={priceFor} businessId={businessId} products={products} onClose={() => setPriceFor(null)}
        onSaved={(p, price) => {
          setPriceFor(null);
          setState((s) => s.kind === 'ready' ? { ...s, rows: s.rows.map((r) => r.id === p.id ? { ...p, sellingPrice: price } : r) } : s);
          setFlash(`${p.name}: price is now ${formatCedis(price)}`);
        }}
        onRefreshed={(p) => setState((s) => s.kind === 'ready' ? { ...s, rows: s.rows.map((r) => r.id === p.id ? p : r) } : s)} />
      {toast}
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

/** S-30 row (spec 08 §9.1): the whole row opens Details; "Change price" is a quiet text action. */
function ProductRow({ product, categoryName, index, onOpen, onChangePrice, priceDisabled }: {
  product: Product; categoryName: string | null; index: number; onOpen: () => void; onChangePrice: () => void; priceDisabled: boolean;
}) {
  const meta = [categoryName, product.unit ? `per ${product.unit}` : null].filter(Boolean).join(' · ');
  return (
    <FadeIn delay={Math.min(index, 8) * 30}>
      <Card padded={false} style={styles.rowCard}>
        <ListRow title={product.name} subtitle={meta || undefined} value={formatCedis(product.sellingPrice)}
          badge={<StockBadge qty={product.stockQty} lowStockLevel={product.lowStockLevel} unit={product.unit} />}
          onPress={onOpen} accessibilityLabel={`${product.name}, ${formatCedis(product.sellingPrice)}. Opens the product.`}
          action={product.active
            ? { label: 'Change price', onPress: onChangePrice, disabled: priceDisabled, accessibilityLabel: `Change price of ${product.name}` }
            : undefined} />
        {!product.active ? <View style={styles.archivedRow}><AppText variant="caption" tone="neutral" style={styles.bold}>Archived</AppText></View> : null}
      </Card>
    </FadeIn>
  );
}

/**
 * S-32 Quick price change: new selling price only (cost corrections are a separate, audited action, D-5).
 * Opened from the list and from Product Details (Stage 1C-3.1). Built on the kit Sheet, which is
 * height-limited and scrolls, so the iPhone keyboard can't push it out of view (QPS-D1 – D6).
 */
export function QuickPriceSheet({ product, businessId, products, onClose, onSaved, onRefreshed }: {
  product: Product | null; businessId: string; products: ProductsService; onClose: () => void; onSaved: (p: Product, price: number) => void;
  onRefreshed: (p: Product) => void;
}) {
  const online = useConnectivity();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  // The copy of the product this change is based on; replaced by the server's copy after a conflict
  const [base, setBase] = useState<Product | null>(product);
  useEffect(() => {
    if (product) { setBase(product); setText(pesewasToInput(product.sellingPrice)); setError(undefined); setUnconfirmed(false); setOutcome(null); }
  }, [product]);
  if (!product || !base) return null;

  const save = async () => {
    const checked = checkSellingPrice(text);
    if (!checked.ok) { setError(checked.error); return; }
    setBusy(true);
    setOutcome(null);
    const res = await products.changeSellingPrice(businessId, base, checked.value);
    setBusy(false);
    if (res.ok) { onSaved(base, checked.value); return; }
    setUnconfirmed(res.kind === 'unconfirmed');
    if (res.kind === 'conflict' || (res.kind === 'unconfirmed' && res.current)) { setBase(res.current!); onRefreshed(res.current!); }
    // "May have been saved" and "changed by someone else" aren't mistakes in what was typed
    if (res.kind === 'refused' || res.kind === 'not_sent') setError(res.message);
    else setOutcome(res.message);
  };

  // No autoFocus on the price field: on iPhone, focusing while the sheet is still appearing opened
  // the number pad on its own and the sheet was displaced out of view. The owner taps the field.
  return (
    <Sheet visible title="Change price" subtitle={`${base.name} · now ${formatCedis(base.sellingPrice)}`} onClose={onClose}>
      <TextField label="New selling price" prefix="GH₵" value={text} onChangeText={(t) => { setText(t); setError(undefined); }} keyboardType="decimal-pad"
        error={error} hint="The change is recorded in the shop's history." selectTextOnFocus />
      {outcome ? <Notice text={outcome} /> : null}
      {online === 'offline' ? <Notice tone="error" text="This needs internet. Your data is safe — try again when you're connected." /> : null}
      <Button label="Save price" size="large" fullWidth onPress={save} busy={busy} disabled={online === 'offline'} />
      {unconfirmed ? (
        <Button label="I've checked — save this price" kind="secondary" fullWidth onPress={async () => { await products.discardUnconfirmed('update_product', base.id); setUnconfirmed(false); save(); }} />
      ) : null}
      <View style={styles.center}><TextAction label="Cancel" onPress={onClose} /></View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  center: { alignItems: 'center' },
  list: { paddingTop: space.md, paddingBottom: space.xl },
  controls: { gap: space.xs, marginBottom: space.md },
  chipRow: { gap: space.xs, paddingVertical: 2 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  sortLabel: { fontWeight: '600' },
  reloading: { marginBottom: space.xs },
  separator: { height: space.xs },
  rowCard: { overflow: 'hidden' },
  archivedRow: { paddingHorizontal: space.md, paddingBottom: space.sm },
  skeletons: { gap: space.xs },
  footer: { gap: space.xs, marginTop: space.md },
  more: { margin: space.lg },
  endText: { marginVertical: space.lg },
  footerSpace: { height: space.lg },
});
