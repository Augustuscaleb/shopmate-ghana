# Stage 1C-1, task T10: Acknowledge attention, stock integrity check, low-stock list — plan

**Status: ✅ IMPLEMENTED** in `ba565e7` (24 Nov 2026), after the owner accepted this plan as the implementation baseline; 25 of 25 deliberate faults caught; CI passed ([CI #48](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45424865849), [#49](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45431840081)); not applied to the cloud project (D11). Owner decisions A1–A3, I1–I3, L1–L3 and M2 recorded 24 Nov 2026. **Still open:** I2 (deferred) and the §12 Reports-stage items. M2 has since been decided (Option B) and implemented in `7d29d4d` ([CI #51](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45487659376); [STAGE-1C-DECISIONS.md](STAGE-1C-DECISIONS.md) §4). *Below: the plan as approved; its draft wording is historical.*
**Baseline:** commit `2b3bb4a` (T9), CI #47 passed (849 database / 124 API / 25 app). Specification revision 5.1.
**Origin:** Stage 1C-1 checkpoint review, findings H1 (missing `acknowledge_attention`, `check_stock_integrity`), I5 (no low-stock list), H2 / M1 / M2 / M3 (documentation and decisions).
**Legend:** **[REQ]** established by the specification or an approved decision · **[DEC]** owner-approved for T10 · **[REC]** recommendation, not approved.

## 1. Scope and objectives

| # | In T10 | Why |
|---|---|---|
| 1 | `public.acknowledge_attention` | STAGE-1C-PLAN §2 server functions; 09 §3; C-122 / C-123 / C-125 / C-126; S-36 |
| 2 | `public.check_stock_integrity` (read-only) and its internal core | STAGE-1C-PLAN §2 and exit criterion 2; 09 §3; 06 SY-75; TC-COST-10 |
| 3 | Additive integrity assertions in existing inventory test files (§7.2) | STAGE-1C-PLAN exit criterion 2 ("after every test"); [DEC] I3 |
| 4 | `public.low_stock_products` | STAGE-1C-PLAN §2 "Low stock", Q2; F-07; S-35; 04 §2.4; [DEC] L1, L2 |

Outside T10 (§12): documentation cleanup, Reports specification clarifications, cloud migration and R-1 re-verification, weekly all-shops integrity run and alerts, CI workflow changes, `unpaid_purchases` display fields (M2).

## 2. Owner decisions (24 Nov 2026)

| # | Decision [DEC] |
|---|---|
| **A1** | Acknowledgeable types: `cost_adjustment`, `cost_check`, `purchase_correction`, `time_uncertain`, `closed_day_changed`. **Refused** (`not_acknowledgeable`): `negative_stock`, `stock_discrepancy`, `cost_missing`, where the specification requires corrective action (C-120, C-124, 04 §2.3, TC-ATTN-06) |
| **A2** | An item already `acknowledged` or `resolved` returns a **no-change result** preserving the original acknowledgement details; **no** further audit entry |
| **A3** | **One** audit entry for an actual acknowledgement change only |
| **I1** | All nine integrity checks, each with its exact formula, sources, rounding, applicability and expected / actual calculation documented before implementation (§3.2.1); nothing that could produce false discrepancies |
| **I2** | Weekly all-shops integrity run and administrator alert **deferred** (separate planning and authorisation) |
| **I3** | Narrow, **additive** integrity assertions in existing inventory database and API test files, after the relevant operations and before fixture cleanup / rollback. No change to existing scenarios, expected results, production code or accounting rules. Files and additions listed in §7.2; **no other historical test-file changes** |
| **L1** | Option B: a separate paginated `low_stock_products` function |
| **L2** | Order: largest shortfall first, then product name, then product ID |
| **L3** | **No index now**; conditions and evidence for a future index recorded (§9.3) |
| **M2** | `unpaid_purchases` display fields **deferred**: the T7 function is **not** modified in T10; no `corrected_cost`, `refunds_received` or `credits`. **Required owner decision before Stage 1C-2** |

## 3. Existing architecture and dependencies

- **`attention_items`** (`core_tables.sql:330–347`): `type` (8 values), `entity`, `entity_id`, `message_data`, `status` `open` / `acknowledged` / `resolved`, `acknowledged_by`, `acknowledged_at`, `resolved_ref`, `created_at`, `updated_at`. Check: `acknowledged` ⇒ `acknowledged_by` and `acknowledged_at` set. Not append-only; `set_updated_at` and `forbid_business_change` triggers apply. RLS `members_read`; no app write grant. Unique open item per (business, type, entity, entity_id) (T1 D8).
- **`private.raise_attention`** (T1): inserts, or adds `occurrences` / `latest` to an identical **open** item. After acknowledgement a repeat opens a **new** item.
- **Raised today:** cost_check (C-25b, T1), cost_adjustment (C-25a ≥ 10, T1; C-25, T5; C-25c ≥ 10, T8), purchase_correction (T9). None of negative_stock, stock_discrepancy, cost_missing, time_uncertain, closed_day_changed is raised yet (Stage 1D). Nothing resolves items yet (T6 S5).
- **Stock pool:** `products` (`stock_qty`, `stock_value`, `cost_known`, created at 0 / 0 by `create_product`); `stock_movements` (append-only; index `(product_id, created_at)`); `product_cost_history` (append-only; one row per movement, `movement_id` set by `write_movement`; `effective_at` strictly increasing per product; index `(product_id, effective_at)`). `write_movement` stores `avg_cost = round(new_value::numeric / new_qty, 4)` only when new_qty > 0, new_value ≥ 0 and the product's cost is known at that moment; otherwise null. `apply_movement` leaves every product with stock 0 ⇒ value 0 (C-25a) and stock > 0 ⇒ value ≥ 0 (C-25b).
- **`inventory_summary`** (T2, `20261123000200_inventory_summary.sql`): `language plpgsql`, `stable`, `security invoker`, `search_path = ''`, explicit `not_authenticated` / `not_a_member` checks; counts `products where business_id = $1 and active and deleted_at is null` and, of those, `stock_qty <= low_stock_level`.
- **Pagination precedent:** T7 `unpaid_purchases` (limit 1–200, offset ≥ 0, totals over all rows, deterministic order). API `max_rows = 1000` (RPC results are one JSON value, so the row cap does not apply to them).

## 4. Function contracts and security model

### 4.1 Security model (all three functions)

| | `acknowledge_attention` | `check_stock_integrity` | `low_stock_products` |
|---|---|---|---|
| Mode | SECURITY DEFINER | SECURITY DEFINER (public wrapper) + internal core `private.stock_integrity` | SECURITY INVOKER (as T2) |
| Why | writes `attention_items`, which the app cannot update | must see every row of the shop regardless of RLS, so it can never under-report | reads only `products`; RLS `members_read` already scopes it, exactly like `inventory_summary` |
| `search_path` | `''` | `''` (wrapper and core) | `''` |
| Sign-in | `not_authenticated` if `auth.uid()` is null | same | same |
| Membership | `private.is_member(p_business_id)` else `not_a_member` | same | same |
| Shop scoping | item looked up with `business_id = p_business_id` | every query filtered by `business_id = p_business_id` (product filter also shop-scoped) | `business_id = p_business_id` plus RLS |
| Grants | revoked from public, anon; execute to authenticated | wrapper: same; **core revoked from public, anon, authenticated** (internal; called by the wrapper and by tests as the superuser) | revoked from public, anon; execute to authenticated |
| RLS | bypassed (definer) and replaced by the explicit checks above | bypassed (definer), explicit checks | applies (invoker) |
| Writes | `attention_items` (status fields only), `audit_log`, `request_log` | **none** (STABLE; PostgreSQL rejects writes) | **none** (STABLE) |
| Audit | one entry per actual change (A3) | none (a read) | none (a read) |
| Idempotency | business-scoped claim (`claim_request('acknowledge_attention')`) | not needed (read) | not needed (read) |

MVP has only the `owner` role (decision 7), so "authorised" = an active member of the shop. No table grant, policy or existing function changes.

### 4.2 `public.acknowledge_attention`

```
public.acknowledge_attention(p_request_id uuid, p_business_id uuid, p_item_id uuid) returns jsonb
```
1. `not_authenticated` / `not_a_member`; claim (a replay returns the stored result)
2. `select … from attention_items where id = p_item_id and business_id = p_business_id for update` → `attention_item_not_found`
3. Type not in A1's list → `not_acknowledgeable` (item unchanged; claim rolled back)
4. `status = 'open'` → `update … set status = 'acknowledged', acknowledged_by = auth.uid(), acknowledged_at = now()` (only these fields; `updated_at` by trigger); one audit entry: action `acknowledge_attention`, entity `attention_item`, entity_id = item, before `{status: 'open'}`, after `{status: 'acknowledged', acknowledged_by, acknowledged_at, type}`
5. `status in ('acknowledged', 'resolved')` → no change, no audit (A2)
6. Result (stored for replays): `{item_id, type, status, changed, acknowledged_by, acknowledged_at}` — on a no-change result these are the item's existing values (null for a resolved item never acknowledged)

Changes no figures (TC-ATTN-05); never deletes or rewrites history (`message_data`, `type`, `entity`, `entity_id`, `created_at` untouched).

### 4.3 `public.check_stock_integrity`

```
public.check_stock_integrity(p_business_id uuid, p_product_id uuid default null, p_limit integer default 200) returns jsonb
private.stock_integrity(p_business_id uuid, p_product_id uuid default null) returns table (product_id uuid, product_name text, check_code text, expected text, actual text)
```
- Wrapper: sign-in, membership, `p_limit` 1–1000 (`invalid_limit`), `p_product_id` must be a product of the shop (`product_not_found`); calls the core **in one SQL statement**, then returns
  `{business_id, product_id, checked_at, products_checked, movements_checked, ok, discrepancy_count, discrepancies: [{product_id, product_name, check, expected, actual}], truncated}`
  - `discrepancy_count` and `ok` cover **all** discrepancies; `discrepancies` holds the first `p_limit` in deterministic order (lower(product name), product ID, check code); `truncated = discrepancy_count > p_limit`
- Core: `language sql`, `stable`, one `SELECT` with CTEs (one snapshot; see §5). Products in scope: all products of the shop **including archived and deleted ones** (their movements still count), or the one product.
- **Read-only. Never repairs stock, never writes attention items or audit entries.** Safe to run repeatedly.

#### 4.3.1 The nine checks (I1)

Notation for product p (shop-scoped): M = its `stock_movements` rows; H = its `product_cost_history` rows; ΣQ = Σ M.qty_change; ΣV = Σ M.value (both `coalesce(…, 0)`, computed as `bigint` / `numeric`, no rounding). All comparisons are exact integer equality except check 9 (exact numeric equality after the same rounding as the writer).

| # | Code | Formula (expected vs actual) | Sources | Applies when | Why it cannot be a false positive |
|---|---|---|---|---|---|
| 1 | `qty_mismatch` | expected ΣQ; actual `products.stock_qty`; flag if ≠ | products, stock_movements | always | every function changes stock_qty only through `write_movement`, which adds exactly the movement's qty_change; products start at 0 |
| 2 | `value_mismatch` | expected ΣV; actual `products.stock_value`; flag if ≠ | products, stock_movements | always | as 1, for value (05 §3.2: value changes only through movements) |
| 3 | `history_latest_mismatch` | expected (stock_qty, stock_value); actual (stock_qty_after, stock_value_after) of the H row with the greatest `effective_at`; flag if ≠ | products, product_cost_history | p has ≥ 1 history row | `write_movement` writes the after-values of every change; `effective_at` is strictly increasing per product (no ties) |
| 4 | `history_link_mismatch` | expected: each M row has exactly one H row with `movement_id = M.id`, and each H row has a non-null `movement_id` pointing to an M row of the same product; actual: the counts of movements without exactly one history row, and of history rows without a matching movement; flag if either > 0 | stock_movements, product_cost_history | always | `write_movement` inserts exactly one linked H row per M row in the same statement sequence |
| 5 | `history_chain_mismatch` | for H rows linked to M rows, ordered by `effective_at`: expected running Σ of the linked movements' (qty_change, value) up to and including the row; actual the row's (stock_qty_after, stock_value_after); flag at the **first** row that differs (expected / actual of that row) | stock_movements, product_cost_history | p has ≥ 1 linked H row | each H row is written by the same call that applied its movement, starting from 0 / 0; ordering by effective_at is the recorded order |
| 6 | `zero_stock_value` | if stock_qty = 0: expected stock_value 0; actual stock_value | products | stock_qty = 0 | `apply_movement` posts any residue at 0 stock (C-25a) before returning |
| 7 | `negative_value` | if stock_qty > 0: expected stock_value ≥ 0; actual stock_value | products | stock_qty > 0 | `apply_movement` corrects a negative value with positive stock (C-25b) before returning |
| 8 | `unknown_cost_value` | if cost_known = false: expected stock_value 0 and no H row with non-null avg_cost; actual stock_value and the count of such rows | products, product_cost_history | cost_known = false | value enters the pool only with a known cost (opening with cost, restock, set_cost mark cost known; T6 S1 / T8 Q1 value 0 / refuse); `write_movement` writes an average only for a known cost |
| 9 | `average_mismatch` | for each H row with non-null avg_cost: expected `round(stock_value_after::numeric / stock_qty_after, 4)` with stock_qty_after > 0 and stock_value_after ≥ 0; actual avg_cost; flag the first differing row | product_cost_history | H.avg_cost is not null | identical expression and types to `write_movement` (numeric ÷ integer, `round(…, 4)`, half away from zero); a null average is **not** checked (whether the cost was known at that past moment is not recorded) |

Rounding: none in checks 1–8; check 9 reproduces the writer's rounding exactly. `expected` / `actual` are returned as text (exact integers or 4-dp numbers; for check 4 the two counts).

#### 4.3.2 Large histories, snapshot, limits, performance (requirement B)

- **One snapshot:** the core is a single `SELECT`; under READ COMMITTED a single statement reads one consistent snapshot, so concurrent restocks / adjustments / corrections cannot produce torn results. No row locks are taken, so it never blocks writers (MVCC).
- **Cost:** O(M + H) for the shop: grouped sums per product (index `stock_movements (product_id, created_at)`), one window pass over history (index `(product_id, effective_at)`). Products without movements cost one row each.
- **Limits:** `p_limit` caps the returned list (1–1000); counts are always complete; `truncated` flags the cut. `p_product_id` allows a targeted run.
- **Timeouts:** if the hosted project applies a per-role statement timeout (Supabase commonly sets one for `authenticated`; not configured in this repository), a very large shop could exceed it; the call then fails cleanly (read-only, nothing to roll back) and can be repeated per product. Measured in TC-INV-121p; to be checked before the cloud migration (D11).

### 4.4 `public.low_stock_products`

```
public.low_stock_products(p_business_id uuid, p_limit integer default 50, p_offset integer default 0) returns jsonb
```
- `language plpgsql`, `stable`, `security invoker`, `search_path = ''`; `not_authenticated`, `not_a_member`; `p_limit` 1–200 (`invalid_limit`); `p_offset` ≥ 0 (`invalid_offset`)
- **Definition (requirement C) — the same predicate as `inventory_summary`, verbatim:**
  `p.business_id = p_business_id and p.active and p.deleted_at is null and p.stock_qty <= p.low_stock_level`
  Both functions are INVOKER, so RLS applies identically; `total_count` is `count(*)` over this predicate (all qualifying products, not the page), so by construction `total_count = inventory_summary.low_stock_count` for the same shop and snapshot.
- **Order (L2):** `(p.low_stock_level::bigint − p.stock_qty::bigint) desc, lower(btrim(p.name)), p.id` — `bigint` so a very negative stock cannot overflow; `lower(btrim(name))` matches the product-name uniqueness rule; `id` makes it total.
- **One statement** computes the count and the page (as T7).
- Result: `{total_count, limit, offset, products: [{product_id, name, unit, category_id, stock_qty, low_stock_level, shortfall}]}`, `shortfall = low_stock_level − stock_qty` (bigint).

## 5. Idempotency and concurrency

- **acknowledge_attention:** claim → item lock `FOR UPDATE`. Two phones at once: the second waits, then sees `acknowledged` and returns no-change (A2). Concurrent `raise_attention`: committed first → its occurrence is on the item the acknowledgement then covers; acknowledgement first → the repeat opens a new item (T1 D8; history kept).
- **check_stock_integrity / low_stock_products:** single read statements, no locks, repeatable.

## 6. Error handling

| Function | Errors |
|---|---|
| acknowledge_attention | `not_authenticated`, `not_a_member`, `attention_item_not_found`, `not_acknowledgeable`, `request_id_reused` |
| check_stock_integrity | `not_authenticated`, `not_a_member`, `product_not_found`, `invalid_limit` |
| low_stock_products | `not_authenticated`, `not_a_member`, `invalid_limit`, `invalid_offset` |

Refused requests write nothing (acknowledgement: the claim is rolled back too).

## 7. Tests

### 7.1 New T10 files

**Database** `supabase/tests/database/13_attention_integrity_lowstock.test.sql`:

| ID | Test |
|---|---|
| TC-INV-120a | definitions per §4.1 (modes, search_path, grants; core not executable by app roles) |
| TC-INV-120b | acknowledge an open item: status / by / at set; message_data, type, entity, entity_id, created_at unchanged |
| TC-ATTN-05 | acknowledging changes no figures (products, movements, history, purchases, payments byte-identical) |
| TC-INV-120c | one audit entry per change (A3); none for a no-change result |
| TC-INV-120d | each A1 acknowledgeable type succeeds; `negative_stock`, `stock_discrepancy`, `cost_missing` refused and unchanged (TC-ATTN-06) |
| TC-INV-120e | already acknowledged → no change, original by / at kept; resolved → no change (A2) |
| TC-INV-120f | replay, other shop / function reuse, refused request leaves no claim |
| TC-INV-120g | isolation: other shop's item not found; inactive membership; no user; anonymous; app cannot update attention_items directly |
| TC-INV-120h | a repeat raise after acknowledgement opens a new open item; the acknowledged one is kept |
| TC-INV-121a | integrity ok for a shop exercised by every T3–T9 function |
| TC-INV-121b–j | one test per check 1–9: a fixture corruption written by the superuser inside the test transaction is reported with the exact code, expected and actual |
| TC-INV-121k | near-boundary cases that must **not** be reported: stock 0 / 0; negative stock with negative value; archived and deleted products with movements; unknown cost with zero value; averages of thirds (4-dp rounding); a product with no movements |
| TC-INV-121l | read-only: two runs give identical results; no rows written anywhere |
| TC-INV-121m | product filter, unknown product, limit validation, truncation with full count and deterministic order |
| TC-INV-121n | isolation: other shop refused; another shop's corruption never reported |
| TC-COST-10 | 100 random restocks, fixture sales and voids, adjustments, returns and corrections: integrity ok |
| TC-INV-121p | ≥ 20,000 movements: run time recorded (diag) |
| TC-INV-122a | definition: stock below, at and above level; 0 and negative stock; level 0; archived and deleted excluded |
| TC-INV-122b | `total_count = inventory_summary.low_stock_count` in every fixture shop, including edge cases |
| TC-INV-122c | order per L2 (shortfall desc, name, id), ties broken by name then ID; pages concatenate to the full list with no repeats |
| TC-INV-122d | > 1,000 low-stock products: exact count, last page, timing recorded (L3 evidence) |
| TC-INV-122e | validation and isolation |

**API** `tests/attention-integrity-lowstock.api.test.ts`:

| ID | Test |
|---|---|
| TC-INV-130a | acknowledge a real T8 C-25c item end to end; status visible to the app; no figure changes |
| TC-INV-130b | two parallel acknowledgements: one change, one no-change, one audit entry |
| TC-INV-130c | 5 copies of one request: recorded once |
| TC-INV-130d | isolation; direct update refused |
| TC-INV-131a | integrity ok after a mixed sequence through the public functions |
| TC-INV-131b | integrity run concurrently with restocks / adjustments: no error, no blocking, ok afterwards |
| TC-INV-132a | low-stock paging and totals through the API; equals `inventory_summary` |

**App:** none (no app code in T10; service layer and screens are Stage 1C-2).

### 7.2 Additive integrity assertions in existing files (I3)

Each addition is placed **after the file's last operation and before `select * from finish(); rollback;`** (database) or in a new `afterAll` (API); it runs the integrity core / RPC for the shops the file created and asserts zero discrepancies, **except** the two documented fixtures below, for which it asserts exactly the expected discrepancy. The only other line changed in a database file is its `select plan(N)` count (+1). Nothing else changes.

**Database (superuser inside the test transaction, calling `private.stock_integrity` for each `tests.ids` key beginning `biz_`):**

| File | Addition |
|---|---|
| `supabase/tests/database/03_inventory_helpers.test.sql` (T1) | 1 assertion; `plan(62)` → `plan(63)`. **Exception:** product `sugar`: the overflow fixtures (lines 235–254) set it directly to 1 / 0 with cost known, and TC-INV-06l (line 264) then applies one accepted `value_correction` of +99,999,999,999,999 through `apply_movement`. Its quantity (1) therefore differs from its movements (0), and its one history row shows quantity 1 against a running sum of 0. The assertion requires `sugar`'s discrepancies to be exactly `qty_mismatch` and `history_chain_mismatch` (value, latest-row, link and average checks hold), and none for any other product. If implementation shows any other result, stop and report (no silent exclusion) |
| `supabase/tests/database/05_products_categories.test.sql` (T3) | 1 assertion; `plan(108)` → `plan(109)` |
| `supabase/tests/database/07_set_cost.test.sql` (T4) | 1 assertion; `plan(60)` → `plan(61)` |
| `supabase/tests/database/08_restock.test.sql` (T5) | 1 assertion; `plan(81)` → `plan(82)`. Product `free` was set directly for the overflow test and restored to 5 / 0, which equals its single restock (5 for 0): **no exception expected**; if implementation shows otherwise, stop and report (no silent exclusion) |
| `supabase/tests/database/09_adjust_stock.test.sql` (T6) | 1 assertion; `plan(92)` → `plan(93)`. Product `big` restored to 100000 = its movement: no exception expected (same rule) |
| `supabase/tests/database/10_supplier_payments.test.sql` (T7) | 1 assertion; `plan(99)` → `plan(100)` (T7's six U1 expectations untouched) |
| `supabase/tests/database/11_return_to_supplier.test.sql` (T8) | 1 assertion; `plan(94)` → `plan(95)` |
| `supabase/tests/database/12_correct_purchase.test.sql` (T9) | 1 assertion; `plan(107)` → `plan(108)` |

**API (new `afterAll` calling `check_stock_integrity` for each owner's own shop with that owner's client):**

| File | Addition |
|---|---|
| `tests/products.api.test.ts` (T3) | `afterAll`: shops ok |
| `tests/set-cost.api.test.ts` (T4) | `afterAll`: shops ok |
| `tests/restock.api.test.ts` (T5) | `afterAll`: shops ok **except** product "API Parallel pen" (TC-INV-68f), whose fixture inserted a movement and an unlinked history row with the service-role key: its discrepancies must be exactly `history_link_mismatch` and `history_chain_mismatch`; any other discrepancy fails |
| `tests/adjust-stock.api.test.ts` (T6) | `afterAll`: shops ok |
| `tests/supplier-payments.api.test.ts` (T7) | `afterAll`: shops ok (including the list shop) |
| `tests/return-to-supplier.api.test.ts` (T8) | `afterAll`: shops ok |
| `tests/correct-purchase.api.test.ts` (T9) | `afterAll`: shops ok |

**Not modified, and why:** `01_structure_and_constraints`, `02_rls_isolation_and_functions` (insert products, movements and history directly as schema / RLS fixtures); `04_inventory_summary` and `tests/inventory-summary.api.test.ts` (insert > 1,000 products with stock directly to test counting: every product would be a by-design `qty_mismatch`); `06_request_idempotency`, `tests/idempotency.api.test.ts`, `tests/security.api.test.ts` and the remaining non-inventory files.

## 8. Deliberate faults

membership check removed; claim removed; item lock removed; A1 type check removed; acknowledgement touching `message_data`; audit removed / duplicated on no-change; each integrity check disabled in turn (its 121x test must fail); a check made over-strict (e.g. check 9 with truncation instead of rounding: 121k must fail); integrity writing an attention item; low-stock predicate changed (`<` for `<=`, archived included); total from the page only; order changed.

## 9. Performance

### 9.1 Integrity
O(movements + history) per shop, one statement; measured in TC-INV-121p (≥ 20,000 movements); product filter for targeted runs.

### 9.2 Acknowledge
One row lock and two inserts.

### 9.3 Low-stock (L3: no index now)
Same scan as `inventory_summary` (`products_active_idx`). **A partial index `(business_id) where active and deleted_at is null and stock_qty <= low_stock_level` would be justified when** any of: (a) `low_stock_products` or `inventory_summary` exceeds 200 ms at p95 for a real shop; (b) a shop exceeds about 10,000 active products; (c) `EXPLAIN (ANALYZE, BUFFERS)` shows the active-product scan dominating. **Evidence to collect:** TC-INV-122d timing (> 1,000 products), and production query timings once in use. Adding it later is a new migration (no data change).

## 10. Migration, atomicity and rollback (requirement D)

- **One migration** `supabase/migrations/20261125000100_attention_integrity_lowstock.sql`: four functions (`acknowledge_attention`, `private.stock_integrity`, `check_stock_integrity`, `low_stock_products`) and their grants. No table, constraint, index, policy or existing-function change.
- **Atomic:** the Supabase CLI applies each migration file in a single transaction; every statement here (CREATE FUNCTION, REVOKE, GRANT) is transactional, so a failure leaves nothing behind (to be confirmed during implementation by a deliberate failing-statement check on the local stack).
- **Rollback:** before any cloud apply (D11), locally by `db reset` from the previous migrations; afterwards, a new forward migration dropping the four functions (no data to migrate back).
- **Irreversible data effects:** acknowledgements (status, acknowledged_by, acknowledged_at on attention items, and their audit entries). Dropping the function does not undo them; un-acknowledging is not provided (out of scope). The check and the list write nothing.

## 11. Acceptance criteria

1. Four functions exactly as in §4; no other schema change.
2. All new T10 tests pass; all earlier tests pass with only the §7.2 additions (and their plan counts); every §7.2 assertion passes, with only the two documented fixture exceptions.
3. No T1–T9 production file changed; no other historical test-file change.
4. Clean rebuild; full database, API and app regression; typecheck, secret scan, audit gate, Android bundle export and scan; CI green.
5. Every §8 fault caught by its named test; originals restored.
6. Acknowledgements change no figures; the check and the list write nothing; `low_stock_products.total_count = inventory_summary.low_stock_count` in every fixture.

## 12. Exclusions and work separation

| Category | Items |
|---|---|
| **T10** | §1 items 1–4 |
| **Documentation-only (separate task)** | `IMPLEMENTATION-STATUS.md` (still "T1 in progress", CI #40); test tracker 10 (all 📝); Stage 1C evidence logs; T4–T7 decisions (A–E, R1–R7, S1–S5, P1–P7) recorded in `docs/PLAN.md` or a Stage 1C decisions page |
| **Owner decision before Stage 1C-2** | **M2** `unpaid_purchases` display fields (shows original `purchase_cost` and gross `paid`; after corrections, refunds or credits cost − paid ≠ unpaid); the app service layer for the T10 functions |
| **Reports stage** | 09 §3 (Model A); 05 §3.2 conservation line and C-41 (C-25c) from T8; 10 TC-PUR-13 wording; reports reading T8 / T9 records |
| **Separate authorisation** | cloud migration of T1–T10 and R-1 re-verification (D11), including the statement-timeout check (§4.3.2); weekly all-shops integrity run and admin alert (I2); any CI workflow change |
| **Not T10** | repairing discrepancies; resolving items automatically; bulk or un-acknowledgement; sales-created item types (1D); any T1–T9 production change |

## 13. Remaining items

No owner decision is outstanding for T10 itself. Routine details marked [REC] (error-code names, result field names, ordering of discrepancies) follow §4; anything that turns out to affect accounting, security or scope will be raised before implementation.

## 14. Specification notes

- 09 §2 lists `attention_items.type` without `purchase_correction` (the schema has it): wording only.
- 06 SY-75 asks for a weekly production run with admin alerts; 09 §3 defines `check_stock_integrity()` as a read: T10 provides the shop-scoped read; the rest is I2 (deferred).
- No conflict for acknowledgement: S-36, C-122 – C-126 and TC-ATTN-05 / 06 agree with A1.
