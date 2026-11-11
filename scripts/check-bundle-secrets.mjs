#!/usr/bin/env node
// App bundle secret scan (TC-SEC-05, bundle part): the compiled Android bundle must
// contain the public URL it was built with, and NO service-role/secret keys or DB passwords.
// Usage: node scripts/check-bundle-secrets.mjs <export-dir> <expected-public-url>
// Optional: BUNDLE_DENY_VALUES="value1,value2" exact secret values that must not appear
// (e.g. the service-role and secret keys of the stack the tests run against).
// Note: Hermes bytecode stores strings back-to-back, so prefix-only matches (like the
// literal "sb_secret_" that supabase-js itself contains) are not treated as leaks.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [dir, expectedUrl] = process.argv.slice(2);
if (!dir || !expectedUrl) {
  console.error('usage: check-bundle-secrets.mjs <export-dir> <expected-public-url>');
  process.exit(2);
}

const files = [];
(function walk(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    statSync(p).isDirectory() ? walk(p) : files.push(p);
  }
})(dir);

const rules = [
  { name: 'JWT whose payload says role=service_role', test: (t) => [...t.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)]
      .some((m) => { try { return JSON.parse(Buffer.from(m[1], 'base64url').toString()).role === 'service_role'; } catch { return false; } }) },
  { name: 'Supabase secret key (sb_secret_ followed by a random key)', test: (t) => [...t.matchAll(/sb_secret_([A-Za-z0-9_-]{20,64})/g)]
      .some((m) => /\d/.test(m[1]) && /[a-z]/.test(m[1]) && /[A-Z]/.test(m[1])) },
  { name: 'Database URL with password', test: (t) => /postgres(?:ql)?:\/\/[^:\s'"]+:[^@\s'"]+@/.test(t) },
  { name: 'Private key block', test: (t) => /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t) },
];

const denyValues = (process.env.BUNDLE_DENY_VALUES ?? '').split(',').map((v) => v.trim()).filter((v) => v.length >= 16);
let sawUrl = false;
const findings = [];
for (const f of files) {
  const text = readFileSync(f).toString('latin1'); // works for JS and Hermes bytecode string tables
  if (text.includes(expectedUrl)) sawUrl = true;
  for (const r of rules) if (r.test(text)) findings.push(`${f}: ${r.name}`);
  for (const v of denyValues) if (text.includes(v)) findings.push(`${f}: exact match of a denied secret value (${v.slice(0, 6)}…)`);
}

if (!sawUrl) {
  console.error(`Control failed: expected public URL "${expectedUrl}" not found in bundle, so the scan cannot be trusted.`);
  process.exit(1);
}
if (findings.length) {
  console.error('Secrets found in app bundle:\n' + findings.join('\n'));
  process.exit(1);
}
console.log(`Bundle secret scan passed: ${files.length} files; public URL present; ${denyValues.length} denied secret values absent; no service-role JWTs, secret keys, DB passwords or private keys.`);
