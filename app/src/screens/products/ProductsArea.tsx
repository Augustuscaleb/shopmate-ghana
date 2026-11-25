/**
 * The Products tab: a small stack of screens (navigation/productsStack.ts). The list stays mounted
 * underneath the other screens (and every screen stays mounted while another is on top of it), so
 * search, filters, scroll position and typed form input survive opening another screen; after a save it reloads from the server and shows a short success message.
 * The stack itself is owned by HomeScreen so Android Back can pop it.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colours } from '../../ui/theme';
import { current, pop, push, type ProductsStack } from '../../navigation/productsStack';
import type { ProductsService } from '../../services/products';
import { ProductListScreen } from './ProductListScreen';
import { ProductFormScreen } from './ProductFormScreen';
import { CategoriesScreen } from './CategoriesScreen';
import { CostCorrectionScreen } from './CostCorrectionScreen';

export function ProductsArea({ businessId, products, stack, onStackChange }: {
  businessId: string;
  products: ProductsService;
  stack: ProductsStack;
  onStackChange: (stack: ProductsStack) => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const route = current(stack);
  const back = () => onStackChange(pop(stack) ?? stack);
  const go = (r: Parameters<typeof push>[1]) => onStackChange(push(stack, r));
  /** After a save: refresh the list, show the message there, and return to the list. */
  const savedToList = (message: string) => { setRefreshKey((k) => k + 1); setNotice(message); onStackChange(push(stack, { name: 'list' })); };
  /** After a cost correction: back to the product it was opened from (or the list). */
  const savedBack = (message: string) => {
    setRefreshKey((k) => k + 1);
    const prev = pop(stack);
    if (!prev || prev.length === 1) setNotice(message);
    onStackChange(prev ?? stack);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.root, route.name !== 'list' && styles.hidden]} importantForAccessibility={route.name === 'list' ? 'auto' : 'no-hide-descendants'}>
        <ProductListScreen businessId={businessId} products={products} refreshKey={refreshKey}
          onAdd={() => go({ name: 'add' })} onOpen={(id) => go({ name: 'edit', productId: id })}
          onManageCategories={() => go({ name: 'categories' })} notice={route.name === 'list' ? notice : null} onNoticeShown={() => setNotice(null)} />
      </View>
      {stack.slice(1).map((r, i) => {
        const top = i === stack.length - 2;
        const key = `${i}-${r.name}-${'productId' in r ? r.productId : ''}`;
        return (
          <View key={key} style={[styles.root, !top && styles.hidden]} importantForAccessibility={top ? 'auto' : 'no-hide-descendants'}>
            {r.name === 'add' || r.name === 'edit' ? (
              <ProductFormScreen mode={r.name} productId={r.name === 'edit' ? r.productId : undefined} businessId={businessId} products={products}
                refreshKey={refreshKey} onBack={back} onSaved={savedToList}
                onCorrectCost={(id) => go({ name: 'cost', productId: id })} onManageCategories={() => go({ name: 'categories' })} />
            ) : r.name === 'categories' ? (
              <CategoriesScreen businessId={businessId} products={products} onBack={back} onChanged={() => setRefreshKey((k) => k + 1)} />
            ) : r.name === 'cost' ? (
              <CostCorrectionScreen productId={r.productId} businessId={businessId} products={products} onBack={back} onSaved={savedBack} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colours.warmWhite },
  hidden: { display: 'none' },
});
