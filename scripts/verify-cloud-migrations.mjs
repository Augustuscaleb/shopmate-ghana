#!/usr/bin/env node
// TC-CLOUD-01: every migration in supabase/migrations has been applied to the cloud
// database, and the cloud has no migrations that are missing from the repository.
// Needs SUPABASE_DB_URL (GitHub Actions secret) and the psql client.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const url = process.env.SUPABASE_DB_URL;
if (!url) { console.error('SUPABASE_DB_URL is not set'); process.exit(2); }

const local = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).map((f) => f.split('_')[0]).sort();
const out = execFileSync('psql', [url, '-At', '-c', 'select version from supabase_migrations.schema_migrations order by version'], { encoding: 'utf8' });
const remote = out.split('\n').map((s) => s.trim()).filter(Boolean).sort();

const missingInCloud = local.filter((v) => !remote.includes(v));
const unknownInCloud = remote.filter((v) => !local.includes(v));
console.log(`Repository migrations: ${local.length}; applied in cloud: ${remote.length}`);
if (missingInCloud.length) console.error('Not applied in cloud: ' + missingInCloud.join(', '));
if (unknownInCloud.length) console.error('In cloud but not in repository: ' + unknownInCloud.join(', '));
if (missingInCloud.length || unknownInCloud.length) process.exit(1);
console.log('Cloud migrations match the repository.');
