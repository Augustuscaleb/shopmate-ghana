# 01 — Market Research: Small Retail in Ghana

Evidence labels: **[V]** verified · **[R]** reported · **[A]** assumption. Full links are in [sources.md](sources.md).

---

## 1. Size and shape of the market

| Finding | Evidence | Source |
|---|---|---|
| Ghana had about **1.87 million** fixed-location business establishments in 2024, up from about 638,000 in 2014 | [V] | GSS Integrated Business Establishment Survey (IBES) 2024, reported by Graphic Online and B&FT |
| **90.4%** of establishments are micro-enterprises and **8.5%** are small; medium and large firms are under 1.1% combined | [V] | IBES 2024 |
| About **92.3%** of establishments are informal; only **7.7%** are formal | [V] | IBES 2024, reported by GhanaWeb and Norvan Reports |
| A separate 2026 GSS release counted about **2.64 million mobile and open-space businesses**, employing about 992,000 people. Retail trade dominates this segment | [V] | GSS release, March 2026 (GNA, Citi Newsroom, GhanaWeb) |
| The two counts above cover **different populations** and should not simply be added | [V] | Same releases |
| The **exact number of provision stores, mini-marts and boutiques** was not found | — | Gap |

**What this means**

- The potential market is very large and overwhelmingly **micro and informal**.
- Most target businesses are likely to be one person or a family, possibly with one helper **[A]**. This supports our owner-only Stage 1 decision.
- "Informal" usually means no registered accounts, so formal accounting software is a poor fit. A simple daily tool is more appropriate **[A]**, supported by the record-keeping findings below.
- Our true addressable market is the subset of fixed shops that have a smartphone, are willing to use an app, and can pay. **This subset is unknown.**

## 2. Record-keeping practices

| Finding | Evidence | Source |
|---|---|---|
| Most small business owners in a 2023 Ghana study were **aware of the need for records**, but most kept them **by hand** | [V] | Expert Journal of Business and Management, 2023 |
| Kumasi petty traders use a mix of **indigenous methods** (customer and susu-collector records, tin cans) and **mobile money** for keeping track | [V] | The Qualitative Report, vol. 28(3) |
| In a study of 367 Kumasi SMEs, **only a few** used computerised accounting systems | [V] | Ghana study via CORE |
| Records are kept on paper and electronically, but staff often **lack record-keeping training** (Sekondi-Takoradi SMEs) | [V] | University of Ghana MPhil thesis, 2022 (small sample of 5 SMEs) |
| SMEs adopt mobile money widely, but adopt cloud, CRM and accounting software much less, due to **cost, skills gaps and resistance to change** | [V] | Springer chapter, 2026 |
| A GSS/ReFinD analysis of IBES 2024 found **37% of firms** use digital platforms | [V] | GSS / ReFinD (University of Ghana) |

**What this means**

- The core problem, informal and handwritten records, is well documented.
- Awareness is not the barrier; **ease, cost and skills are** **[V]**. The app must be simpler than a notebook for the tasks owners actually do.

## 3. Customer credit

| Finding | Evidence | Source |
|---|---|---|
| **26.89% of informal firms extend trade credit to customers**, and 13.83% receive credit from suppliers (World Bank Enterprise Survey data) | [V] | Heliyon, June 2024 |
| Ghanaian small businesses rely on **informal trust** ("we know their house, family and workplace") to grant and enforce credit | [V] | Liverpool John Moores University research paper |
| Customer default is a recognised problem for credit-giving businesses | [V] | Same; University of Ghana thesis (listed firms) |
| **Provision stores specifically** commonly sell on credit to regular customers | [A] | Widely believed; no Ghana-specific provision-store data found |
| Several Ghanaian apps (MyPayAid, Clink, ChopMoney, ArmPOS) advertise debt or credit tracking | [R] | Vendor listings |

**What this means**

- Credit-giving is real and measurable (about 1 in 4 informal firms) **[V]**.
- The share among provision stores may be higher **[A]**. Several local vendors building debt features suggests demand **[R]**.
- This supports keeping the **credit ledger in the MVP**.

## 4. Payments and mobile money

| Finding | Evidence | Source |
|---|---|---|
| **80.5 million** registered mobile money accounts by December 2025, of which **26.7 million were active** | [V] | Bank of Ghana data, via news reports |
| Mobile money transactions were about **GH₵4.5 trillion in 2025** (provisional) | [V] | Bank of Ghana Summary of Economic and Financial Data, January 2026 |
| The **1% E-Levy on electronic transactions was abolished** with effect from 2 April 2025; normal MoMo fees still apply | [V] | GRA, MTN Ghana, Parliament (GNA, Graphic) |
| Mobile money is the **most widely adopted** digital technology among SMEs | [V] | Springer chapter, 2026 |
| Shops receive a significant share of payments by MoMo and find it hard to match MoMo receipts against sales | [A] | Plausible; MoMo-reconciliation features from SikaBooks and MyPayAid suggest a need **[R]** |

**What this means**

- Every sale should record its **payment method (cash / MoMo / credit)**, and reports should split them. Owners can then check their cash drawer and MoMo wallet against the app.
- MoMo is also the obvious way for owners to **pay for their subscription**, consistent with our manual MoMo plan.

## 5. Connectivity and devices

| Finding | Evidence | Source |
|---|---|---|
| 38.3 million mobile connections (110% of population) and 24.3 million internet users in January 2025 | [V] | DataReportal Digital 2025: Ghana |
| Internet users grew by about 2.1 million (+8.6%) between October 2024 and October 2025 | [V] | DataReportal Digital 2026: Ghana |
| GSMA reports only **about 37% of the population uses mobile internet**, despite near-universal 3G/4G coverage (the "usage gap") | [V] | GSMA Digital Economy Report Ghana, September 2025 |
| Most target shop owners have an Android smartphone | [A] | Likely, but no shop-owner-specific data found |
| Mobile data cost is a concern for shop owners | [A] | Not verified in this research |

**What this means**

- Network coverage is not the main barrier; **usage, cost, skills and device quality are** **[V]**.
- Offline sales recording and low data use remain correct priorities.
- The share of target shop owners who own and are comfortable with a smartphone is **unknown** and must be tested.

## 6. Power supply

| Finding | Evidence | Source |
|---|---|---|
| In a 2024 IEA survey, **70.7% of businesses** said power outages had significant or severe effects on their activities | [V] | Institute of Economic Affairs, via B&FT, June 2024 |
| Traders' associations (GUTA) continued to complain about outages in 2025–2026; the government disputes that this is a return of "dumsor" | [R] | GUTA statements, news reports, April 2026 |

**What this means**

- Outages can also take down mobile data and Wi-Fi and drain phone batteries **[A]**. This reinforces offline-first sales recording, local data safety, and a **light app** that doesn't drain the battery.

## 7. Economic conditions

| Finding | Evidence | Source |
|---|---|---|
| Inflation fell to a multi-decade low of **3.2% in March 2026**, then rose to **5.5% in October 2026** | [V] | GSS CPI releases via GNA |
| Owners need to update selling prices regularly | [A] | Likely even at moderate inflation; not measured |

**What this means**

- Changing a product's price must be **quick**. Profit must use the **cost price at the time of sale** (already in our plan).
- Lower inflation in 2026 may make subscription pricing more stable **[A]**.

## 8. Adoption of digital bookkeeping tools

| Finding | Evidence | Source |
|---|---|---|
| OZÉ (Ghana) found that, due to low digital literacy, **in-person support staff were vital** to uptake and usage | [V] | UNCDF case study, November 2021 |
| A bookkeeping app in Lagos, Abidjan and Lilongwe (tabtap SHOP) saw fast onboarding, but **very low retention** | [R] | Practitioner case write-up |
| A Nigerian app (Kippa) became **inaccessible from January 2024**, leaving businesses without their records | [V] | TechCabal, February 2024 |
| A Ghana randomised trial of e-bookkeeping (PEDL) exists, but no results were found | — | PEDL project page |

**What this means**

- **The biggest market risk is not signing users up but keeping them using the app daily.**
- Support, habit and trust matter as much as features.
- Owners risk losing their records if an app shuts down. **Data export** and transparency about backups can be a trust advantage.

## 9. Summary of verified vs assumed

**Verified:**
- The market is large, mostly micro and informal.
- Record keeping is mostly manual.
- About 1 in 4 informal firms give customer credit.
- Mobile money is dominant.
- Mobile internet usage lags coverage.
- Power outages affect most businesses.
- Bookkeeping-app adoption depends heavily on support, and retention is hard.

**Assumed (to test):**
- Provision stores, mini-marts and boutiques specifically want a sales, stock and credit app.
- Owners have suitable Android phones and will use them at the counter.
- Credit is especially common in provision stores.
- Owners will pay about GH₵30–80/month.
- Email login is workable.
- MoMo reconciliation is a felt pain.
- Owners will record **every** sale, rather than only some.
