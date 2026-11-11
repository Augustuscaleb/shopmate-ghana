# Backup and restore

**Status: designed, NOT implemented, NOT tested.** This is a **mandatory release gate** (requirement R-3; gate G2; tests TC-BAK-01–05). Having a backup option, or a backup job that runs, does **not** satisfy the gate. Only a successful, recorded **restore drill** does.

Builds on [PLAN.md §10](../PLAN.md#10-backups-and-restoration).

## 1. Why we need our own backups
- The Supabase **Free plan has no downloadable backups**, so we must make our own.
- After paid launch (Supabase Pro, already in the cost plan), Supabase's daily backups are added **on top of** ours, not instead of them, because our restore drill must still prove we can recover.

## 2. What is backed up

| Part | Included | How |
|---|---|---|
| Database roles | Yes | `supabase db dump --role-only` |
| Schema (tables, functions, RLS policies, triggers) | Yes | `supabase db dump` (schema). The repository migrations are a second copy |
| Business data (all 30 tables) | Yes | `supabase db dump --data-only --use-copy` |
| User accounts (`auth` schema) | **Must be confirmed in the first drill** | Supabase's restore guide covers auth data; the drill must prove test users can log in after a restore |
| Files (Supabase Storage) | Not used in the MVP | Separate backup if ever used |
| Secrets and keys | **Never** | Kept in GitHub environment secrets and the owner's password manager |

## 3. Backup design (to be implemented after the cloud project exists)

| Item | Design |
|---|---|
| Schedule | Weekly (GitHub Actions schedule), plus a manual "run now" before every migration. Daily costs nothing extra and can be chosen instead |
| Runs in | GitHub Actions, inside the protected `cloud-dev` (later `cloud-prod`) environment |
| Connection | Session-pooler connection string from an environment secret (never in the repository) |
| Encryption | Every dump is encrypted with **age** before it leaves the runner. The **public** key may be in the repository; the **private** key is held offline by the owner (password manager and a printed copy) |
| Manifest | Each backup also records, encrypted with the dump, the row count of every table and control totals: Σ sales, Σ stock_value, Σ customer ledger, Σ expenses, Σ unpaid purchases. The drill compares against these |
| Storage | Encrypted files as GitHub Actions artifacts, kept 90 days (about 12 weekly backups). Because files are encrypted, storage location doesn't expose data |
| Failure alerts | A failed run emails the owner (GitHub default). A failed backup is an incident |
| Cost | GH₵0 (GitHub Actions minutes; Supabase free tier) |

## 4. Restore drill: the test that closes the gate

Performed on a **separate** target, never the live project: a local Supabase stack (`supabase start`) or a second free project.

1. Download the latest encrypted backup and its manifest. Decrypt them on a trusted machine with the private key.
2. Start an empty restore target.
3. Restore in order with `psql`: roles → schema → data, with `session_replication_role = replica`, `--single-transaction` and `ON_ERROR_STOP=1`.
4. **Verify** (all must pass):
   - [ ] Row count of every table equals the manifest
   - [ ] Control totals (sales, stock value, ledger, expenses, unpaid purchases) equal the manifest
   - [ ] `check_stock_integrity()` passes (stock and value equal the sum of movements)
   - [ ] All database tests pass on the restored database (`supabase test db`), including RLS and isolation
   - [ ] A fictitious test owner can log in and sees only their own shop
   - [ ] Append-only protections still active (an edit attempt on a movement is refused)
5. Record the result in [RESTORE-LOG.md](../RESTORE-LOG.md): date, backup used, duration, each check, and the result.
6. **Repeat** monthly during the pilot, after every major migration, and before the paid launch.

## 5. Mapping to tests

| Test | Proves |
|---|---|
| TC-BAK-01 | Scheduled backup produces encrypted files in storage |
| TC-BAK-02 | Files can't be read without the private key |
| TC-BAK-03 | Restore drill (§4) passes all checks |
| TC-BAK-04 | A deliberately broken run sends a failure alert |
| TC-BAK-05 | Drill recorded in RESTORE-LOG.md |

All five are 📝 Documented today.

## 6. Known limitations
- Data written after the last backup can be lost (up to 7 days with weekly backups). Accepted for the pilot; frequency to be reviewed.
- A paused free-tier project can't be backed up. Daily pilot use prevents pausing, and the failure alert reveals it.
- Custom role passwords aren't in dumps and must be reset after a restore.
- If the owner loses the private key, backups are unreadable. Hence two copies (password manager and paper).

## 7. When this will be built
After R-1 (the cloud project exists), as its own small stage, which the owner approves before work starts. It isn't part of Stage 1C.
