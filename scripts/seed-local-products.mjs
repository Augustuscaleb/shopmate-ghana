#!/usr/bin/env node
/**
 * Seeds 35 FICTITIOUS products (and 3 fictitious categories) into one shop on the LOCAL Supabase
 * stack, for Stage 1C-2 device testing (increment 2b checklist; D2-10 paging needs more than 30
 * products). Local development only.
 *
 * Safety:
 * - Local only: the API address comes from `npx supabase status` and must be a loopback address
 *   (127.0.0.1, localhost or ::1). Anything else, including any *.supabase.co project, is refused.
 *   `.env` is never read.
 * - No admin key: it signs in as the shop owner (the fictitious test account), so the usual
 *   access rules apply and only that owner's shop can be written.
 * - Dry run by default: without --confirm-shop it only shows what it would do. Writing needs
 *   --confirm-shop=<the shop's reference code, e.g. SM-0008>.
 * - Never resets, wipes, updates or deletes anything: it only adds what is missing.
 * - Idempotent: products and categories that already exist (same name, active or archived) are
 *   skipped. Each product's request ID is derived from the shop and the product name, so a re-run
 *   after an interrupted run returns the earlier result instead of creating a duplicate; product
 *   names are also unique per shop on the server.
 *
 * Usage (on the computer that runs the local stack, from the repository root). The first command
 * is a dry run; the second, with the shop's reference code, writes.
 *
 *   macOS or Linux (bash, zsh):
 *     SHOPMATE_SEED_EMAIL='<test owner email>' SHOPMATE_SEED_PASSWORD='<password>' node scripts/seed-local-products.mjs
 *     SHOPMATE_SEED_EMAIL='<test owner email>' SHOPMATE_SEED_PASSWORD='<password>' node scripts/seed-local-products.mjs --confirm-shop=SM-0008
 *
 *   Windows PowerShell (the VAR=value form above doesn't work there; single quotes keep
 *   special characters in the password as typed):
 *     $env:SHOPMATE_SEED_EMAIL = '<test owner email>'
 *     $env:SHOPMATE_SEED_PASSWORD = '<password>'
 *     node scripts/seed-local-products.mjs
 *     node scripts/seed-local-products.mjs --confirm-shop=SM-0008
 *     Remove-Item Env:SHOPMATE_SEED_PASSWORD, Env:SHOPMATE_SEED_EMAIL
 *
 *   Windows Command Prompt (cmd.exe; keep the quotes around the whole assignment, so characters such
 *   as & | < > in the password are taken literally; a % in the password may be changed by
 *   cmd.exe, so use PowerShell for such a password):
 *     set "SHOPMATE_SEED_EMAIL=<test owner email>"
 *     set "SHOPMATE_SEED_PASSWORD=<password>"
 *     node scripts\seed-local-products.mjs
 *     node scripts\seed-local-products.mjs --confirm-shop=SM-0008
 *     set "SHOPMATE_SEED_PASSWORD="
 *     set "SHOPMATE_SEED_EMAIL="
 *
 * On Windows the variables stay set for the rest of that terminal window, so the last commands
 * clear them.
 * Optional: SHOPMATE_SEED_BUSINESS_ID=<uuid> when the account has more than one shop (set it the same
 * way as the other two for your terminal).
 * The password is read from the environment only and is never printed.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const PRODUCT_COUNT = 35;
const CATEGORIES = ['Test Drinks (fictitious)', 'Test Provisions (fictitious)', 'Test Toiletries (fictitious)'];
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** The fictitious products: names, prices and stock chosen to show every stock state. */
export function seedProducts() {
  const units = ['piece', 'pack', 'bottle', 'sachet', 'tin'];
  return Array.from({ length: PRODUCT_COUNT }, (_, i) => {
    const n = i + 1;
    // Every 7th is out of stock; every 5th is low (at or below 5); the rest are in stock
    const openingStock = n % 7 === 0 ? 0 : n % 5 === 0 ? 3 : 10 + n;
    return {
      name: `Test Item ${String(n).padStart(2, '0')} (fictitious)`,
      category: CATEGORIES[i % CATEGORIES.length],
      unit: units[i % units.length],
      sellingPrice: 150 + n * 25, // pesewas: GH₵ 1.75 … GH₵ 10.25
      costPrice: openingStock > 0 ? 100 + n * 15 : null,
      openingStock,
      lowStockLevel: 5,
    };
  });
}

/** A stable UUID from text (same shop + same name → same request ID on every run). */
export function stableRequestId(text) {
  const h = createHash('sha256').update(`shopmate-seed:${text}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Refuses anything but a loopback API address. */
export function assertLocal(apiUrl) {
  let host;
  try { host = new URL(apiUrl).hostname; } catch { throw new Error('Refusing to seed: the local API address could not be read.'); }
  if (!LOOPBACK.has(host)) throw new Error(`Refusing to seed: ${host} is not this computer. This script works only on the local development stack.`);
}

/**
 * How to run `npx` on this platform. On Windows it is `npx.cmd`, which Node can only start
 * through the shell; the arguments are fixed constants, never user input.
 */
export function npxCommand(platform = process.platform) {
  return platform === 'win32' ? { command: 'npx.cmd', shell: true } : { command: 'npx', shell: false };
}

/**
 * Whether this module is the script being run (`node scripts/seed-local-products.mjs`), not an
 * import (the tests). Compares file URLs built the same way, so a path with spaces (`%20`),
 * Windows drive letters and backslashes, and symlinked folders all match. Windows paths are
 * compared without regard to letter case.
 */
export function isEntryPoint(metaUrl, argv1, platform = process.platform) {
  if (!argv1) return false;
  const windows = platform === 'win32';
  let target = argv1;
  try { target = realpathSync(argv1); } catch { /* keep the path as given */ }
  const href = pathToFileURL(target, { windows }).href;
  return windows ? href.toLowerCase() === metaUrl.toLowerCase() : href === metaUrl;
}

function localStack() {
  const npx = npxCommand();
  const raw = execFileSync(npx.command, ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: npx.shell });
  const status = JSON.parse(raw.slice(raw.indexOf('{')));
  const apiUrl = status.API_URL;
  const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
  if (!apiUrl || !key) throw new Error('Refusing to seed: the local Supabase stack is not running (npx supabase status).');
  assertLocal(apiUrl);
  return { apiUrl, key };
}

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.find((a) => a.startsWith('--confirm-shop='))?.split('=')[1] ?? null;
  const email = process.env.SHOPMATE_SEED_EMAIL;
  const password = process.env.SHOPMATE_SEED_PASSWORD;
  if (!email || !password) throw new Error('Set SHOPMATE_SEED_EMAIL and SHOPMATE_SEED_PASSWORD (the fictitious test owner account).');

  const { apiUrl, key } = localStack();
  const client = createClient(apiUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`Sign-in failed: ${signIn.error.message}`);

  const shops = await client.from('businesses').select('id, name, reference_code').order('created_at');
  if (shops.error) throw new Error(`Could not read the shop: ${shops.error.message}`);
  const wanted = process.env.SHOPMATE_SEED_BUSINESS_ID;
  const candidates = wanted ? shops.data.filter((b) => b.id === wanted) : shops.data;
  if (candidates.length !== 1) {
    throw new Error(candidates.length === 0 ? 'No shop found for this account.' : 'This account has more than one shop: set SHOPMATE_SEED_BUSINESS_ID.');
  }
  const shop = candidates[0];
  const seeds = seedProducts();

  // What already exists (active or archived; products are never hard-deleted)
  const existingProducts = await client.from('products').select('name').eq('business_id', shop.id).is('deleted_at', null)
    .in('name', seeds.map((s) => s.name));
  if (existingProducts.error) throw new Error(`Could not read products: ${existingProducts.error.message}`);
  const haveProduct = new Set(existingProducts.data.map((r) => r.name));
  const existingCats = await client.from('categories').select('id, name, deleted_at').eq('business_id', shop.id).in('name', CATEGORIES);
  if (existingCats.error) throw new Error(`Could not read categories: ${existingCats.error.message}`);

  const toCreate = seeds.filter((s) => !haveProduct.has(s.name));
  // A seed category that exists in any state counts as present: an archived one is NOT re-created
  // (that would add a second category with the same name). Products then get no category for it.
  const catsMissing = CATEGORIES.filter((c) => !existingCats.data.some((r) => r.name === c));
  console.log(`Local stack: ${apiUrl}`);
  console.log(`Shop: ${shop.name} (${shop.reference_code})`);
  console.log(`Fictitious products: ${seeds.length - toCreate.length} already present, ${toCreate.length} to add.`);
  console.log(`Fictitious categories: ${CATEGORIES.length - catsMissing.length} already present, ${catsMissing.length} to add.`);

  if (confirm !== shop.reference_code) {
    console.log(confirm === null
      ? `Dry run: nothing written. To add them, run again with --confirm-shop=${shop.reference_code}`
      : `Refusing: --confirm-shop=${confirm} does not match this shop (${shop.reference_code}). Nothing written.`);
    return;
  }

  // Categories (direct writes under the owner's access rules); a duplicate means it exists
  const catId = new Map(existingCats.data.filter((r) => r.deleted_at === null).map((r) => [r.name, r.id]));
  for (const name of catsMissing) {
    const ins = await client.from('categories').insert({ business_id: shop.id, name }).select('id').single();
    if (ins.error && ins.error.code !== '23505') throw new Error(`Could not add category ${name}: ${ins.error.message}`);
    if (ins.data) catId.set(name, ins.data.id);
    else {
      const again = await client.from('categories').select('id').eq('business_id', shop.id).eq('name', name).is('deleted_at', null).single();
      if (again.error) throw new Error(`Could not read category ${name}: ${again.error.message}`);
      catId.set(name, again.data.id);
    }
  }

  let added = 0;
  let skipped = seeds.length - toCreate.length;
  for (const s of toCreate) {
    const res = await client.rpc('create_product', {
      p_request_id: stableRequestId(`${shop.id}:${s.name}`), p_business_id: shop.id, p_name: s.name,
      p_selling_price: s.sellingPrice, p_category_id: catId.get(s.category) ?? null, p_unit: s.unit,
      p_cost_price: s.costPrice, p_opening_stock: s.openingStock, p_low_stock_level: s.lowStockLevel,
    });
    if (res.error) {
      if (res.error.message === 'duplicate_product_name') { skipped += 1; continue; }
      throw new Error(`Could not add ${s.name}: ${res.error.message}`);
    }
    added += 1;
  }
  console.log(`Done: ${added} added, ${skipped} already present. Nothing was changed or deleted.`);
}

if (isEntryPoint(import.meta.url, process.argv[1])) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
}
