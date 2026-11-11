# 07 — Error Handling and Security Requirements

## Part A — Error handling

### A1. Principles (E-01 – E-06)

| ID | Principle |
|---|---|
| E-01 | **A sale is never lost because of an error.** If anything fails during Charge, the sale stays in the outbox |
| E-02 | Messages use **plain English**: what happened + what to do. No codes or technical words on the main message |
| E-03 | The owner's typed input is never cleared by an error |
| E-04 | Online-only actions attempted offline show "This needs internet. Your data is safe — try again when you're connected." |
| E-05 | Every error is logged to crash reporting **without** personal or business data (see SEC-30) |
| E-06 | Destructive actions (void, delete expense, write off, archive) need confirmation that **names the item and amount** |

### A2. Error catalogue

| Situation | Message to owner | Behaviour |
|---|---|---|
| No internet (online action) | "No internet connection. Try again when you're connected." | Button disabled with hint; form kept |
| Request timeout | "This is taking too long. Check your connection and try again." | Retry button |
| Server error | "Something went wrong on our side. Please try again. If it keeps happening, contact support." | Retry; error logged |
| Session expired | "Please log in again to continue." | Outbox kept (SY-41) |
| Validation (e.g. empty name) | Inline under the field: "Enter the product name" | No pop-up |
| Duplicate product name | "You already have a product called 'Milo sachet'." | Link to existing product |
| Insufficient stock (online) | "Only 2 Sardine in stock. Correct the stock, or reduce the quantity." | Buttons: Correct stock / Edit cart |
| Payment > balance + recoverable | "Kofi owes GH₵ 20.00 and has GH₵ 40.00 written off. The most you can record is GH₵ 60.00." | Server-enforced (C-79) |
| Undo more than was written off | "Only GH₵ 25.00 of this write-off can still be undone." | |
| Cancel a sale the server already has | "This sale was already recorded. Use Cancel sale (void) instead." | Sale marked Synced (04 §1.5) |
| Pay supplier more than owed | "Only GH₵ 200.00 is owed on this purchase." | |
| Paid now more than purchase cost | "Amount paid can't be more than the cost of the goods." | |
| Close a day that is already closed | "12 Nov is already closed. You can record a recount; the original closing stays as it is." | |
| Cancel attempted offline | "Cancelling needs internet, so we can check the sale wasn't already uploaded. The sale is safe on this phone." | |
| Credit limit exceeded | "This takes Kofi above the credit limit of GH₵ 100.00. Continue anyway?" | Warning only |
| Discount > subtotal | "Discount can't be more than the sale amount." | |
| Sync failed (permanent) | "1 sale couldn't upload. Tap to see it." | Failed status; Retry / Send details to support / Cancel this sale (safe process); never removed automatically |
| Logout with pending sales | "3 sales haven't uploaded yet. Connect to the internet first so you don't lose them." | Logout blocked |
| Low phone storage | "Your phone is almost full. ShopMate may not save new sales. Free some space." | Shown when free space < 50 MB |
| Plan limit reached (after launch) | "Starter plan includes up to 50 products. Upgrade to add more — your existing data stays safe." | Never blocks selling existing products, or viewing and exporting |
| Unexpected crash | App restarts to Today; the outbox is intact | Crash reported |

## Part B — Security requirements

Builds on [PLAN.md §8](../PLAN.md#8-authentication-and-security).

### B1. Authentication (SEC-01 – SEC-08)

| ID | Requirement |
|---|---|
| SEC-01 | Email + password via Supabase Auth; minimum 8 characters; reject the 1,000 most common passwords [A: list source to be chosen] |
| | *Implementation (Stage 1B):* minimum 8 is enforced by the server (Supabase Auth) and the app. The common-password check uses 2,087 entries (all 8+ character passwords from the SecLists "10k most common" list, MIT licence) and runs **in the app only**: Supabase's free plan has no server-side common-password check, so a person calling the API directly could bypass it. Optional server-side hardening (Supabase "password requirements", e.g. letters and digits) would be a requirement change and needs owner approval |
| SEC-02 | Login and reset attempts are rate-limited (Supabase defaults, reviewed before the pilot) |
| SEC-03 | Login errors never reveal whether an email exists |
| SEC-04 | Email confirmation is **on** if Supabase's built-in email limits allow it for the pilot. If not, accounts are created through assisted setup, and confirmation is switched on before launch. **Decision recorded in the pilot log** |
| SEC-05 | Session tokens are stored in the phone's secure storage (Android Keystore-backed), not plain files |
| | *Implementation (Stage 1B):* `expo-secure-store` (Android Keystore-backed encryption), split into ≤1,800-character chunks because a session can exceed the ~2 KB per-value limit; a missing chunk means "logged out", never a corrupted session. Secure-store entries are excluded from Android auto-backup by the `expo-secure-store` config plugin |
| SEC-06 | "Log out other devices" in Settings revokes other sessions |
| SEC-07 | Optional **app lock** uses the phone's own PIN, pattern or fingerprint when the app opens or resumes after 5 minutes |
| SEC-08 | Device-count limit per plan is enforced server-side at login (after paid launch) |

### B2. Data access (SEC-10 – SEC-16)

| ID | Requirement |
|---|---|
| SEC-10 | **Row Level Security on every table**; every row carries `business_id`; policies allow access only to members of that business |
| SEC-11 | Money, stock and ledger changes happen **only** through server functions (full list in [09-data-model.md §3](09-data-model.md)). Direct table writes for these tables are denied |
| SEC-12 | Server functions validate everything again: business membership, positive quantities, amounts within limits (C-04), discount ≤ subtotal, repayment ≤ balance, field lengths, allowed values |
| SEC-13 | The client is never trusted for totals or costs. The server **recalculates** subtotal and total from the lines, rejects mismatches with the client's total, and **assigns unit costs itself** from the product cost history as at the sale time (C-23 – C-23c). The phone's provisional cost is stored for audit only. Unit prices as charged are accepted (owner-only) and recorded |
| SEC-14 | Automated tests prove that Business A cannot read or change Business B's data, for every table and function |
| SEC-15 | The service-role key is never in the app or the repository. Only the public anon key ships in the app |
| SEC-16 | Admin actions (confirming subscription payments) are performed by a separate admin role, never through the shop app |

### B3. Integrity, concurrency and audit (SEC-20 – SEC-27)

| ID | Requirement |
|---|---|
| SEC-20 | Ledgers (stock movements, customer ledger) are **append-only**. Corrections are new entries |
| SEC-21 | Audit log for: price and cost changes, voids, **cancellations before upload**, stock adjustments, balance corrections, write-offs, **write-off undos**, **debt recoveries**, back-dated entries, expense edits and deletes, cash count changes, plan changes, device registration and revocation |
| SEC-22 | Database constraints as listed in 09 §4.4 (sale ID, receipt number, device code, request ID, MoMo transaction ID, positive amounts, same-business foreign keys) |
| SEC-23 | Soft delete only; nothing financial is hard-deleted by the app. A sale leaves a phone's outbox **only** after the server confirms it as recorded or cancelled |
| SEC-24 | **Idempotency:** every write function takes a client-generated key (sale ID or request ID). Repeats return the original result and write nothing (09 §4.3) |
| SEC-25 | **Transactions and locks:** every write function is one transaction with the fixed lock order (claim → products by ID → customer). Deadlock or serialisation errors roll back fully and are retried by the client (09 §4.2) |
| SEC-26 | **Re-authentication** (account password, or PIN/fingerprint when app lock is on) is required to cancel an unsent sale (04 §1.5) |
| SEC-27 | `day_closings` and `day_adjustments` cannot be updated or deleted by anyone through the app or API (database policy). Corrections are new adjustments |

### B4. Privacy and personal data (SEC-30 – SEC-36)

| ID | Requirement |
|---|---|
| SEC-30 | Crash and error reports exclude customer names, phone numbers, amounts and product names. Only technical details and IDs are sent |
| SEC-31 | Collect the minimum: customer name required, phone optional; no ID numbers or addresses |
| SEC-32 | A privacy notice in the app and on sign-up explains what is stored, why, where (Supabase cloud region), backups, and export/deletion rights. **Ghana Data Protection Act, 2012 (Act 843)** — registration with the Data Protection Commission to be checked before charging customers [V: the Act exists; registration requirements for our case not yet confirmed] |
| SEC-33 | CSV export shows a warning that the file contains personal data |
| SEC-34 | Account deletion on request: data deleted within 30 days, except where legally required to keep it; backups expire under the rotation policy |
| SEC-35 | Shared receipts and reminders contain only the shop name, items and amounts, and the customer's own balance |
| SEC-36 | Local phone data is protected by Android app sandboxing. Full local database encryption is **future** [A: acceptable for the MVP given owner-only use and the app-lock option] |

### B5. Transport and backups (SEC-40 – SEC-42)

| ID | Requirement |
|---|---|
| SEC-40 | HTTPS only |
| SEC-41 | Weekly encrypted backups with a **demonstrated, successful restore before any real business data** (PLAN.md §10; tests TC-BAK-01 to 05, gate G2). Until the restore drill passes, backup is reported as **"designed, not yet implemented"**, never as a working feature |
| SEC-42 | Dependencies are kept updated; automated dependency alerts are enabled on GitHub |
