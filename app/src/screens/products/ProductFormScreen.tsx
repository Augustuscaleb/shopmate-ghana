/**
 * S-31 Product form: add a product (create_product) or edit one (update_product), archive/restore
 * (set_product_archived, D4), and the entry to "Correct cost price" (set_cost, D-5). Cost and opening
 * stock are set only when a product is created; stock changes later only through stock movements.
 * Typed input is never cleared by an error (E-03). Online-only (D-3).
 * Stage 1C-3.3: redesigned on the v2 kit; money fields show a GH₵ prefix (spec 08 §5.3); the save
 * button sits in a bar that stays above the keyboard (§5.2). Archive asks first; Restore runs at once.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFreshness } from '../../ui/useFreshness';
import { useLatestRequest } from '../../ui/useLatestRequest';
import { updatedLabel } from '../../lib/freshness';
import { FadeIn } from '../../ui/animated';
import {
  AppText, Banner, Button, Card, Chip, Divider, Notice, ScreenHeader, ScreenScaffold, SectionHeader, StockBadge, TextAction, TextField,
  SkeletonText, UpdatedLine, confirmAction, space,
} from '../../ui/kit';
import { useConnectivity } from '../../ui/useConnectivity';
import { formatCedis } from '../../services/dashboard';
import { UNIT_SUGGESTIONS, checkNewProduct, checkProductEdit, outcomeTone, rebaseValues, valuesFrom, type FormErrors, type Outcome, type ProductFormValues } from '../../services/productForm';
import { ReadError, sameProduct, type Category, type Product, type ProductsService } from '../../services/products';

const EMPTY: ProductFormValues = { name: '', categoryId: null, unit: '', sellingPrice: '', costPrice: '', openingStock: '', lowStockLevel: '5' };

export function ProductFormScreen({ mode, productId, businessId, products, refreshKey, visible, onBack, onSaved, onCorrectCost, onManageCategories }: {
  mode: 'add' | 'edit';
  productId?: string;
  businessId: string;
  products: ProductsService;
  /** Changes after a save on a screen opened from this one: categories and stock figures reload; typing is kept. */
  refreshKey: number;
  /** On screen (increment 2b: automatic refreshes only then). */
  visible: boolean;
  onBack: () => void;
  /** After a successful save; `productId` is the product saved (a new product's Details opens, A-1). */
  onSaved: (message: string, productId: string) => void;
  onCorrectCost: (productId: string) => void;
  onManageCategories: () => void;
}) {
  const online = useConnectivity();
  const offline = online === 'offline';
  const [values, setValues] = useState<ProductFormValues>(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode === 'edit');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Outcome | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  /** Increment 2b: last successful load, last attempt, a failed automatic refresh, and a change seen. */
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [lastAttemptAt, setLastAttemptAt] = useState<number | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [changedElsewhere, setChangedElsewhere] = useState(false);
  /** Stage 1C-3.1 (Review-2 finding 1): an older answer never replaces a newer one. */
  const reads = useLatestRequest();
  const readBoth = () => Promise.all([
    products.listCategories(businessId, { includeArchived: true }),
    mode === 'edit' && productId ? products.getProduct(businessId, productId) : Promise.resolve(null),
  ]);

  const load = async () => {
    setLoadError(null);
    setLastAttemptAt(Date.now());
    await reads.run(readBoth, ([cats, p]) => {
      setCategories(cats);
      setLoading(false);
      if (mode === 'edit') {
        if (!p) { setLoadError("This product can't be found. It may have been deleted. Go back and refresh the list."); return; }
        setProduct(p);
        setValues(valuesFrom(p));
      }
      setLoadedAt(new Date().toISOString());
    }, (e) => {
      setLoading(false);
      setLoadError(e instanceof ReadError ? e.message : "We couldn't load this product. Please try again.");
    });
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A category added, or a cost corrected, on a screen opened from here: refresh what is shown
  // without touching what the owner has typed (E-03).
  const firstKey = useRef(refreshKey);
  /** When this device's own change (on a screen opened from here) last triggered a reload. */
  const ownChangeAt = useRef(0);
  useEffect(() => {
    if (refreshKey === firstKey.current) return;
    ownChangeAt.current = Date.now();
    // Not while the first load is still running or has failed: that load (or Try again) reads it all
    if (loading || loadError) return;
    // Replaces any read still running (its answer may predate this device's own change)
    reads.run(readBoth, ([cats, p]) => {
      setCategories(cats);
      if (p) adopt(p);
      setLoadedAt(new Date().toISOString());
    }, () => { /* keep what is shown */ });
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Increment 2b: re-read silently (another device may have changed the product). What the owner
   * typed is kept (rebaseValues); fields they didn't touch take the new values, with a note. A
   * failed refresh keeps everything on screen and says "couldn't refresh". Never runs while saving.
   */
  const refreshSilently = async ({ retry = false } = {}) => {
    if (loading || loadError) return;
    // An automatic refresh while a read is running would only repeat it (Review-2 finding 3)
    if (reads.running && !retry) return;
    const startedAt = Date.now();
    setLastAttemptAt(startedAt);
    await reads.run(readBoth, async ([cats, p]) => {
      setCategories(cats);
      setLoadedAt(new Date().toISOString());
      setRefreshFailed(false);
      if (mode === 'edit' && p && product && !sameProduct(p, product)) {
        adopt(p);
        // Not "another device" when the change may be this device's own: a cost correction or
        // category change made from this form (measured from when this refresh started, so a slow
        // network doesn't matter), or an edit whose reply was lost and is still unconfirmed.
        const ownRecent = startedAt - ownChangeAt.current <= 10_000;
        const ownUnconfirmed = await products.hasUnconfirmed('update_product', p.id).catch(() => true);
        if (!ownRecent && !ownUnconfirmed) setChangedElsewhere(true);
      }
    }, () => setRefreshFailed(true));
  };
  useFreshness({ visible, lastLoadedAt: lastAttemptAt, busy, refresh: () => { refreshSilently(); } });

  /** Take a newer copy of the product as the base of the edit, keeping the owner's typing. */
  const adopt = (now: Product) => {
    setProduct((was) => {
      if (was) setValues((v) => rebaseValues(v, was, now));
      return now;
    });
  };

  const set = (k: keyof ProductFormValues) => (v: string) => { setValues((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); setMessage(null); };

  const submit = async () => {
    setMessage(null);
    if (mode === 'add') {
      const c = checkNewProduct(values);
      if (!c.ok) { setErrors(c.errors); return; }
      setBusy(true);
      const res = await products.createProduct(businessId, c.value);
      setBusy(false);
      if (res.ok) { onSaved(`${c.value.name} added`, res.data.productId); return; }
      setUnconfirmed(res.kind === 'unconfirmed');
      setMessage({ tone: outcomeTone(res.kind), text: res.message });
    } else if (product) {
      const c = checkProductEdit(values);
      if (!c.ok) { setErrors(c.errors); return; }
      setBusy(true);
      const res = await products.saveEdit(businessId, product, c.value);
      setBusy(false);
      if (res.ok) { onSaved(res.data.changed ? `${c.value.name} saved` : 'No changes to save', product.id); return; }
      if (res.kind === 'conflict' || (res.kind === 'unconfirmed' && res.current)) adopt(res.current!);
      setUnconfirmed(res.kind === 'unconfirmed');
      setMessage({ tone: outcomeTone(res.kind), text: res.message });
    }
  };
  /** Archive asks first (destructive); Restore is harmless and reversible, so it runs at once. */
  const runArchive = async (archiving: boolean) => {
    if (!product) return;
    setBusy(true);
    const res = await products.setArchived(businessId, product.id, archiving);
    setBusy(false);
    if (res.ok) onSaved(archiving ? `${product.name} archived` : `${product.name} restored`, product.id);
    else setMessage({ tone: outcomeTone(res.kind), text: res.message });
  };
  const toggleArchive = () => {
    if (!product) return;
    if (!product.active) { runArchive(false); return; }
    confirmAction({
      title: `Archive ${product.name}?`,
      message: 'It will be hidden from your product list. Nothing is deleted, its history is kept, and you can restore it at any time.',
      confirmLabel: 'Archive', destructive: true, onConfirm: () => { runArchive(true); },
    });
  };

  const title = mode === 'add' ? 'Add product' : 'Edit product';
  const ready = !loading && !loadError;
  const footer = ready ? (
    <View style={styles.footer}>
      {message ? <Notice tone={message.tone} text={message.text} /> : null}
      <Button label={mode === 'add' ? 'Save product' : 'Save changes'} size="large" fullWidth onPress={submit} busy={busy}
        disabled={offline || (mode === 'edit' && !product?.active)}
        disabledReason={offline ? 'Needs internet. Your typing is kept.' : mode === 'edit' && product && !product.active ? "Archived products can't be edited. Restore it first." : undefined} />
      {unconfirmed ? (
        <Button label="I've checked — save as a new change" kind="secondary" fullWidth onPress={async () => {
          await products.discardUnconfirmed(mode === 'add' ? 'create_product' : 'update_product', mode === 'add' ? businessId : product!.id);
          setUnconfirmed(false); submit();
        }} />
      ) : null}
    </View>
  ) : undefined;

  return (
    <ScreenScaffold keyboard width="form" footer={footer}
      header={<ScreenHeader title={title} subtitle={mode === 'edit' && product ? product.name : 'Fill in what you know; you can change it later.'} onBack={onBack} />}
      banners={offline ? (
        <Banner tone="offline" message="You're offline. Saving changes needs internet; your typing is kept."
          action={{ label: 'Check again', onPress: () => { products.checkConnection(businessId); } }} />
      ) : null}>
      {loading ? <Card><SkeletonText lines={4} /></Card> : loadError ? (
        <FadeIn>
          <View style={styles.gap}>
            <Banner tone="danger" message={loadError} />
            <Button label="Try again" kind="secondary" onPress={() => { setLoading(true); load(); }} />
          </View>
        </FadeIn>
      ) : (
        <FadeIn>
          <View style={styles.gap}>
            {changedElsewhere ? <Banner tone="info" message="This product was changed on another device. The latest details are shown." /> : null}
            {refreshFailed ? <UpdatedLine label={updatedLabel(loadedAt, new Date(), true) ?? ''} failed onRetry={() => { refreshSilently({ retry: true }); }} /> : null}
            {mode === 'edit' && product ? <StockCard product={product} onCorrectCost={() => onCorrectCost(product.id)} disabled={offline} /> : null}

            <Card>
              <SectionHeader title="Product" />
              <TextField label="Name" value={values.name} onChangeText={set('name')} error={errors.name} placeholder="e.g. Milo sachet" maxLength={100} />
              <View style={styles.fieldGroup}>
                <AppText variant="label">Category</AppText>
                <View style={styles.chips}>
                  <Chip label="None" selected={values.categoryId === null} onPress={() => setValues((x) => ({ ...x, categoryId: null }))} />
                  {categories.filter((c) => !c.archived || c.id === values.categoryId).map((c) => (
                    <Chip key={c.id} label={c.archived ? `${c.name} (archived)` : c.name} selected={values.categoryId === c.id}
                      onPress={() => setValues((x) => ({ ...x, categoryId: c.id }))} />
                  ))}
                </View>
                <TextAction label="Manage categories" onPress={onManageCategories} />
              </View>
              <View style={styles.fieldGroup}>
                <TextField label="Unit (optional)" value={values.unit} onChangeText={set('unit')} error={errors.unit} placeholder="e.g. sachet" maxLength={30} autoCapitalize="none" />
                <View style={styles.chips}>
                  {UNIT_SUGGESTIONS.map((u) => <Chip key={u} label={u} selected={values.unit.trim() === u} onPress={() => set('unit')(u)} />)}
                </View>
              </View>
            </Card>

            <Card>
              <SectionHeader title="Price" />
              <TextField label="Selling price" prefix="GH₵" value={values.sellingPrice} onChangeText={set('sellingPrice')} error={errors.sellingPrice}
                keyboardType="decimal-pad" placeholder="0.00" hint={mode === 'edit' ? 'Price changes are recorded in the shop history.' : undefined} />
              {mode === 'add' ? (
                <TextField label="Cost price per unit (optional)" prefix="GH₵" value={values.costPrice} onChangeText={set('costPrice')} error={errors.costPrice}
                  keyboardType="decimal-pad" placeholder="0.00" hint="What one unit cost you. It sets the average cost of your opening stock. Leave empty if you don't know it yet." />
              ) : null}
            </Card>

            <Card>
              <SectionHeader title="Stock" />
              {mode === 'add' ? (
                <TextField label="Stock you have now (optional)" value={values.openingStock} onChangeText={set('openingStock')} error={errors.openingStock}
                  keyboardType="number-pad" placeholder="0" hint="Counted in units. Later changes go through Restock and Adjust stock." />
              ) : null}
              <TextField label="Low-stock level" value={values.lowStockLevel} onChangeText={set('lowStockLevel')} error={errors.lowStockLevel}
                keyboardType="number-pad" hint="When stock is at or below this, the product shows as Low." />
            </Card>

            {mode === 'edit' && product ? (
              <Card>
                <SectionHeader title={product.active ? 'Archive' : 'Archived'} />
                <AppText variant="caption" tone="textSecondary">
                  {product.active ? 'Hide this product from your list. Nothing is deleted, and you can restore it at any time.' : "Archived products can't be edited. Restore it first."}
                </AppText>
                <Button label={product.active ? 'Archive product' : 'Restore product'} kind={product.active ? 'destructive' : 'secondary'} onPress={toggleArchive} disabled={offline || busy} />
              </Card>
            ) : null}
          </View>
        </FadeIn>
      )}
    </ScreenScaffold>
  );
}

/** Read-only stock summary on the edit screen; the cost is corrected separately (audited, D-5). */
function StockCard({ product, onCorrectCost, disabled }: { product: Product; onCorrectCost: () => void; disabled: boolean }) {
  const average = product.costKnown && product.stockQty > 0 && product.stockValue >= 0 ? Math.round(product.stockValue / product.stockQty) : null;
  return (
    <Card>
      <SectionHeader title="Stock now" />
      <StockBadge qty={product.stockQty} lowStockLevel={product.lowStockLevel} unit={product.unit} />
      <View style={styles.statRow}>
        <View style={styles.stat}>
          <AppText variant="caption" tone="textSecondary">Stock value</AppText>
          <AppText variant="heading" number>{product.costKnown ? formatCedis(product.stockValue) : 'Cost not set'}</AppText>
        </View>
        <View style={styles.stat}>
          <AppText variant="caption" tone="textSecondary">Average cost (about)</AppText>
          <AppText variant="heading" number>{average !== null ? formatCedis(average) : '—'}</AppText>
        </View>
      </View>
      <AppText variant="caption" tone="textSecondary">Stock changes only through Restock and Adjust stock, so its history stays complete.</AppText>
      <Divider />
      <Button label="Correct cost price" kind="secondary" onPress={onCorrectCost} disabled={disabled} />
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  fieldGroup: { gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stat: { flexGrow: 1, flexBasis: '40%', minWidth: 140, gap: 2 },
  footer: { gap: space.xs },
});
