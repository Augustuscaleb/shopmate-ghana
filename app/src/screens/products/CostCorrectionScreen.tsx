/**
 * "Correct cost price" (set_cost, T4, D-5): a separate, audited correction of the product's average
 * cost. A reason is required; the change is recorded as a value correction in the stock history and
 * in the audit log. The preview is only an estimate (stock × new cost); the figures shown after
 * saving are the server's.
 * Stage 1C-3.3: redesigned on the v2 kit. A cost correction changes the recorded stock value, so it
 * is confirmed first (owner principle: confirm financially consequential actions), with the new
 * figures in words; the save itself is unchanged.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFreshness } from '../../ui/useFreshness';
import { useLatestRequest } from '../../ui/useLatestRequest';
import { updatedLabel } from '../../lib/freshness';
import { FadeIn } from '../../ui/animated';
import {
  AppText, Banner, Button, Card, Notice, ScreenHeader, ScreenScaffold, SectionHeader, SkeletonText, StockBadge, TextField, UpdatedLine,
  confirmAction, space,
} from '../../ui/kit';
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

  /** Stage 1C-3.1 (Review-2 finding 1): an older answer never replaces a newer one. */
  const reads = useLatestRequest();

  const load = async () => {
    setLoadError(null);
    setLastAttemptAt(Date.now());
    await reads.run(() => products.getProduct(businessId, productId), (p) => {
      if (!p) setLoadError("This product can't be found. It may have been deleted. Go back and refresh the list.");
      else { setProduct(p); setLoadedAt(new Date().toISOString()); }
    }, (e) => {
      setLoadError(e instanceof ReadError ? e.message : "We couldn't load this product. Please try again.");
    });
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Increment 2b: re-read the stock figures silently (another device may have restocked or
   * corrected them). The typed cost and reason are kept; a failed refresh keeps the figures shown.
   * Not after the result is shown, and never while saving.
   */
  const refreshSilently = async ({ retry = false } = {}) => {
    if (!product || result) return;
    // An automatic refresh while a read is running would only repeat it (Review-2 finding 3)
    if (reads.running && !retry) return;
    setLastAttemptAt(Date.now());
    await reads.run(() => products.getProduct(businessId, productId), async (p) => {
      if (p) setProduct(p);
      setLoadedAt(new Date().toISOString());
      setRefreshFailed(false);
      if (p && (p.stockQty !== product.stockQty || p.stockValue !== product.stockValue || p.costKnown !== product.costKnown)) {
        // A correction from this device whose reply was lost may be what changed: not "another device"
        const ownUnconfirmed = await products.hasUnconfirmed('set_cost', p.id).catch(() => true);
        if (!ownUnconfirmed) setStockChangedElsewhere(true);
      }
    }, () => setRefreshFailed(true));
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

  /** Confirm the correction in words first (it changes the recorded stock value), then save. */
  const confirmAndSubmit = () => {
    if (!product) return;
    const c = checkCostCorrection(cost, reason);
    if (!c.ok) { setErrors(c.errors); return; }
    const newValue = product.stockQty * c.value.cost;
    confirmAction({
      title: 'Correct the cost price?',
      message: `Every unit in stock will be valued at ${formatCedis(c.value.cost)}. Stock value goes from ${product.costKnown ? formatCedis(product.stockValue) : 'not set'} to about ${formatCedis(newValue)}. This is recorded in the stock history with your reason.`,
      confirmLabel: 'Correct cost', onConfirm: () => { submit(); },
    });
  };

  const footer = product && !result && !loadError ? (
    <View style={styles.footer}>
      {message ? <Notice tone={message.tone} text={message.text} /> : null}
      <Button label="Save correction" size="large" fullWidth onPress={confirmAndSubmit} busy={busy} disabled={offline || noStock}
        disabledReason={offline ? 'Needs internet. Your typing is kept.' : noStock ? 'There is no stock to value.' : undefined} />
      {unconfirmed ? (
        <Button label="I've checked — save as a new correction" kind="secondary" fullWidth onPress={async () => {
          await products.discardUnconfirmed('set_cost', product.id); setUnconfirmed(false); submit();
        }} />
      ) : null}
    </View>
  ) : undefined;

  return (
    <ScreenScaffold keyboard width="form" footer={footer}
      header={<ScreenHeader title="Correct cost price" subtitle={product?.name} onBack={onBack} />}
      banners={offline ? (
        <Banner tone="offline" message="You're offline. Saving changes needs internet; your typing is kept."
          action={{ label: 'Check again', onPress: () => { products.checkConnection(businessId); } }} />
      ) : null}>
      {loadError ? (
        <View style={styles.gap}><Banner tone="danger" message={loadError} /><Button label="Try again" kind="secondary" onPress={load} /></View>
      ) : !product ? <Card><SkeletonText lines={3} /></Card> : result ? (
        <FadeIn>
          <Card>
            <SectionHeader title={result.changed ? 'Cost price corrected' : 'Nothing to change'} />
            <AppText variant="body">
              {result.changed
                ? `Stock value is now ${formatCedis(result.stockValue)} (${result.valueChange >= 0 ? 'up' : 'down'} ${formatCedis(Math.abs(result.valueChange))}). The correction and your reason are saved in the stock history.`
                : `The stock value is already ${formatCedis(result.stockValue)}, so nothing was recorded.`}
            </AppText>
            <Button label="Done" onPress={() => onSaved(result.changed ? 'Cost price corrected' : 'No changes to save')} />
          </Card>
        </FadeIn>
      ) : (
        <FadeIn>
          <View style={styles.gap}>
            {stockChangedElsewhere ? <Banner tone="info" message="The stock was changed on another device. The latest figures are shown." /> : null}
            {refreshFailed ? <UpdatedLine label={updatedLabel(loadedAt, new Date(), true) ?? ''} failed onRetry={() => { refreshSilently({ retry: true }); }} /> : null}
            <Card>
              <SectionHeader title="Now" />
              <StockBadge qty={product.stockQty} lowStockLevel={product.lowStockLevel} unit={product.unit} />
              <AppText variant="body">Stock value: <AppText variant="label" number>{product.costKnown ? formatCedis(product.stockValue) : 'cost not set'}</AppText></AppText>
            </Card>
            {noStock ? (
              <Banner tone="warning" message={product.stockQty === 0
                ? 'There is no stock to value. Record a restock first; its cost becomes the average.'
                : 'Stock is below zero. Record the missing restock or correct the count first.'} />
            ) : null}
            <Card>
              <SectionHeader title="Correction" />
              <TextField label="Correct cost per unit" prefix="GH₵" value={cost} keyboardType="decimal-pad" placeholder="0.00" error={errors.cost}
                onChangeText={(t) => { setCost(t); setErrors((e) => ({ ...e, cost: undefined })); setMessage(null); }}
                hint={preview !== null ? `Stock value will be about ${formatCedis(preview)} (${product.stockQty} × this cost).` : 'Every unit in stock is valued at this cost.'} />
              <TextField label="Reason" value={reason} placeholder="e.g. Typed the wrong cost when adding" error={errors.reason} maxLength={300}
                onChangeText={(t) => { setReason(t); setErrors((e) => ({ ...e, reason: undefined })); setMessage(null); }}
                hint="Saved with the correction so you can see later why it changed." />
            </Card>
          </View>
        </FadeIn>
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  footer: { gap: space.xs },
});
