/**
 * Screens inside the Products tab (S-30 – S-32, S-37 Product detail, owner-approved category
 * management, set_cost). A small stack: the list is always at the bottom; Android Back pops one
 * screen.
 *
 * Stage 1C-3.1 (plan §5.2): a list row opens Product Details (`detail`); Details opens the edit
 * form; saving or cancelling the form returns to Details; after a new product is added, its
 * Details replaces the add form (owner decision A-1).
 */
export type ProductsRoute =
  | { name: 'list' }
  | { name: 'detail'; productId: string }
  | { name: 'add' }
  | { name: 'edit'; productId: string }
  | { name: 'categories' }
  | { name: 'cost'; productId: string };

export type ProductsStack = readonly ProductsRoute[];

export const PRODUCTS_HOME: ProductsStack = [{ name: 'list' }];

export function push(stack: ProductsStack, route: ProductsRoute): ProductsStack {
  if (route.name === 'list') return PRODUCTS_HOME;
  return [...stack, route];
}

/** Back inside the tab: the previous screen, or null when already on the list. */
export function pop(stack: ProductsStack): ProductsStack | null {
  return stack.length > 1 ? stack.slice(0, -1) : null;
}

export function current(stack: ProductsStack): ProductsRoute {
  return stack[stack.length - 1] ?? { name: 'list' };
}

/**
 * Where a successful save on the product form (add, edit, archive or restore) goes (plan §5.2):
 * - a new product (A-1): its Details replaces the add form, so Back from Details goes to where
 *   Add was opened from (the list);
 * - an edit, archive or restore opened from Details: back to that Details (it reloads);
 * - otherwise: the list.
 */
export function afterFormSaved(stack: ProductsStack, savedProductId?: string): ProductsStack {
  const top = current(stack);
  if (top.name === 'add' && savedProductId) return [...stack.slice(0, -1), { name: 'detail', productId: savedProductId }];
  const previous = pop(stack);
  if (previous && current(previous).name === 'detail') return previous;
  return PRODUCTS_HOME;
}

/** The screen a success message should be shown on, if it can show one (the list or Details). */
export function showsNotice(route: ProductsRoute): boolean {
  return route.name === 'list' || route.name === 'detail';
}
