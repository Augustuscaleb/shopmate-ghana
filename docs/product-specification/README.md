# ShopMate Ghana — MVP Product Specification

**Status:** Draft for review — not yet approved
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
| 08 | [Visual design direction](08-visual-design.md) | Colours, type, components, tone, accessibility |
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

## Decisions reflected in this specification

1. Core MVP: sales, inventory, expenses, customer credit, profit reporting, offline sales recording.
2. Included where practical: optional MoMo reference, CSV export, basic cash reconciliation (cash count).
3. Deferred: automated WhatsApp reports, staff management, automated subscription payments.
4. Positioning: simplicity, reliable offline use, Ghanaian business operations, affordability, accessible local support.
5. Pricing: GH₵30–60/month is a **hypothesis**. Free Starter plan plus two paid plans, to be explored.
6. The verified / reported / assumption distinction is preserved throughout.
