/**
 * Screens inside the Products tab (S-30 – S-32, owner-approved category management, set_cost).
 * A small stack: the list is always at the bottom; Android Back pops one screen.
 */
export type ProductsRoute =
  | { name: 'list' }
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
