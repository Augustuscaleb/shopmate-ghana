# 03 — Product Requirements (MVP)

Based on the market research ([01](01-market-research.md)), the competitor analysis ([02](02-competitor-analysis.md)) and clearly labelled assumptions.

**Approved technical decisions kept unchanged:** React Native, Expo, TypeScript, Supabase, Android-first, owner-only accounts, offline sales recording, inventory, customer credit ledger, expense tracking, business reports.

---

## 1. Product principle

> **"Simpler than the notebook, and it tells you your profit."**

The research shows owners know records matter but keep them by hand, because digital tools feel costly, complex or unfamiliar **[V]**, and that keeping users active is the hardest part **[V/R]**. So every MVP feature must make **daily use faster or more rewarding** than paper.

## 2. Priority customer problems

| # | Problem | Evidence | Priority |
|---|---|---|---|
| P1 | "I don't know if I'm actually making profit." Handwritten records can't easily show profit | Records mostly handwritten [V]; profit insight is an [A] | **High** |
| P2 | "I forget who owes me and how much." Credit is tracked informally and defaults happen | 26.89% of informal firms give credit [V]; trust-based enforcement [V] | **High** |
| P3 | "I run out of fast-moving items, or don't know what's in stock" | [A], supported by competitors emphasising low-stock alerts [R] | **High** |
| P4 | "My cash and MoMo don't match what I sold." Payments are split across cash and MoMo | MoMo dominance [V]; reconciliation pain [A] | **Medium–High** |
| P5 | "I don't know where my money goes." Expenses aren't tracked | [A] | **Medium** |
| P6 | "Light or data goes off." Unreliable power and connectivity | Outages affect 70.7% of businesses [V]; usage gap [V] | **High** (reliability requirement) |
| P7 | "What if the app disappears with my records?" | Kippa shutdown [V] | **Medium** (trust requirement) |

## 3. MVP features (MoSCoW)

### Must have

| Feature | Solves | Notes |
|---|---|---|
| **Quick sale** in 3 taps or fewer for a common item | P1, P3 | Large product buttons, search, favourites/most-sold at the top |
| **Payment method per sale:** Cash / MoMo / Credit | P2, P4 | **New:** optional MoMo reference or last 4 digits field |
| **Offline sale recording** with Pending / Synced / Failed status and local stock update | P6 | As approved in PLAN.md |
| Products with **cost price and selling price**; **fast price edit** | P1 | Sample product lists for provision store, mini-mart and boutique |
| Restock (with optional carton multiplier) and stock adjustment | P3 | Adjustments resolve negative-stock flags |
| **Low-stock list**, shareable on WhatsApp as a shopping list | P3 | |
| **Customer credit ledger:** customers, credit sales, part-repayments, balance, history | P2 | |
| **WhatsApp balance reminder** (pre-filled message, no SMS cost) | P2 | Polite default wording; owner edits before sending |
| **Expenses** with simple categories (rent, ECG/electricity, transport, stock transport, wages, other) | P5 | |
| **Today screen:** sales, profit, cash vs MoMo vs credit, money owed to you, low stock | P1, P4 | The habit-forming screen |
| **Reports:** daily, weekly and monthly sales, profit, expenses, best sellers, credit outstanding | P1, P5 | |
| **Data export (CSV)** of products, sales, customers and expenses | P7 | **New** |
| Email login (owner-only) and business setup | — | As approved |

### Should have (include if they fit Stage 1; otherwise early Stage 3)

| Feature | Solves | Notes |
|---|---|---|
| **End-of-day summary**, shareable on WhatsApp ("Today: GH₵1,240 sales, GH₵310 profit, GH₵150 on credit") | P1, retention | **New.** Cheap to build; creates a daily habit |
| **Cash count / close the day:** expected cash vs counted cash | P4 | **New.** Helps catch errors or theft |
| Credit limit per customer, with a warning | P2 | Field already in schema |
| Simple in-app help and a "Chat with support on WhatsApp" button | Retention | OZÉ's experience shows support matters [V] |

### Could have (later)

WhatsApp or printed receipts, barcode scanning, supplier records, product photos, Twi language, PDF reports.

### Won't have in the MVP

| Feature | Reason |
|---|---|
| Online storefront / e-commerce | Different customer need (Bumpa's focus) |
| Staff accounts | Owner-only decision |
| Accepting card or MoMo payments in-app | Payment-processor complexity and regulation; we only **record** the method |
| Loans / lending | Regulated; out of scope |
| VAT invoices / GRA integration | Most target businesses are informal [V]; revisit later |
| Multi-branch | Not needed by micro-shops [A] |

## 4. Changes to the approved plan (for approval)

These are **additions**; no approved decision changes.

1. **Optional MoMo reference field on sales.** One extra column on `sales`.
2. **CSV data export** (Must).
3. **End-of-day WhatsApp summary** (Should).
4. **Cash count / close the day** (Should). Would add a small `cash_counts` table.
5. **WhatsApp support button** (Should).

## 5. Non-functional requirements (reconfirmed by research)

- Works on low-end Android phones; small download; low battery and data use (P6).
- **Sales never lost** offline (P6). Already designed.
- Plain English, large buttons, GH₵ formatting everywhere.
- Onboarding a new shop in **under 10 minutes** with sample products (adoption risk).
- Clear statement in the app of how data is protected and backed up, plus export (P7).

## 6. Pricing hypothesis (to test, not decided)

Competitors range from free to about GH₵200/month [R]. Revised hypothesis **[A]**:

- **Free plan** with useful limits (e.g. up to about 30–50 products, 30 days of reports)
- **Standard plan** at about **GH₵30–60/month**, tested through the survey and pilot

The earlier GH₵50–80 range may be too high against free alternatives. This is unproven either way.
