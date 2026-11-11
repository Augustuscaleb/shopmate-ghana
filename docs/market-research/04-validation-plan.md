# 04 — Validation Plan (Without Mandatory Interviews)

Physical interviews are **optional**. Proceeding does not depend on them. Every method below costs **GH₵0**.

---

## 1. Methods

| # | Method | What it tells us | Effort | Status |
|---|---|---|---|---|
| 1 | **Desk research** | Market context, competitors | Done | ✅ This folder |
| 2 | **Competitor hands-on testing** | Real usability, offline behaviour, pricing, gaps | 1–2 hours | To do (project owner) — [scorecard](templates/competitor-test-scorecard.md) |
| 3 | **App-store review mining** | What real users love and hate about existing apps | 2–3 hours | To do — [log template](templates/review-mining-log.md) |
| 4 | **Public discussion scan** | Language owners use, frustrations, workarounds | 1–2 hours | To do |
| 5 | **Online survey** (Google Forms via WhatsApp) | Current practices, pains, phone type, willingness to pay | 1 hour to set up; 2–4 weeks to collect | To do — [questions](templates/survey-questions.md) |
| 6 | **Remote conversations** (WhatsApp/phone calls with willing survey respondents) | Deeper "why" behind answers | Optional | Optional |
| 7 | **Opportunistic pilot** (any accessible shop: family, friends, neighbours, referrals) | Real usage evidence | When the MVP exists | Stage 2 |
| 8 | Physical interviews/visits | Richest insight | Optional | Optional |

## 2. How to do each method

### 2.1 Competitor hands-on testing
1. Install 3–5 apps (see `02-competitor-analysis.md` §6) on an ordinary Android phone.
2. For each: set up a fake shop, add 5 products, record 3 sales (one on credit), turn on **airplane mode** and record a sale, turn the network back on, and check whether it synced.
3. Fill in the scorecard. Note prices **as shown in the app** in GH₵ (this upgrades [R] to [V]).

### 2.2 App-store review mining
1. Open each competitor's Google Play page and sort reviews by **most recent**, then by **lowest rating**.
2. Read about 30 reviews per app, prioritising reviewers who appear to be in Ghana or West Africa.
3. Tag each review with categories: *sync/offline, data loss, price, complexity, missing credit feature, support, bugs, speed, praise*.
4. Count tags. Recurring complaints become requirements; recurring praise shows what users value.
5. **Do not copy reviewers' names** into our documents. Record only the paraphrased point, the rating and the date.

### 2.3 Public discussion scan
Look at public posts only, in Ghanaian business Facebook groups, Reddit r/ghana, the comment sections of Ghanaian business news, and YouTube comments on shop-management videos. Search terms: *"shop records", "provision shop", "customers owing", "inventory app Ghana", "credit customers"*. Record themes, not identities. Respect group rules and don't post adverts.

### 2.4 Online survey
- Build in Google Forms (free) from the [survey questions](templates/survey-questions.md).
- Share via WhatsApp status, community and church groups, alumni groups, and friends who own shops. Ask them to forward it.
- Keep it short (about 5 minutes), optionally anonymous, with consent text at the top (Data Protection Act, 2012 — collect the minimum).
- Optional incentive: none at GH₵0, or later a small MoMo airtime draw if budget allows.

### 2.5 Opportunistic pilot
Any shop owner who is willing and reachable — in person or remotely — can join once the MVP exists. Remote onboarding: share the APK link, then a WhatsApp video call to set up, with sample products preloaded.

## 3. Revised Stage 0 targets (targets, not guaranteed outcomes)

| Signal | Target |
|---|---|
| Competitor apps tested hands-on | 3–5 |
| App reviews analysed | About 100–150 across apps |
| Survey responses from people who **own or run** a shop | **30+** (stretch: 50) |
| Respondents reporting a clear problem with records, stock or credit | **50%+** of shop-owner respondents |
| Respondents willing to try a free pilot and leaving a contact | **10+** |
| Pilot businesses recruited (any method) | **At least 3** to begin, aiming for 5 |

**Decision rule:**
- **Most targets met:** proceed to the Stage 1 MVP.
- **Partly met:** proceed, but adjust features or pricing.
- **Clearly missed** (e.g. very few shop owners report a problem): pause and revisit the idea before investing further.

Small samples from WhatsApp networks are **not statistically representative**. They are a sense-check, not proof.

## 4. Assumptions to test during the pilot

| # | Assumption | How we measure | Target signal |
|---|---|---|---|
| A1 | Owners will record **most** sales in the app | Sales recorded vs owner's estimate of daily sales count | About 70%+ coverage after 2 weeks |
| A2 | The app is quick enough at the counter | Time to record a sale (observed or self-reported) | Under 15 seconds for a common item |
| A3 | Owners keep using it | Days active per week, per shop | 5+ days/week after 3 weeks in at least half the shops |
| A4 | The credit ledger is valuable | % of shops with 3+ credit customers recorded; repayments logged | Used by most provision-store pilots |
| A5 | Offline recording works reliably | Sync failures, duplicates, lost sales (error logs) | Zero lost or duplicate sales |
| A6 | Email login is workable | Setup help needed; password-reset requests | Most owners self-serve after setup |
| A7 | Profit and Today screens change behaviour | Owner feedback: "I learned something" | Majority report a useful insight |
| A8 | Owners will pay | Stated price and actual MoMo payment after the free period | 3+ shops willing; at least 1 pays |
| A9 | Low-end phones perform acceptably | Crash reports, slowness complaints, device models | No blocking performance issues |
| A10 | WhatsApp support is enough | Support requests and resolution time | Issues resolved within 24 hours |
| A11 | Negative-stock flags are understood | Discrepancies resolved by owners | Most resolved within a week |
| A12 | Owners trust the app with their data | Survey and pilot feedback; export usage | No trust-related drop-outs |
