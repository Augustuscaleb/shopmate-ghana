# 01 — Scope: MVP vs Future

## 1. Positioning

> **ShopMate Ghana: the simple shop book that works even when light or data is off, and shows you your real profit.**

| Pillar | What it means in the product | Evidence |
|---|---|---|
| **Simplicity** | Sale in 3 taps or fewer; plain words ("Money owed to you", not "Accounts receivable"); setup in under 10 minutes | Records mostly handwritten; skills and complexity are barriers [V] |
| **Reliable offline use** | Sales never blocked or lost by network problems; visible sync status | Mobile internet usage gap [V]; power outages affect most businesses [V] |
| **Ghanaian operations** | GH₵ and pesewas; Cash / MoMo / Credit; the credit book; WhatsApp sharing; ECG and transport expense categories | MoMo dominance [V]; customer credit common [V] |
| **Affordability** | Free Starter plan; paid plans tested at GH₵30–60 | Competitors range from free to about GH₵200/month [R]; price is [A] |
| **Accessible local support** | WhatsApp support button; assisted setup | OZÉ found in-person support vital [V] |
| **Data trust** | CSV export on every plan, including free; backups; clear privacy notice | Kippa outage left users without records [V] |

## 2. MVP feature list

| ID | Feature | Notes |
|---|---|---|
| F-01 | Email + password registration, login, password reset | Owner-only |
| F-02 | Business setup with shop type and sample product lists | Provision store / mini-mart / boutique / other |
| F-03 | Products: create, edit, archive; cost and selling price; category; unit; low-stock level | |
| F-04 | Quick price change | From the product list |
| F-05 | Restock (purchase) with optional pack multiplier: **purchase cost** (full acquisition cost) and **amount paid now** | Stock value rises by the full purchase cost (05 §12) |
| F-27 | **Unpaid purchases:** amounts owed per purchase; Pay supplier; correct a purchase; return to supplier | No full supplier accounts (05 L6) |
| F-28 | **Needs attention** list explaining negative stock, cost adjustments, cost checks, uncertain sale times and changes to closed days, with GH₵ effect and action | 05 §3.4 |
| F-06 | Stock adjustment with reason | Also resolves negative-stock flags. Losses reduce estimated net profit (05 §4) |
| F-07 | Low-stock list, shareable as text | Uses the Android share sheet (WhatsApp, SMS, etc.) |
| F-08 | **New Sale**: cart, sale discount, payment method Cash / MoMo / Credit | **Works offline** |
| F-09 | **Optional MoMo reference** on MoMo sales and repayments | Free text, up to 30 characters |
| F-10 | Credit sale with optional **amount paid now** | Remainder goes to the customer's balance |
| F-11 | Sales history with sync status; receipt view; share receipt as text; **safe cancellation of unsent sales** (04 §1.5) | |
| F-12 | Void a sale with a reason (online) | Reverses stock and credit |
| F-13 | Customers: create, edit, archive; optional phone and credit limit | |
| F-14 | Customer balance and history; **record payment** (cash or MoMo; applied as repayment, then recovery of written-off debt); **write off bad debt**; **undo a mistaken write-off** | Write-offs reduce and recoveries increase estimated net profit (05 §4, §7.2) |
| F-15 | Balance reminder: pre-filled message opened in WhatsApp | Manual send by owner. **Not** automated |
| F-16 | Expenses: add, edit, delete (soft); category; paid from (cash drawer / MoMo / other) | |
| F-17 | **Today dashboard**: sales, profit, payment split, money owed, low stock, needs attention | |
| F-18 | Reports: today / this week / this month / custom range | Sales, gross profit, operating expenses, **stock losses and bad debts shown separately**, net profit (estimated), best sellers, credit outstanding |
| F-19 | **Cash count (close the day)**: expected vs counted cash, difference recorded | Basic reconciliation |
| F-20 | **CSV export**: products, sales, sale items, customers and ledger, expenses | All plans |
| F-21 | Offline sales outbox with Pending / Synced / Failed statuses | See 06 |
| F-22 | Stock discrepancy flags and reconciliation | See 04 |
| F-23 | Settings: business profile, receipt footer text, low-stock default | |
| F-24 | Subscription screen: plan, paid-until date, manual MoMo payment instructions and reference code | Manual confirmation by admin |
| F-25 | Help and **WhatsApp support** button | Opens a chat with the support number |
| F-26 | App lock with phone PIN or fingerprint (optional setting) | Included if practical (uses the device's own lock) |

## 3. Explicitly not in the MVP (future)

| Feature | Target stage | Reason for deferring |
|---|---|---|
| Automated WhatsApp daily/weekly reports | Later | Decision 3; needs messaging API and cost |
| Staff/cashier/manager accounts, PINs, permissions | Stage 3+ | Decision 3; owner-only MVP |
| Automated subscription payments (MoMo prompts, recurring) | Stage 5 | Decision 3; provider research pending |
| Phone OTP login | Later | Cost; email first (approved) |
| Barcode scanning | Later | Not essential for MVP |
| Offline restock, expenses, repayments, new customers | Later, if the pilot shows a need | Approved offline scope is sales only |
| Partial returns/refunds (only full void in MVP) | Later | Complexity |
| Decimal quantities (selling by weight) | Later | Whole units in MVP [A] |
| Suppliers and purchase orders | Later | |
| Printed receipts (Bluetooth printers) | Later | |
| Product photos | Later | Data and storage cost |
| Twi and other languages | Later | English first; wording kept simple for translation |
| Multi-branch; web dashboard; iOS | Later | |
| Dark mode | Later | Light theme is better in bright sunlight [A] |
| Online store, lending, VAT/GRA invoicing, in-app payment acceptance | Not planned | Out of scope |

## 4. Plans and pricing (hypothesis — not confirmed)

Starter (Free), Standard (about GH₵30/month) and Plus (about GH₵60/month) are **approved as initial pricing hypotheses [A], not final prices**. They are informed by competitor prices [R].

**Pilot arrangement (approved):**
- **5–10 shops**, all features free (plan `pilot`, no limits, up to 3 devices) for **30–60 days**.
- During and after the pilot, we review feedback and **willingness to pay** (validation plan A8). Only then are prices and limits finalised.
- Plan limits are enforced only from paid launch.

| | **Starter (Free)** | **Standard** | **Plus** |
|---|---|---|---|
| Price per month (hypothesis) | GH₵0 | **about GH₵30** | **about GH₵60** |
| Products | Up to 50 | Unlimited | Unlimited |
| Customers on credit | Up to 20 | Unlimited | Unlimited |
| Reports history | Last 30 days | Full history | Full history |
| Offline sales, credit book, expenses, cash count | ✅ | ✅ | ✅ |
| **CSV export** | ✅ (always) | ✅ | ✅ |
| Devices logged in at once | 1 | 2 | 3 |
| Support | WhatsApp (normal) | WhatsApp (normal) | WhatsApp (priority) + assisted product setup |
| Future features (when built) | — | — | Staff accounts, automated summaries |

**Principles:**
- Owners can **always** view and export their own data, even on the free plan or when payment is overdue.
- The free plan must be genuinely useful, so it builds trust and word of mouth.
- Plan names, limits and prices will be adjusted using survey and pilot evidence.
