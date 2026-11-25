/**
 * Products and categories for Stage 1C-2 increment 2 (S-30 – S-32; category management; set_cost).
 *
 * Writes to products go ONLY through the approved server functions (create_product, update_product,
 * set_product_archived, set_cost), each with a request ID that is saved before the call and reused
 * on retry (PendingRequests), so a lost reply can never record a change twice. Categories are
 * written directly under RLS (Stage 1A grants; the D5 guard refuses archiving a category in use).
 * Lists are paginated on the server (`range` + exact count): nothing is counted or totalled on the
 * phone beyond one page (STAGE-1C-PLAN §4; max_rows unchanged).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { appConnectivity, type ConnectivityMonitor } from '../lib/connectivity';
import { CATEGORY_CHANGED_MESSAGE, OFFLINE_MESSAGE, UNCONFIRMED_MESSAGE, UNKNOWN_OUTCOME_MESSAGE, messageFor } from './errorMessages';
import { formatCedis } from './dashboard';
import { ResultError, asObject, bool, pesewas, text, uuid, wholeNumber } from './parse';
import type { PendingRequests } from './pendingRequests';
import { classifyRpcError, looksLikeNetworkFailure, type ErrorLike } from './rpcErrors';
import type { NewProductFields, ProductFields } from './productForm';

export type Product = {
  id: string;
  name: string;
  categoryId: string | null;
  unit: string | null;
  sellingPrice: number;
  stockQty: number;
  stockValue: number;
  costKnown: boolean;
  lowStockLevel: number;
  active: boolean;
};

export type Category = { id: string; name: string; archived: boolean };

/** The newest product_cost_history row whose avg_cost is not null (Stage 1C-3.1, cost state 2). */
export type LastKnownCostRow = {
  /** avg_cost exactly as the server stores it: numeric(18,4) pesewas per unit, e.g. "112.5". */
  avgCost: string;
  effectiveAt: string;
};

/** 'lowest_stock' sorts by stock quantity, fewest first. It is not a low-stock filter (see the brief). */
export type ProductSort = 'name' | 'lowest_stock';
export type CategoryFilter = { kind: 'all' } | { kind: 'none' } | { kind: 'category'; id: string };

export type ProductQuery = {
  search: string;
  category: CategoryFilter;
  archived: boolean;
  sort: ProductSort;
  offset: number;
  limit: number;
};

export type Page<T> = { rows: T[]; total: number };

/**
 * The outcome of a write, so the screen can tell the owner exactly what happened:
 * - ok: confirmed by the server (`reconciled`: confirmed by reading it back after a lost reply);
 * - refused / not_sent: definitely NOT saved (a server refusal, or offline so nothing was sent);
 * - no_response: sent, but no answer: it MAY have been saved; a retry is safe;
 * - unconfirmed: held back, because an earlier attempt's outcome is unknown and the inputs changed;
 * - conflict: not sent, because someone else changed the same thing since it was loaded.
 */
export type ActionResult<T, C = Product> =
  | { ok: true; data: T; reconciled?: boolean }
  | { ok: false; kind: 'refused'; code: string; message: string; details: string | null; sqlState?: string }
  | { ok: false; kind: 'not_sent'; message: string }
  | { ok: false; kind: 'no_response'; message: string }
  | { ok: false; kind: 'unconfirmed'; message: string; current?: Product }
  | { ok: false; kind: 'conflict'; message: string; current: C };

/** The product fields an edit can change (update_product sets all five every time). */
const EDIT_FIELDS = ['name', 'categoryId', 'unit', 'sellingPrice', 'lowStockLevel'] as const;
type EditField = (typeof EDIT_FIELDS)[number];
const FIELD_LABEL: Record<EditField, string> = {
  name: 'name', categoryId: 'category', unit: 'unit', sellingPrice: 'selling price', lowStockLevel: 'low-stock level',
};

export type MergeResult =
  | { kind: 'ok'; fields: ProductFields }
  | { kind: 'conflict'; changed: EditField[] };

/**
 * Three-way merge for an edit (update_product overwrites all five fields, so the app must not send
 * stale values for fields the owner didn't touch):
 * - a field the owner didn't change takes the server's CURRENT value (another user's newer change survives);
 * - a field the owner changed is sent as typed;
 * - if the owner changed a field that someone else ALSO changed to something different since it
 *   was loaded, nothing is sent: the owner sees the new value and decides.
 */
export function mergeEdit(loaded: Product, current: Product, edited: ProductFields): MergeResult {
  const changed: EditField[] = [];
  const fields = {} as Record<EditField, unknown>;
  for (const f of EDIT_FIELDS) {
    const mine = f === 'name' ? edited.name.trim() : edited[f];
    const was = loaded[f];
    const now = current[f];
    if (mine === was) fields[f] = now;
    else {
      if (now !== was && now !== mine) changed.push(f);
      fields[f] = mine;
    }
  }
  if (changed.length > 0) return { kind: 'conflict', changed };
  return { kind: 'ok', fields: fields as ProductFields };
}

function conflictMessage(changed: EditField[], current: Product): string {
  if (changed.length === 1 && changed[0] === 'sellingPrice') {
    return `Someone else changed the price to ${formatCedis(current.sellingPrice)} while you were editing. Nothing was saved. Check it, then save again to use your price.`;
  }
  const list = changed.map((f) => FIELD_LABEL[f]).join(', ');
  return `Someone else changed this product's ${list} while you were editing. Nothing was saved. The latest values are shown; check them, then save again.`;
}

export const PAGE_SIZE = 30;
const CATEGORY_PAGE = 500;
const PRODUCT_COLUMNS = 'id, name, category_id, unit, selling_price, stock_qty, stock_value, cost_known, low_stock_level, active';

/** Escapes LIKE wildcards so the owner's search text is matched literally. */
export function likePattern(search: string): string {
  return `%${search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function toProduct(row: unknown): Product {
  const o = asObject(row, 'product');
  const categoryId = o.category_id === null ? null : uuid(o, 'category_id');
  return {
    id: uuid(o, 'id'),
    name: text(o, 'name') as string,
    categoryId,
    unit: text(o, 'unit', { nullable: true }),
    sellingPrice: pesewas(o, 'selling_price'),
    stockQty: wholeNumber(o, 'stock_qty'),
    stockValue: pesewas(o, 'stock_value'),
    costKnown: bool(o, 'cost_known'),
    lowStockLevel: wholeNumber(o, 'low_stock_level', { min: 0 }),
    active: bool(o, 'active'),
  };
}

/** Two copies of a product show the same thing (increment 2b: "changed on another device"). */
export function sameProduct(a: Product, b: Product): boolean {
  return a.id === b.id && a.name === b.name && a.categoryId === b.categoryId && a.unit === b.unit
    && a.sellingPrice === b.sellingPrice && a.stockQty === b.stockQty && a.stockValue === b.stockValue
    && a.costKnown === b.costKnown && a.lowStockLevel === b.lowStockLevel && a.active === b.active;
}

/** update_product's p_expected: the five editable fields exactly as read from the server. */
export function expectedValues(p: Product): Record<string, unknown> {
  return { name: p.name, selling_price: p.sellingPrice, category_id: p.categoryId, unit: p.unit, low_stock_level: p.lowStockLevel };
}

function categoryNotFound(): { ok: false; kind: 'refused'; code: string; message: string; details: null } {
  return { ok: false, kind: 'refused', code: 'category_not_found', message: messageFor({ kind: 'definite', code: 'category_not_found', sqlState: 'P0002', details: null }), details: null };
}

/** Matches the unique index categories_name_uq: lower(btrim(name)). */
function normalName(name: string): string {
  return name.trim().toLowerCase();
}

const UNIQUE_VIOLATION = '23505';

function toCategory(row: unknown): Category {
  const o = asObject(row, 'category');
  return { id: uuid(o, 'id'), name: text(o, 'name') as string, archived: o.deleted_at !== null };
}

/** Thrown by reads; carries the plain-language message to show. */
export class ReadError extends Error {
  constructor(message: string, readonly offline: boolean) {
    super(message);
    this.name = 'ReadError';
  }
}

export class ProductsService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly pending: PendingRequests,
    private readonly connectivity: ConnectivityMonitor = appConnectivity,
  ) {}

  /* ───────── reads ───────── */

  async listProducts(businessId: string, q: ProductQuery): Promise<Page<Product>> {
    let req = this.client.from('products').select(PRODUCT_COLUMNS, { count: 'exact' })
      .eq('business_id', businessId).is('deleted_at', null).eq('active', !q.archived);
    if (q.search.trim()) req = req.ilike('name', likePattern(q.search));
    if (q.category.kind === 'none') req = req.is('category_id', null);
    else if (q.category.kind === 'category') req = req.eq('category_id', q.category.id);
    req = q.sort === 'lowest_stock'
      ? req.order('stock_qty', { ascending: true }).order('name', { ascending: true }).order('id', { ascending: true })
      : req.order('name', { ascending: true }).order('id', { ascending: true });
    const { data, error, count } = await req.range(q.offset, q.offset + q.limit - 1);
    if (error) throw this.readFailed(error);
    this.connectivity.reportServerResponse();
    return { rows: (data ?? []).map(toProduct), total: count ?? 0 };
  }

  async getProduct(businessId: string, productId: string): Promise<Product | null> {
    const { data, error } = await this.client.from('products').select(PRODUCT_COLUMNS)
      .eq('business_id', businessId).eq('id', productId).is('deleted_at', null).maybeSingle();
    if (error) throw this.readFailed(error);
    this.connectivity.reportServerResponse();
    return data ? toProduct(data) : null;
  }

  /**
   * The newest cost-history row of this product that has an average (Stage 1C-3.1, P-3 state 2):
   * product_cost_history for this shop and product, avg_cost not null, newest effective_at first,
   * then newest created_at; one row. Read under row-level security (members of the shop only).
   * null when there is none. avg_cost is returned exactly as stored (numeric, pesewas per unit).
   */
  async getLastKnownCost(businessId: string, productId: string): Promise<LastKnownCostRow | null> {
    const { data, error } = await this.client.from('product_cost_history').select('avg_cost, effective_at')
      .eq('business_id', businessId).eq('product_id', productId).not('avg_cost', 'is', null)
      .order('effective_at', { ascending: false }).order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    if (error) throw this.readFailed(error);
    this.connectivity.reportServerResponse();
    if (!data) return null;
    const o = asObject(data, 'cost history');
    const avg = o.avg_cost;
    const avgCost = typeof avg === 'number' && Number.isFinite(avg) ? String(avg) : typeof avg === 'string' ? avg : null;
    if (avgCost === null || !/^-?\d+(\.\d+)?$/.test(avgCost)) throw new ResultError('avg_cost');
    return { avgCost, effectiveAt: text(o, 'effective_at') as string };
  }

  /** All categories of the shop, page by page (never more than CATEGORY_PAGE rows per request). */
  async listCategories(businessId: string, { includeArchived = false } = {}): Promise<Category[]> {
    const out: Category[] = [];
    for (let from = 0; ; from += CATEGORY_PAGE) {
      let req = this.client.from('categories').select('id, name, deleted_at').eq('business_id', businessId);
      if (!includeArchived) req = req.is('deleted_at', null);
      const { data, error } = await req.order('name', { ascending: true }).order('id', { ascending: true })
        .range(from, from + CATEGORY_PAGE - 1);
      if (error) throw this.readFailed(error);
      const rows = (data ?? []).map(toCategory);
      out.push(...rows);
      if (rows.length < CATEGORY_PAGE) break;
    }
    this.connectivity.reportServerResponse();
    return out;
  }

  /** A cheap read to check whether the server can be reached again (after being offline). */
  async checkConnection(businessId: string): Promise<boolean> {
    const { error } = await this.client.from('categories').select('id', { count: 'exact', head: true }).eq('business_id', businessId);
    if (error && looksLikeNetworkFailure(error as ErrorLike)) { this.connectivity.reportNoResponse(); return false; }
    this.connectivity.reportServerResponse();
    return true;
  }

  /* ───────── product writes (server functions, request IDs) ───────── */

  createProduct(businessId: string, f: NewProductFields): Promise<ActionResult<{ productId: string }>> {
    const args = {
      p_business_id: businessId, p_name: f.name, p_selling_price: f.sellingPrice, p_category_id: f.categoryId,
      p_unit: f.unit, p_cost_price: f.costPrice, p_opening_stock: f.openingStock, p_low_stock_level: f.lowStockLevel,
    };
    return this.write(`create_product.${businessId}`, 'create_product', args, (d) => ({ productId: uuid(asObject(d), 'product_id') }));
  }

  /**
   * update_product with the five fields as they are on the server now (`expected`): the server
   * compares them with the locked row and refuses with product_changed if anything changed since
   * (migration 20261125000300). The request ID's fingerprint covers the intended change only, not
   * `expected`, so a retry after a lost reply (when the row already holds the new values) reuses
   * the same ID and gets the stored result.
   */
  updateProduct(businessId: string, productId: string, f: ProductFields, expected: Product): Promise<ActionResult<{ changed: boolean }>> {
    const change = {
      p_business_id: businessId, p_product_id: productId, p_name: f.name, p_selling_price: f.sellingPrice,
      p_category_id: f.categoryId, p_unit: f.unit, p_low_stock_level: f.lowStockLevel,
    };
    const args = { ...change, p_expected: expectedValues(expected) };
    return this.write(`update_product.${productId}`, 'update_product', args, (d) => ({ changed: bool(asObject(d), 'changed') }), change);
  }

  /**
   * S-31 edit: reads the product again just before saving and merges (mergeEdit), so fields the
   * owner didn't touch are sent with their CURRENT server values, not the values loaded earlier.
   * The save carries the re-read values as `expected`; a change landing between this read and the
   * save is refused by the server (product_changed) and shown as a conflict. Nothing is overwritten.
   */
  async saveEdit(businessId: string, loaded: Product, edited: ProductFields): Promise<ActionResult<{ changed: boolean }>> {
    if (!this.connectivity.onlineActionsAllowed) return { ok: false, kind: 'not_sent', message: OFFLINE_MESSAGE };
    let current: Product | null;
    try {
      current = await this.getProduct(businessId, loaded.id);
    } catch (e) {
      return { ok: false, kind: 'not_sent', message: e instanceof ReadError ? e.message : OFFLINE_MESSAGE };
    }
    if (!current) return { ok: false, kind: 'refused', code: 'product_not_found', message: messageFor({ kind: 'definite', code: 'product_not_found', sqlState: 'P0002', details: null }), details: null };
    const merged = mergeEdit(loaded, current, edited);
    if (merged.kind === 'conflict') {
      // The newer value may be this phone's own earlier change whose reply was lost: say so, not "someone else"
      if (await this.pending.has(`update_product.${loaded.id}`)) return { ok: false, kind: 'unconfirmed', message: UNCONFIRMED_MESSAGE, current };
      return { ok: false, kind: 'conflict', message: conflictMessage(merged.changed, current), current };
    }
    const res = await this.updateProduct(businessId, loaded.id, merged.fields, current);
    if (res.ok || res.kind !== 'refused' || res.code !== 'product_changed') return res;
    // Changed in the moment between the read and the save: nothing was written. Show the latest copy.
    let latest: Product | null = null;
    try { latest = await this.getProduct(businessId, loaded.id); } catch { /* fall back to the copy we have */ }
    return { ok: false, kind: 'conflict', message: res.message, current: latest ?? current };
  }

  /** S-32: only the selling price is changed; every other field is sent as it is on the server now. */
  changeSellingPrice(businessId: string, loaded: Product, sellingPrice: number): Promise<ActionResult<{ changed: boolean }>> {
    return this.saveEdit(businessId, loaded, {
      name: loaded.name, categoryId: loaded.categoryId, unit: loaded.unit, sellingPrice, lowStockLevel: loaded.lowStockLevel,
    });
  }

  setArchived(businessId: string, productId: string, archived: boolean): Promise<ActionResult<{ active: boolean; changed: boolean }>> {
    return this.write(`set_product_archived.${productId}`, 'set_product_archived',
      { p_business_id: businessId, p_product_id: productId, p_archived: archived },
      (d) => { const o = asObject(d); return { active: bool(o, 'active'), changed: bool(o, 'changed') }; });
  }

  /**
   * "Correct cost price" (T4, D-5): separate, audited, reason required. set_cost values the stock
   * the server has at that moment (stock × cost) and changes nothing else on the product. With
   * `seen` (the product as shown), the stock is read again first: if it changed since, nothing is
   * sent and the owner sees the new figures before confirming.
   */
  async setCost(businessId: string, productId: string, cost: number, reason: string, seen?: Product):
    Promise<ActionResult<{ changed: boolean; valueChange: number; stockValue: number }>> {
    if (seen) {
      if (!this.connectivity.onlineActionsAllowed) return { ok: false, kind: 'not_sent', message: OFFLINE_MESSAGE };
      let current: Product | null;
      try {
        current = await this.getProduct(businessId, productId);
      } catch (e) {
        return { ok: false, kind: 'not_sent', message: e instanceof ReadError ? e.message : OFFLINE_MESSAGE };
      }
      if (current && (current.stockQty !== seen.stockQty || current.stockValue !== seen.stockValue || current.costKnown !== seen.costKnown)) {
        if (await this.pending.has(`set_cost.${productId}`)) return { ok: false, kind: 'unconfirmed', message: UNCONFIRMED_MESSAGE, current };
        return { ok: false, kind: 'conflict', current,
          message: `The stock changed while you were on this screen (now ${current.stockQty.toLocaleString('en-GB')}). Nothing was saved. Check the new figures, then save again.` };
      }
    }
    return this.write(`set_cost.${productId}`, 'set_cost',
      { p_business_id: businessId, p_product_id: productId, p_cost: cost, p_reason: reason },
      (d) => {
        const o = asObject(d);
        const changed = bool(o, 'changed');
        return { changed, valueChange: pesewas(o, 'value_change'), stockValue: pesewas(o, 'stock_value') };
      });
  }

  /**
   * Whether this device still has an attempt of `operation` on `id` with no definite answer (a
   * lost reply). Used so a change that may be this device's own is never reported as "changed on
   * another device" (increment 2b review, finding 4). Uses the existing request-ID store.
   */
  hasUnconfirmed(operation: 'update_product' | 'set_cost', id: string): Promise<boolean> {
    return this.pending.has(`${operation}.${id}`);
  }

  /** The owner has checked and wants to send a change even though an earlier attempt's outcome is unknown. */
  discardUnconfirmed(operation: 'create_product' | 'update_product' | 'set_product_archived' | 'set_cost', id: string): Promise<void> {
    return this.pending.discard(`${operation}.${id}`);
  }

  /* ───────── category writes (direct, RLS) ───────── */

  /**
   * Categories are written directly (Stage 1A grants: insert business_id + name only), so there is
   * no request ID and the app can't choose the row's id. Lost replies are handled by reading back:
   * - add: after an add whose reply was lost, a retry refused as a duplicate (23505) reads the
   *   category back; if an active category with that name exists, the add is reported as confirmed
   *   (the owner's intended result exists) rather than "already used";
   * - rename, archive, restore: conditional writes with read-back (below), so a repeat is
   *   confirmed and a change made on another device meanwhile is a conflict, not overwritten.
   */
  async createCategory(businessId: string, name: string): Promise<ActionResult<Category>> {
    const key = `${businessId}:${normalName(name)}`;
    const res = await this.direct(() => this.client.from('categories').insert({ business_id: businessId, name }).select('id, name, deleted_at').single());
    if (res.ok) { this.lostCategoryAdds.delete(key); return res; }
    if (res.kind === 'no_response') { this.lostCategoryAdds.add(key); return res; }
    if (res.kind === 'refused' && res.sqlState === UNIQUE_VIOLATION && this.lostCategoryAdds.has(key)) {
      const found = await this.findActiveCategory(businessId, name);
      if (found) { this.lostCategoryAdds.delete(key); return { ok: true, data: found, reconciled: true }; }
    }
    if (res.kind === 'refused') this.lostCategoryAdds.delete(key);
    return res;
  }

  /**
   * Rename, conflict-safe (increment 2b; no migration): the row is changed only if it is still
   * active and still has `seenName`, the name this screen showed. If nothing matched, the row is
   * read back:
   * - it already has the new name: confirmed (e.g. a retry after this device's lost reply);
   * - it was renamed to something else, or archived, on another device: conflict, nothing changed
   *   (`current` is the row as it is now, or null if it is gone);
   * - it can't be found (deleted, or another shop's): refused.
   * A duplicate name is still refused by the unique index.
   */
  async renameCategory(businessId: string, id: string, name: string, seenName: string): Promise<ActionResult<Category, Category | null>> {
    const res = await this.direct(() => this.client.from('categories').update({ name })
      .eq('business_id', businessId).eq('id', id).eq('name', seenName).is('deleted_at', null)
      .select('id, name, deleted_at').maybeSingle(), { allowNone: true });
    if (!res.ok) return res;
    if (res.data) return { ok: true, data: res.data };
    const row = await this.readCategory(businessId, id);
    if (!row.ok) return row;
    if (!row.data) return categoryNotFound();
    if (!row.data.archived && row.data.name === name) return { ok: true, data: row.data, reconciled: true };
    return { ok: false, kind: 'conflict', message: CATEGORY_CHANGED_MESSAGE, current: row.data };
  }

  /**
   * Archive (deleted_at) or restore. Archiving is refused while an active product uses it (D5).
   * Only a row still in the other state is changed, so a repeat keeps the original archive time.
   * Archiving is also conflict-safe (increment 2b): with `seenName`, only a category that still has
   * the name this screen showed is archived; one renamed on another device is a conflict.
   * If nothing matched, the row is read back: already in the wanted state is confirmed.
   */
  async setCategoryArchived(businessId: string, id: string, archived: boolean, seenName?: string): Promise<ActionResult<Category, Category | null>> {
    const res = await this.direct(() => {
      let req = this.client.from('categories').update({ deleted_at: archived ? new Date().toISOString() : null })
        .eq('business_id', businessId).eq('id', id);
      if (archived && seenName !== undefined) req = req.eq('name', seenName);
      return (archived ? req.is('deleted_at', null) : req.not('deleted_at', 'is', null)).select('id, name, deleted_at').maybeSingle();
    }, { allowNone: true });
    if (!res.ok) return res;
    if (res.data) return { ok: true, data: res.data };
    const row = await this.readCategory(businessId, id);
    if (!row.ok) return row;
    if (!row.data) return categoryNotFound();
    if (row.data.archived === archived) return { ok: true, data: row.data, reconciled: true };
    return { ok: false, kind: 'conflict', message: CATEGORY_CHANGED_MESSAGE, current: row.data };
  }

  private readCategory(businessId: string, id: string): Promise<ActionResult<Category | null, never>> {
    return this.direct(() => this.client.from('categories').select('id, name, deleted_at')
      .eq('business_id', businessId).eq('id', id).maybeSingle(), { allowNone: true });
  }

  private readonly lostCategoryAdds = new Set<string>();

  private async findActiveCategory(businessId: string, name: string): Promise<Category | null> {
    const { data, error } = await this.client.from('categories').select('id, name, deleted_at')
      .eq('business_id', businessId).is('deleted_at', null).ilike('name', likePattern(name)).limit(50);
    if (error) return null;
    return (data ?? []).map(toCategory).find((c) => normalName(c.name) === normalName(name)) ?? null;
  }

  /* ───────── internals ───────── */

  private readFailed(error: unknown): ReadError {
    const offline = looksLikeNetworkFailure(error as ErrorLike);
    if (offline) this.connectivity.reportNoResponse();
    else if (classifyRpcError(error as ErrorLike).kind === 'definite') this.connectivity.reportServerResponse();
    return new ReadError(offline ? OFFLINE_MESSAGE : messageFor(classifyRpcError(error as ErrorLike)), offline);
  }

  private async write<T>(operation: string, fn: string, args: Record<string, unknown>, parseResult: (data: unknown) => T,
    fingerprintOf: Record<string, unknown> = args): Promise<ActionResult<T>> {
    if (!this.connectivity.onlineActionsAllowed) return { ok: false, kind: 'not_sent', message: OFFLINE_MESSAGE };
    const reservation = await this.pending.reserve(operation, fingerprintOf);
    if (reservation.kind === 'unconfirmed_previous') return { ok: false, kind: 'unconfirmed', message: UNCONFIRMED_MESSAGE };
    let data: unknown;
    let error: unknown;
    try {
      ({ data, error } = await this.client.rpc(fn, { p_request_id: reservation.requestId, ...args }));
    } catch (e) {
      error = e;
    }
    if (error) {
      const failure = classifyRpcError(error as ErrorLike);
      if (failure.kind === 'no_response') {
        // Outcome unknown: keep the request ID so a retry can't record the change twice
        if (looksLikeNetworkFailure(error as ErrorLike)) this.connectivity.reportNoResponse();
        return { ok: false, kind: 'no_response', message: UNKNOWN_OUTCOME_MESSAGE };
      }
      await this.pending.settle(operation);
      this.connectivity.reportServerResponse();
      return { ok: false, kind: 'refused', code: failure.code, message: messageFor(failure), details: failure.details, sqlState: failure.sqlState };
    }
    await this.pending.settle(operation);
    this.connectivity.reportServerResponse();
    return { ok: true, data: parseResult(data) };
  }

  private async direct(run: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<ActionResult<Category, never>>;
  private async direct(run: () => PromiseLike<{ data: unknown; error: unknown }>, opts: { allowNone: true }): Promise<ActionResult<Category | null, never>>;
  private async direct(run: () => PromiseLike<{ data: unknown; error: unknown }>, opts?: { allowNone: true }): Promise<ActionResult<Category | null, never>> {
    if (!this.connectivity.onlineActionsAllowed) return { ok: false, kind: 'not_sent', message: OFFLINE_MESSAGE };
    let data: unknown;
    let error: unknown;
    try {
      ({ data, error } = await run());
    } catch (e) {
      error = e;
    }
    if (error) {
      const failure = classifyRpcError(error as ErrorLike);
      if (failure.kind === 'no_response') {
        if (looksLikeNetworkFailure(error as ErrorLike)) this.connectivity.reportNoResponse();
        return { ok: false, kind: 'no_response', message: UNKNOWN_OUTCOME_MESSAGE };
      }
      this.connectivity.reportServerResponse();
      return { ok: false, kind: 'refused', code: failure.code, message: messageFor(failure), details: failure.details, sqlState: failure.sqlState };
    }
    this.connectivity.reportServerResponse();
    if (data === null && opts?.allowNone) return { ok: true, data: null };
    return { ok: true, data: toCategory(data) };
  }
}
