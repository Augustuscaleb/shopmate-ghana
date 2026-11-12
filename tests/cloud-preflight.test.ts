/**
 * Cloud-verification preflight (scripts/check-cloud-target.mjs).
 * Fake refs and passwords only, assembled at runtime so the repository secret
 * scan never sees a credential-shaped literal.
 */
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const REF = 'abcdefghijklmnopqrst';            // fake project ref (20 chars)
const OTHER = 'zyxwvutsrqponmlkjihg';          // a different fake ref
const PASSWORD = ['Fake', 'Pass', 'w0rd', 'Xy9'].join('');
const join = (...p: string[]) => p.join('');
const poolerUrl = (ref: string) =>
  join('postgresql://postgres.', ref, ':', PASSWORD, '@aws-0-eu-north-1.pooler.supabase.com:5432/postgres');
const directUrl = (ref: string) => join('postgresql://postgres:', PASSWORD, '@db.', ref, '.supabase.co:5432/postgres');

function preflight(dbUrl: string | undefined, ref: string | undefined) {
  const env: Record<string, string> = { PATH: process.env.PATH ?? '' };
  if (dbUrl !== undefined) env.SUPABASE_DB_URL = dbUrl;
  if (ref !== undefined) env.SUPABASE_DEV_PROJECT_REF = ref;
  const r = spawnSync('node', ['scripts/check-cloud-target.mjs'], { env, encoding: 'utf8' });
  const output = `${r.stdout}${r.stderr}`;
  // Nothing sensitive may ever be printed, whatever the outcome
  for (const secret of [PASSWORD, REF, OTHER, dbUrl ?? '\u0000', ...hostAndUser(dbUrl)]) {
    expect(output.includes(secret), 'output must not reveal secrets').toBe(false);
  }
  return { code: r.status, output };
}

/**
 * Host name, raw username, decoded username and raw password of the test URL,
 * when it can be parsed. The plain username "postgres" is excluded: it is a standard,
 * non-secret name that also appears in the script's fixed messages (e.g. "postgres:// URL").
 */
function hostAndUser(dbUrl: string | undefined): string[] {
  if (!dbUrl) return [];
  let u: URL;
  try { u = new URL(dbUrl); } catch { return []; }
  const values = [u.hostname, u.username, u.password];
  try { values.push(decodeURIComponent(u.username)); } catch { /* malformed: raw form already listed */ }
  return values.filter((v) => v && v !== 'postgres');
}

const pooledAt = (host: string, ref: string) =>
  join('postgresql://postgres.', ref, ':', PASSWORD, '@', host, ':5432/postgres');

describe('Cloud target preflight', () => {
  it('TC-CLOUD-00e: passes when the pooler URL username carries the declared project ref', () => {
    const r = preflight(poolerUrl(REF), REF);
    expect(r.code).toBe(0);
    expect(r.output).toMatch(/preflight passed/);
  });

  it('TC-CLOUD-00f: passes for a direct-connection URL of the declared project', () => {
    expect(preflight(directUrl(REF), REF).code).toBe(0);
  });

  it('TC-CLOUD-00g: refuses when the database URL belongs to a different project', () => {
    const pooled = preflight(poolerUrl(OTHER), REF);
    const direct = preflight(directUrl(OTHER), REF);
    expect(pooled.code).toBe(1);
    expect(direct.code).toBe(1);
    expect(pooled.output).toMatch(/does NOT match/);
  });

  it('TC-CLOUD-00h: refuses missing, malformed or non-Supabase values', () => {
    expect(preflight(undefined, REF).code).toBe(1);
    expect(preflight(poolerUrl(REF), undefined).code).toBe(1);
    expect(preflight('not a url', REF).code).toBe(1);
    expect(preflight(poolerUrl(REF), 'Not-A-Ref').code).toBe(1);
    expect(preflight(join('postgresql://postgres.', REF, ':', PASSWORD, '@evil.example.com:5432/postgres'), REF).code).toBe(1);
    expect(preflight(join('mysql://postgres.', REF, ':', PASSWORD, '@aws-0-eu-north-1.pooler.supabase.com:5432/x'), REF).code).toBe(1);
    expect(preflight(join('postgresql://postgres:', PASSWORD, '@aws-0-eu-north-1.pooler.supabase.com:5432/postgres'), REF).code).toBe(1);
  });

  it('TC-CLOUD-00i: a password with URL-encoded special characters is handled and never printed', () => {
    const encoded = join('postgresql://postgres.', REF, ':', encodeURIComponent(PASSWORD + '@#/?'), '@aws-0-eu-north-1.pooler.supabase.com:5432/postgres');
    expect(preflight(encoded, REF).code).toBe(0);
  });

  it('TC-CLOUD-00j: accepts legitimate pooler hostnames across AWS regions and pool numbers', () => {
    for (const host of [
      'aws-0-eu-north-1.pooler.supabase.com',
      'aws-1-eu-north-1.pooler.supabase.com',
      'aws-0-eu-west-2.pooler.supabase.com',
      'aws-0-us-east-1.pooler.supabase.com',
      'aws-1-ap-southeast-1.pooler.supabase.com',
      'aws-0-ca-central-1.pooler.supabase.com',
      'aws-0-sa-east-1.pooler.supabase.com',
    ]) {
      expect(preflight(pooledAt(host, REF), REF).code, host).toBe(0);
    }
  });

  it('TC-CLOUD-00k: rejects unexpected hostnames under (or imitating) pooler.supabase.com', () => {
    for (const host of [
      'evil.pooler.supabase.com',                         // arbitrary subdomain
      'aws-0-eu-north-1.evil.pooler.supabase.com',        // extra level
      'x.aws-0-eu-north-1.pooler.supabase.com',           // extra leading level
      'aws-a-eu-north-1.pooler.supabase.com',             // pool number not numeric
      'aws-0-eu-north.pooler.supabase.com',               // region without number
      'aws-0-eunorth1.pooler.supabase.com',               // region not in AWS form
      'gcp-0-eu-north-1.pooler.supabase.com',             // not the aws- form
      'aws-0-eu-north-1.pooler.supabase.com.evil.com',    // look-alike suffix
      'aws-0-eu-north-1.pooler-supabase.com',             // look-alike domain
    ]) {
      const r = preflight(pooledAt(host, REF), REF);
      expect(r.code, host).toBe(1);
      expect(r.output, host).toMatch(/not a Supabase pooler or direct database host/);
    }
  });

  it('TC-CLOUD-00l: rejects a valid pooler hostname whose username carries a different project ref', () => {
    const r = preflight(pooledAt('aws-0-eu-north-1.pooler.supabase.com', OTHER), REF);
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/does NOT match/);
  });

  it('TC-CLOUD-00m: rejects a direct connection whose username ref differs from the host ref', () => {
    // host belongs to the declared project, username names another project
    const userMismatch = join('postgresql://postgres.', OTHER, ':', PASSWORD, '@db.', REF, '.supabase.co:5432/postgres');
    // username names the declared project, host belongs to another project
    const hostMismatch = join('postgresql://postgres.', REF, ':', PASSWORD, '@db.', OTHER, '.supabase.co:5432/postgres');
    for (const u of [userMismatch, hostMismatch]) {
      const r = preflight(u, REF);
      expect(r.code).toBe(1);
      expect(r.output).toMatch(/does NOT match/);
    }
  });

  it('TC-CLOUD-00n: rejects malformed URL-encoded credentials', () => {
    const host = '@aws-0-eu-north-1.pooler.supabase.com:5432/postgres';
    const badUser = join('postgresql://postgres.', REF, '%ZZ:', PASSWORD, host);       // invalid escape in username
    const badUser2 = join('postgresql://postgres.', REF, '%E0%A4:', PASSWORD, host);   // truncated UTF-8 in username
    const badPass = join('postgresql://postgres.', REF, ':', PASSWORD, '%ZZ', host);   // invalid escape in password
    const badPass2 = join('postgresql://postgres.', REF, ':', PASSWORD, '%E0%A4', host); // truncated UTF-8 in password
    const badPass3 = join('postgresql://postgres.', REF, ':', PASSWORD, '%', host);    // lone percent sign
    for (const [u, part] of [[badUser, 'username'], [badUser2, 'username'], [badPass, 'password'], [badPass2, 'password'], [badPass3, 'password']] as const) {
      const r = preflight(u, REF);
      expect(r.code, part).toBe(1);
      expect(r.output, part).toMatch(new RegExp(`${part} is not correctly encoded`));
    }
  });

  it('TC-CLOUD-00o: direct connection accepts only "postgres" or postgres.<matching-ref> as the username', () => {
    const directAs = (user: string, hostRef: string) =>
      join('postgresql://', user, ':', PASSWORD, '@db.', hostRef, '.supabase.co:5432/postgres');
    // accepted
    expect(preflight(directAs('postgres', REF), REF).code).toBe(0);
    expect(preflight(directAs(join('postgres.', REF), REF), REF).code).toBe(0);
    // unexpected usernames refused with the fixed message
    for (const user of ['admin', 'postgres_admin', 'Postgres', join('postgres.', REF, 'x'), 'postgres.short']) {
      const r = preflight(directAs(user, REF), REF);
      expect(r.code, user).toBe(1);
      expect(r.output, user).toMatch(/direct-connection URL username is not "postgres" or postgres\.<project-ref>/);
    }
    // a valid-format but different project ref in the username is refused
    const other = preflight(directAs(join('postgres.', OTHER), REF), REF);
    expect(other.code).toBe(1);
    expect(other.output).toMatch(/does NOT match/);
  });
});
