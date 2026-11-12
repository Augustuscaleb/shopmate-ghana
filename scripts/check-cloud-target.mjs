#!/usr/bin/env node
// Cloud-verification preflight: confirm the database URL secret belongs to the
// declared development project BEFORE any cloud test runs.
//
// Reads:  SUPABASE_DB_URL           (from secret SUPABASE_DEV_DB_URL)
//         SUPABASE_DEV_PROJECT_REF  (from secret of the same name)
// Accepts the two Supabase connection-string forms (described in words so no
// credential-shaped example appears in the repository):
//   session pooler: user "postgres.<ref>",
//                   host "aws-<pool number>-<AWS region>.pooler.supabase.com"
//                   (e.g. pool 0 or 1; region such as eu-north-1, us-east-1, ap-southeast-1)
//   direct:         user "postgres" (or "postgres.<ref>"), host "db.<ref>.supabase.co"
// SAFETY: never prints the URL, password, username, host or either ref value.
// Messages describe only which rule failed. Exit code 0 = match; 1 = refuse.

const fail = (reason) => {
  console.error(`Cloud target preflight FAILED: ${reason}. No cloud tests were run.`);
  process.exit(1);
};

const rawUrl = process.env.SUPABASE_DB_URL ?? '';
const expectedRef = (process.env.SUPABASE_DEV_PROJECT_REF ?? '').trim();

if (!rawUrl) fail('the database URL secret is empty or missing');
if (!expectedRef) fail('the project ref secret is empty or missing');
if (!/^[a-z0-9]{20}$/.test(expectedRef)) fail('the project ref secret is not in the expected format (20 lowercase letters/digits)');

let url;
try {
  url = new URL(rawUrl);
} catch {
  fail('the database URL secret is not a valid URL');
}

if (!['postgres:', 'postgresql:'].includes(url.protocol)) fail('the database URL is not a postgres:// or postgresql:// URL');

const host = url.hostname.toLowerCase();
let username;
try {
  username = decodeURIComponent(url.username);
} catch {
  fail('the database URL username is not correctly encoded');
}
try {
  decodeURIComponent(url.password); // validation only; the password is never printed or kept
} catch {
  fail('the database URL password is not correctly encoded');
}

const refs = [];
// Exact Supabase pooler form only: aws-<pool number>-<AWS region>.pooler.supabase.com.
// Any other name under .pooler.supabase.com (e.g. "anything.pooler.supabase.com" or extra
// subdomain levels) is refused.
const POOLER_HOST = /^aws-\d{1,2}-[a-z]{2,}(?:-[a-z]+)+-\d{1,2}\.pooler\.supabase\.com$/;
const pooler = POOLER_HOST.test(host);
const direct = host.match(/^db\.([a-z0-9]{20})\.supabase\.co$/);

if (pooler) {
  const m = username.match(/^postgres\.([a-z0-9]{20})$/);
  if (!m) fail('pooler URL username is not of the form postgres.<project-ref>');
  refs.push(m[1]);
} else if (direct) {
  refs.push(direct[1]);
  const m = username.match(/^postgres\.([a-z0-9]{20})$/);
  if (m) refs.push(m[1]);
} else {
  fail('the database host is not a Supabase pooler or direct database host');
}

if (refs.some((r) => r !== expectedRef)) fail('the project ref in the database URL does NOT match SUPABASE_DEV_PROJECT_REF');

console.log(`Cloud target preflight passed: database URL belongs to the declared development project (${pooler ? 'session pooler' : 'direct connection'}).`);
