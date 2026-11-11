# ShopMate Ghana — MVP Product Specification

**Status:** Revision 4 — for final review as the implementation baseline
**Date:** 11 November 2026
**Depends on:** [docs/PLAN.md](../PLAN.md) (approved) and [Stage 0 research](../market-research/STAGE-0-REPORT.md) (approved direction)

> No application code and no Supabase project will be created until this specification and design are approved.

## Contents

| # | Document | Covers |
|---|---|---|
| 01 | [Scope: MVP vs future](01-scope.md) | What is in and out, plans and pricing hypothesis, positioning |
| 02 | [User journeys](02-user-journeys.md) | Registration to first sale; daily, credit and end-of-day journeys |
| 03 | [Screens](03-screens.md) | Screen-by-screen descriptions and the dashboard layout |
| 04 | [Workflows](04-workflows.md) | Sales, inventory, credit and repayments, expenses, cash count, voids |
| 05 | [Financial calculations](05-financial-calculations.md) | Money rules, formulas, rounding, worked examples |
| 06 | [Offline synchronisation](06-offline-sync.md) | Outbox, statuses, local stock, edge cases |
| 07 | [Errors and security](07-errors-and-security.md) | Error handling, messages, security requirements |
| 08 | [Visual design direction](08-visual-design.md) | Colours, type, components, tone, accessibility, simplicity rules |
| 09 | [Data model](09-data-model.md) | **Single source of truth** for tables, fields and server functions |
| 10 | [Test plan and release gates](10-test-plan.md) | All test cases (calculation, cost, credit, sync, security, backup, UX) and gates G1–G3 |
| — | [design-preview.html](design-preview.html) | Static mock-up of key screens (open in a browser) |

## Conventions

**Evidence labels** (as in all project documents):

| Label | Meaning |
|---|---|
| **[V]** | Verified: official statistics, peer-reviewed research, reputable reporting of official data |
| **[R]** | Reported: vendor claims, directories, single reports. Not independently confirmed |
| **[A]** | Assumption: our reasoning; to be tested in the pilot |

Most design choices are **[A]**: reasoned decisions to be validated with real users. Where research supports a choice, the evidence is cited.

**Requirement IDs:** `S-` screens, `F-` functional, `C-` calculation, `SY-` sync, `E-` error handling, `SEC-` security, `D-` design. Future code and tests will refer to these IDs.

**Money:** all amounts are stored as integer pesewas and displayed as GH₵ (see 05).

**Test status:** every test case in 10 is currently **📝 Documented only**. None is implemented or passed. See 10 §0.

## Decisions reflected in this specification

1. Core MVP: sales, inventory, expenses, customer credit, profit reporting, offline sales recording.
2. Included where practical: optional MoMo reference, CSV export, basic cash reconciliation (cash count).
3. Deferred: automated WhatsApp reports, staff management, automated subscription payments.
4. Positioning: simplicity, reliable offline use, Ghanaian business operations, affordability, accessible local support.
5. Pricing: GH₵30–60/month is a **hypothesis**. Free Starter plan plus two paid plans, to be explored.
6. The verified / reported / assumption distinction is preserved throughout.

## Revision log

### Revision 4 (11 November 2026)

| # | Issue raised | Resolution | Where |
|---|---|---|---|
| Main | Late offline sale keeps its cost, but the future average was wrong (restock blended against a stock count that missed the sale) | **Value-pool method:** products keep stock value (pesewas) and quantity; average = value ÷ qty; a late sale removes its sale-time cost, so the pool equals true-time-order processing (owner's scenario: 12.78). Total cost always conserved. Remaining limitation (in-between sales) quantified, bounded, logged | 05 §3.1–3.5, §3.9; 09; 04 §1.1, §2; TC-COST-01–21 |
| 1 | Wrong or manipulated phone time | Android elapsed-time verification, clock offset, red-flag checks, time confidence; low → upload time; flagged, never rejected | 05 §3.6; 06 §9; TC-TIME-01–06 |
| 2 | Overlapping device times | Sales don't change the average; cost events are server-timed; tie rule; stock conflicts via discrepancies | 05 §3.7; TC-TIME-07/08 |
| 3 | Offline restocks or adjustments | Stay online-only, now an explicit accounting safeguard | 05 §3.8; TC-COST-19 |
| 4 | Late arrivals vs confirmed reports | Immutable day snapshots; "Confirmed / Changes after closing / Current" | 05 §11; 04 §5; 03 S-60/61; TC-CLOSE-01–06 |
| — | Test status | 113 documented, 0 implemented, 0 passed | 10 §0 |


### Revision 3 (11 November 2026)

| # | Issue raised | Resolution | Where |
|---|---|---|---|
| 1 | Offline sale costed at a later average | **Point-in-time costing:** every average-cost change is written to `product_cost_history`; each sale is costed as at its sale time (`occurred_at`, or `received_at` if the clock is suspect); recorded costs never change. Limitations L1–L5 documented | 05 §3.2–3.5; 09; TC-COST-11–16 |
| 2 | DISCARD could lose or hide records | Replaced by **Cancel unsent sale**: internet status check (refused if the server already has it), required reason, review, password or PIN, server-side `cancelled_unsent` record and audit entry; ID reserved against stale uploads; visible in history and reports. No local-only discard. Outcomes for sales that never reach the server documented | 04 §1.5; 03 S-24/S-25; 06 SY-07, SY-18; TC-CANCEL-01–09 |
| 3 | Undo vs recovery of written-off debt | **Undo write-off** (`write_off_undo`, mistake, no money, restores balance) vs **Recovery** (`debt_recoveries`, money received, balance unchanged, "Recovered bad debts" profit line). Payments split server-side: repayment first, then recovery, then rejection. Worked example 05 §10 | 05 §4, §7; 04 §3.3, §3.6; 03 S-42–S-44; TC-CRED-04, 08–12 |
| 4 | Multi-device concurrency | One transaction per write; idempotency claim → product locks by ID → customer lock; retry on deadlock; `request_log`; constraints. Two-devices-offline scenario documented step by step | 09 §4; 06 SY-71, §8.1; 07 SEC-24–26; TC-CONC-01–07, TC-SYNC-10/11/14 |
| 5 | Test status | Status legend and counts (94 documented, 0 implemented, 0 passed); evidence required for ✅; gates show "Not reached" | 10 §0, §10 |
| — | Renamed | `write_off_reversal` → `write_off_undo` | All |


### Revision 2 (11 November 2026)

| # | Owner decision | Changes |
|---|---|---|
| 1 | Stock losses and written-off debts reduce estimated net profit, shown separately from operating expenses | 05 §4–§6 rewritten (C-30–C-47); new ledger types `write_off` / `write_off_reversal`; Reports and Today show each loss type on its own line (03); workflows 04 §2.3, §3.6; tests TC-LOSS, TC-CRED-03/04 |
| 2 | Assess weighted-average costing | **Assessed as feasible: adopted for the MVP** (05 §3.1). Server-assigned costs, row locking, exact decimals. Limitations documented (05 §3.3); last-restock fallback and its effect documented (05 §3.4); tests TC-COST-01–10 |
| 3 | Pilot pricing hypotheses; 5–10 shops free for 30–60 days | 01 §4; PLAN.md §11–12; plan value `pilot` (09) |
| 4 | Offline reliability: duplicates, failed-sync recovery, multi-device, reconciliation | 06 §4 (SY-18, SY-19), §8 (SY-70–75); S-24 failed-sale actions; tests TC-SYNC-01–20 (gate G2) |
| 5 | Backup must be demonstrated before real data | SEC-41; TC-BAK-01–05; gate G2; PLAN.md §10 status line |
| 6 | Visual design provisionally approved; keep it simple | 08 status; new §8 simplicity rules; no long-press needed (S-20); TC-UX-03 |
| — | Consistency | New 09 (data model) and 10 (test plan); PLAN.md §5–§6, §10–§14 aligned |
