/**
 * "Correct cost price" (set_cost, T4, D-5): a separate, audited correction of the product's average
 * cost. A reason is required; the change is recorded as a value correction in the stock history and
 * in the audit log. The preview is only an estimate (stock × new cost); the figures shown after
 * saving are the server's.
 */
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Notice } from '../../ui/components';
import { Card, OfflineBar, ScreenHeader, StockChip, UpdatedLine } from '../../ui/surfaces';
import { useFreshness } from '../../ui/useFreshness';
import { updatedLabel } from '../../lib/freshness';
import { FadeIn } from '../../ui/animated';
import { colours, space, type } from '../../ui/theme';
import { useConnectivity } from '../../ui/useConnectivity';
import { formatCedis } from '../../services/dashboard';
import { parseCedis } from '../../lib/money';
import { checkCostCorrection, outcomeTone, type Outcome } from '../../services/productForm';
import { ReadError, type Product, type ProductsService } from '../../services/products';

export function CostCorrectionScreen({ productId, businessId, products, onBack, onSaved, visible }: {
  productId: string;
  /** On screen (increment 2b: automatic refreshes only then). */
  visible: boolean;
  businessId: string;
  products: ProductsService;
  onBack: () => void;
  onSaved: (message: string) => void;
}) {
  const offline = useConnectivity() === 'offline';
  const [product, setProduct] = useState<Product | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cost, setCost] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ cost?: string; reason?: string }>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Outcome | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [result, setResult] = useState<{ changed: boolean; valueChange: number; stockValue: number } | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [lastAttemptAt, setLastAttemptAt] = useState<number | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [stockChangedElsewhere, setStockChangedElsewhere] = useState(false);

  const load = async () => {
    setLoadError(null);
    setLastAttemptAt(Date.now());
    try {
      const p = await products.getProduct(businessId, productId);
      if (!p) setLoadError("This product can't be found. It may have been deleted. Go back and refresh the list.");
      else { setProduct(p); setLoadedAt(new Date().toISOString()); }
    } catch (e) {
      setLoadError(e instanceof ReadError ? e.message : "We couldn't load this product. Please try again.");
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Increment 2b: re-read the stock figures silently (another device may have restocked or
   * corrected them). The typed cost and reason are kept; a failed refresh keeps the figures shown.
   * Not after the result is shown, and never while saving.
   */
  const refreshSilently = async () => {
    if (!product || result) return;
    setLastAttemptAt(Date.now());
    try {
      const p = await products.getProduct(businessId, productId);
      if (p && (p.stockQty !== product.stockQty || p.stockValue !== product.stockValue || p.costKnown !== product.costKnown)) {
        // A correction from this device whose reply was lost may be what changed: not "another device"
        const ownUnconfirmed = await products.hasUnconfirmed('set_cost', p.id).catch(() => true);
        if (!ownUnconfirmed) setStockChangedElsewhere(true);
      }
      if (p) setProduct(p);
      setLoadedAt(new Date().toISOString());
      setRefreshFailed(false);
    } catch {
      setRefreshFailed(true);
    }
  };
  useFreshness({ visible, lastLoadedAt: lastAttemptAt, busy, refresh: () => { refreshSilently(); } });

  const submit = async () => {
    if (!product) return;
    setMessage(null);
    const c = checkCostCorrection(cost, reason);
    if (!c.ok) { setErrors(c.errors); return; }
    setBusy(true);
    // Passing the product as shown: if its stock changed since, nothing is sent and the new figures are shown
    const res = await products.setCost(businessId, product.id, c.value.cost, c.value.reason, product);
    setBusy(false);
    if (res.ok) { setResult(res.data); return; }
    if (res.kind === 'conflict' || (res.kind === 'unconfirmed' && res.current)) setProduct(res.current!);
    setUnconfirmed(res.kind === 'unconfirmed');
    setMessage({ tone: outcomeTone(res.kind), text: res.message });
  };

  const parsed = parseCedis(cost);
  const preview = product && product.stockQty > 0 && parsed.ok ? product.stockQty * parsed.value : null;
  const noStock = product !== null && product.stockQty <= 0;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Correct cost price" subtitle={product?.name} onBack={onBack} />
        <View style={styles.body}>
          {offline ? <OfflineBar onCheck={() => { products.checkConnection(businessId); }} /> : null}
          {loadError ? (
            <View style={styles.gap}><Notice tone="error" text={loadError} /><Button label="Try again" onPress={load} /></View>
          ) : !product ? <Text style={styles.muted}>Loading…</Text> : result ? (
            <FadeIn>
              <Card style={styles.section}>
                <Text style={styles.sectionTitle}>{result.changed ? 'Cost price corrected' : 'Nothing to change'}</Text>
                <Text style={styles.body16}>
                  {result.changed
                    ? `Stock value is now ${formatCedis(result.stockValue)} (${result.valueChange >= 0 ? 'up' : 'down'} ${formatCedis(Math.abs(result.valueChange))}). The correction and your reason are saved in the stock history.`
                    : `The stock value is already ${formatCedis(result.stockValue)}, so nothing was recorded.`}
                </Text>
                <Button label="Done" onPress={() => onSaved(result.changed ? 'Cost price corrected' : 'No changes to save')} />
              </Card>
            </FadeIn>
          ) : (
            <FadeIn>
              <View style={styles.gap}>
                {stockChangedElsewhere ? <Notice text="The stock was changed on another device. The latest figures are shown." /> : null}
                {refreshFailed ? <UpdatedLine label={updatedLabel(loadedAt, new Date(), true)} failed onRetry={() => { refreshSilently(); }} /> : null}
                <Card style={styles.section}>
                  <Text style={styles.sectionTitle}>Now</Text>
                  <StockChip qty={product.stockQty} lowStockLevel={product.lowStockLevel} unit={product.unit} />
                  <Text style={styles.body16}>Stock value: {product.costKnown ? formatCedis(product.stockValue) : 'cost not set'}</Text>
                </Card>
                {noStock ? (
                  <Notice text={product.stockQty === 0
                    ? 'There is no stock to value. Record a restock first; its cost becomes the average.'
                    : 'Stock is below zero. Record the missing restock or correct the count first.'} />
                ) : null}
                <Card style={styles.section}>
                  <Text style={styles.sectionTitle}>Correction</Text>
                  <Field label="Correct cost per unit (GH₵)" value={cost} keyboardType="decimal-pad" placeholder="0.00" error={errors.cost}
                    onChangeText={(t) => { setCost(t); setErrors((e) => ({ ...e, cost: undefined })); setMessage(null); }}
                    hint={preview !== null ? `Stock value will be about ${formatCedis(preview)} (${product.stockQty} × this cost).` : 'Every unit in stock is valued at this cost.'} />
                  <Field label="Reason" value={reason} placeholder="e.g. Typed the wrong cost when adding" error={errors.reason} maxLength={300}
                    onChangeText={(t) => { setReason(t); setErrors((e) => ({ ...e, reason: undefined })); setMessage(null); }}
                    hint="Saved with the correction so you can see later why it changed." />
                </Card>
                {message ? <Notice tone={message.tone} text={message.text} /> : null}
                <Button label="Save correction" onPress={submit} busy={busy} disabled={offline || noStock} />
                {unconfirmed ? (
                  <Button label="I've checked — save as a new correction" kind="secondary" onPress={async () => {
                    await products.discardUnconfirmed('set_cost', product.id); setUnconfirmed(false); submit();
                  }} />
                ) : null}
              </View>
            </FadeIn>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colours.warmWhite },
  body: { padding: space.md },
  gap: { gap: space.md },
  section: { padding: space.md, gap: space.md },
  sectionTitle: { fontSize: type.section, fontWeight: '800', color: colours.ink },
  body16: { fontSize: type.body, color: colours.ink },
  muted: { fontSize: type.caption, color: colours.stone },
});
