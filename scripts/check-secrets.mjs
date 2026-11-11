#!/usr/bin/env node
// Secret scan (TC-SEC-05): fails if a key, token or password appears in any file
// that git would commit (tracked + untracked, excluding .gitignore'd files).
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter((f) => !/(^|\/)(package-lock\.json|node_modules\/)/.test(f))
  .filter((f) => !/\.(png|jpg|jpeg|gif|ico|webp|ttf|otf)$/i.test(f));

const rules = [
  { name: 'JSON Web Token (Supabase anon/service-role keys are JWTs)', re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'Supabase secret key', re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: 'Supabase publishable key value', re: /sb_publishable_[A-Za-z0-9_-]{10,}/ },
  { name: 'Service-role key assignment', re: /SERVICE_ROLE_KEY\s*[=:]\s*['"]?[A-Za-z0-9_.-]{20,}/ },
  { name: 'Database URL with password (non-local)', re: /postgres(?:ql)?:\/\/[^:\s'"]+:[^@\s'"]+@(?!127\.0\.0\.1|localhost)[^\s'"]+/ },
  { name: 'Private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{30,}/ },
];

const findings = [];
for (const file of files) {
  let text;
  try {
    if (statSync(file).size > 2_000_000) continue;
    text = readFileSync(file, 'utf8');
  } catch { continue; }
  text.split('\n').forEach((line, i) => {
    for (const rule of rules) if (rule.re.test(line)) findings.push(`${file}:${i + 1}  ${rule.name}`);
  });
}

if (findings.length) {
  console.error('Possible secrets found. Remove them before committing:\n' + findings.join('\n'));
  process.exit(1);
}
console.log(`Secret scan passed: ${files.length} files checked, no keys, tokens or passwords found.`);
