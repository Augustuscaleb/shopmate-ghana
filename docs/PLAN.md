# ShopMate Ghana — Development Plan

**Status:** v7.1. **Approved as the implementation baseline** (11 November 2026), with product specification revision 5.1. Implementation progress: [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md)
**Last updated:** 11 November 2026

> Detailed product rules live in [docs/product-specification/](product-specification/README.md). Where this plan summarises them, the specification is authoritative: [09-data-model.md](product-specification/09-data-model.md) for the database, [05-financial-calculations.md](product-specification/05-financial-calculations.md) for money rules and [10-test-plan.md](product-specification/10-test-plan.md) for tests.

ShopMate Ghana is a mobile-first business management app for small businesses in Ghana — provision stores, mini-marts and boutiques. It helps owners manage daily sales, inventory, expenses, low-stock alerts, customer credit, and revenue/profit reports, in Ghana cedis (GH₵).

The goal is a genuine SaaS product with monthly subscription revenue. The product must be secure, reliable, easy to use and suitable for Ghanaian small businesses.

> **Important:** This plan does not authorise implementation by itself. Coding begins only on explicit instruction from the project owner.

---

## Table of contents

1. [Guiding principles](#1-guiding-principles)
2. [Technology stack](#2-technology-stack)
3. [System architecture](#3-system-architecture)
4. [Offline sales and synchronisation](#4-offline-sales-and-synchronisation)
5. [Stock rules and negative stock](#5-stock-rules-and-negative-stock)
6. [Database structure](#6-database-structure)
7. [Application screens](#7-application-screens)
8. [Authentication and security](#8-authentication-and-security)
9. [Subscription payments](#9-subscription-payments)
10. [Backups and restoration](#10-backups-and-restoration)
11. [Development stages and checkpoints](#11-development-stages-and-checkpoints)
12. [Costs](#12-costs)
13. [Technical risks and mitigations](#13-technical-risks-and-mitigations)
14. [Decision log](#14-decision-log)

---

## 1. Guiding principles

| Ghanaian reality | Design response |
|---|---|
| Most shop owners use Android, often low-cost phones | Android-first, lightweight app |
| Mobile data is expensive and connections drop | Sales can be recorded offline; minimal data usage |
| Credit sales ("the book") are common | Customer credit ledger included in the MVP |
| Owners are busy and not always tech-savvy | Large buttons, plain English, a sale in 3 taps or fewer |
| Limited budget before the product is proven | Free tiers only until validation succeeds |

**Validate before investing.** Real shop owners shape the product. Each stage ends with a checkpoint that decides whether to continue, change direction or stop.

---

## 2. Technology stack

| Layer | Tool | Why | Cost now |
|---|---|---|---|
| Mobile app | **React Native + Expo + TypeScript** | One codebase (Android now, iOS/web later); TypeScript catches mistakes early; huge community | Free |
| On-device storage | **SQLite** (`expo-sqlite`) | Holds the downloaded product/customer data and the sales outbox | Free |
| Backend | **Supabase** (PostgreSQL, Auth, Edge Functions) | Managed database, login and server logic without running our own server | Free tier |
| Login | Supabase email + password | Free; phone OTP can be added later | Free |
| App builds | Expo EAS (free tier) → **APK** shared by link/WhatsApp | No Play Store account needed during the pilot | Free |
| App updates | Expo EAS Update | Small fixes reach phones without reinstalling | Free tier |
| Crash reporting | Sentry | Alerts us to crashes on users' phones | Free tier |
| Validation mock-ups | Figma (free plan) or paper sketches | Test ideas with shop owners before building | Free |
| Source code & automation | GitHub + GitHub Actions | Code storage, automated tests, scheduled backups | Free |
| Subscription payments | Manual MoMo transfers | No integration cost; see section 9 | No cost |

**Platform:** Android first. iOS later, when there is demand.

**Pilot distribution:** EAS builds an installable APK. Pilot users must allow "install unknown apps", and Android may show a Play Protect warning. We install it in person for each pilot shop. The Google Play account ($25, one-time) is bought only at paid launch.

---

## 3. System architecture

```
┌──────────────────────────────────────────┐
│ Shop owner's Android phone               │
│  ShopMate app                            │
│   ├─ Screens                             │
│   ├─ Local cache (last downloaded):      │
│   │    products, prices, stock, customers│
│   └─ SALES OUTBOX (queue) ───────────────┼──┐
└──────────────────────────────────────────┘  │ HTTPS
                                              ▼
┌──────────────────────────────────────────────────┐
│ SUPABASE (cloud) — the single source of truth    │
│  ├─ Auth (email + password)                      │
│  ├─ PostgreSQL with Row Level Security           │
│  │    (each business sees only its own data)     │
│  └─ record_sale(): saves sale + items + stock    │
│      movements + credit entry in ONE transaction │
│      (all or nothing), idempotent by sale ID     │
└──────────────────────────────────────────────────┘
              │
              ▼
  GitHub Actions: weekly encrypted backup (section 10)
```

**Key ideas**

- **The server is the source of truth.** The phone keeps a cached copy for display and an outbox for unsent sales.
- **Multi-tenant.** Every record belongs to one business. Row Level Security in the database enforces separation between businesses.
- **IDs are generated on the phone.** Each sale gets a unique ID (UUID) when it is created, which makes duplicate prevention possible.
- **Important writes go through server functions.** Sales, voids, repayments and stock adjustments are performed by database functions that check permissions and keep everything consistent.

---

## 4. Offline sales and synchronisation

### 4.1 Scope (MVP)

| Works offline ✅ | Needs internet 🌐 |
|---|---|
| Recording a sale — cash, MoMo or credit | Adding/editing products and prices |
| Choosing an existing product or customer from the last downloaded data | Restocking and stock adjustments |
| Viewing locally updated stock levels | Adding customers, recording repayments |
| Viewing pending/failed sales and their status | Expenses, reports, settings, subscription |

Offline features beyond this are added only if pilot evidence shows they are needed.

### 4.2 How a sale flows

1. The owner completes a sale. The app creates a **unique sale ID** and writes the complete sale to the **outbox** in local storage **before** showing the confirmation or receipt.
2. **Local stock is updated immediately.** Displayed stock = last downloaded server stock − quantities in pending (unsynced) sales. The owner always sees realistic stock, even offline.
3. When internet is available, the sync engine sends outbox sales **one at a time, oldest first**, to `record_sale()`.
4. The server saves the sale, its items, its stock movements and any credit-ledger entry in **one transaction**. Either everything is saved or nothing is.
5. **Duplicate prevention:** if a sale with that ID already exists, the server does not save it again. It returns "already recorded" and the phone treats this as success. A retried sale can never be counted twice. This is enforced by a unique constraint in the database, not only by app logic.
6. The phone marks the sale **Synced** only after the server confirms. It then refreshes product stock from the server.
7. Temporary failures (no network, timeout, server busy) are retried automatically with increasing delays (e.g. 5 s, 30 s, 2 min, 10 min, …). The app also retries immediately when the connection returns or when the app is opened.

### 4.3 Sync statuses shown to the owner

| Status | Meaning | What the owner sees |
|---|---|---|
| **Pending** | Saved on the phone, not yet confirmed by the server (including while retrying) | Clock icon; banner such as "Offline – 3 sales waiting to upload" |
| **Synced** | Confirmed by the server | Green tick |
| **Failed – needs attention** | The server rejected the sale for a reason that retrying will not fix (e.g. unexpected data problem) | Red warning; sale details kept on the phone; "Retry" and "Contact support" options |

Rules:

- Failed sales are **never silently discarded**. They stay on the phone until resolved.
- A sale that never reached the server can only be removed through the **safe cancellation process**: internet status check, reason, review, re-authentication, and a server-side `cancelled_unsent` record and audit entry (specification 04 §1.5). There is no local-only discard.
- Logging out, or anything else that would clear local data, is **blocked or strongly warned against** while Pending or Failed sales exist.
- A sales history filter lets the owner see Pending/Failed sales at any time.

### 4.4 Online vs offline sales

- **Offline sales** (queued because there was no connection) are **accepted by the server even if they make stock negative**, because they really happened. They are flagged (see section 5).
- **Online sales** are validated against current server stock. See section 5.2.
- Each queued sale records whether it was created offline, the phone time (`occurred_at`) and a **payload version number**, so later app updates can still process older queued sales.

---

## 5. Stock rules and negative stock

### 5.1 General rules

- Stock changes **only** through recorded `stock_movements` (restock, sale, void reversal, adjustment, damaged/expired). Nobody edits the stock number directly.
- `products.stock_qty` is a cached total. It is updated in the same transaction as each movement, using a single safe database step (`stock_qty = stock_qty − qty`). This prevents two simultaneous sales from overwriting each other.
- A reconciliation check can recalculate stock from the movement history and flag any mismatch.

### 5.2 Online sale validation

- When online, the server checks stock before accepting the sale. If any item has insufficient stock, the sale is **not saved**, and the app tells the owner which item is short.
- The app then offers a quick **"Correct stock"** action: the owner records a stock adjustment with a reason (for example, "physical count higher than system"), then completes the sale. History is preserved and nothing is changed silently.

### 5.3 Offline sale that causes negative stock (with safeguards)

1. The server **accepts** the sale and records all stock movements normally. Stock may become negative.
2. The server creates a **stock discrepancy** record linking the product, the sale that caused it and the shortfall.
3. The dashboard shows a **"Needs attention: stock discrepancies"** card. Negative stock is shown clearly in red on product screens.
4. The owner **reconciles** by recording a stock adjustment (e.g. after a physical count). The adjustment is linked to the discrepancy, which is then marked resolved.
5. **Nothing is deleted or overwritten.** The original sale, its movements, the discrepancy and the adjustment all remain in history and in the audit log.

*Note:* a modified app could falsely claim a sale was made offline to bypass online validation. In Stage 1 only the owner uses the app, so this is low risk, and such sales are still flagged as discrepancies. We will revisit this when cashier accounts are added.

### 5.4 Cost method and losses

- **Weighted-average cost using a value pool:** each product keeps stock quantity and stock value (whole pesewas); average = value ÷ quantity.
- Each sale is costed **as at its sale time** from the product's cost history, and removes exactly that cost from the pool. A late-uploaded offline sale therefore keeps its original cost **and** leaves the correct future average.
- Total cost is always conserved.
- Cost-changing events (restock, adjustment, void, cost correction) are online-only and server-timed.
- Phone sale times are verified with Android's elapsed-time clock and flagged when doubtful.
- Closed days keep immutable snapshots, so confirmed reports are never rewritten.
- Details: specification 05 §3, §11.
- Limitations and the fallback (last-restock pricing) are documented in specification 05 §3.
- **Purchases** add their **full acquisition cost** to stock value, whatever was paid. Unpaid amounts are tracked per purchase (no full supplier accounts in the MVP).
- **Goods taken for own use** are shown separately, below estimated net profit, with stock reduced at cost (approved).
- **Supplier payments** can be partial, any number of times; they never change stock value and are never expenses.
- **Purchase-cost corrections** are split proportionally between goods already sold or used and remaining stock (specification 05 §12.2).
- **Every automatic cost adjustment is visible**, with a Needs attention item showing its GH₵ effect and the action required.
- **Daily closing** keeps the original figures; later changes are separate adjustments.
- **Stock losses** (damaged, expired, missing, count corrections down) and **bad debts written off** **reduce estimated net profit**. They are shown separately from operating expenses.

### 5.5 Units

MVP: each product has one selling unit (e.g. piece). When restocking, the owner can enter a simple multiplier (e.g. "1 carton = 24 pieces"). Full multi-unit support is deferred.

---

## 6. Database structure

The full, authoritative data model (tables, fields, server functions) is in **[product-specification/09-data-model.md](product-specification/09-data-model.md)**. Summary:

**Conventions**

- **Money** is stored as whole **pesewas** (integers): GH₵12.50 = `1250`, including stock value. Average-cost snapshots are exact decimals (4 dp, never floating point).
- **Time** is stored in UTC. Reports use Ghana time (GMT/UTC+0, no daylight saving).
- Every table has `id` (UUID), `business_id`, `created_at`, `updated_at` and `deleted_at`. Records are soft-deleted.
- **Balances and stock are derived from append-only ledgers** (`customer_ledger`, `stock_movements`).
- Money, stock and ledger changes happen **only** through server functions.

**Tables:**

| Area | Tables |
|---|---|
| Business and access | `businesses`, `profiles`, `business_members`, `devices` |
| Products and stock | `categories`, `products` (with `stock_qty`, `stock_value`), `product_cost_history`, `stock_movements` (with exact value changes), `stock_discrepancies` |
| Sales | `sales` (phone-generated ID, MoMo reference, paid-now amount, online/offline mode), `sale_items` (server-assigned unit cost) |
| Customers and credit | `customers`, `customer_ledger` (credit_sale, repayment, adjustment, write_off, write_off_undo, void_reversal), `debt_recoveries` |
| Expenses and cash | `expense_categories`, `expenses` (paid_from), `cash_counts`, `day_snapshots` (immutable confirmed days) |
| Subscription and audit | `subscriptions` (incl. `pilot` plan), `subscription_payments`, `audit_log`, `request_log` (idempotency) |

**Report formulas** (full rules in specification 05):

- **Sales** = Σ non-voided sale totals, including credit sales
- **Cost of items sold** = Σ sale-time line costs + cost adjustments (shown as a sub-line)
- **Gross profit** = Sales − Cost of items sold
- **Net profit (estimated)** = Gross profit − Operating expenses − Stock losses − Bad debts written off + Recovered bad debts. Each is shown on its own line
- **Cash / MoMo received** = sales + paid-now + repayments, by method
- **Credit outstanding** = Σ customer balances

---

## 7. Application screens

### Stage 1 (MVP)

1. **Sign up / Log in / Forgot password** (email + password)
2. **Business setup** — name, type, location; optional sample product lists for provision stores, mini-marts and boutiques
3. **Home dashboard** — today's sales and profit, credit outstanding, low-stock items, a "Needs attention" card (stock discrepancies, failed syncs), sync status banner, and **New Sale** / **Add Expense** buttons
4. **New Sale** — tap or search products, cart, sale-level discount, payment method (Cash / MoMo / Credit + customer), Complete. **Works offline.**
5. **Sales history** — sync status per sale (Pending / Synced / Failed), receipt view, void with reason (online)
6. **Products** — list with stock colours (green / amber / red, negative highlighted), add/edit product
7. **Restock and stock adjustment**, including reconciling discrepancies
8. **Low-stock list** — shareable as a WhatsApp shopping list
9. **Customers (credit book)** — list sorted by amount owed, customer history, **Record repayment**, WhatsApp balance reminder (pre-filled message via WhatsApp link; no cost)
10. **Expenses** — list and add
11. **Reports** — daily, weekly and monthly sales, cash received, profit, expenses, best sellers, credit outstanding
12. **Settings & Subscription** — business profile, plan status, "paid until" date, how to pay by MoMo with the business reference code

### Later stages

Cashier/manager accounts with PINs, barcode scanning, suppliers, PDF reports, Twi language, web dashboard, phone OTP, multiple branches, iOS.

### Design rules

Large tap targets, high contrast for bright sunlight, plain English, support for Android 8+ and low-memory phones, GH₵ formatting everywhere, low data usage.

---

## 8. Authentication and security

### 8.1 Login: email and password (development and pilot)

- **Why:** free and built into Supabase. Users log in once per device and stay logged in, so there is no per-login cost.
- **Limitation:** Supabase's built-in email sender is rate-limited and meant for testing. It is enough for a small pilot (confirmations and password resets). A proper email provider, or phone OTP, is needed before public launch.
- **Pilot measurement:** we help owners set up in person and record how many find email difficult. This evidence decides when phone OTP is prioritised.
- **Phone OTP (future):** users are identified by ID, not email, so phone login can be added later without restructuring.
- **Stage 1 roles:** one owner account per business. Manager/cashier roles come in a later stage. The data model already includes `business_members.role`.

### 8.2 Security measures

- HTTPS for all traffic.
- **Row Level Security enabled on every table.** Policies restrict every row to members of its business.
- **Automated security tests** create two test businesses and confirm that Business A cannot read or modify Business B's data. They run on every code change.
- Sales, voids, repayments and adjustments go through **server functions** that check membership and role. The app cannot bypass them.
- The Supabase **service-role key** is never placed in the app or committed to GitHub. The public "anon" key is safe to ship because RLS protects the data.
- Password rules, Supabase rate limiting, and "log out all devices".
- Audit log for voids, price changes, deletions, stock adjustments and credit adjustments.
- **Legal:** Ghana's Data Protection Act, 2012 (Act 843). Obtain informed consent from pilot shops, publish a simple privacy notice, and investigate Data Protection Commission registration before charging customers. Pilot shops are told this is a test version.

---

## 9. Subscription payments

### 9.1 Manual MoMo (pilot and early launch)

We make **no assumption** that any provider supports recurring MoMo subscriptions in Ghana.

1. Each business has a reference code (e.g. `SM-0042`) shown in Settings → Subscription.
2. The owner sends the monthly fee by MoMo, using the code as the reference.
3. The project owner checks incoming MoMo messages and records each payment (transaction ID, amount, date, payer number) in `subscription_payments`. At first this is done in the Supabase dashboard; a simple admin screen comes later. Transaction IDs are unique, so the same payment cannot be recorded twice.
4. `paid_until` moves forward one month. Overdue shops get reminders and a grace period of about 7 days. **Data is never deleted, and owners can always view and export it.**

**Recommendation:** before charging real customers, consider a MoMo merchant/business number (e.g. MTN MoMoPay) to keep business funds separate and look professional.

### 9.2 Future automation (research task, Stage 5)

Evaluate Paystack, Hubtel, ExpressPay, Flutterwave and the MTN MoMo Open API on:

- whether automatic **recurring** MoMo charges are truly supported, or only one-off payment prompts
- fees and settlement times
- business registration and KYC requirements
- support for MTN MoMo, Telecel Cash and AirtelTigo Money

A monthly "Pay now" MoMo prompt with automatic confirmation would remove most manual work, even without true recurring charges.

---

## 10. Backups and restoration

> **Status: designed, not yet implemented or tested.** The backup is **not** treated as a working feature until the restore drill passes (tests TC-BAK-01 to TC-BAK-05, release gate G2). No real business data is entered before then.

### 10.1 Feasibility on the free tier (checked against documentation)

- The Supabase **Free plan has no downloadable managed backups**, so we must make our own.
- Supabase publishes an official guide, *Automated backups using GitHub Actions*. It uses the Supabase CLI (`supabase db dump`) on a schedule, producing three files: **roles**, **schema** and **data** (`--data-only --use-copy`), using the database connection string stored as a GitHub secret.
- Supabase's *Restore a Platform Project to Self-Hosted* guide documents restoring these files with `psql`, in order (roles → schema → data), using `--single-transaction`, `ON_ERROR_STOP=1`, and `SET session_replication_role = replica` before the data import.
- GitHub Actions is free for public repositories and includes free monthly minutes for private repositories. A weekly dump of a small database takes a few minutes, well within the limit.

**Conclusion:** a weekly backup is feasible at GH₵0. However, it has **only been verified against documentation, not yet executed**, because no Supabase project exists yet. It is treated as unproven until the restore test in 10.4 passes.

### 10.2 Backup design

- **Schedule:** weekly, run by a scheduled GitHub Actions workflow, plus a manual "run now" button before risky changes such as database migrations. Daily backups cost nothing extra and can be switched on if preferred.
- **Connection:** the Supabase session-pooler connection string (IPv4-compatible), stored as a GitHub Actions secret. It is never committed.
- **Encryption:** dumps contain real business data, so they are **encrypted before storage** (e.g. with `age` or GPG). The decryption key is held by the project owner offline and also stored as a secret.
- **Storage:** encrypted files are stored **separately from the code repository**, in a dedicated **private** location (e.g. a private backup repository or private workflow artifacts). Keep at least the last 8–12 weekly backups.
- **Alerts:** a failed workflow triggers GitHub's failure email. A failed backup is treated as an incident.

### 10.3 Known limitations to handle

- **Paused projects:** a paused free-tier project cannot be dumped. Daily pilot use should prevent pausing, and the failure alert will reveal it if it happens.
- **Inactive scheduled workflows:** GitHub may disable scheduled workflows in repositories with no recent activity. Check the backup run history monthly.
- **Passwords of custom database roles** are not included in dumps and must be reset after a restore. Some role-related errors are expected on restore and must be reviewed.
- **Supabase Storage files** (uploaded images, etc.) are not in database dumps. The MVP does not use file storage. If it does later, those files need their own backup.
- **Auth users:** confirm during the restore test that user accounts (the `auth` schema) restore correctly and users can log in.
- **Data since the last backup** would be lost in a disaster. With weekly backups, that is up to 7 days. Accepted for the pilot; reconsider frequency then.

### 10.4 Restoration procedure (must be tested before real data)

The **test restore target** is a second free Supabase project or a local Supabase instance (`supabase start`, via Docker). It is **never** the live project.

1. Download the latest encrypted backup and decrypt it on a trusted machine.
2. Create an empty restore target.
3. Restore in order with `psql` against the target: roles, then schema, then data (with `session_replication_role = replica`), in a single transaction that stops on the first error.
4. Reset any custom role passwords and review any role-related warnings.
5. **Verify:**
   - Row counts for every table match the source at backup time (the backup job also records the counts).
   - Totals match: sum of sales, expenses, and customer ledger balances.
   - A test user can log in and sees only their own business.
   - The automated RLS security tests pass against the restored database.
   - Product stock matches the stock recalculated from `stock_movements`.
6. Record the result, date and time taken in `docs/RESTORE-LOG.md`.

**Rules**

- **No real business data is entered until a full backup and a test restore have succeeded** (Stage 1 exit criterion).
- Repeat the test restore **monthly** during the pilot and after any major schema change.
- Use the same steps for a real restore, but restore first to a separate project, verify it, and only then switch over.

---

## 11. Development stages and checkpoints

Timelines are estimates for part-time work.

### Stage 0 — Validate (research-led; physical interviews optional)

- ✅ Desk research and competitor analysis (see [market-research/](market-research/STAGE-0-REPORT.md))
- ✅ Product specification and design direction (see [product-specification/](product-specification/README.md))
- Hands-on testing of 3–5 competitor apps; app-store review mining; online survey via WhatsApp
- **Targets (not guaranteed outcomes):** 30+ shop-owner survey responses, 50%+ reporting a clear problem, 10+ pilot volunteers, at least 3 pilot shops to start (aiming for 5–10)

### Stage 1 — MVP build (6–8 weeks), in controlled sub-stages, each reviewed and approved by the owner

| Sub-stage | Scope | Status |
|---|---|---|
| **1A** | Project foundation; database schema; auth configuration; RLS; security and constraint tests; CI | ✅ Built; **awaiting owner review** |
| 1B | App login and onboarding (secure session storage), business setup, cloud project connection | Proposed next |
| 1C onwards | Business features in agreed slices (inventory and purchases, sales and sync, credit, expenses, closing, reports, backup) | Not started |

Original Stage 1 scope:

- Project setup, database schema, RLS policies and automated security tests
- Email login, business setup (owner-only)
- Products, categories, stock movements, restock and adjustments
- New Sale with offline outbox, sync statuses, local stock updates and duplicate prevention
- Online stock validation and negative-stock discrepancy flow
- Sales history and voids
- Customer credit ledger: customers, credit sales, balances, repayments
- Expenses, dashboard, basic reports
- Weighted-average costing, stock losses and write-offs in reports, cash count, CSV export, optional MoMo reference
- Weekly encrypted backup workflow and a **demonstrated, successful test restore**
- Automated tests per [10-test-plan.md](product-specification/10-test-plan.md)
- **Exit criteria:** release gate **G2** passed, i.e. every listed test ✅ Passed with evidence: calculations, all sync tests (duplicates, failed-sync recovery, multi-device, reconciliation), cancellation, concurrency, all security tests and all backup/restore tests

### Stage 2 — Pilot (30–60 days, all features free)

- **5–10 shops**, all features free (plan `pilot`). Start with 2–3 shops; expand after gate G3
- In-person or remote (WhatsApp video) installation and training; weekly feedback
- Gather **willingness to pay** for the pricing hypotheses (Starter free, Standard about GH₵30, Plus about GH₵60) before finalising prices
- Monitor daily usage, sync failures, discrepancies and crashes
- Measure how many owners struggle with email login
- **Checkpoint:** at least half the pilot shops still use it daily after 3 weeks, and at least 3 say they would pay

### Stage 3 — Refinement (3–4 weeks)

- Fix pilot problems
- Likely additions: manager/cashier accounts with PINs, plus top pilot requests

### Stage 4 — Paid launch (only after the Stage 2 checkpoint passes)

- Manual MoMo subscriptions go live
- Purchase only now: Google Play account, Supabase Pro, a domain, an email/SMS provider

### Stage 5 — Growth

- Payment automation (section 9.2), phone OTP, barcode scanning, suppliers, extended offline features, multiple branches, Twi, iOS, web dashboard

---

## 12. Costs

| Period | Cost |
|---|---|
| Stages 0–3 (validation, build, pilot, refinement) | **GH₵0** — free tiers only; no domain, Play Store account or paid hosting |
| Stage 4 onwards (after validation) | Approx. GH₵350–500/month (Supabase Pro ~$25, email/SMS usage), plus a one-time ~$25 Google Play fee. Cedi amounts vary with the exchange rate |

**Free-tier limits to watch**

| Limit | Mitigation |
|---|---|
| Supabase free projects pause after about a week of inactivity | Daily pilot use; backup failure alerts |
| Supabase free tier has no downloadable backups | Our own backup (section 10) |
| 500 MB database | Far more than a pilot needs |
| Built-in email rate limits | Enough for a small pilot; replace before launch |

**Pricing hypotheses (approved for testing, not final):** Starter (free), Standard (about GH₵30/month), Plus (about GH₵60/month). The pilot runs free for 30–60 days, and prices are finalised only after reviewing feedback and willingness to pay. At these prices, roughly 10–15 paying shops would cover early running costs (estimate).

---

## 13. Technical risks and mitigations

### A. Offline synchronisation

| Risk | Mitigation |
|---|---|
| Duplicate sales from retries | Sale ID generated on the phone + primary key + idempotent `record_sale()`; idempotency keys on every other write (spec 09 §4) |
| Concurrent uploads from several phones | One transaction per write; row locks in a fixed order (products by ID, then customer); retry on deadlock; tests TC-CONC |
| Offline sale costed at a later average, or distorting the future average | Value pool + sale-time costing (spec 05 §3); conservation test TC-COST-20; order-independence test TC-COST-18 |
| Wrong or manipulated phone clocks | Elapsed-time verification, clock offset, red-flag checks; low confidence → upload time (spec 05 §3.6) |
| Late uploads changing confirmed reports | Immutable day snapshots; "Changes after closing" shown separately (spec 05 §11) |
| Manipulation by removing unsent sales | Safe cancellation with reason, re-authentication and a permanent server record (spec 04 §1.5) |
| Lost sales (crash, battery) | Written to local storage before confirmation is shown; removed only after server confirmation |
| Half-saved sales | Single all-or-nothing database transaction |
| Unsynced data on a lost or wiped phone | Visible pending counter, logout blocked or warned, encourage daily connection; residual risk explained to pilot shops |
| Wrong phone clock | Store `occurred_at` and `received_at`; flag large differences |
| Stale prices offline | The sale records the price actually charged |
| App update changes the data format | `payload_version` on every queued sale; server supports older versions |

### B. Database security

| Risk | Mitigation |
|---|---|
| Missing or incorrect RLS policy (**highest-impact risk**) | RLS on every table; automated cross-business access tests on every change |
| Rules enforced only in the app | Server functions perform permission checks |
| Service-role key leak | Never in the app or the repository; secrets only |
| Account takeover | Password rules, rate limiting, log out all devices |
| Backups exposing data | Encrypted, private, separate from code |

### C. Stock consistency

| Risk | Mitigation |
|---|---|
| Simultaneous sales overwriting stock | Atomic database update inside the sale transaction |
| Stock drifting from history | Changes only via `stock_movements`; reconciliation check |
| Negative stock from offline sales | Accept, flag as a discrepancy, owner reconciles via adjustment; full history kept (section 5) |
| Online overselling | Server-side stock validation; "Correct stock" adjustment flow |
| Packs vs pieces | Single unit + restock multiplier in the MVP |

### D. Financial calculations

| Risk | Mitigation |
|---|---|
| Rounding errors | Integer pesewas; one shared, tested rounding function |
| Profit changing when cost prices change | Weighted-average cost, assigned by the server and stored on each sale line; past sales never re-costed |
| Average cost corrupted by simultaneous activity | Row locks in product-ID order; exact decimals; tests TC-COST-09/10 |
| Profit overstated by hidden losses | Stock losses and bad debts subtracted, each shown separately |
| Credit sales inflating apparent cash | Separate Sales, Cash & MoMo received, and Credit outstanding figures |
| Edited or drifting balances | Balances derived from ledger; corrections as visible adjustment entries |
| Voids leaving stock or credit wrong | Void creates reversing stock and credit entries; original kept as voided |
| Day boundaries | UTC storage; reports in Ghana time (UTC+0) |
| Discount allocation | Sale-level discounts only in the MVP, with documented profit treatment |

### E. Product and operational

| Risk | Mitigation |
|---|---|
| Owners don't use email | Assisted setup; measure; phone OTP later |
| APK install distrust | In-person installation and explanation |
| Free-tier pausing / no managed backups | Daily use; own encrypted backups with tested restore |
| Manual payments don't scale | Acceptable for dozens of shops; automation research in Stage 5 |
| Building unwanted features | Stage 0 validation and checkpoints |

---

## 14. Decision log

| # | Decision | Status |
|---|---|---|
| 1 | React Native + Expo + TypeScript + Supabase | Approved |
| 2 | Android-first; iOS later | Approved |
| 3 | Offline: only sales recording in the MVP; products and customers available from the last download | Approved |
| 4 | Offline sales update local stock immediately and show Pending / Synced / Failed statuses; duplicates prevented | Approved |
| 5 | Offline sales may cause negative stock, but are flagged with history preserved and reconciled by adjustment; online sales validated | Approved |
| 6 | Email + password for development and pilot; phone OTP as a future option | Approved |
| 7 | Stage 1 is owner-only (one owner account per business) | Approved |
| 8 | Customer credit ledger in Stage 1 | Approved |
| 9 | Manual monthly MoMo payments; payment automation researched later | Approved |
| 10 | Free tiers only until validation; no domain, Play Store account or paid hosting yet | Approved |
| 11 | ~~Stage 0 interviews of 10–15 owners~~ → research-led Stage 0; physical interviews optional | Superseded (approved) |
| 12 | Weekly encrypted backup with a tested restore before any real business data | Approved |
| 13 | Implementation starts only on explicit instruction | In force |
| 14 | MVP includes optional MoMo reference, CSV export (all plans), basic cash count | Approved |
| 15 | Deferred: automated WhatsApp reports, staff management, automated subscription payments | Approved |
| 16 | Positioning: simplicity, reliable offline use, Ghanaian operations, affordability, local support | Approved |
| 17 | Stock losses and written-off debts reduce estimated net profit; shown separately from operating expenses | Approved |
| 18 | Weighted-average costing in the MVP; last-restock pricing as documented fallback | Approved in principle |
| 19 | Pricing hypotheses: Starter free, Standard about GH₵30, Plus about GH₵60 (not final) | Approved |
| 20 | Pilot: 5–10 shops, all features free for 30–60 days | Approved |
| 21 | Backup counts as implemented only after a demonstrated restore (gate G2) | Approved |
| 22 | Visual design (colours, typography, layout) | Provisionally approved |
| 23 | Verified / reported / assumption labelling in all documentation | Approved |
| 24 | Not counting stock found in recounts as profit | Approved |
| 25 | Point-in-time costing: sales costed as at their sale time from product cost history; recorded costs never change | Approved in direction; refined by 30 |
| 26 | Safe cancellation of unsent sales (server check, reason, re-authentication, permanent record); no local-only discard | Approved |
| 27 | Write-off undo (mistake, no money) is separate from debt recovery (money received, own profit line); payments split server-side | Approved |
| 28 | Transactions, fixed lock order and idempotency keys for every write | Approved |
| 29 | Test status reported as Documented / Implemented / Passed, with evidence; currently all Documented | Approved |
| 30 | **Value-pool weighted average** (stock value in pesewas; average = value ÷ qty; sales remove their sale-time cost; edge cases posted as visible cost adjustments) | Approved |
| 31 | Sale-time verification with elapsed-time clock and time confidence; low confidence uses upload time | Superseded by 36 |
| 32 | Restocks, adjustments, voids and cost corrections remain **online-only** as an accounting safeguard | Approved |
| 33 | Immutable day snapshots on Close the day; late changes shown separately | Superseded by 38 |
| 34 | Full chronological replay of in-between sales **not** in MVP; misallocation logged during pilot to decide | Approved |
| 35 | Purchases at **full acquisition cost**; amount paid recorded separately; per-purchase unpaid amounts, Pay supplier, purchase corrections, supplier returns; no full supplier accounts in MVP | Approved |
| 36 | Sale time from **server anchors + same-session elapsed time**; reboot and clock-change detection; bounds; low confidence → upload time, flagged | Approved |
| 37 | Never adjust quantities automatically; every automatic value change is a visible cost adjustment with a Needs attention item | Approved |
| 38 | **One immutable original closing per day**; later changes as itemised day adjustments; current adjusted total shown alongside (supersedes 33) | Approved |
| 39 | **Goods taken for own use are not a business cost:** shown below estimated net profit, inventory reduced at cost (changes the earlier rule that counted own use as a stock loss) | Approved |
| 40 | Partial supplier payments against a purchase, any number of times; never stock value, never expenses | Approved |
| 41 | Purchase-cost corrections split proportionally (already sold / losses / own use / remaining stock) from movement history; dated on the correction day; no restatement; approximate corrections flagged with reasons and audited | Approved |

### References

- [Supabase: Automated backups using GitHub Actions](https://supabase.com/docs/guides/deployment/ci/backups)
- [Supabase: Restore a Platform Project to Self-Hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
