/**
 * The Products tab: a small stack of screens (navigation/productsStack.ts). The list stays mounted
 * underneath the other screens (and every screen stays mounted while another is on top of it), so
 * search, filters, scroll position and typed form input survive opening another screen; after a save it reloads from the server and shows a short success message.
 * The stack itself is owned by HomeScreen so Android Back can pop it.
 *
 * Stage 1C-3.1 (plan §5.2): a list row opens Product Details; Details opens the edit form, the
 * quick price sheet and "Correct cost price"; saving or cancelling returns to Details; after Add,
 * the new product's Details opens (A-1).
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { color } from '../../ui/kit';
import { afterFormSaved, current, pop, push, showsNotice, type ProductsStack } from '../../navigation/productsStack';
import type { ProductsService } from '../../services/products';
import { ProductListScreen } from './ProductListScreen';
import { ProductFormScreen } from './ProductFormScreen';
import { ProductDetailsScreen } from './ProductDetailsScreen';
import { CategoriesScreen } from './CategoriesScreen';
import { CostCorrectionScreen } from './CostCorrectionScreen';

export function ProductsArea({ businessId, products, stack, onStackChange, visible }: {
  businessId: string;
  /** The Products tab is selected (increment 2b: hidden screens don't refresh until shown). */
  visible: boolean;
  products: ProductsService;
  stack: ProductsStack;
  onStackChange: (stack: ProductsStack) => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const route = current(stack);
  const back = () => onStackChange(pop(stack) ?? stack);
  const go = (r: Parameters<typeof push>[1]) => onStackChange(push(stack, r));
  /** A change was saved on this tab: every screen of the tab reloads (in place, keeping typing and position). */
  const changed = () => setRefreshKey((k) => k + 1);
  /** After a save on the form: back to Details (or a new product's Details, A-1), with the message there. */
  const formSaved = (message: string, productId: string) => {
    changed();
    const next = afterFormSaved(stack, productId);
    if (showsNotice(current(next))) setNotice(message);
    onStackChange(next);
  };
  /** After a cost correction: back to the screen it was opened from (Details or the form). */
  const savedBack = (message: string) => {
    changed();
    const prev = pop(stack) ?? stack;
    if (showsNotice(current(prev))) setNotice(message);
    onStackChange(prev);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.root, route.name !== 'list' && styles.hidden]} importantForAccessibility={route.name === 'list' ? 'auto' : 'no-hide-descendants'}>
        <ProductListScreen businessId={businessId} products={products} refreshKey={refreshKey} visible={visible && route.name === 'list'}
          onAdd={() => go({ name: 'add' })} onOpen={(id) => go({ name: 'detail', productId: id })}
          onManageCategories={() => go({ name: 'categories' })} notice={route.name === 'list' ? notice : null} onNoticeShown={() => setNotice(null)} />
      </View>
      {stack.slice(1).map((r, i) => {
        const top = i === stack.length - 2;
        const key = `${i}-${r.name}-${'productId' in r ? r.productId : ''}`;
        return (
          <View key={key} style={[styles.root, !top && styles.hidden]} importantForAccessibility={top ? 'auto' : 'no-hide-descendants'}>
            {r.name === 'detail' ? (
              <ProductDetailsScreen productId={r.productId} visible={visible && top} businessId={businessId} products={products} refreshKey={refreshKey}
                notice={top ? notice : null} onNoticeShown={() => setNotice(null)} onBack={back} onBackToList={() => go({ name: 'list' })}
                onEdit={(id) => go({ name: 'edit', productId: id })} onCorrectCost={(id) => go({ name: 'cost', productId: id })} onChanged={changed} />
            ) : r.name === 'add' || r.name === 'edit' ? (
              <ProductFormScreen mode={r.name} visible={visible && top} productId={r.name === 'edit' ? r.productId : undefined} businessId={businessId} products={products}
                refreshKey={refreshKey} onBack={back} onSaved={formSaved}
                onCorrectCost={(id) => go({ name: 'cost', productId: id })} onManageCategories={() => go({ name: 'categories' })} />
            ) : r.name === 'categories' ? (
              <CategoriesScreen visible={visible && top} businessId={businessId} products={products} onBack={back} onChanged={changed} />
            ) : r.name === 'cost' ? (
              <CostCorrectionScreen visible={visible && top} productId={r.productId} businessId={businessId} products={products} onBack={back} onSaved={savedBack} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  hidden: { display: 'none' },
});
