# 03 — Screens

**Navigation:** a bottom tab bar with 5 tabs, each with an icon and a text label (never icon-only):

**Today · Sell · Products · Customers · More**

- "Sell" opens New Sale directly.
- "More" contains Expenses, Reports, Close the day, Settings, Subscription, Help.

🌐 = needs internet · 📴 = works offline (MVP: selling, plus viewing cached data)

---

## A. Account and setup

| ID | Screen | Contents | Rules |
|---|---|---|---|
| S-01 | Welcome | Logo, "Your shop book, on your phone", buttons: Create account / Log in | |
| S-02 | Sign up 🌐 | Name, email, password, Terms & Privacy checkbox | Inline validation; password ≥ 8 characters |
| S-03 | Log in 🌐 / Forgot password 🌐 | Email, password; reset link by email | Generic error: "Email or password is not correct" (no hint which) |
| S-04 | Shop details 🌐 | Shop name, type, town/area, optional phone | Editable later in Settings |
| S-05 | Starter products 🌐 | Checklist by shop type; selling price and stock per ticked item; "Skip" | Saved in one batch |
| S-06 | Quick tour | 3 cards | Skippable; viewable again from Help |

## B. Today (dashboard) — S-10

```
┌──────────────────────────────────────┐
│ Ama's Provisions          ● Online   │  ← shop name + connection dot
│ Wednesday, 12 Nov                    │
├──────────────────────────────────────┤
│ [!] 3 sales waiting to upload        │  ← only when pending/failed
├──────────────────────────────────────┤
│  TODAY'S SALES          TODAY'S PROFIT│
│  GH₵ 1,240.50           GH₵ 310.20   │  ← large numbers
│  48 sales               after expenses│
├──────────────────────────────────────┤
│  Cash  GH₵ 820.00 │ MoMo GH₵ 300.50  │
│  Credit GH₵ 120.00                   │  ← payment split
├──────────────────────────────────────┤
│  Money owed to you      GH₵ 1,560.00 │  → Customers
│  Low stock              5 items      │  → Low-stock list
│  Needs attention        1 stock issue│  → only if > 0
├──────────────────────────────────────┤
│ ┌────────────────┐ ┌───────────────┐ │
│ │   NEW SALE     │ │  ADD EXPENSE  │ │  ← big primary buttons
│ └────────────────┘ └───────────────┘ │
│        Close the day →               │
├──────────────────────────────────────┤
│ Today  Sell  Products  Customers More│
└──────────────────────────────────────┘
```

**Rules:**
- "Today's profit" = gross profit − today's expenses (see 05). The small caption "after expenses" is always shown. Tapping it explains the calculation in plain words.
- Figures include **pending (unsynced) sales from this phone**, marked "includes 3 sales not yet uploaded".
- A **date switcher** ("Today ▾") allows Yesterday / This week / This month.
- **Empty state:** a "getting started" checklist and the New Sale button.

## C. Selling

| ID | Screen | Contents | Rules |
|---|---|---|---|
| S-20 | New Sale 📴 | Search bar; "Most sold" row; product tiles (name, price, stock badge); cart drawer at the bottom showing item count and total; **Charge GH₵ X** button | Tap tile = +1; long-press or tap in cart to edit quantity or line price; items with 0 or negative stock show a red badge but can still be sold offline (see 04 §1.3) |
| S-21 | Payment 📴 | Total, optional sale discount (amount or %), payment method: **Cash / MoMo / Credit** | **Cash:** optional amount received → change due. **MoMo:** optional reference. **Credit:** customer picker + optional "paid now" amount and method |
| S-22 | Sale complete 📴 | ✓ Sale saved, receipt number, sync status, **Next sale**, **Share receipt** | Share sends plain text via the Android share sheet |
| S-23 | Sales history 📴 (view) | List grouped by day: time, total, method icon, status (✓ Synced / ⏱ Pending / ⚠ Failed); filter by status and method | Pending and failed sales appear at the top |
| S-24 | Sale detail | Items, discount, total, method, MoMo reference, customer, recorded time, sync status; **Void sale** 🌐; Retry (if failed) | Void requires a reason |

## D. Products and stock

| ID | Screen | Contents | Rules |
|---|---|---|---|
| S-30 | Products 📴 (view) | Search, category filter, list: name, selling price, stock (green / amber / red / **negative**) | Sort: name / low stock first |
| S-31 | Product form 🌐 | Name, category, unit (piece, pack, bottle, sachet, kg-bag…), selling price, cost price, stock (new product only), low-stock level | Stock of existing products changes only via restock/adjustment |
| S-32 | Quick price change 🌐 | From the product list: new selling price (and optionally cost) | Recorded in the audit log |
| S-33 | Restock 🌐 | Product, quantity (or packs × per-pack), total cost **or** unit cost, note | Shows the new stock level before saving |
| S-34 | Stock adjustment 🌐 | Product, new counted quantity **or** +/− change, reason (count correction, damaged, expired, missing/theft, own use, other), note | Linked open discrepancies are resolved |
| S-35 | Low stock 🌐/📴 view | Items at or below their low-stock level; **Share list** | Text list, e.g. "Restock: Milo sachet (3 left)…" |
| S-36 | Stock issues (discrepancies) | Open negative-stock flags: product, sale, shortfall; **Count and correct** | |
| S-37 | Product detail | Stock, prices, margin, movement history (restocks, sales, adjustments) | |

## E. Customers (credit book)

| ID | Screen | Contents | Rules |
|---|---|---|---|
| S-40 | Customers 📴 (view) | Total owed at top; list sorted by amount owed: name, balance, days since last payment | Search |
| S-41 | Customer form 🌐 | Name, phone (optional), credit limit (optional), note | Phone format checked (Ghana 10-digit or +233) |
| S-42 | Customer detail | Balance (large), credit limit, **Record repayment**, **Send reminder**, ledger history (credit sales, repayments, adjustments, void reversals) | |
| S-43 | Record repayment 🌐 | Amount, Cash/MoMo, MoMo reference, date | Amount must be > 0 and ≤ current balance (see 04 §3) |
| S-44 | Balance adjustment 🌐 | Amount +/−, required reason | For corrections and writing off bad debt; audit-logged |

## F. Expenses — S-50 to S-51

| ID | Screen | Contents |
|---|---|---|
| S-50 | Expenses 🌐 | Month total, list by date: category, amount, paid from |
| S-51 | Expense form 🌐 | Amount, category (Rent, Electricity/ECG, Water, Transport, Wages, Stock transport, Repairs, Phone/data, Tax/levies, Other), **paid from** (Cash drawer / MoMo / Other — owner's pocket or bank), date, note |

## G. Reports and money

| ID | Screen | Contents |
|---|---|---|
| S-60 | Reports 🌐 | Period picker (Today, This week, This month, Last month, Custom). Cards: Sales, Cost of goods, Gross profit, Expenses, **Net profit**, Money received (Cash / MoMo / Repayments), Credit given, Credit outstanding, Best sellers (top 10 by quantity and by profit), Expense breakdown by category, Voided sales count |
| S-61 | Close the day 🌐 | Opening cash, + cash sales, + cash repayments, − cash expenses, **= expected cash**; counted cash input; difference; note; MoMo received today (for comparison) |
| S-62 | Cash count history | Past days: expected, counted, difference |
| S-63 | Export data 🌐 | Choose what to export (all / products / sales / customers / expenses), date range → CSV files shared via the share sheet | Warning: "This file contains customer names and phone numbers. Share it only with people you trust." |

## H. More, settings and support

| ID | Screen | Contents |
|---|---|---|
| S-70 | More | Menu: Expenses, Reports, Close the day, Export data, Settings, Subscription, Help & support, Log out |
| S-71 | Settings | Shop profile, receipt footer text, default low-stock level, app lock (on/off), devices logged in (log out others) |
| S-72 | Subscription | Plan, status, paid-until date, how to pay (MoMo number + reference code), payment history |
| S-73 | Help & support | Short how-to articles, **Chat on WhatsApp**, app version, "Send diagnostic info" (no business data) |
| S-74 | Log out | Blocked while sales are pending: "3 sales have not uploaded yet. Connect to the internet first so you don't lose them." |

## I. System states (apply to every screen)

| State | Treatment |
|---|---|
| Offline | Thin grey banner "Offline — sales are saved on this phone". Online-only buttons are visible but disabled, with the hint "Needs internet" |
| Loading | Skeleton placeholders. Never a blank white screen |
| Empty | A friendly sentence plus one action button (e.g. "No customers yet. Add your first credit customer") |
| Error | See [07](07-errors-and-security.md) |
