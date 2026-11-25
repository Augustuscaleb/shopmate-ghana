/**
 * S-31 Product form: add a product (create_product) or edit one (update_product), archive/restore
 * (set_product_archived, D4), and the entry to "Correct cost price" (set_cost, D-5). Cost and opening
 * stock are set only when a product is created; stock changes later only through stock movements.
 * Typed input is never cleared by an error (E-03). Online-only (D-3).
 */
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Notice } from '../../ui/components';
import { Card, FilterChip, OfflineBar, ScreenHeader, StockChip } from '../../ui/surfaces';
import { FadeIn } from '../../ui/animated';
import { colours, space, type } from '../../ui/theme';
import { useConnectivity } from '../../ui/useConnectivity';
import { formatCedis } from '../../services/dashboard';
import { UNIT_SUGGESTIONS, checkNewProduct, checkProductEdit, outcomeTone, rebaseValues, valuesFrom, type FormErrors, type Outcome, type ProductFormValues } from '../../services/productForm';
import { ReadError, type Category, type Product, type ProductsService } from '../../services/products';

const EMPTY: ProductFormValues = { name: '', categoryId: null, unit: '', sellingPrice: '', costPrice: '', openingStock: '', lowStockLevel: '5' };

export function ProductFormScreen({ mode, productId, businessId, products, refreshKey, onBack, onSaved, onCorrectCost, onManageCategories }: {
  mode: 'add' | 'edit';
  productId?: string;
  businessId: string;
  products: ProductsService;
  /** Changes after a save on a screen opened from this one: categories and stock figures reload; typing is kept. */
  refreshKey: number;
  onBack: () => void;
  onSaved: (message: string) => void;
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

  const load = async () => {
    setLoadError(null);
    try {
      const [cats, p] = await Promise.all([
        products.listCategories(businessId, { includeArchived: true }),
        mode === 'edit' && productId ? products.getProduct(businessId, productId) : Promise.resolve(null),
      ]);
      setCategories(cats);
      if (mode === 'edit') {
        if (!p) { setLoadError("This product can't be found. It may have been deleted. Go back and refresh the list."); return; }
        setProduct(p);
        setValues(valuesFrom(p));
      }
    } catch (e) {
      setLoadError(e instanceof ReadError ? e.message : "We couldn't load this product. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A category added, or a cost corrected, on a screen opened from here: refresh what is shown
  // without touching what the owner has typed (E-03).
  const firstKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey === firstKey.current) return;
    products.listCategories(businessId, { includeArchived: true }).then(setCategories).catch(() => { /* keep the old list */ });
    if (mode === 'edit' && productId) products.getProduct(businessId, productId).then((p) => { if (p) adopt(p); }).catch(() => { /* keep */ });
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (res.ok) { onSaved(`${c.value.name} added`); return; }
      setUnconfirmed(res.kind === 'unconfirmed');
      setMessage({ tone: outcomeTone(res.kind), text: res.message });
    } else if (product) {
      const c = checkProductEdit(values);
      if (!c.ok) { setErrors(c.errors); return; }
      setBusy(true);
      const res = await products.saveEdit(businessId, product, c.value);
      setBusy(false);
      if (res.ok) { onSaved(res.data.changed ? `${c.value.name} saved` : 'No changes to save'); return; }
      if (res.kind === 'conflict' || (res.kind === 'unconfirmed' && res.current)) adopt(res.current!);
      setUnconfirmed(res.kind === 'unconfirmed');
      setMessage({ tone: outcomeTone(res.kind), text: res.message });
    }
  };

  const toggleArchive = () => {
    if (!product) return;
    const archiving = product.active;
    Alert.alert(
      archiving ? `Archive ${product.name}?` : `Restore ${product.name}?`,
      archiving
        ? 'It will be hidden from your product list. Nothing is deleted, its history is kept, and you can restore it at any time.'
        : 'It will appear in your product list again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: archiving ? 'Archive' : 'Restore',
          style: archiving ? 'destructive' : 'default',
          onPress: async () => {
            setBusy(true);
            const res = await products.setArchived(businessId, product.id, archiving);
            setBusy(false);
            if (res.ok) onSaved(archiving ? `${product.name} archived` : `${product.name} restored`);
            else setMessage({ tone: outcomeTone(res.kind), text: res.message });
          },
        },
      ],
    );
  };

  const title = mode === 'add' ? 'Add product' : 'Edit product';
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={title} subtitle={mode === 'edit' && product ? product.name : 'Fill in what you know; you can change it later.'} onBack={onBack} />
        <View style={styles.body}>
          {offline ? <OfflineBar onCheck={() => { products.checkConnection(businessId); }} /> : null}
          {loading ? <Text style={styles.muted}>Loading…</Text> : loadError ? (
            <FadeIn><View style={styles.gap}><Notice tone="error" text={loadError} /><Button label="Try again" onPress={() => { setLoading(true); load(); }} /></View></FadeIn>
          ) : (
            <FadeIn>
              <View style={styles.gap}>
                {mode === 'edit' && product ? <StockCard product={product} onCorrectCost={() => onCorrectCost(product.id)} disabled={offline} /> : null}

                <Card style={styles.section}>
                  <Text style={styles.sectionTitle}>Product</Text>
                  <Field label="Name" value={values.name} onChangeText={set('name')} error={errors.name} placeholder="e.g. Milo sachet" maxLength={100} />
                  <View style={{ gap: space.xs }}>
                    <Text style={styles.label}>Category</Text>
                    <View style={styles.chips}>
                      <FilterChip label="None" selected={values.categoryId === null} onPress={() => setValues((x) => ({ ...x, categoryId: null }))} />
                      {categories.filter((c) => !c.archived || c.id === values.categoryId).map((c) => (
                        <FilterChip key={c.id} label={c.archived ? `${c.name} (archived)` : c.name} selected={values.categoryId === c.id}
                          onPress={() => setValues((x) => ({ ...x, categoryId: c.id }))} />
                      ))}
                    </View>
                    <Button label="Manage categories" kind="link" onPress={onManageCategories} />
                  </View>
                  <View style={{ gap: space.xs }}>
                    <Field label="Unit (optional)" value={values.unit} onChangeText={set('unit')} error={errors.unit} placeholder="e.g. sachet" maxLength={30} autoCapitalize="none" />
                    <View style={styles.chips}>
                      {UNIT_SUGGESTIONS.map((u) => <FilterChip key={u} label={u} selected={values.unit.trim() === u} onPress={() => set('unit')(u)} />)}
                    </View>
                  </View>
                </Card>

                <Card style={styles.section}>
                  <Text style={styles.sectionTitle}>Price</Text>
                  <Field label="Selling price (GH₵)" value={values.sellingPrice} onChangeText={set('sellingPrice')} error={errors.sellingPrice}
                    keyboardType="decimal-pad" placeholder="0.00" hint={mode === 'edit' ? 'Price changes are recorded in the shop history.' : undefined} />
                  {mode === 'add' ? (
                    <Field label="Cost price per unit (GH₵, optional)" value={values.costPrice} onChangeText={set('costPrice')} error={errors.costPrice}
                      keyboardType="decimal-pad" placeholder="0.00" hint="What one unit cost you. It sets the average cost of your opening stock. Leave empty if you don't know it yet." />
                  ) : null}
                </Card>

                <Card style={styles.section}>
                  <Text style={styles.sectionTitle}>Stock</Text>
                  {mode === 'add' ? (
                    <Field label="Stock you have now (optional)" value={values.openingStock} onChangeText={set('openingStock')} error={errors.openingStock}
                      keyboardType="number-pad" placeholder="0" hint="Counted in units. Later changes go through Restock and Adjust stock." />
                  ) : null}
                  <Field label="Low-stock level" value={values.lowStockLevel} onChangeText={set('lowStockLevel')} error={errors.lowStockLevel}
                    keyboardType="number-pad" hint="When stock is at or below this, the product shows as Low." />
                </Card>

                {message ? <Notice tone={message.tone} text={message.text} /> : null}
                <Button label={mode === 'add' ? 'Save product' : 'Save changes'} onPress={submit} busy={busy} disabled={offline || (mode === 'edit' && !product?.active)} />
                {unconfirmed ? (
                  <Button label="I've checked — save as a new change" kind="secondary" onPress={async () => {
                    await products.discardUnconfirmed(mode === 'add' ? 'create_product' : 'update_product', mode === 'add' ? businessId : product!.id);
                    setUnconfirmed(false); submit();
                  }} />
                ) : null}
                {mode === 'edit' && product ? (
                  <Button label={product.active ? 'Archive product' : 'Restore product'} kind="secondary" onPress={toggleArchive} disabled={offline || busy} />
                ) : null}
                {mode === 'edit' && product && !product.active ? <Text style={styles.muted}>Archived products can't be edited. Restore it first.</Text> : null}
              </View>
            </FadeIn>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Read-only stock summary on the edit screen; the cost is corrected separately (audited, D-5). */
function StockCard({ product, onCorrectCost, disabled }: { product: Product; onCorrectCost: () => void; disabled: boolean }) {
  const average = product.costKnown && product.stockQty > 0 && product.stockValue >= 0 ? Math.round(product.stockValue / product.stockQty) : null;
  return (
    <Card style={styles.section}>
      <Text style={styles.sectionTitle}>Stock now</Text>
      <StockChip qty={product.stockQty} lowStockLevel={product.lowStockLevel} unit={product.unit} />
      <View style={styles.statRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.statLabel}>Stock value</Text>
          <Text style={styles.statValue}>{product.costKnown ? formatCedis(product.stockValue) : 'Cost not set'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.statLabel}>Average cost (about)</Text>
          <Text style={styles.statValue}>{average !== null ? formatCedis(average) : '—'}</Text>
        </View>
      </View>
      <Text style={styles.muted}>Stock changes only through Restock and Adjust stock, so its history stays complete.</Text>
      <Button label="Correct cost price" kind="secondary" onPress={onCorrectCost} disabled={disabled} />
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colours.warmWhite },
  body: { padding: space.md },
  gap: { gap: space.md },
  section: { padding: space.md, gap: space.md },
  sectionTitle: { fontSize: type.section, fontWeight: '800', color: colours.ink },
  label: { fontSize: type.body, fontWeight: '600', color: colours.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  muted: { fontSize: type.caption, color: colours.stone },
  statRow: { flexDirection: 'row', gap: space.md },
  statLabel: { fontSize: type.caption, color: colours.stone, fontWeight: '600' },
  statValue: { fontSize: type.section, fontWeight: '800', color: colours.ink, fontVariant: ['tabular-nums'] },
});
