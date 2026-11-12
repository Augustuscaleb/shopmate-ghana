# Creating the Supabase cloud project (free tier)

**Who does this:** the project owner, in a browser. Claude cannot create it: it needs your Supabase account, and supabase.com isn't reachable from Claude's environment.

**Cost:** GH₵0 on the Free plan. Don't upgrade, add a card or enable paid add-ons without a separate cost discussion (decision 10).

**Data:** until release gate G2 passes (including a tested backup restore), use **fictitious test data only**.

## 1. Create the project
1. Sign in at supabase.com (GitHub login is fine) and create an organisation on the **Free** plan.
2. **New project**:
   - Name: `shopmate-ghana-dev`. This first project is for development and testing; create a separate production project later.
   - Database password: generate a strong one and store it in a **password manager**. Never in GitHub, chat or the app.
   - Region: the closest available to Ghana. Supabase has no African region; a European region (e.g. London or Frankfurt) is usually closest. Check the list at creation time.
3. Wait until the project shows "Healthy".

## 2. Authentication settings (Dashboard → Authentication)
| Setting | Value | Why |
|---|---|---|
| Email provider | Enabled | Email + password login (decision 6) |
| Minimum password length | **8** | SEC-01 (matches `supabase/config.toml`) |
| Confirm email | On, unless the built-in email limit blocks pilot sign-ups; then assisted setup (SEC-04) | |
| Phone, anonymous and social providers | **Off** | Not in the MVP |
| Site URL | leave default | |
| **Redirect URLs** (Authentication → URL Configuration) | add `shopmate://auth-callback` and `shopmate://reset-password` | Email confirmation and password-reset links open the app (Stage 1B) |

## 3. Apply the database migrations safely (from your own computer)

**Never do these against the cloud project:**
- `supabase config push`: it would copy the *local* auth settings (email confirmation **off**) over your cloud settings
- `supabase db reset --linked`: it erases the cloud database
- editing tables by hand in the dashboard

### 3.1 Prepare (5 minutes)
1. Install Node.js 20+ and Git (Docker is **not** needed for these steps).
2. Get the code on the default branch and check that you have exactly the 5 migrations:
   ```
   git clone https://github.com/Augustuscaleb/shopmate-ghana.git
   cd shopmate-ghana
   git checkout claude/elegant-babbage-a2rfd2
   npm ci
   ls supabase/migrations
   ```
   Expected: `20261111000100_foundation.sql`, `..._200_business_access.sql`, `..._300_core_tables.sql`, `..._400_triggers_rls_privileges.sql`, `..._500_foundation_functions.sql`.

### 3.2 Link to the project (nothing is changed yet)
```
npx supabase login
npx supabase link --project-ref <your-project-ref>
```
- `login` opens your browser. The access token is stored on your computer, not in the repository.
- `link` asks for the **database password**. Type it; don't put it in any file.
- If `link` offers to change or update **config**, answer **No**.

Check nothing private was added to the repository: `git status` should show **no new files**. Supabase's link data goes into `supabase/.temp/`, which is git-ignored.

### 3.3 Preview, then apply
```
npx supabase migration list
npx supabase db push --dry-run
```
- `migration list`: **Local** column shows the 5 versions; **Remote** column is empty.
- `--dry-run`: lists exactly those 5 migrations and **applies nothing**.

If both look right:
```
npx supabase db push
```
Confirm when asked. **If any error appears, stop:** don't retry, edit files or run other commands. Copy the error text (it contains no secrets) and send it to Claude.

**If the connection fails with an IPv6 / "network is unreachable" error:** use the IPv4 **session pooler** connection string instead. Dashboard → **Connect** → "Session pooler" → URI. To keep the password out of your shell history:
- macOS/Linux: `read -s DB_URL` (paste the URI with your password filled in, press Enter), then `npx supabase db push --db-url "$DB_URL" --dry-run`, then the same without `--dry-run`
- Windows PowerShell 7: `$env:DB_URL = Read-Host -MaskInput`, then `npx supabase db push --db-url $env:DB_URL --dry-run`

### 3.4 Verify (required: don't assume the push worked)
1. `npx supabase migration list`: **Local and Remote both show all 5 versions**.
2. Dashboard → **SQL Editor** → New query → paste the whole of [`scripts/sql/verify-cloud-schema.sql`](../../scripts/sql/verify-cloud-schema.sql) → Run. It is **read-only**. **All 12 rows must say PASS.**
3. Send Claude the `migration list` output and the 12-row result table. Neither contains secrets.

Only after this is verified is the database considered applied. That is still **not** cloud verification (R-1): that needs §6.

## 4. Connect the app
Dashboard → Project Settings → API. Copy the **Project URL** and the **anon / publishable** key into `app/.env` (git-ignored):
```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon or publishable key>
```
**Never copy the `service_role` / secret key anywhere in this repository or the app.** The app also refuses to start if it detects one (`app/src/config/env.ts`).

## 5. Free-tier limits to remember
- A project **pauses after about 7 days without activity**. Unpausing is free.
- **No downloadable backups** on Free. Our own backup and restore drill (PLAN §10) must pass before real data.
- Built-in auth emails are rate-limited. That's fine for development and a small pilot.

## 6. REQUIRED: cloud verification (do not skip)

The local tests prove the design. This step proves the **actual cloud database** has the same protections. It's required after creating the project, and again after **every** migration is applied (decision 42).

**Why this works on GitHub's free plan:** the repository is **public**, and GitHub Free supports environment secrets and required reviewers for public repositories only. If the repository is ever made private on GitHub Free, these stop working and this section must be redesigned first.

### 6.1 Create the environment (GitHub → repository → Settings → Environments → New environment)
1. Name: `cloud-dev` (exactly).
2. **Deployment protection rules** → tick **Required reviewers** → add yourself → **Save protection rules**.
3. **Deployment branches and tags**: choose **Selected branches and tags** → add `claude/elegant-babbage-a2rfd2`, so no other branch can use these secrets.

### 6.2 Add the four environment secrets (same page → **Environment secrets** → Add environment secret)
Use **environment secrets**, not "Environment variables" (those are visible to anyone) and not repository secrets.

| Secret name (exact) | Value | Where to find it |
|---|---|---|
| `SUPABASE_DEV_PROJECT_REF` | The project ref, e.g. `abcdefghijklmnopqrst` | Project Settings → General → Project ID (also in the project URL) |
| `SUPABASE_DEV_DB_URL` | Full **session pooler** URI with your database password inserted | Dashboard → **Connect** → Session pooler → URI. Replace `[YOUR-PASSWORD]`. **If the password contains** `@ : / ? # [ ] %` **or spaces, it must be URL-encoded** (e.g. `@` → `%40`), or reset the database password to letters and digits only |
| `SUPABASE_DEV_ANON_KEY` | The **publishable** key (`sb_publishable_…`) or the legacy **anon** key | Project Settings → API Keys |
| `SUPABASE_DEV_SERVICE_ROLE_KEY` | The **secret** key (`sb_secret_…`) or the legacy **service_role** key | Project Settings → API Keys. Used only by the cloud test to create the two fictitious test owners. **Never** paste it into the app, the repository, chat or email |

Claude tested both key styles (new and legacy) with the code path the cloud test uses (11 Nov 2026).

**After saving:** the environment page should list exactly these 4 secret names. GitHub never shows secret values again; that's expected. Tell Claude the names you see, not the values.

### 6.3 Run it
GitHub → **Actions** → "Cloud verification (development project)" → **Run workflow** (branch `claude/elegant-babbage-a2rfd2`) → type `fictitious-data-only` → Run. Then open the run and **approve** it (required reviewer). It checks:

| Test | What it proves |
|---|---|
| Preflight | Before anything touches the cloud: the database URL secret belongs to the project in `SUPABASE_DEV_PROJECT_REF` (exact Supabase host forms only). If not, the run stops without printing the URL, password or ref |
| TC-CLOUD-01 | Every repository migration is applied in the cloud, and nothing unexpected is there |
| TC-CLOUD-02 | The database tests pass **on the cloud database**: 30 tables, RLS on every table, no anonymous access, write restrictions, append-only protection, isolation between two businesses. Each test file runs in a transaction that is rolled back |
| TC-CLOUD-03 | Business-data isolation **through the cloud API**: two fictitious owners can't read or change each other's data |

Both database steps run with `PGSSLMODE=require`, so they refuse to connect without encryption.

The cloud tests create two fictitious owners (`shopmate.cloudtest.a@example.test`, `...b@...`) with one test shop each. They are reused on every run, so data doesn't pile up.

**Known risk:** on Supabase cloud, the database role used by TC-CLOUD-02 may not be allowed to insert test rows into the `auth.users` table (needed by one test file). If TC-CLOUD-02 fails for that reason only, report the error to Claude: the test will be adapted, and the step is **not** treated as passed in the meantime.

## 7. Tell Claude when it's done
Share only the **project ref** and the result of the cloud verification run. Never share keys or passwords in chat.
