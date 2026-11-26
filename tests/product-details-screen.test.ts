/**
 * Stage 1C-3.1 Product Details: static guards on the screen sources. The app has no React Native
 * renderer in its tests, so what the screens look like and how taps behave need the device
 * checklist (DET-01 – DET-15); these stop known regressions in the wiring from coming back.
 * Updated for the 1C-3.3 redesign: the same rules, checked against the v2 kit markup.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(join(__dirname, '../app/src/screens/products', name), 'utf8');
const area = read('ProductsArea.tsx');
const details = read('ProductDetailsScreen.tsx');

describe('Product Details wiring (Stage 1C-3.1)', () => {
  it('PDS-01: a list row opens Product Details, never the edit form directly', () => {
    expect(area).toContain("onOpen={(id) => go({ name: 'detail', productId: id })}");
    expect(area).not.toMatch(/onOpen=\{\(id\) => go\(\{ name: 'edit'/);
  });

  it('PDS-02: Edit is a compact pencil top-right in the header, spoken as "Edit product", opening the existing form (owner decision, 25 Nov 2026)', () => {
    expect(details).toMatch(/action=\{product \? \(\s*<IconButton icon=\{EditIcon\} label="Edit product" tone="header" onPress=\{\(\) => onEdit\(product\.id\)\}\s*disabled=\{archived\}/);
    expect(area).toContain("onEdit={(id) => go({ name: 'edit', productId: id })}");
    // The oversized bottom-bar button is gone
    expect(details).not.toContain('<Button label="Edit product"');
    expect(details).not.toContain('styles.bottomBar');
  });

  it('PDS-02b: the header icon control keeps a 48 dp touch target, has a spoken label and announces when disabled', () => {
    const controls = readFileSync(join(__dirname, '../app/src/ui/kit/controls.tsx'), 'utf8');
    const tokens = readFileSync(join(__dirname, '../app/src/ui/kit/tokens.ts'), 'utf8');
    expect(controls).toMatch(/iconTarget: \{ width: control\.touchTarget, height: control\.touchTarget,/);
    expect(tokens).toMatch(/touchTarget: 48,/);
    expect(controls).toContain('<PressableScale accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}');
    expect(controls).toContain('accessibilityHint={disabled ? disabledReason : undefined}');
  });

  it('PDS-03: the form returns to Details after a save, and a new product opens its Details (A-1)', () => {
    expect(area).toContain('onSaved={formSaved}');
    expect(area).toContain('const next = afterFormSaved(stack, productId);');
    expect(read('ProductFormScreen.tsx')).toContain('onSaved(`${c.value.name} added`, res.data.productId)');
  });

  it('PDS-04: the quick price sheet and "Correct cost price" are the existing ones', () => {
    expect(details).toContain("import { QuickPriceSheet } from './ProductListScreen';");
    expect(area).toContain("onCorrectCost={(id) => go({ name: 'cost', productId: id })}");
  });

  it('PDS-05: the latest-request guard is used on Details, the form, Cost correction and Categories', () => {
    for (const f of ['ProductDetailsScreen.tsx', 'ProductFormScreen.tsx', 'CostCorrectionScreen.tsx', 'CategoriesScreen.tsx']) {
      expect(read(f), f).toContain('useLatestRequest()');
    }
  });

  it('PDS-06: no text-scaling caps on the Products screens (spec 08 rev 2)', () => {
    for (const f of ['ProductDetailsScreen.tsx', 'ProductFormScreen.tsx', 'CostCorrectionScreen.tsx', 'CategoriesScreen.tsx', 'ProductListScreen.tsx', 'ProductsArea.tsx']) {
      expect(read(f), f).not.toMatch(/maxFontSizeMultiplier|allowFontScaling/);
    }
  });

  it('PDS-07: the "changed on another device" note on Details is held back for this device\'s own unconfirmed changes', () => {
    expect(details).toContain("products.hasUnconfirmed('update_product', now.id), products.hasUnconfirmed('set_cost', now.id)");
    expect(details).toContain('<Banner tone="info" message="This product was changed on another device. The latest details are shown." />');
  });

  it('PDS-08: after a failed refresh the cost is state 4 (spec 08 rev 2 §9.3), with a stale-data banner', () => {
    expect(details).toContain('costUnavailable={refreshFailed}');
    expect(details).toContain('const cost = shownCost(product, history, costUnavailable);');
    expect(details).not.toMatch(/const cost = costInfo\(/);
    expect(details).toMatch(/\{costUnavailable \? \(\s*<Banner tone="warning" title="Couldn't refresh"/);
  });

  it('PDS-09: a failed first load shows an error with Try again, never the figures', () => {
    expect(details).toContain("else setState({ kind: 'error', message: e instanceof ReadError ? e.message : \"We couldn't load this product. Please try again.\" });");
    expect(details).toMatch(/state\.kind === 'error' \? \([\s\S]*?<Banner tone="danger" message=\{state\.message\} \/>[\s\S]*?<Button label="Try again"/);
  });

  it('PDS-10 (1C-3.3): Archive asks first; Restore, being harmless and reversible, runs without a prompt', () => {
    for (const src of [details, read('ProductFormScreen.tsx')]) {
      expect(src).toMatch(/confirmAction\(\{\s*title: `Archive \$\{product\.name\}\?`[\s\S]*?destructive: true/);
      expect(src).not.toContain('`Restore ${product.name}?`');
    }
  });

  it('PDS-11 (1C-3.3): a cost correction is confirmed in words before it is saved (financially consequential)', () => {
    const cost = read('CostCorrectionScreen.tsx');
    expect(cost).toContain("title: 'Correct the cost price?'");
    expect(cost).toContain('<Button label="Save correction" size="large" fullWidth onPress={confirmAndSubmit}');
    // The save itself is unchanged
    expect(cost).toContain('const res = await products.setCost(businessId, product.id, c.value.cost, c.value.reason, product);');
  });
});
