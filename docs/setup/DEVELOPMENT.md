# Development guide

## Prerequisites
- Node.js 20 or newer (22 recommended)
- Docker (running), needed for the local Supabase stack
- Git

## First-time setup
```bash
npm ci
npm ci --prefix app
```

## Local database (Supabase in Docker: database, auth and API only)
```bash
npm run db:start      # starts the local stack and applies all migrations
npm run db:reset      # wipes local data and re-applies all migrations
npm run db:stop
```
`db:start` prints local URLs and keys. These are Supabase's public **demo** keys for local development only. Don't copy them into committed files.

## Tests
```bash
npm run check:secrets   # no keys, tokens or passwords in the repository
npm run typecheck       # tests + app
npm run test:db         # database tests (pgTAP): structure, constraints, isolation, functions
npm run test:security   # end-to-end security tests through the real Supabase API
npm test                # both test suites
```
The security tests refuse to run against anything other than `localhost`, so they can never touch a real project.

## Mobile app
```bash
cp app/.env.example app/.env     # then fill in URL + anon key (local or cloud)
npm --prefix app start           # Expo dev server
```
Only the **public** anon/publishable key goes in the app. Never the service-role (secret) key.

## Adding a database change
1. `npx supabase migration new <short_name>` creates a new file in `supabase/migrations/`.
2. Write the SQL. Every new table needs `business_id`, RLS policies and a privileges review.
3. Add or extend tests in `supabase/tests/database/`. The isolation tests automatically include any new table with `business_id`.
4. `npm run db:reset && npm test`.
