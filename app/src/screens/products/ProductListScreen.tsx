/**
 * S-30 Products (online-only in 1C-2, D-3) with S-32 Quick price change.
 * Server-paginated (range + exact count); search, category filter (with "Manage categories", owner
 * decision), sort A–Z or "Lowest stock" (a sort by stock quantity, fewest first: NOT a low-stock filter;
 * owner-accepted as temporary, 25 Nov 2026; the true low-stock list is S-35),
 * and archived products. Stock colours per D-6, always with a word.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Notice } from '../../ui/components';
import { Card, EmptyState, FilterChip, ListSkeleton, OfflineBar, ScreenHeader, SearchField, StockChip, SuccessFlash, UpdatedLine } from '../../ui/surfaces';
import { useFreshness } from '../../ui/useFreshness';
import { updatedLabel } from '../../lib/freshness';
import { FadeIn, PressableScale } from '../../ui/animated';
import { BoxIcon, SearchIcon, TagIcon } from '../../ui/icons';
import { colours, radius, space, touch, type } from '../../ui/theme';
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

  const header = (
    <View style={styles.controls}>
      {online === 'offline' ? <OfflineBar onCheck={() => { products.checkConnection(businessId).then((ok) => { if (ok) refreshList(); }); }} /> : null}
      <SuccessFlash message={flash} onDone={() => setFlash(null)} />
      <SearchField value={search} onChangeText={setSearch} placeholder="Search products" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
        <FilterChip label="All" selected={category.kind === 'all'} onPress={() => setCategory({ kind: 'all' })} />
        {categories.map((c) => (
          <FilterChip key={c.id} label={c.name} selected={category.kind === 'category' && category.id === c.id} onPress={() => setCategory({ kind: 'category', id: c.id })} />
        ))}
        <FilterChip label="No category" selected={category.kind === 'none'} onPress={() => setCategory({ kind: 'none' })} />
        <FilterChip label="Manage categories" icon={TagIcon} selected={false} onPress={onManageCategories} />
      </ScrollView>
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort</Text>
        <FilterChip label="A–Z" selected={sort === 'name'} onPress={() => setSort('name')} />
        <FilterChip label="Lowest stock" selected={sort === 'lowest_stock'} onPress={() => setSort('lowest_stock')} />
        <View style={{ flex: 1 }} />
        <FilterChip label={archived ? 'Showing archived' : 'Archived'} selected={archived} onPress={() => setArchived((a) => !a)} />
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <ScreenHeader title="Products" subtitle={subtitle}>
        {state.kind === 'ready' ? (
          <UpdatedLine label={updatedLabel(state.updatedAt, new Date(), state.refreshFailed)} failed={state.refreshFailed}
            onRetry={() => refreshList({ spinner: true })} onGreen />
        ) : null}
        <View style={styles.headerAction}>
          <Button label="+ Add product" kind="secondary" onPress={onAdd} disabled={online === 'offline'} />
        </View>
      </ScreenHeader>
      <FlatList
        data={state.kind === 'ready' ? state.rows : []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <>
            {header}
            {state.kind === 'ready' && state.reloading ? <ActivityIndicator color={colours.shopGreen} style={{ marginBottom: space.sm }} /> : null}
          </>
        }
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <ProductRow product={item} categoryName={categoryName(item.categoryId)} index={index}
            onOpen={() => onOpen(item.id)} onChangePrice={() => setPriceFor(item)} priceDisabled={online === 'offline' || !item.active} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { refreshList({ spinner: true }); }} colors={[colours.shopGreen]} />}
        ListEmptyComponent={
          state.kind === 'loading' ? <ListSkeleton /> :
          state.kind === 'error' ? (
            <FadeIn>
              <View style={styles.footer}>
                <Notice tone="error" text={state.message} />
                <Button label="Try again" onPress={() => load()} />
              </View>
            </FadeIn>
          ) : filtered ? (
            <EmptyState icon={SearchIcon} title="No products match" body="Try a different search or category." />
          ) : archived ? (
            <EmptyState icon={BoxIcon} title="No archived products" body="Products you archive appear here, and you can restore them." />
          ) : (
            <EmptyState icon={BoxIcon} title="No products yet" body="Add the items you sell, with their selling price, and optionally their cost and the stock you have now."
              action={<View style={{ alignSelf: 'stretch', marginTop: space.sm }}><Button label="Add your first product" onPress={onAdd} disabled={online === 'offline'} /></View>} />
          )
        }
        ListFooterComponent={
          state.kind !== 'ready' ? undefined
            : state.loadingMore ? <ActivityIndicator color={colours.shopGreen} style={{ margin: space.lg }} />
            : state.moreError ? <View style={styles.footer}><Notice tone="error" text={state.moreError} /><Button label="Try again" kind="secondary" onPress={loadMore} /></View>
            : state.rows.length > 0 && state.rows.length >= state.total ? <Text style={styles.endText}>{state.total === 1 ? 'That is your only product.' : `All ${state.total.toLocaleString('en-GB')} shown.`}</Text>
            : <View style={{ height: space.lg }} />
        }
      />
      <QuickPriceSheet product={priceFor} businessId={businessId} products={products} onClose={() => setPriceFor(null)}
        onSaved={(p, price) => {
          setPriceFor(null);
          setState((s) => s.kind === 'ready' ? { ...s, rows: s.rows.map((r) => r.id === p.id ? { ...p, sellingPrice: price } : r) } : s);
          setFlash(`${p.name}: price is now ${formatCedis(price)}`);
        }}
        onRefreshed={(p) => setState((s) => s.kind === 'ready' ? { ...s, rows: s.rows.map((r) => r.id === p.id ? p : r) } : s)} />
    </View>
  );
}

function ProductRow({ product, categoryName, index, onOpen, onChangePrice, priceDisabled }: {
  product: Product; categoryName: string | null; index: number; onOpen: () => void; onChangePrice: () => void; priceDisabled: boolean;
}) {
  const meta = [categoryName, product.unit ? `per ${product.unit}` : null].filter(Boolean).join(' · ');
  return (
    <FadeIn delay={Math.min(index, 8) * 30}>
      <Card style={styles.row}>
        <PressableScale accessibilityRole="button" accessibilityLabel={`${product.name}, ${formatCedis(product.sellingPrice)}. Opens the product.`}
          onPress={onOpen} style={styles.rowMain}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.rowName} numberOfLines={2}>{product.name}</Text>
            {meta ? <Text style={styles.rowMeta} numberOfLines={1}>{meta}</Text> : null}
            <StockChip qty={product.stockQty} lowStockLevel={product.lowStockLevel} unit={product.unit} />
          </View>
          <Text style={styles.rowPrice}>{formatCedis(product.sellingPrice)}</Text>
        </PressableScale>
        {product.active ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Change price of ${product.name}`} accessibilityState={{ disabled: priceDisabled }}
            onPress={priceDisabled ? undefined : onChangePrice} style={({ pressed }) => [styles.rowAction, pressed && !priceDisabled && styles.pressed, priceDisabled && styles.disabled]}>
            <Text style={styles.rowActionText}>Change price</Text>
          </Pressable>
        ) : (
          <View style={styles.rowAction}><Text style={styles.archivedText}>Archived</Text></View>
        )}
      </Card>
    </FadeIn>
  );
}

/**
 * S-32 Quick price change: new selling price only (cost corrections are a separate, audited action, D-5).
 * Opened from the list and from Product Details (Stage 1C-3.1).
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
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={onClose} />
        {/*
          iPhone fix: the sheet can never be taller than the space left above the keyboard; if the
          keyboard and large text leave less room, its contents scroll instead of being pushed out
          of view. Taps on the buttons work while the keyboard is open.
        */}
        <FadeIn style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" bounces={false}>
            <Text style={styles.sheetTitle} accessibilityRole="header">Change price</Text>
            <Text style={styles.sheetSubtitle} numberOfLines={2}>{base.name} · now {formatCedis(base.sellingPrice)}</Text>
            <Field label="New selling price (GH₵)" value={text} onChangeText={(t) => { setText(t); setError(undefined); }} keyboardType="decimal-pad"
              error={error} hint="The change is recorded in the shop's history." selectTextOnFocus />
            {outcome ? <Notice tone="info" text={outcome} /> : null}
            {online === 'offline' ? <Notice tone="error" text="This needs internet. Your data is safe — try again when you're connected." /> : null}
            <Button label="Save price" onPress={save} busy={busy} disabled={online === 'offline'} />
            {unconfirmed ? (
              <Button label="I've checked — save this price" kind="secondary" onPress={async () => { await products.discardUnconfirmed('update_product', base.id); setUnconfirmed(false); save(); }} />
            ) : null}
            <Button label="Cancel" kind="link" onPress={onClose} />
          </ScrollView>
        </FadeIn>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colours.warmWhite },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
  headerAction: { marginTop: space.sm },
  list: { padding: space.md, paddingBottom: space.xl },
  controls: { gap: space.sm, marginBottom: space.md },
  chipRow: { gap: space.sm, paddingVertical: 2 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  sortLabel: { fontSize: type.caption, color: colours.stone, fontWeight: '700' },
  row: { overflow: 'hidden' },
  rowMain: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.md, minHeight: touch.min + 24 },
  rowName: { fontSize: type.body + 1, fontWeight: '800', color: colours.ink },
  rowMeta: { fontSize: type.caption, color: colours.stone },
  rowPrice: { fontSize: type.section, fontWeight: '800', color: colours.ink, fontVariant: ['tabular-nums'] },
  rowAction: { minHeight: touch.min, borderTopWidth: 1, borderTopColor: colours.sand, alignItems: 'center', justifyContent: 'center' },
  rowActionText: { fontSize: type.body, fontWeight: '800', color: colours.shopGreen },
  archivedText: { fontSize: type.caption, fontWeight: '700', color: colours.stone },
  footer: { gap: space.sm, marginTop: space.md },
  endText: { textAlign: 'center', color: colours.stone, fontSize: type.caption, marginVertical: space.lg },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(28,27,25,0.45)' },
  sheet: { backgroundColor: colours.surface, borderTopLeftRadius: radius.lg + 4, borderTopRightRadius: radius.lg + 4, maxHeight: '100%', overflow: 'hidden' },
  sheetContent: { padding: space.lg, paddingBottom: space.xl + space.lg, gap: space.md },
  sheetTitle: { fontSize: type.title, fontWeight: '800', color: colours.ink },
  sheetSubtitle: { fontSize: type.body, color: colours.stone },
});
