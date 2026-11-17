#!/usr/bin/env node
// Dependency audit gate (SEC-42; docs/security/DEPENDENCY-ADVISORIES.md).
//
// Same policy as `npm audit --audit-level=high`: any HIGH or CRITICAL advisory
// fails. Moderate, low and info advisories are listed but do not fail (they are
// tracked in the advisories log). An advisory whose severity is missing or is not
// one of npm's five values fails. The only difference from npm audit is a short
// list of owner-approved, time-limited exceptions, each matched by its exact
// advisory ID AND package name. An exception stops applying, and the gate fails,
// when:
//   - its expiry date is reached,
//   - the advisory's severity becomes critical,
//   - the advisory's vulnerable range changes from the approved one, or
//   - the package's published stable releases differ from the snapshot taken at
//     approval (see RELEASE POLICY below): a possible patch, so upgrade or have
//     the owner re-approve.
// Every installed copy npm lists is read and checked independently against the
// approved range, after its location has been validated. The audit report's
// structure is validated entry by entry (see validateReportStructure), including
// severity consistency, and the registry's version list is validated against the
// approval snapshot (see publishedVersions). Anything the gate cannot verify (npm
// exit code other than 0 or 1, termination by a signal, npm error, unknown or
// malformed report, malformed or incomplete registry response, a missing,
// unreadable, out-of-range or out-of-project installed copy) also fails. It never
// passes by default.
//
// RELEASE POLICY (newer-release check). `approvedLatestByMajor` records the
// newest stable release of EVERY major line published when the exception was
// approved. A published stable release (x.y.z, no pre-release tag) fails the
// gate if its major line is not in the snapshot at all, or if it is newer than
// the snapshot's latest for that line. So a release on any line, old or new,
// cannot be overlooked. Pre-release versions (e.g. 4.0.8-beta.1) are not
// considered.
//
// Usage:  node scripts/audit-gate.mjs <project-dir>
// Test-only options (used by tests/audit-gate.test.ts with fixture files):
//   --audit-file <json>      npm audit --json output, instead of running npm audit
//   --published-file <json>  { "<package>": ["1.0.0", ...] }, instead of the npm registry
//   --now <ISO date>         the current time, instead of the system clock

import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';

/** Owner-approved exceptions. Add or extend only with the owner's written approval. */
const EXCEPTIONS = [
  {
    id: 'GHSA-fc5q-39xc-vjpf',
    package: 'picomatch',
    approvedRange: '<=4.0.7',
    // Newest stable release of every major line on the npm registry when the
    // exception was approved (17 Nov 2026). See RELEASE POLICY above.
    approvedLatestByMajor: { 1: '1.2.0', 2: '2.3.2', 3: '3.0.2', 4: '4.0.7' },
    approvedOn: '2026-11-17',
    expires: '2026-12-17', // the gate fails from 00:00 UTC on this date
    record: 'ADV-002 in docs/security/DEPENDENCY-ADVISORIES.md',
  },
];

/** npm's severity values, lowest to highest. Anything else is rejected. */
const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const FAILING_RANK = SEVERITY_RANK.high;
const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const GHSA = /(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})$/;

function parseArgs(argv) {
  const opts = { project: undefined, auditFile: undefined, publishedFile: undefined, now: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--audit-file') opts.auditFile = argv[++i];
    else if (a === '--published-file') opts.publishedFile = argv[++i];
    else if (a === '--now') opts.now = argv[++i];
    else if (!opts.project) opts.project = a;
    else throw new Error(`unexpected argument "${a}"`);
  }
  if (!opts.project) throw new Error('missing project directory');
  return opts;
}

function compareVersions(a, b) {
  const pa = STABLE.exec(a).slice(1).map(Number);
  const pb = STABLE.exec(b).slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/**
 * True when `version` (x.y.z) satisfies every comparator in `range`, e.g. "<=4.0.7"
 * or ">=7.0.0 <11.0.1". Only these simple forms are supported; anything else
 * (|| alternatives, wildcards, pre-releases) throws, so the gate fails closed.
 */
function satisfiesRange(version, range) {
  if (!STABLE.test(version)) throw new Error(`"${version}" is not a plain x.y.z version`);
  const comparators = String(range).trim().split(/\s+/);
  return comparators.every((c) => {
    const m = /^(<=|>=|<|>|=)?(\d+\.\d+\.\d+)$/.exec(c);
    if (!m) throw new Error(`unsupported version range "${range}"`);
    const cmp = compareVersions(version, m[2]);
    switch (m[1] ?? '=') {
      case '<=': return cmp <= 0;
      case '<': return cmp < 0;
      case '>=': return cmp >= 0;
      case '>': return cmp > 0;
      default: return cmp === 0;
    }
  });
}

function runNpm(args, cwd) {
  const r = spawnSync('npm', args, { cwd, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`could not run npm ${args[0]}: ${r.error.message}`);
  if (r.signal) throw new Error(`npm ${args[0]} was terminated by signal ${r.signal}`);
  if (typeof r.status !== 'number') throw new Error(`npm ${args[0]} ended without an exit code`);
  return r;
}

function loadAudit(opts, projectDir) {
  let text;
  if (opts.auditFile) {
    text = readFileSync(opts.auditFile, 'utf8');
  } else {
    const r = runNpm(['audit', '--json'], projectDir);
    // 0 = no vulnerabilities, 1 = vulnerabilities found (the JSON report decides). Anything else is an npm failure.
    if (r.status !== 0 && r.status !== 1) throw new Error(`npm audit failed with exit code ${r.status}`);
    text = r.stdout;
  }
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    throw new Error('npm audit did not return valid JSON');
  }
  if (report.error) throw new Error(`npm audit reported an error (${report.error.code ?? 'unknown'})`);
  if (report.auditReportVersion !== 2 || !isPlainObject(report.vulnerabilities)) {
    throw new Error('unrecognised npm audit report format (expected auditReportVersion 2 with a "vulnerabilities" object)');
  }
  validateReportStructure(report.vulnerabilities);
  return report;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

const nonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * Structural check of every vulnerability entry, matching how npm (auditReportVersion 2)
 * builds the report. Anything malformed throws, so the gate fails instead of skipping it:
 *   - each entry is a plain object whose "name" equals its key and whose "severity" is
 *     one of npm's five values;
 *   - "via" is a non-empty array whose items are either advisory objects (plain objects
 *     with an integer "source", a "name" equal to the entry's key, string "url" and
 *     "range", and a known "severity") or non-empty package names that are themselves
 *     entries in the report (npm's references to a vulnerable dependency);
 *   - SEVERITY CONSISTENCY: the entry's severity equals the highest severity among its
 *     "via" items (advisory objects, and the entries that package names refer to), so a
 *     critical top-level severity can't sit on top of lower advisory severities, and vice versa.
 */
function validateReportStructure(vulnerabilities) {
  const knownSeverity = (s) => Object.hasOwn(SEVERITY_RANK, s);
  for (const [key, entry] of Object.entries(vulnerabilities)) {
    const where = `vulnerability entry ${JSON.stringify(key)}`;
    if (!isPlainObject(entry)) throw new Error(`${where} is not an object`);
    if (entry.name !== key) throw new Error(`${where} has a "name" that does not match its key`);
    if (!knownSeverity(entry.severity)) throw new Error(`${where} has a missing or unrecognised severity ${JSON.stringify(entry.severity)}`);
    if (!Array.isArray(entry.via) || entry.via.length === 0) throw new Error(`${where} has a missing or empty "via" list`);
    let highest = -1;
    entry.via.forEach((via, i) => {
      const item = `${where}, via[${i}]`;
      if (typeof via === 'string') {
        if (!nonEmptyString(via)) throw new Error(`${item} is an empty package name`);
        const target = vulnerabilities[via];
        if (!Object.hasOwn(vulnerabilities, via) || !isPlainObject(target)) throw new Error(`${item} refers to ${JSON.stringify(via)}, which is not an entry in the report`);
        if (!knownSeverity(target.severity)) throw new Error(`${item} refers to an entry with a missing or unrecognised severity`);
        highest = Math.max(highest, SEVERITY_RANK[target.severity]);
        return;
      }
      if (!isPlainObject(via)) throw new Error(`${item} is neither an advisory object nor a package name`);
      if (!Number.isInteger(via.source)) throw new Error(`${item} has no integer "source"`);
      if (via.name !== key) throw new Error(`${item} names a different package than its entry`);
      if (typeof via.url !== 'string' || typeof via.range !== 'string') throw new Error(`${item} has a missing "url" or "range"`);
      if (!knownSeverity(via.severity)) throw new Error(`${item} has a missing or unrecognised severity ${JSON.stringify(via.severity)}`);
      highest = Math.max(highest, SEVERITY_RANK[via.severity]);
    });
    if (SEVERITY_RANK[entry.severity] !== highest) {
      throw new Error(`${where} has severity "${entry.severity}", but its advisories and dependencies add up to "${Object.keys(SEVERITY_RANK)[highest]}" (inconsistent report)`);
    }
  }
}

/**
 * A strict SemVer 2.0.0 version string (the expression suggested by semver.org):
 * major.minor.patch with no leading zeroes (0 itself is allowed); an optional
 * pre-release of dot-separated identifiers, where numeric identifiers have no
 * leading zeroes; and optional build metadata (any non-empty dot-separated
 * [0-9A-Za-z-] identifiers, leading zeroes allowed there by the specification).
 */
const NUM = '(?:0|[1-9]\\d*)';
const PRE_ID = `(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)`;
const BUILD_ID = '[0-9A-Za-z-]+';
const VERSION = new RegExp(`^${NUM}\\.${NUM}\\.${NUM}(?:-${PRE_ID}(?:\\.${PRE_ID})*)?(?:\\+${BUILD_ID}(?:\\.${BUILD_ID})*)?$`);

/**
 * The package's published STABLE versions, from the registry (or a test file). Throws
 * (gate fails) if the response is not a non-empty list of valid version strings, if it
 * contains no stable versions, or if any version in the approval snapshot is missing
 * (a truncated, wrong or tampered response).
 */
function publishedVersions(opts, pkg, snapshot) {
  let list;
  if (opts.publishedFile) {
    list = JSON.parse(readFileSync(opts.publishedFile, 'utf8'))[pkg];
  } else {
    const r = runNpm(['view', pkg, 'versions', '--json'], process.cwd());
    if (r.status !== 0) throw new Error(`could not read published versions of ${pkg} from the npm registry`);
    try { list = JSON.parse(r.stdout); } catch { list = undefined; }
  }
  if (typeof list === 'string') list = [list];
  if (!Array.isArray(list) || list.length === 0) throw new Error(`no published versions found for ${pkg}`);
  const malformed = list.filter((v) => typeof v !== 'string' || !VERSION.test(v));
  if (malformed.length > 0) {
    throw new Error(`the registry's version list for ${pkg} contains malformed entries (${malformed.map((v) => JSON.stringify(v)).join(', ')})`);
  }
  const stable = list.filter((v) => STABLE.test(v));
  if (stable.length === 0) throw new Error(`the registry lists no stable versions of ${pkg}`);
  const missing = Object.values(snapshot).filter((v) => !stable.includes(v));
  if (missing.length > 0) {
    throw new Error(`the registry's version list for ${pkg} is missing approved snapshot versions (${missing.join(', ')})`);
  }
  return stable;
}

/** Stable releases outside the approval snapshot (see RELEASE POLICY at the top). */
function releasesNewerThanSnapshot(published, snapshot) {
  return published.filter((v) => {
    const known = snapshot[STABLE.exec(v)[1]];
    return known === undefined || compareVersions(v, known) > 0;
  });
}

/**
 * Validates an installed location reported by npm (e.g. "node_modules/a/node_modules/b")
 * and returns the absolute folder. It must be a relative path made of plain segments
 * inside node_modules, with no "." or ".." segments, and must resolve inside the
 * project, including after following symbolic links.
 */
function resolveInstalledLocation(projectDir, node) {
  if (typeof node !== 'string' || node.trim() === '' || node.includes('\0')) {
    throw new Error('npm audit listed an empty or invalid installed location');
  }
  if (isAbsolute(node) || win32.isAbsolute(node) || /^[a-zA-Z]:/.test(node)) {
    throw new Error(`npm audit listed an absolute installed location (${JSON.stringify(node)})`);
  }
  const segments = node.split(/[\\/]/);
  if (segments[0] !== 'node_modules' || segments.some((s) => s === '' || s === '.' || s === '..')) {
    throw new Error(`npm audit listed an installed location outside node_modules or with "." or ".." segments (${JSON.stringify(node)})`);
  }
  const inside = (base, target) => {
    const rel = relative(base, target);
    return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel);
  };
  const dir = resolve(projectDir, node);
  if (!inside(projectDir, dir)) throw new Error(`installed location ${JSON.stringify(node)} resolves outside the project`);
  let real;
  try {
    real = realpathSync(dir);
  } catch {
    throw new Error(`could not read the installed copy at ${node}`);
  }
  if (!inside(realpathSync(projectDir), real)) {
    throw new Error(`installed location ${JSON.stringify(node)} resolves outside the project after following links`);
  }
  return dir;
}

/**
 * Reads the actual version of EVERY installed copy npm audit lists for the package
 * and checks each one independently against the owner-approved vulnerable range
 * (not npm's reported range). Throws (gate fails) if any location is invalid or
 * outside the project, or if any copy is missing, unreadable, not the expected
 * package, has no valid version, or lies outside the approved range.
 */
function checkInstalledCopies(projectDir, entry, ex) {
  const nodes = Array.isArray(entry?.nodes) ? entry.nodes : [];
  if (nodes.length === 0) throw new Error(`npm audit listed no installed copies of ${ex.package}`);
  return nodes.map((node) => {
    const dir = resolveInstalledLocation(projectDir, node);
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    } catch {
      throw new Error(`could not read the installed copy at ${node}`);
    }
    if (pkg?.name !== ex.package) throw new Error(`the installed copy at ${node} is not ${ex.package}`);
    const version = pkg.version;
    if (typeof version !== 'string' || !STABLE.test(version)) {
      throw new Error(`the installed copy at ${node} has a missing or invalid version`);
    }
    if (!satisfiesRange(version, ex.approvedRange)) {
      throw new Error(`the installed copy at ${node} is ${version}, outside the approved range "${ex.approvedRange}"`);
    }
    return { node, version };
  });
}

/**
 * Every distinct advisory in the report, keyed by advisory ID and package (npm
 * lists dependents separately; only objects are advisories). When the same
 * advisory appears more than once, the HIGHEST severity is kept, whatever the
 * order, and any disagreement in vulnerable range is recorded so that it cannot
 * match an exception. Missing or unrecognised severities are recorded too.
 */
function collectAdvisories(report) {
  const found = new Map();
  for (const entry of Object.values(report.vulnerabilities)) {
    for (const via of entry.via ?? []) {
      if (typeof via !== 'object' || via === null) continue;
      const id = GHSA.exec(String(via.url ?? ''))?.[1] ?? `npm-advisory-${via.source}`;
      const key = `${id}|${via.name}`;
      const known = Object.hasOwn(SEVERITY_RANK, via.severity);
      const adv = found.get(key) ?? { id, name: via.name, title: via.title, rank: -1, severity: undefined, invalidSeverity: [], ranges: new Set() };
      if (!known) adv.invalidSeverity.push(via.severity === undefined ? '(missing)' : JSON.stringify(via.severity));
      else if (SEVERITY_RANK[via.severity] > adv.rank) {
        adv.rank = SEVERITY_RANK[via.severity];
        adv.severity = via.severity;
      }
      adv.ranges.add(String(via.range));
      found.set(key, adv);
    }
  }
  return [...found.values()];
}

function evaluate({ report, projectDir, opts, exceptions = EXCEPTIONS, now = new Date() }) {
  const failures = [];
  const notes = [];
  const advisories = collectAdvisories(report);
  const used = new Set();

  for (const adv of advisories) {
    const label = `${adv.id} (${adv.name}, ${adv.severity ?? 'unknown severity'})`;
    if (adv.invalidSeverity.length > 0) {
      failures.push(`${label}: missing or unrecognised severity ${adv.invalidSeverity.join(', ')}; expected one of ${Object.keys(SEVERITY_RANK).join(', ')}`);
      continue;
    }
    if (adv.rank < FAILING_RANK) {
      notes.push(`${label}: below the failing level; tracked in docs/security/DEPENDENCY-ADVISORIES.md`);
      continue;
    }
    const ex = exceptions.find((e) => e.id === adv.id && e.package === adv.name);
    if (!ex) {
      failures.push(`${label}: ${adv.title ?? 'advisory'} — not covered by any approved exception`);
      continue;
    }
    used.add(ex);
    const problems = [];
    if (now.getTime() >= Date.parse(`${ex.expires}T00:00:00Z`)) {
      problems.push(`the exception expired on ${ex.expires}`);
    }
    if (adv.severity === 'critical') problems.push('the advisory is now CRITICAL');
    const ranges = [...adv.ranges];
    if (ranges.length !== 1 || ranges[0] !== ex.approvedRange) {
      problems.push(`the vulnerable range changed from "${ex.approvedRange}" to ${ranges.map((r) => `"${r}"`).join(' and ')} (a patch may exist)`);
    }
    const newer = releasesNewerThanSnapshot(publishedVersions(opts, ex.package, ex.approvedLatestByMajor), ex.approvedLatestByMajor);
    const installed = checkInstalledCopies(projectDir, report.vulnerabilities[ex.package], ex);
    const installedText = installed.map((i) => `${i.version} at ${i.node}`).join(', ');
    if (newer.length > 0) {
      problems.push(`${ex.package} has stable releases not in the approval snapshot (${newer.join(', ')}) while affected versions remain installed (${installedText}): check whether one fixes ${ex.id}, then upgrade or have the owner re-approve`);
    }
    if (problems.length > 0) {
      failures.push(`${label}: exception no longer applies — ${problems.join('; ')}`);
    } else {
      notes.push(`${label}: TEMPORARY EXCEPTION until ${ex.expires} (${ex.record}); installed: ${installedText}`);
    }
  }

  for (const ex of exceptions) {
    if (!used.has(ex)) notes.push(`Exception ${ex.id} (${ex.package}) is not needed in this project any more; remove it once it is unused everywhere`);
  }
  return { failures, notes };
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`Dependency audit gate FAILED: ${e.message}`);
    process.exit(1);
  }
  const projectDir = resolve(opts.project);
  const now = opts.now ? new Date(opts.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    console.error('Dependency audit gate FAILED: invalid --now date');
    process.exit(1);
  }
  let result;
  try {
    result = evaluate({ report: loadAudit(opts, projectDir), projectDir, opts, now });
  } catch (e) {
    console.error(`Dependency audit gate FAILED for ${opts.project}: ${e.message}`);
    process.exit(1);
  }
  for (const n of result.notes) console.log(`  note: ${n}`);
  if (result.failures.length > 0) {
    for (const f of result.failures) console.error(`  FAIL: ${f}`);
    console.error(`Dependency audit gate FAILED for ${opts.project}: ${result.failures.length} blocking advisory problem(s).`);
    process.exit(1);
  }
  console.log(`Dependency audit gate passed for ${opts.project}: no high or critical advisories outside approved, unexpired exceptions.`);
}

main();
