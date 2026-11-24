# ShopMate Ghana

A mobile-first business management app for small shops in Ghana (provision stores, mini-marts, boutiques): sales, stock, customer credit, expenses and profit, in GH₵, with offline sales recording.

**Status:** Stage 1C, checkpoint 1C-1: the inventory database functions (products, restock, adjustments, supplier payments, returns, purchase corrections, Needs attention, stock integrity, low stock) are built and pass CI on the local stack; they are **not** yet applied to the cloud project, and there are no inventory screens yet. No real shop data. See [docs/IMPLEMENTATION-STATUS.md](docs/IMPLEMENTATION-STATUS.md).

| Folder | What it is |
|---|---|
| `app/` | React Native + Expo + TypeScript mobile app (Android-first) |
| `supabase/migrations/` | Database schema, security rules and server functions (SQL) |
| `supabase/tests/database/` | Database tests (pgTAP) |
| `tests/` | End-to-end security tests through the Supabase API |
| `docs/` | Plan, research, product specification, setup guides, test evidence |

Start here:
- [docs/PLAN.md](docs/PLAN.md): development plan and decision log
- [docs/product-specification/](docs/product-specification/README.md): approved specification (revision 5.1) and test plan
- [docs/setup/DEVELOPMENT.md](docs/setup/DEVELOPMENT.md): run the project and tests locally
- [docs/setup/SUPABASE-CLOUD-SETUP.md](docs/setup/SUPABASE-CLOUD-SETUP.md): create the free Supabase project

**Security rule:** never commit passwords, API secrets or service-role keys. `npm run check:secrets` checks this, and CI runs it on every push.
