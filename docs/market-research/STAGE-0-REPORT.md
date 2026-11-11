# ShopMate Ghana — Stage 0 Report (Research-Led)

**Status:** Draft for review — not yet approved
**Date:** 11 November 2026

Evidence labels: **[V]** verified · **[R]** reported · **[A]** assumption. Details are in files 01–04, and links in [sources.md](sources.md).

---

## 1. What we know about the market

1. **The market is large and mostly micro and informal.**
   - About 1.87 million fixed business establishments in 2024; 90.4% are micro and 92.3% informal [V].
   - A further about 2.64 million mobile and open-space businesses, where retail dominates [V].
2. **Records are mostly handwritten.** Owners know records matter, but cost, skills and resistance hold back digital tools [V].
3. **Customer credit is common.** About 1 in 4 informal firms (26.89%) extend credit to customers, enforced through personal trust [V].
4. **Mobile money is everywhere.**
   - 80.5 million registered accounts and 26.7 million active (December 2025).
   - About GH₵4.5 trillion transacted in 2025 [V].
   - The E-Levy was abolished in April 2025 [V].
5. **Coverage is good, but usage lags.** About 37% of people use mobile internet despite near-universal 3G/4G [V].
6. **Power outages hurt business.** 70.7% of businesses reported significant effects in 2024 [V], and complaints continue in 2026 [R].
7. **Inflation is moderate in 2026** (3.2–5.5%) [V].
8. **Keeping users is harder than signing them up.**
   - OZÉ found in-person support vital [V].
   - Another African bookkeeping app saw very low retention [R].
   - Kippa's 2024 outage left users without their records [V].
9. **Competition is crowded.** There are free international POS apps (Loyverse, Zoho), a regional commerce platform (Bumpa), Ghanaian bookkeeping apps (OZÉ, ChopMoney), and many small Ghanaian POS products priced from free to about GH₵200/month [R].

## 2. What remains uncertain

| Uncertainty | Why it matters |
|---|---|
| How many **provision stores, mini-marts and boutiques** exist, and how many have suitable Android phones | Market size and device requirements |
| Whether owners will record **every** sale at the counter | The whole product depends on it |
| How common and how large credit is **in provision stores** specifically | Value of the credit ledger |
| **Willingness to pay**, and at what price, given free alternatives | Business viability |
| Whether **email login** works for this audience | Onboarding friction |
| Real **competitor** usability, offline behaviour and Ghana pricing (only [R] so far) | Our differentiation |
| Why previous users **stopped** using similar apps | Retention design |
| Whether MoMo reconciliation is a felt pain | Feature priority |

## 3. Customer problems to prioritise

1. **"Am I making profit?"** — no clear view of profit from handwritten records
2. **"Who owes me, and how much?"** — informal credit tracking and losses
3. **"What's running out?"** — stock-outs and stock uncertainty
4. **"Do my cash and MoMo match my sales?"**
5. **Reliability despite power or data cuts** — a must, not a feature
6. **Trust that records won't disappear**

## 4. Recommended MVP features

The approved Stage 1 scope stays. The research adds **five small items**, which need your approval:

| Feature | Priority | Status |
|---|---|---|
| Quick sale (3 taps or fewer); Cash / MoMo / Credit | Must | Approved |
| Offline sales with Pending / Synced / Failed status | Must | Approved |
| Products with cost and selling price; fast price edit; restock; adjustments | Must | Approved |
| Low-stock list (WhatsApp shareable) | Must | Approved |
| Credit ledger with part-repayments and WhatsApp reminders | Must | Approved |
| Expenses; Today screen; daily, weekly and monthly reports | Must | Approved |
| ➕ **Optional MoMo reference on a sale** | Must | **New — for approval** |
| ➕ **CSV data export** | Must | **New — for approval** |
| ➕ **End-of-day WhatsApp summary** | Should | **New — for approval** |
| ➕ **Cash count / close the day** | Should | **New — for approval** |
| ➕ **WhatsApp support button** | Should | **New — for approval** |

**Excluded from the MVP:** online store, staff accounts, in-app payment acceptance, lending, VAT/GRA invoices, multi-branch.

**Pricing hypothesis (revised, to test):** a free plan plus a Standard plan at about **GH₵30–60/month**, lowered from GH₵50–80 because free competitors exist [A].

## 5. Assumptions to test

**Before building (Stage 0):**
- Through survey, competitor testing and review mining: the headaches owners rank highest; credit prevalence; phone type; email use; willingness to pay; why owners stopped using other apps.

**During the pilot** (full table in `04-validation-plan.md` §4):
- A1 — Owners record most sales
- A2 — A sale takes under 15 seconds
- A3 — Shops use it 5+ days a week after 3 weeks
- A4 — The credit ledger is used
- A5 — Zero lost or duplicate offline sales
- A6 — Email login is workable
- A7 — Profit insight is useful
- A8 — Owners will pay (at least 1 actual MoMo payment)
- A9 — Performance on low-end phones is acceptable
- A10 — WhatsApp support is enough
- A11 — Negative-stock flags are understood
- A12 — Owners trust the app with their data

## 6. Revised Stage 0 activities

**Physical interviews are optional.**

| Activity | Owner | Target |
|---|---|---|
| Desk research | Claude | ✅ Done |
| Hands-on test of 3–5 competitor apps | Project owner | Scorecards completed |
| App-store review mining | Project owner (Claude can help analyse) | About 100–150 reviews |
| Public discussion scan | Project owner | Themes recorded |
| Online survey via WhatsApp | Project owner | 30+ shop-owner responses; 50%+ report a clear problem; 10+ pilot volunteers |
| Pilot recruitment (any method) | Project owner | At least 3 to start, aiming for 5 |

These are **targets, not guaranteed outcomes**.

## 7. Development recommendation

1. **Proceed with a research-led Stage 0**, not a halt. The evidence supports the core problem (manual records, common credit, MoMo, unreliable power) **[V]**. The approved MVP scope matches it.
2. **Be realistic about competition.** ShopMate must earn its place through **simplicity, offline reliability, data trust, local support and price**, not a novel feature list.
3. **The biggest risk is retention, not technology.** Design for a daily habit (Today screen, end-of-day summary) and human support (WhatsApp).
4. **Run the survey and competitor tests in parallel** with early Stage 1 groundwork. Survey results can still adjust features and pricing before the pilot.
5. **Suggested go/no-go:** start Stage 1 once (a) you approve this report, and (b) you have done the competitor tests. Survey results should be in before the pilot starts.

## 8. Decisions needed

1. Approve the **five additional MVP items** in §4 (all, some, or none)?
2. Approve the **revised Stage 0 targets** (§6), with interviews optional?
3. Accept the **revised pricing hypothesis** (free plan + about GH₵30–60/month) for testing?
4. Agree to start Stage 1 after the **competitor tests**, without waiting for the full survey?

Once approved, `docs/PLAN.md` will be updated to match. No application code or Supabase project will be created until you give a separate instruction.
