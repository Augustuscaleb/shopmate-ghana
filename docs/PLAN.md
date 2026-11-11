# ShopMate Ghana — Development Plan

**Version:** 3.0 (approved)
**Date:** 11 November 2026
**Status:** Plan approved. **Implementation has not started** and begins only on the owner's explicit instruction.

---

## 0. Product summary

ShopMate Ghana is a mobile-first business management app for small businesses in Ghana — provision stores, mini-marts and boutiques. It helps owners manage:

- Daily sales (cash, MoMo and credit)
- Product inventory and stock levels, with low-stock alerts
- A customer credit book (who owes what, and repayments)
- Business expenses
- Revenue and profit reports

All amounts are in **Ghana cedis (GH₵)**. The goal is a genuine SaaS product with monthly subscriptions.

### Design realities

| Reality in Ghana | Design consequence |
|---|---|
| Most owners use (often low-cost) Android phones | Android-first, lightweight app |
| Mobile data is costly and connections drop | Sales recording works offline; low data usage |
| Selling on credit ("the book") is common | Credit ledger in the MVP |
| MoMo is the main digital payment method | Subscriptions paid by MoMo (manual at first) |
| Owners are busy, not always tech-savvy | Large buttons, plain language, a sale in ≤ 3 taps |

### Approved decisions log

| # | Decision |
|---|---|
| 1 | Stack: React Native + Expo + TypeScript + Supabase |
| 2 | Android-first; iOS later |
| 3 | Only **sales recording** works offline in the MVP, via a reliable queue. Products and customers are available offline from the last downloaded data (read-only) |
| 4 | Email + password authentication for development and pilot; phone OTP is a future option |
| 5 | Basic customer credit ledger included in Stage 1 |
| 6 | Manual monthly MoMo subscription payments; payment automation to be researched later — no assumptions about recurring MoMo support |
| 7 | Free tiers only during development and pilot. No domain, Google Play account or paid hosting yet |
| 8 | Validate with real shop owners before heavy investment (Stage 0 + checkpoints) |
| 9 | Negative stock: genuine offline sales are accepted even if stock goes negative, but the discrepancy is flagged, history is preserved, and the owner reconciles via an adjustment. **Online sales are stock-validated** |
| 10 | Stage 1 is **owner-only**: one owner account per business. Cashier/manager accounts later |
| 11 | Stage 0 targets: interview 10–15 owners, aim for ≥ 7 showing a clear problem and interest, recruit ≥ 5 pilot businesses. These are **targets, not guaranteed outcomes** |
| 12 | Offline sales immediately update locally displayed stock and show clear **pending / synced / failed** statuses. Duplicate transactions must be prevented |
| 13 | The free-tier backup must be verified, and a **tested restoration procedure** must exist before real business data is relied upon |

---

## 1. Technology stack

| Layer | Tool | Why (plain language) | Cost now |
|---|---|---|---|
| Mobile app | **React Native + Expo**, written in **TypeScript** | One codebase (Android now, iOS/web later). TypeScript catches mistakes before the app runs. Huge community | Free |
| On-phone storage | **SQLite** (via Expo) | A small database inside the app: holds the downloaded product/customer list and the offline sales queue | Free |
| Backend | **Supabase** | Managed PostgreSQL database, login, and server functions — no server for us to maintain | Free tier |
| Login | Supabase **email + password** | Free and built in | Free |
| App builds | **Expo EAS** (free tier) | Builds an installable **APK** shared directly with pilot shops | Free |
| App updates | Expo EAS Update | Pushes small fixes without reinstalling | Free tier |
| Crash reporting | Sentry | Alerts us when the app crashes on a user's phone | Free tier |
| Validation mock-ups | Figma (free) or paper | Show screens to owners before building | Free |
| Code & backup automation | GitHub + GitHub Actions | Code storage; scheduled database backups | Free |
| Subscriptions | Manual MoMo transfer | No integration cost or assumptions | Free |

**Distribution without the Play Store:** pilot shops install the APK directly. Android will ask to allow "install unknown apps" and may show a Play Protect warning, so we install in person. The one-time Google Play fee is paid only at public launch.

---

## 2. System architecture

```
┌──────────────────────────────────────┐
│ Owner's Android phone                │
│  ShopMate app                        │
│   ├─ Screens                         │
│   ├─ Local cache (read-only offline):│
│   │    products, prices, stock,      │
│   │    customers                     │
│   └─ SALES OUTBOX (queue)  ──────────┼──┐ sends queued sales; marks
│        pending → syncing → synced    │  │ each synced only after the
│                          ↘ failed    │  │ server confirms
└──────────────────────────────────────┘  │ HTTPS
                                          ▼
┌─────────────────────────────────────────────────┐
│ SUPABASE (cloud) — single source of truth       │
│  ├─ Auth (email + password)                     │
│  ├─ PostgreSQL with Row Level Security          │
│  │    (each business sees only its own data)    │
│  └─ record_sale() server function:              │
│       sale + items + stock movements + credit   │
│       entry saved together, or not at all;      │
│       idempotent (same sale ID never saved twice)│
└───────────────┬─────────────────────────────────┘
                ▼
     GitHub Actions (weekly encrypted backup → private storage)
```

### 2.1 Offline scope (MVP)

| Works offline ✅ | Needs internet 🌐 |
|---|---|
| Recording a sale: cash, MoMo or credit | Adding/editing products and prices |
| Picking an **existing** customer for a credit sale | Restocking and stock adjustments |
| Viewing products, prices, stock (last downloaded) | Adding customers, recording repayments |
| Viewing own pending/failed sales | Expenses, reports, settings, subscription |

A clear banner shows connection state, e.g. **"Offline — 3 sales waiting to upload"**.

### 2.2 Sale recording and synchronisation

**Two modes for a sale:**

| Mode | When | Stock rule |
|---|---|---|
| **Online (strict)** | The phone is online and the server responds while the sale is being completed | Server **validates stock**. If quantity exceeds recorded stock, the sale is not saved and the app explains: *"Only 2 in stock. Record a stock adjustment or restock first."* |
| **Offline (lenient)** | No connection, or the live request fails/times out | Sale goes to the outbox. On sync the server **accepts** it even if stock goes negative, and creates a **stock discrepancy flag** for the owner |

On the phone, offline sales exceeding locally displayed stock trigger a warning ("Recorded stock is 2 — continue?") but are allowed, because the goods have physically left the shop.

**Queue mechanics:**

1. On "Complete sale", the app generates a **unique sale ID (UUID)** on the phone and writes the sale to SQLite **before** showing the receipt.
2. The "Complete" button is disabled immediately after the first tap (prevents double-tap duplicates).
3. **Locally displayed stock updates immediately**: displayed stock = last downloaded server stock − quantities in this phone's unsynced (pending/syncing/failed) sales.
4. The sync engine sends queued sales oldest first when online, retrying with increasing waits (e.g. 5 s, 30 s, 2 min, 10 min…), and also on app open and when connectivity returns.
5. The server's `record_sale()`:
   - checks the user owns the business;
   - **if the sale ID already exists, returns "already recorded" with the original result** (idempotent — no duplicate);
   - otherwise saves sale, items, stock movements and (for credit) a ledger entry in **one transaction**;
   - assigns the official sequential receipt number.
6. The phone marks the sale **synced** only after the server's confirmation, then refreshes stock from the server.
7. Queued items carry a **payload version**, so app updates never strand old queued sales.

**Sync statuses shown to the owner:**

| Status | Meaning | What the owner sees/does |
|---|---|---|
| ⏳ **Pending** | Saved on phone, not yet uploaded | Counter on banner; nothing to do |
| 🔄 **Syncing** | Upload in progress | — |
| ✅ **Synced** | Server confirmed | Official receipt number shown |
| ⚠️ **Failed** | Server rejected or repeated errors (e.g. product removed, account issue) | Listed under "Needs attention" with the reason; **Retry** button. **Failed sales are never silently deleted** |

**Duplicate prevention (layers):** button lock → phone-generated UUID → database unique constraint on sale ID → idempotent server function.

**Lost-phone risk (accepted for MVP):** unsynced sales on a lost/wiped phone cannot be recovered. Mitigations: visible pending counter, warning before logout/uninstall-like actions (logout is blocked while sales are pending unless confirmed), encouragement to come online daily.

### 2.3 Negative stock and reconciliation

When an offline sale makes stock negative:

1. The sale and its stock movement are saved normally — **history is never altered**.
2. A row is created in `stock_discrepancies` (product, expected vs recorded stock, linked sale, status `open`).
3. The dashboard shows **"Needs attention: 1 stock discrepancy"**; the product is highlighted.
4. The owner counts the item and records a **stock adjustment** with a reason (e.g. "Unrecorded delivery", "Counting error"). The adjustment links to the discrepancy and marks it `resolved`.
5. Reconciliation is recorded in the audit log.

---

## 3. Database structure

**Money rule:** all amounts are stored as **integer pesewas** (GH₵12.50 → `1250`), displayed as GH₵.
**Stock rule:** stock changes only through `stock_movements`; `products.stock_qty` is a cached total kept in step by server functions.
**Credit rule:** a customer's balance is the **sum of ledger entries**, never a directly edited number.
**Common columns on every table:** `id` (UUID), `business_id`, `created_at`, `updated_at`, `deleted_at` (soft delete).

| Table | Purpose | Key fields |
|---|---|---|
| `businesses` | Each shop (tenant) | name, type, phone, town/region, reference code (e.g. `SM-0042`) |
| `profiles` | Each login | user_id, full_name, email |
| `business_members` | Links users to businesses | business_id, user_id, role (`owner` only in Stage 1) |
| `categories` | Product groups | name |
| `products` | Items for sale | name, category, unit, cost_price, selling_price, stock_qty, low_stock_level, pack_size (optional multiplier for restocking), active |
| `stock_movements` | Every stock change | product, type (`restock`, `sale`, `void`, `adjustment`, `damaged`), qty_change, unit_cost, reason, linked sale/discrepancy, user, time |
| `stock_discrepancies` | Negative-stock flags from offline sales | product, linked sale, recorded_qty_at_sync, status (`open`/`resolved`), resolving adjustment |
| `sales` | Each receipt | id (phone-generated UUID, unique), receipt_no (server-assigned), subtotal, discount, total, payment_method (`cash`/`momo`/`credit`), customer_id, mode (`online`/`offline`), **occurred_at** (phone time), **received_at** (server time), payload_version, voided_at, void_reason |
| `sale_items` | Receipt lines | sale, product, qty, unit_price, **unit_cost at time of sale**, line_total |
| `customers` | Credit customers | name, phone, credit_limit (optional), notes |
| `customer_ledger` | Every change to what a customer owes | customer, type (`credit_sale` +, `repayment` −, `void_reversal`, `adjustment`), amount, method (cash/MoMo for repayments), linked sale, reason, user, time |
| `expense_categories` | Rent, ECG, transport, etc. | name |
| `expenses` | Spending | category, amount, description, date |
| `subscriptions` | Plan status | plan, status (`trial`/`active`/`grace`/`overdue`), paid_until |
| `subscription_payments` | Manual MoMo payments confirmed by the operator | business, amount, MoMo transaction ID, payer number, confirmed_by, date |
| `audit_log` | Sensitive actions | who, action, before/after values, time |

### Report definitions

- **Sales (revenue)** = sum of non-voided sale totals (includes credit sales)
- **Cash & MoMo received** = cash/MoMo sales + credit repayments
- **Credit outstanding** = sum of all customer ledger balances
- **Cost of goods sold** = Σ qty × unit cost recorded at time of sale
- **Gross profit** = revenue − cost of goods sold
- **Net profit** = gross profit − expenses
- Days are reported in Ghana time (GMT/UTC+0, no daylight saving); timestamps stored in UTC.

---

## 4. Main screens

### Stage 1 (MVP)

1. **Sign up / Log in / Forgot password** (email + password)
2. **Business setup** — name, type, location; optional sample product lists per shop type
3. **Home dashboard** — today's sales, profit, cash received, credit outstanding, low-stock items, **Needs attention** (failed syncs, stock discrepancies), sync banner, big **New Sale** and **Add Expense** buttons
4. **New Sale** — tap/search products, quantities, whole-sale discount, payment method (Cash / MoMo / Credit → pick customer), Complete; works offline; share receipt via WhatsApp
5. **Sales history** — with sync status per sale; void with reason (online only)
6. **Products** — list with stock colours (green/amber/red, negative highlighted); add/edit product
7. **Restock & stock adjustment** — including reconciling discrepancies
8. **Low-stock list** — shareable WhatsApp shopping list
9. **Customers (credit book)** — sorted by amount owed; customer detail with history; **Record repayment**; WhatsApp balance reminder (pre-filled message, no cost)
10. **Expenses** — list and add
11. **Reports** — daily/weekly/monthly sales, profit, expenses, best sellers, credit outstanding
12. **Settings & Subscription** — business profile; plan status, paid-until date, "How to pay by MoMo" with the business reference code

### Later

Cashier/manager accounts and PINs, barcode scanning, suppliers, PDF reports, Twi language, owner web dashboard, phone OTP, iOS.

### UX rules

Large tap targets, high contrast for sunlight, plain English (Twi later), Android 8+ and low-RAM friendly, GH₵ formatting everywhere, minimal data usage.

---

## 5. Authentication and security

### 5.1 Authentication (development & pilot)

- **Email + password** via Supabase Auth. Users stay logged in on their phone, so login cost is zero.
- Supabase's built-in email sender is rate-limited and intended for testing. That is sufficient for 5–15 pilot shops (sign-up confirmation, password resets). A dedicated email provider or phone OTP is required **before public launch**.
- Pilot risk: some owners rarely use email. We help set up in person and **record how many struggle** — this decides the priority of phone OTP.
- Users are linked by internal user ID, not email, so phone OTP can be added later without restructuring.

### 5.2 Security measures

- HTTPS for all traffic.
- **Row Level Security (RLS) enabled on every table**, restricting access to the user's own business.
- Sensitive operations (sale, void, repayment, restock, adjustment) run through **server functions that check ownership**, so a modified app cannot bypass rules.
- The Supabase **service-role key** is never placed in the app or the repository — only in server/CI secrets. (The public "anon" key is designed to be in the app.)
- Minimum password rules; Supabase rate limiting on auth; "log out all devices" option.
- Audit log for voids, price changes, deletions, credit adjustments and stock reconciliations.
- **Data Protection Act, 2012 (Act 843):** informed consent from pilot shops, a simple privacy notice, and investigation of Data Protection Commission registration **before charging customers**.

---

## 6. Payments

### 6.1 Manual monthly MoMo (pilot and early launch)

1. Each business has a reference code (e.g. `SM-0042`) shown on the Subscription screen.
2. The owner sends the monthly fee by MoMo with the code as the reference.
3. The operator verifies the MoMo message and records it (transaction ID, amount, date) — initially directly in Supabase, later via a small admin screen.
4. `paid_until` advances one month. After expiry: ~7-day **grace** period with reminders. Data is never deleted or held hostage.

**Recommendation before charging:** consider a MoMo merchant/business number (e.g. MTN MoMoPay) to separate business funds.

### 6.2 Future automation (research in Stage 5 — no assumptions)

Evaluate Paystack, Hubtel, ExpressPay, Flutterwave and the MTN MoMo Open API against:

- Genuine support for **repeated automatic MoMo charges**, versus one-off payment prompts
- Fees and settlement times
- Business registration requirements
- Coverage of MTN MoMo, Telecel Cash and AirtelTigo Money

A monthly "Pay now" MoMo prompt with automatic confirmation would already remove most manual work.

---

## 7. Development stages and checkpoints

### Stage 0 — Validate (2–4 weeks, minimal code)

- Interview **10–15 shop owners**: how they record sales and credit today, what costs them money, staff-theft concerns, willingness to pay monthly.
- Show mock-ups (Figma/paper) of New Sale, Products and the Credit Book; observe understanding.
- Recruit pilot businesses.
- **Checkpoint (targets, not guarantees):** ≥ 7 owners show a clear problem and interest; ≥ 5 businesses agree to pilot. If targets are missed, adjust the product before building further.

### Stage 1 — MVP (6–8 weeks)

- Project setup, database schema, RLS policies
- Email auth, business setup (owner-only)
- Products, stock movements, restock/adjustments, discrepancy reconciliation
- New Sale with online validation and the offline queue
- Sales history and voids
- Credit ledger: customers, credit sales, repayments, balances
- Expenses, dashboard, basic reports
- **Weekly backup automation and a successful restore drill (see Section 8)**
- Automated tests for everything in Section 9 (money, security rules, stock, sync)

### Stage 2 — Pilot (4–6 weeks, free for pilot shops)

- **Entry gate:** backup + restore drill passed and documented; RLS isolation tests passing.
- Install in person; weekly feedback; fast fixes.
- Track daily usage, sync failures, discrepancies and crashes.
- **Checkpoint:** ≥ half of pilot shops still using it daily after 3 weeks; ≥ 3 say they would pay.

### Stage 3 — Refinement (3–4 weeks)

Fix pilot findings; likely add cashier/manager accounts with PINs and the most-requested features.

### Stage 4 — Paid launch (only after the Stage 2 checkpoint)

Start manual MoMo subscriptions. **Only now** spend money: Google Play ($25 one-time), Supabase Pro (~$25/month, includes managed daily backups), a domain, and a proper email/SMS provider.

### Stage 5 — Growth

Payment automation, phone OTP, barcode scanning, suppliers, wider offline support, multiple branches, Twi, iOS.

---

## 8. Backup and restoration (free tier)

### 8.1 Verification findings

| Question | Finding | Status |
|---|---|---|
| Does the Supabase Free plan provide downloadable backups? | No managed/downloadable backups on Free; daily backups come with Pro | From third-party guides; **official docs to be re-checked** during Stage 1 |
| Can we export the database ourselves? | Yes — standard PostgreSQL tools (`pg_dump`, or the Supabase CLI `supabase db dump`) work with a normal database connection string | Feasible |
| Can GitHub Actions connect? | The Free plan's direct connection uses IPv6, which GitHub runners may not support. The **Session Pooler** connection string (IPv4) must be used | Known pitfall, handled |
| Version issues? | The `pg_dump` client must match or exceed the Supabase Postgres major version; install the matching client in the workflow | Known pitfall, handled |
| Cost? | GitHub Actions is free for public repos; private repos get a free monthly minutes allowance — a weekly dump uses a few minutes | Free |
| Where to store dumps? | **This repository is currently public**, so dumps must **never** be stored here. Use a **separate private repository** and **encrypt** each dump before upload | Required safeguard |

**Conclusion:** a free weekly backup is technically feasible. It is **not considered verified** until the restore drill below has passed against a real Supabase project. **No real business data will be entered until it has.**

### 8.2 Backup design

- **Schedule:** weekly via GitHub Actions (cron), plus manual "run now". (Daily costs nothing extra and can be enabled if desired — reduces worst-case data loss from 7 days to 1.)
- **Contents:** database roles, schema and data, including the `auth` schema (user accounts), using the Supabase CLI dump commands or `pg_dump` via the Session Pooler.
- **Encryption:** the dump is encrypted (e.g. `age` or `gpg` with a passphrase stored only in GitHub Secrets and in the owner's password manager) before leaving the runner.
- **Storage:** separate **private** GitHub repository (e.g. `shopmate-backups`), keeping the latest ~12 weekly backups.
- **Secrets:** database connection string and encryption passphrase stored only as GitHub Actions secrets.
- **Monitoring:** GitHub emails on workflow failure; the backup log is reviewed weekly during the pilot.
- **Limitation:** file storage (e.g. future product photos) is not included in a database dump; MVP stores no files.

### 8.3 Restoration procedure (to be tested in Stage 1)

1. Download the chosen encrypted backup from the private backup repository.
2. Decrypt it with the passphrase.
3. Restore into a **target**: a second free Supabase project (the free plan allows two active projects) or a local PostgreSQL/Supabase instance via Docker.
4. Apply roles → schema → data in order, using `psql`/`pg_restore`.
5. **Verify** with a checklist script:
   - row counts per table match the source at backup time;
   - totals match: sales per business, stock per product, customer balances;
   - a test owner can log in and sees only their own business (RLS works after restore).
6. Record the drill: date, backup used, time taken, issues found.

**Restore drill rules:**

- Must pass before the pilot starts (Stage 2 entry gate).
- Repeat monthly during the pilot, and after any major database change.

**After a real restore:** phones still holding pending sales will re-upload them safely, because sync is idempotent. Sales synced *after* the backup was taken but before the failure would be lost from the server; this is the main reason daily backups may be preferable.

---

## 9. Key technical risks and mitigations

### A. Offline synchronisation

| Risk | Mitigation |
|---|---|
| Duplicate sales from retries / double taps | Button lock, phone-generated UUID, unique constraint, idempotent `record_sale()` |
| Lost sales from crash or dead battery | Sale written to SQLite **before** the receipt shows; marked synced only after server confirmation |
| Half-saved sales | One all-or-nothing database transaction for sale + items + stock + credit |
| Unsynced data on a lost/wiped phone | Visible pending counter; logout warning while sales are pending; daily-sync encouragement. Accepted MVP risk, explained to pilots |
| Wrong phone clock | Store `occurred_at` and `received_at`; flag large differences |
| Outdated prices offline | Sale stores the price actually charged; cache refreshes when online |
| App update breaks queued items | `payload_version` on every queued sale; server accepts older versions |
| Failed sales unnoticed | ⚠️ Failed status, "Needs attention" list, Retry; never silently deleted |

### B. Database security

| Risk | Mitigation |
|---|---|
| **Missing or wrong RLS policy exposes another shop's data (highest-severity risk)** | RLS on every table by default; **automated isolation tests** (log in as Shop A, attempt to read/write Shop B data — must fail) run on every change |
| Rules enforced only in the app | Sensitive actions only through server functions that verify ownership |
| Service-role key leak | Never in app or repo; secrets only; repository secret scanning |
| Account takeover | Password rules, auth rate limiting, log-out-all-devices |
| Backup data exposure | Encrypted dumps in a separate private repository |

### C. Stock consistency

| Risk | Mitigation |
|---|---|
| Concurrent sales overwrite each other | Atomic `stock_qty = stock_qty − qty` inside the server transaction; never read-then-write from the phone |
| Cached stock drifts from history | Stock changes only via `stock_movements`; a check recalculates from history and flags mismatches |
| Offline sale causes negative stock | Accepted, flagged in `stock_discrepancies`, reconciled by owner adjustment; history preserved |
| Online sale exceeds stock | Rejected by the server with a clear message (strict mode) |
| Packs vs pieces | MVP: one selling unit per product; optional pack-size multiplier when restocking |

### D. Financial calculations

| Risk | Mitigation |
|---|---|
| Decimal rounding errors | Integer pesewas; one shared, tested rounding function |
| Past profit changes when cost price changes | Unit cost snapshot on each sale line |
| Credit sales inflate apparent cash | Reports separate Sales, Cash & MoMo received, Credit outstanding |
| Balances drift or get edited | Balances derived from ledger; corrections only as visible adjustment entries |
| Voids leave stock/credit wrong | Void creates reversing stock and ledger entries; original sale remains, marked voided |
| Day-boundary errors | UTC storage, Ghana-time (UTC+0) reporting, tested boundaries |
| Discount allocation | MVP: whole-sale discounts only, with defined effect on profit |

All money, stock, sync and security rules get automated tests before the pilot.

### E. Other risks

| Risk | Mitigation |
|---|---|
| Owners don't use email | In-person setup; measured during pilot to prioritise phone OTP |
| Distrust of APK installation | In-person installation and explanation |
| Supabase Free pauses inactive projects (~1 week) | Daily pilot use keeps it active; unpausing is free |
| Manual MoMo doesn't scale | Fine for dozens of shops; automation research in Stage 5 |
| Building unwanted features | Stage 0 validation and checkpoints |
| Plan and code are public | **The repository is currently public.** Consider making it private (free on GitHub) to protect business plans and code |

---

## 10. Costs

| Period | Cost |
|---|---|
| Stages 0–3 (validation, build, pilot, refinement) | **GH₵0** — free tiers only |
| Stage 4 onwards (only after validation) | ~GH₵350–500/month (Supabase Pro ~$25, SMS/email usage) + ~GH₵300 one-time for Google Play. Exchange rates vary |

**Free-tier limits to monitor:**

- **Supabase Free:** 500 MB database (ample for a pilot), pauses after ~1 week of inactivity, no managed backups (covered by Section 8), and built-in email rate limits.
- **Expo EAS:** limited monthly builds on the free tier.
- **GitHub Actions:** limited minutes for private repositories.

### Indicative pricing (to test in the pilot)

- **Free plan:** limited products, basic reports.
- **Standard plan:** ~GH₵50–80/month.
- **Break-even:** ~6–10 paying shops cover post-launch running costs.

---

*Next step: await the owner's explicit instruction to begin implementation (Stage 0 materials or Stage 1 setup).*
