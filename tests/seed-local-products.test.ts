/**
 * Stage 1C-2 increment 2b: safety rules of the fictitious local seed script
 * (scripts/seed-local-products.mjs). Pure checks only; no database is touched here.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { testTarget } from './target';

type SeedModule = {
  seedProducts: () => { name: string; category: string; sellingPrice: number; costPrice: number | null; openingStock: number; lowStockLevel: number }[];
  stableRequestId: (text: string) => string;
  assertLocal: (apiUrl: string) => void;
  isEntryPoint: (metaUrl: string, argv1: string | undefined, platform?: string) => boolean;
  npxCommand: (platform?: string) => { command: string; shell: boolean };
};
const modulePath = '../scripts/seed-local-products.mjs';
const load = async () => (await import(modulePath)) as SeedModule;

describe('Local fictitious seed script (increment 2b)', () => {
  it('SEED-01: 35 products, every name unique and clearly fictitious', async () => {
    const { seedProducts } = await load();
    const seeds = seedProducts();
    expect(seeds).toHaveLength(35);
    expect(new Set(seeds.map((s) => s.name)).size).toBe(35);
    for (const s of seeds) expect(s.name).toMatch(/^Test Item \d{2} \(fictitious\)$/);
    for (const s of seeds) expect(s.category).toMatch(/\(fictitious\)$/);
  });

  it('SEED-02: values are within the server rules and cover every stock state', async () => {
    const { seedProducts } = await load();
    const seeds = seedProducts();
    for (const s of seeds) {
      expect(Number.isInteger(s.sellingPrice) && s.sellingPrice >= 1 && s.sellingPrice <= 100_000_000).toBe(true);
      expect(s.openingStock >= 0 && s.openingStock <= 100_000).toBe(true);
      // A cost price needs opening stock (cost_price_needs_opening_stock)
      if (s.costPrice !== null) expect(s.openingStock).toBeGreaterThan(0);
    }
    expect(seeds.some((s) => s.openingStock === 0)).toBe(true);
    expect(seeds.some((s) => s.openingStock > 0 && s.openingStock <= s.lowStockLevel)).toBe(true);
    expect(seeds.some((s) => s.openingStock > s.lowStockLevel)).toBe(true);
  });

  it('SEED-03: request IDs are stable per shop and product (re-runs never create duplicates)', async () => {
    const { stableRequestId } = await load();
    expect(stableRequestId('shop-1:Test Item 01 (fictitious)')).toBe(stableRequestId('shop-1:Test Item 01 (fictitious)'));
    expect(stableRequestId('shop-1:Test Item 01 (fictitious)')).not.toBe(stableRequestId('shop-2:Test Item 01 (fictitious)'));
    expect(stableRequestId('x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('SEED-04: only a loopback API address is accepted; cloud and network addresses are refused', async () => {
    const { assertLocal } = await load();
    for (const ok of ['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321']) expect(() => assertLocal(ok), ok).not.toThrow();
    for (const bad of ['https://abcdefghijklmnop.supabase.co', 'http://192.168.1.20:54321', 'http://example.com', 'not a url']) {
      expect(() => assertLocal(bad), bad).toThrow(/Refusing to seed/);
    }
  });

  it('SEED-05 (regression): the entry-point check matches paths with spaces, Windows paths and letter case', async () => {
    const { isEntryPoint } = await load();
    // Linux/macOS path with a space: the URL has %20, the path has a space
    const posix = '/home/ama mensah/shopmate ghana/scripts/seed-local-products.mjs';
    expect(isEntryPoint(pathToFileURL(posix).href, posix, 'linux')).toBe(true);
    expect(isEntryPoint(pathToFileURL(posix).href, '/elsewhere/other.mjs', 'linux')).toBe(false);
    // Windows: drive letter, backslashes, spaces; Windows paths ignore letter case
    const win = 'C:\\Users\\Ama Mensah\\shopmate ghana\\scripts\\seed-local-products.mjs';
    const winUrl = 'file:///C:/Users/Ama%20Mensah/shopmate%20ghana/scripts/seed-local-products.mjs';
    expect(isEntryPoint(winUrl, win, 'win32')).toBe(true);
    expect(isEntryPoint(winUrl, win.toLowerCase(), 'win32')).toBe(true);
    expect(isEntryPoint(winUrl, 'C:\\Users\\Other\\seed-local-products.mjs', 'win32')).toBe(false);
    // Imported (no script path), as in these tests: not the entry point
    expect(isEntryPoint(winUrl, undefined, 'win32')).toBe(false);
  });

  it('SEED-06 (regression): npx is started as npx.cmd through the shell on Windows, directly elsewhere', async () => {
    const { npxCommand } = await load();
    expect(npxCommand('win32')).toEqual({ command: 'npx.cmd', shell: true });
    expect(npxCommand('linux')).toEqual({ command: 'npx', shell: false });
    expect(npxCommand('darwin')).toEqual({ command: 'npx', shell: false });
  });

  it('SEED-07 (regression): the script really runs from a folder whose path contains a space, and via a symlink', () => {
    // The copy sits inside the repository so @supabase/supabase-js resolves from node_modules.
    // Without the owner's credentials the script must stop with its own message (proof that the
    // main part ran); before the fix it exited silently with status 0. Nothing is written.
    const dir = mkdtempSync(join(resolve('.'), '.seed path check '));
    try {
      const copy = join(dir, 'seed-local-products.mjs');
      copyFileSync(resolve('scripts/seed-local-products.mjs'), copy);
      const env = { ...process.env, SHOPMATE_SEED_EMAIL: '', SHOPMATE_SEED_PASSWORD: '' };
      const run = spawnSync(process.execPath, [copy], { encoding: 'utf8', env });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('Set SHOPMATE_SEED_EMAIL and SHOPMATE_SEED_PASSWORD');
      const link = join(dir, 'linked seed.mjs');
      symlinkSync(copy, link);
      const viaLink = spawnSync(process.execPath, [link], { encoding: 'utf8', env });
      expect(viaLink.status).toBe(1);
      expect(viaLink.stderr).toContain('Set SHOPMATE_SEED_EMAIL and SHOPMATE_SEED_PASSWORD');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(testTarget().mode === 'cloud')('SEED-08 (finding 7, end to end on the LOCAL stack): rerun-safe; an archived seed category is not re-created; nothing duplicated', async () => {
    const target = testTarget();
    const email = `owner.seed-e2e.${randomUUID().slice(0, 8)}@example.test`;
    const password = `Test-${randomUUID()}`;
    const owner = createClient(target.apiUrl, target.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const su = await owner.auth.signUp({ email, password });
    if (su.error) throw su.error;
    const shop = await owner.rpc('create_business', { p_request_id: randomUUID(), p_name: 'Seed E2E Shop (fictitious)', p_type: 'provision' });
    if (shop.error) throw shop.error;
    const businessId = shop.data.business_id as string;
    const ref = (await owner.from('businesses').select('reference_code').eq('id', businessId).single()).data!.reference_code as string;
    const env = { ...process.env, SHOPMATE_SEED_EMAIL: email, SHOPMATE_SEED_PASSWORD: password };
    const seed = (...args: string[]) => spawnSync(process.execPath, [resolve('scripts/seed-local-products.mjs'), ...args], { encoding: 'utf8', env });
    const counts = async () => {
      const prods = await owner.from('products').select('name').eq('business_id', businessId);
      const cats = await owner.from('categories').select('name, deleted_at').eq('business_id', businessId);
      return { products: prods.data!.length, names: new Set(prods.data!.map((r) => r.name)).size, cats: cats.data! };
    };

    // Dry run and a wrong confirmation write nothing
    expect(seed().stdout).toContain('Dry run: nothing written');
    expect(seed('--confirm-shop=SM-0000').stdout).toContain('Nothing written');
    expect((await counts()).products).toBe(0);

    // Real run, then a rerun: 35 products, 3 categories, no duplicates
    const first = seed(`--confirm-shop=${ref}`);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain('Done: 35 added, 0 already present');
    expect(seed(`--confirm-shop=${ref}`).stdout).toContain('Done: 0 added, 35 already present');
    let c = await counts();
    expect([c.products, c.names, c.cats.length]).toEqual([35, 35, 3]);

    // The owner archives one seed category (after moving its products off it); a rerun must not re-create it
    const drinks = (await owner.from('categories').select('id').eq('business_id', businessId).eq('name', 'Test Drinks (fictitious)').single()).data!;
    const moved = await owner.from('products').select('id, name, selling_price, category_id, unit, low_stock_level').eq('business_id', businessId).eq('category_id', drinks.id);
    for (const row of moved.data!) {
      const r = await owner.rpc('update_product', {
        p_request_id: randomUUID(), p_business_id: businessId, p_product_id: row.id, p_name: row.name, p_selling_price: row.selling_price,
        p_category_id: null, p_unit: row.unit, p_low_stock_level: row.low_stock_level,
        p_expected: { name: row.name, selling_price: row.selling_price, category_id: row.category_id, unit: row.unit, low_stock_level: row.low_stock_level },
      });
      if (r.error) throw r.error;
    }
    const arch = await owner.from('categories').update({ deleted_at: new Date().toISOString() }).eq('id', drinks.id).select('id').single();
    if (arch.error) throw arch.error;
    const again = seed(`--confirm-shop=${ref}`);
    expect(again.stdout).toContain('Fictitious categories: 3 already present, 0 to add.');
    expect(again.stdout).toContain('Done: 0 added, 35 already present');
    c = await counts();
    expect([c.products, c.names, c.cats.length]).toEqual([35, 35, 3]);
    expect(c.cats.filter((x) => x.name === 'Test Drinks (fictitious)')).toHaveLength(1);
  }, 120_000);
});
