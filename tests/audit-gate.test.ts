/**
 * Dependency audit gate (scripts/audit-gate.mjs). Uses fixture audit reports,
 * fixture published-version lists and a fake installed package tree in a
 * temporary folder. The exit-status tests put a FAKE `npm` executable first on
 * PATH so the gate really spawns "npm audit"; the real npm, the npm registry and
 * the network are never used.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const EXEMPT = 'GHSA-fc5q-39xc-vjpf';
const BEFORE_EXPIRY = '2026-11-20T12:00:00Z';
const root = mkdtempSync(join(tmpdir(), 'audit-gate-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

type Via = { source: number; name: string; title: string; url: string; severity?: unknown; range: string };
const advisory = (id: string, name: string, severity: unknown, range: string, source: number): Via => ({
  source, name, title: `${name} test advisory`, url: `https://github.com/advisories/${id}`, severity, range,
});
const picomatch = (severity = 'high', range = '<=4.0.7') => advisory(EXEMPT, 'picomatch', severity, range, 1247710);
const otherHigh = advisory('GHSA-aaaa-bbbb-cccc', 'left-pad', 'high', '<1.4.0', 1);
const moderate = advisory('GHSA-g3hv-75wg-m249', 'minimatch', 'moderate', '>=7.0.0 <11.0.1', 2);

/**
 * An installed copy of picomatch in the fixture project. `content` is the raw
 * package.json text; null means npm lists the copy but it is absent on disk.
 */
type Copy = { node: string; content: string | null };
const copy = (node: string, version: unknown, name = 'picomatch'): Copy => ({ node, content: JSON.stringify({ name, version }) });
const DEFAULT_PICOMATCH_COPIES = [copy('node_modules/picomatch', '4.0.7')];
// Matches the approval snapshot: the newest stable release of every major line on 17 Nov 2026
const PUBLISHED = { picomatch: ['1.0.0', '1.2.0', '2.3.1', '2.3.2', '3.0.1', '3.0.2', '4.0.6', '4.0.7'] };
const RANK: Record<string, number> = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

/** Builds a fixture project (installed copies, audit report, published versions). */
function fixture(vias: Via[], { published = PUBLISHED, copies = DEFAULT_PICOMATCH_COPIES }: { published?: Record<string, string[]>; copies?: Copy[] } = {}) {
  const dir = join(root, `case-${++n}`);
  mkdirSync(dir, { recursive: true });
  const vulnerabilities: Record<string, unknown> = {};
  for (const via of vias) {
    // A repeated advisory for the same package goes into that package's existing "via" list, in order
    // and, as npm does, the entry's severity becomes the highest of its advisories
    const existing = vulnerabilities[via.name] as { via: Via[]; severity: unknown } | undefined;
    if (existing) {
      existing.via.push(via);
      if ((RANK[String(via.severity)] ?? -1) > (RANK[String(existing.severity)] ?? -1)) existing.severity = via.severity;
      continue;
    }
    const pkgCopies = via.name === 'picomatch' ? copies : [copy(`node_modules/${via.name}`, '1.0.0', via.name)];
    for (const c of pkgCopies) {
      if (c.content === null) continue;
      mkdirSync(join(dir, c.node), { recursive: true });
      writeFileSync(join(dir, c.node, 'package.json'), c.content);
    }
    vulnerabilities[via.name] = { name: via.name, severity: via.severity, isDirect: false, via: [via], effects: [], range: via.range, nodes: pkgCopies.map((c) => c.node), fixAvailable: false };
  }
  // A dependent package, as npm lists it: "via" holds only a name, which is not an advisory,
  // and its severity is that of the entry it refers to
  if (vias.length > 0) {
    const target = vulnerabilities[vias[0].name] as { severity: unknown };
    vulnerabilities.dependent = { name: 'dependent', severity: target.severity, via: [vias[0].name], effects: [], nodes: ['node_modules/dependent'] };
  }
  writeFileSync(join(dir, 'audit.json'), JSON.stringify({ auditReportVersion: 2, vulnerabilities, metadata: {} }));
  writeFileSync(join(dir, 'published.json'), JSON.stringify(published));
  return dir;
}

let n = 0;
/** Runs the gate on a fixture project built by fixture(). */
function runGate(dir: string, now = BEFORE_EXPIRY) {
  const r = spawnSync('node', ['scripts/audit-gate.mjs', dir, '--audit-file', join(dir, 'audit.json'), '--published-file', join(dir, 'published.json'), '--now', now], { encoding: 'utf8' });
  return { code: r.status, output: `${r.stdout}${r.stderr}` };
}
function gate(vias: Via[], { now = BEFORE_EXPIRY, published = PUBLISHED, copies = DEFAULT_PICOMATCH_COPIES }: { now?: string; published?: Record<string, string[]>; copies?: Copy[] } = {}) {
  return runGate(fixture(vias, { published, copies }), now);
}
/** Adds an extra report entry (as npm does for another package) whose "via" holds the given advisory. */
function addEntry(dir: string, name: string, via: Via) {
  editReport(dir, (report) => {
    report.vulnerabilities[name] = { name, severity: via.severity, via: [via], effects: [], nodes: [`node_modules/${name}`] };
  });
}
/** Changes a fixture's audit report in place. */
function editReport(dir: string, change: (report: any) => void) {
  const file = join(dir, 'audit.json');
  const report = JSON.parse(readFileSync(file, 'utf8'));
  change(report);
  writeFileSync(file, JSON.stringify(report));
}

/**
 * Runs the gate WITHOUT --audit-file, so it really spawns `npm audit --json`.
 * A fake `npm` placed first on PATH prints the fixture report and then exits with
 * the given code, or terminates itself with a signal. The gate script is
 * unchanged; only the npm it finds differs.
 */
function gateWithFakeNpm(vias: Via[], behaviour: { exit?: number; signal?: NodeJS.Signals; noNpm?: boolean }) {
  const dir = fixture(vias);
  const bin = join(dir, 'fake-bin');
  mkdirSync(bin, { recursive: true });
  const fake = join(bin, 'fake-npm.mjs');
  writeFileSync(fake, [
    "import { readFileSync } from 'node:fs';",
    `if (process.argv[2] !== 'audit') process.exit(97);`,
    `process.stdout.write(readFileSync(${JSON.stringify(join(dir, 'audit.json'))}, 'utf8'));`,
    behaviour.signal ? `process.kill(process.pid, ${JSON.stringify(behaviour.signal)});` : `process.exitCode = ${behaviour.exit ?? 0};`,
  ].join('\n'));
  writeFileSync(join(bin, 'npm'), `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`, { mode: 0o755 });
  writeFileSync(join(bin, 'npm.cmd'), `@"${process.execPath}" "${fake}" %*\r\n`);
  // With noNpm, PATH holds only an empty folder: no npm can be found at all
  const pathDir = behaviour.noNpm ? join(dir, 'empty-bin') : bin;
  mkdirSync(pathDir, { recursive: true });
  const r = spawnSync(process.execPath, ['scripts/audit-gate.mjs', dir, '--published-file', join(dir, 'published.json'), '--now', BEFORE_EXPIRY], {
    encoding: 'utf8',
    env: { ...process.env, PATH: pathDir },
  });
  return { code: r.status, output: `${r.stdout}${r.stderr}` };
}

describe('Dependency audit gate (SEC-42, ADV-002)', () => {
  it('passes temporarily when the only high advisory is the approved picomatch one', () => {
    const r = gate([picomatch()]);
    expect(r.code).toBe(0);
    expect(r.output).toContain('TEMPORARY EXCEPTION until 2026-12-17');
  });

  it('fails on any other high advisory', () => {
    const r = gate([otherHigh]);
    expect(r.code).toBe(1);
    expect(r.output).toContain('GHSA-aaaa-bbbb-cccc');
  });

  it('fails when the approved advisory appears together with another high advisory', () => {
    const r = gate([picomatch(), otherHigh]);
    expect(r.code).toBe(1);
    expect(r.output).toContain('GHSA-aaaa-bbbb-cccc');
  });

  it('fails when the approved advisory becomes critical', () => {
    const r = gate([picomatch('critical')]);
    expect(r.code).toBe(1);
    expect(r.output).toContain('now CRITICAL');
  });

  it('fails from the expiry date (00:00 UTC on 17 Dec 2026), not before', () => {
    expect(gate([picomatch()], { now: '2026-12-16T23:59:59Z' }).code).toBe(0);
    const r = gate([picomatch()], { now: '2026-12-17T00:00:00Z' });
    expect(r.code).toBe(1);
    expect(r.output).toContain('expired on 2026-12-17');
  });

  it('fails when a newer picomatch release exists while an affected version is still installed', () => {
    // (each list is the complete approval snapshot plus one extra release)
    const withExtra = (v: string) => ({ picomatch: [...PUBLISHED.picomatch, v] });
    const r = gate([picomatch()], { published: withExtra('4.0.8') });
    expect(r.code).toBe(1);
    expect(r.output).toContain('stable releases not in the approval snapshot (4.0.8)');
    expect(r.output).toContain('4.0.7 at node_modules/picomatch');
    // A backport on the older major line also counts, and so does a new major line
    expect(gate([picomatch()], { published: withExtra('2.3.3') }).output).toContain('not in the approval snapshot (2.3.3)');
    expect(gate([picomatch()], { published: withExtra('5.0.0') }).output).toContain('not in the approval snapshot (5.0.0)');
    // Pre-releases are ignored
    expect(gate([picomatch()], { published: withExtra('4.0.8-beta.1') }).code).toBe(0);
  });

  it('validates the registry response against the approval snapshot', () => {
    // A valid, complete snapshot passes, including alongside well-formed pre-release and build-tagged versions
    expect(gate([picomatch()], { published: PUBLISHED }).code).toBe(0);
    expect(gate([picomatch()], { published: { picomatch: [...PUBLISHED.picomatch, '4.0.8-beta.1', '4.0.8-rc.2.x', '4.0.7+build.5'] } }).code).toBe(0);
    // A pre-release-only response has no stable versions
    const pre = gate([picomatch()], { published: { picomatch: ['4.0.8-beta.1', '5.0.0-rc.1'] } });
    expect(pre.code).toBe(1);
    expect(pre.output).toContain('lists no stable versions');
    // Malformed entries are rejected, not silently dropped, even alongside a complete snapshot
    for (const bad of ['', ' ', 'latest', '4.0', 'v4.0.7', '4.0.7 ', '04.0.7x', '1.2.3.4']) {
      const r = gate([picomatch()], { published: { picomatch: [...PUBLISHED.picomatch, bad] } });
      expect(r.code, JSON.stringify(bad)).toBe(1);
      expect(r.output, JSON.stringify(bad)).toContain('malformed entries');
    }
    // Strict SemVer 2.0.0: leading zeroes in major/minor/patch or in numeric pre-release identifiers, and
    // empty identifiers, are malformed
    for (const bad of ['01.2.3', '1.02.3', '1.2.03', '00.0.0', '1.2.3-01', '1.2.3-00', '1.2.3-alpha.01', '1.2.3-0.01', '1.2.3-', '1.2.3+', '1.2.3-alpha..1', '1.2.3+build..1', '1.2.3-alpha_1']) {
      const r = gate([picomatch()], { published: { picomatch: [...PUBLISHED.picomatch, bad] } });
      expect(r.code, JSON.stringify(bad)).toBe(1);
      expect(r.output, JSON.stringify(bad)).toContain('malformed entries');
    }
    // Valid pre-release and build metadata is accepted (and, not being stable, ignored by the release check)
    const validNonStable = ['1.2.3-0', '1.2.3-0.1.2', '1.2.3-alpha.0', '1.2.3-0alpha', '1.2.3-alpha-1', '1.2.3-x.7.z.92', '1.2.3--', '1.2.3+001', '1.2.3+exp.sha.5114f85', '1.2.3-rc.1+build.01', '10.20.30-beta'];
    const okPre = gate([picomatch()], { published: { picomatch: [...PUBLISHED.picomatch, ...validNonStable] } });
    expect(okPre.code).toBe(0);
    // Valid stable versions, including 0 components, are accepted as versions (then caught by the release check, not as malformed)
    for (const good of ['0.0.0', '10.20.30', '4.0.10']) {
      const r = gate([picomatch()], { published: { picomatch: [...PUBLISHED.picomatch, good] } });
      expect(r.code, good).toBe(1);
      expect(r.output, good).toContain(`not in the approval snapshot (${good})`);
      expect(r.output, good).not.toContain('malformed entries');
    }
    for (const bad of [null, 4, {}, []]) {
      const r = gate([picomatch()], { published: { picomatch: [...PUBLISHED.picomatch, bad] } as unknown as Record<string, string[]> });
      expect(r.code, JSON.stringify(bad)).toBe(1);
      expect(r.output, JSON.stringify(bad)).toContain('malformed entries');
    }
    // Every approved snapshot version must be present; a missing one fails (truncated or wrong response)
    for (const missing of ['1.2.0', '2.3.2', '3.0.2', '4.0.7']) {
      const r = gate([picomatch()], { published: { picomatch: PUBLISHED.picomatch.filter((v) => v !== missing) } });
      expect(r.code, missing).toBe(1);
      expect(r.output, missing).toContain(`missing approved snapshot versions (${missing})`);
    }
  });

  it('cannot overlook a new release on ANY major line, including old or unrecorded ones', () => {
    // The approval snapshot itself passes: 1.2.0, 2.3.2, 3.0.2 and 4.0.7 are the newest per line
    expect(gate([picomatch()], { published: PUBLISHED }).code).toBe(0);
    for (const extra of ['1.2.1', '3.0.3', '3.1.0']) {
      const r = gate([picomatch()], { published: { picomatch: [...PUBLISHED.picomatch, extra] } });
      expect(r.code, extra).toBe(1);
      expect(r.output).toContain(`stable releases not in the approval snapshot (${extra})`);
    }
    // A major line absent from the snapshot fails whether it is below or above the recorded lines
    for (const unrecorded of ['0.1.0', '6.0.0']) {
      const r = gate([picomatch()], { published: { picomatch: [...PUBLISHED.picomatch, unrecorded] } });
      expect(r.code, unrecorded).toBe(1);
      expect(r.output).toContain(unrecorded);
    }
  });

  it('fails on a missing or unrecognised severity instead of treating it as harmless', () => {
    for (const severity of [undefined, 'severe', 'HIGH', '', 3, null]) {
      // On the exempt advisory itself, and on any other advisory
      // (built directly: picomatch(undefined) would fall back to its 'high' default)
      expect(gate([advisory(EXEMPT, 'picomatch', severity, '<=4.0.7', 1247710)]).code, `picomatch ${String(severity)}`).toBe(1);
      const r = gate([advisory('GHSA-qqqq-rrrr-ssss', 'other', severity, '<2.0.0', 5)]);
      expect(r.code, `other ${String(severity)}`).toBe(1);
      expect(r.output).toContain('missing or unrecognised severity');
    }
    // npm's own low and info values keep following the existing policy (listed, not failing)
    expect(gate([advisory('GHSA-llll-llll-llll', 'other', 'low', '<2.0.0', 6)]).code).toBe(0);
    expect(gate([advisory('GHSA-iiii-iiii-iiii', 'other', 'info', '<2.0.0', 7)]).code).toBe(0);
  });

  it('cannot hide a critical duplicate of the exempt advisory behind a high one, in either order', () => {
    for (const order of [[picomatch('high'), picomatch('critical')], [picomatch('critical'), picomatch('high')]]) {
      const r = gate(order);
      expect(r.code).toBe(1);
      expect(r.output).toContain('now CRITICAL');
    }
    // A critical copy filed under a different package's entry is rejected as malformed (npm never does this)
    for (const first of ['aaa-first', 'zzz-last']) {
      const dir = fixture([picomatch('high')]);
      addEntry(dir, first, picomatch('critical'));
      const r = runGate(dir);
      expect(r.code, first).toBe(1);
      expect(r.output, first).toContain('names a different package than its entry');
    }
    // A duplicate that disagrees on the vulnerable range cannot match the exception
    const ranges = gate([picomatch('high', '<=4.0.7'), picomatch('high', '<=4.0.6')]);
    expect(ranges.code).toBe(1);
    expect(ranges.output).toContain('vulnerable range changed');
    // An exact, consistent duplicate still passes
    expect(gate([picomatch('high'), picomatch('high')]).code).toBe(0);
    // A moderate duplicate of a high advisory without an exception still fails
    expect(gate([advisory('GHSA-mmmm-nnnn-oooo', 'other', 'moderate', '<2.0.0', 8), advisory('GHSA-mmmm-nnnn-oooo', 'other', 'high', '<2.0.0', 8)]).code).toBe(1);
  });

  it('validates the audit report structure and rejects malformed entries instead of skipping them', () => {
    const malformed = (change: (report: { vulnerabilities: Record<string, any> }) => void, expected: string) => {
      const dir = fixture([picomatch()]);
      editReport(dir, change);
      const r = runGate(dir);
      expect(r.code, expected).toBe(1);
      expect(r.output, expected).toContain(expected);
      expect(r.output).not.toContain('TEMPORARY EXCEPTION');
    };
    // "vulnerabilities" must be a plain object
    malformed((rep) => { (rep as any).vulnerabilities = []; }, 'unrecognised npm audit report format');
    malformed((rep) => { (rep as any).vulnerabilities = [rep.vulnerabilities.picomatch]; }, 'unrecognised npm audit report format');
    malformed((rep) => { (rep as any).vulnerabilities = 'picomatch'; }, 'unrecognised npm audit report format');
    // Each entry
    malformed((rep) => { rep.vulnerabilities.extra = null; }, 'vulnerability entry "extra" is not an object');
    malformed((rep) => { rep.vulnerabilities.extra = ['picomatch']; }, 'vulnerability entry "extra" is not an object');
    malformed((rep) => { rep.vulnerabilities.picomatch.name = 'other'; }, 'has a "name" that does not match its key');
    malformed((rep) => { delete rep.vulnerabilities.picomatch.severity; }, 'missing or unrecognised severity');
    malformed((rep) => { rep.vulnerabilities.picomatch.severity = 'urgent'; }, 'missing or unrecognised severity');
    // Its "via" list
    malformed((rep) => { delete rep.vulnerabilities.picomatch.via; }, 'missing or empty "via" list');
    malformed((rep) => { rep.vulnerabilities.picomatch.via = []; }, 'missing or empty "via" list');
    malformed((rep) => { rep.vulnerabilities.picomatch.via = 'picomatch'; }, 'missing or empty "via" list');
    malformed((rep) => { rep.vulnerabilities.picomatch.via.push(null); }, 'neither an advisory object nor a package name');
    malformed((rep) => { rep.vulnerabilities.picomatch.via.push(42); }, 'neither an advisory object nor a package name');
    malformed((rep) => { rep.vulnerabilities.picomatch.via.push(['x']); }, 'neither an advisory object nor a package name');
    malformed((rep) => { rep.vulnerabilities.dependent.via = ['']; }, 'is an empty package name');
    malformed((rep) => { rep.vulnerabilities.dependent.via = ['  ']; }, 'is an empty package name');
    malformed((rep) => { rep.vulnerabilities.dependent.via = ['not-in-report']; }, 'which is not an entry in the report');
    // Advisory objects
    malformed((rep) => { delete rep.vulnerabilities.picomatch.via[0].source; }, 'no integer "source"');
    malformed((rep) => { rep.vulnerabilities.picomatch.via[0].source = '1247710'; }, 'no integer "source"');
    malformed((rep) => { delete rep.vulnerabilities.picomatch.via[0].url; }, 'missing "url" or "range"');
    malformed((rep) => { delete rep.vulnerabilities.picomatch.via[0].range; }, 'missing "url" or "range"');
    malformed((rep) => { delete rep.vulnerabilities.picomatch.via[0].severity; }, 'missing or unrecognised severity');
    // Legitimate dependent-package entries (names only) and a chain of them still pass
    const dir = fixture([picomatch()]);
    editReport(dir, (rep) => { rep.vulnerabilities.chain = { name: 'chain', severity: 'high', via: ['dependent', 'picomatch'], effects: [], nodes: ['node_modules/chain'] }; });
    expect(runGate(dir).code).toBe(0);
  });

  it('requires each entry\'s severity to match the highest severity of its advisories and dependencies', () => {
    const inconsistent = (change: (report: { vulnerabilities: Record<string, any> }) => void, vias = [picomatch()]) => {
      const dir = fixture(vias);
      editReport(dir, change);
      const r = runGate(dir);
      expect(r.code).toBe(1);
      expect(r.output).toContain('inconsistent report');
    };
    // A critical top-level severity cannot sit on a lower ("high") advisory, on the exempt entry or a dependent
    inconsistent((rep) => { rep.vulnerabilities.picomatch.severity = 'critical'; });
    inconsistent((rep) => { rep.vulnerabilities.dependent.severity = 'critical'; });
    // Nor the other way round: a lower top-level severity than its advisories
    inconsistent((rep) => { rep.vulnerabilities.picomatch.severity = 'moderate'; });
    inconsistent((rep) => { rep.vulnerabilities.dependent.severity = 'low'; });
    // With duplicates, the entry must carry the highest one
    inconsistent((rep) => { rep.vulnerabilities.picomatch.severity = 'high'; rep.vulnerabilities.dependent.severity = 'high'; }, [picomatch('high'), picomatch('critical')]);
    // Consistent reports pass, including a moderate entry with a moderate dependent
    expect(gate([picomatch()]).code).toBe(0);
    expect(gate([moderate]).code).toBe(0);
  });

  it('rejects unsafe installed locations and accepts legitimate nested node_modules paths', () => {
    const unsafe = [
      '/etc/picomatch',                         // absolute (POSIX)
      'C:\\Users\\picomatch',                   // absolute (Windows drive)
      'C:picomatch',                            // Windows drive-relative
      '\\\\server\\share\\picomatch',           // Windows UNC path
      '../node_modules/picomatch',              // traversal before node_modules
      'node_modules/../../picomatch',           // traversal out of the project
      'node_modules/picomatch/../../..',        // traversal at the end
      'node_modules\\..\\..\\picomatch',        // traversal with Windows separators
      'node_modules/./picomatch',               // "." segment
      'node_modules//picomatch',                // empty segment
      'lib/picomatch',                          // not under node_modules
      'node_modules',                           // node_modules itself, not a package
      '',                                       // empty
      '   ',                                    // blank
      'node_modules/pico\0match',               // NUL byte
    ];
    for (const node of unsafe) {
      // Never written to disk (content null): only the location is under test
      const r = gate([picomatch()], { copies: [copy('node_modules/picomatch', '4.0.7'), { node, content: null }] });
      expect(r.code, JSON.stringify(node)).toBe(1);
      expect(r.output).not.toContain('TEMPORARY EXCEPTION');
    }
    // Absolute locations are rejected by the absolute-path rule itself, not only by the node_modules rule
    for (const node of ['/etc/picomatch', 'C:\\Users\\picomatch', 'C:picomatch', '\\\\server\\share\\picomatch', '/node_modules/picomatch']) {
      const r = gate([picomatch()], { copies: [{ node, content: null }] });
      expect(r.code, JSON.stringify(node)).toBe(1);
      expect(r.output, JSON.stringify(node)).toContain('absolute installed location');
    }
    // A real, valid picomatch outside node_modules is still rejected by the node_modules rule
    const lib = gate([picomatch()], { copies: [copy('lib/picomatch', '4.0.7')] });
    expect(lib.code).toBe(1);
    expect(lib.output).toContain('outside node_modules');
    // Traversal is rejected by the segment rule, with its own message
    for (const node of ['node_modules/../../picomatch', 'node_modules\\..\\..\\picomatch', 'node_modules/./picomatch']) {
      expect(gate([picomatch()], { copies: [{ node, content: null }] }).output, JSON.stringify(node)).toContain('"." or ".." segments');
    }
    // A location that is a symbolic link to a folder outside the project fails, even with a valid package inside
    const outside = join(root, `outside-${++n}`);
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'package.json'), JSON.stringify({ name: 'picomatch', version: '4.0.7' }));
    const dir = fixture([picomatch()], { copies: [{ node: 'node_modules/linked', content: null }] });
    mkdirSync(join(dir, 'node_modules'), { recursive: true });
    symlinkSync(outside, join(dir, 'node_modules', 'linked'), 'dir');
    const linked = runGate(dir);
    expect(linked.code).toBe(1);
    expect(linked.output).toContain('outside the project after following links');
    // Legitimate nested and scoped locations pass
    const nested = gate([picomatch()], {
      copies: [copy('node_modules/@expo/cli/node_modules/picomatch', '4.0.7'), copy('node_modules/a/node_modules/b/node_modules/picomatch', '2.3.2')],
    });
    expect(nested.code).toBe(0);
    expect(nested.output).toContain('2.3.2 at node_modules/a/node_modules/b/node_modules/picomatch');
  });

  it('fails when the advisory\'s vulnerable range changes (for example after a patch)', () => {
    const r = gate([picomatch('high', '<4.0.8')]);
    expect(r.code).toBe(1);
    expect(r.output).toContain('vulnerable range changed');
  });

  it('matches the exact advisory ID and package only', () => {
    // Same package, different advisory
    expect(gate([advisory('GHSA-zzzz-zzzz-zzzz', 'picomatch', 'high', '<=4.0.7', 9)]).code).toBe(1);
    // Same advisory ID reported for a different package
    expect(gate([advisory(EXEMPT, 'micromatch', 'high', '<=4.0.7', 1247710)]).code).toBe(1);
  });

  it('keeps the existing policy for moderate advisories: listed, not failing', () => {
    const only = gate([moderate]);
    expect(only.code).toBe(0);
    expect(only.output).toContain('GHSA-g3hv-75wg-m249 (minimatch, moderate): below the failing level');
    expect(gate([moderate, picomatch()]).code).toBe(0);
    expect(gate([moderate, otherHigh]).code).toBe(1);
  });

  it('checks every installed copy independently against the approved range', () => {
    const three = [copy('node_modules/expo/node_modules/picomatch', '4.0.7'), copy('node_modules/picomatch', '2.3.2'), copy('node_modules/tinyglobby/node_modules/picomatch', '4.0.7')];
    const ok = gate([picomatch()], { copies: three });
    expect(ok.code).toBe(0);
    for (const c of ['4.0.7 at node_modules/expo/node_modules/picomatch', '2.3.2 at node_modules/picomatch', '4.0.7 at node_modules/tinyglobby/node_modules/picomatch']) {
      expect(ok.output).toContain(c);
    }
    // One copy outside the approved "<=4.0.7", even though npm reports it as affected: fails
    const bad = gate([picomatch()], { copies: [three[0], three[1], copy('node_modules/tinyglobby/node_modules/picomatch', '4.0.8')] });
    expect(bad.code).toBe(1);
    expect(bad.output).toContain('node_modules/tinyglobby/node_modules/picomatch is 4.0.8, outside the approved range');
  });

  it('fails when an installed copy is missing, unreadable, mislabelled or has an invalid version', () => {
    const cases: Copy[] = [
      { node: 'node_modules/picomatch', content: null },                 // listed by npm, absent on disk
      { node: 'node_modules/picomatch', content: '{ not valid json' },    // unreadable package.json
      copy('node_modules/picomatch', undefined),                           // no version
      copy('node_modules/picomatch', '4.0.7-beta.1'),                      // not a plain x.y.z version
      copy('node_modules/picomatch', 4),                                   // not a string
      copy('node_modules/picomatch', '4.0.7', 'not-picomatch'),            // a different package at that location
    ];
    for (const bad of cases) {
      const r = gate([picomatch()], { copies: [copy('node_modules/expo/node_modules/picomatch', '4.0.7'), bad] });
      expect(r.code, JSON.stringify(bad)).toBe(1);
    }
    // npm lists no copies at all
    expect(gate([picomatch()], { copies: [] }).code).toBe(1);
    // Non-canonical versions with leading zeroes fail closed, instead of being read as 4.0.7
    for (const version of ['04.0.7', '4.00.7', '4.0.07', '004.0.7']) {
      const r = gate([picomatch()], { copies: [copy('node_modules/expo/node_modules/picomatch', '4.0.7'), copy('node_modules/picomatch', version)] });
      expect(r.code, version).toBe(1);
      expect(r.output, version).toContain('the installed copy at node_modules/picomatch has a missing or invalid version');
    }
    // Valid canonical versions keep working, including 0 components
    expect(gate([picomatch()], { copies: [copy('node_modules/picomatch', '4.0.7'), copy('node_modules/x/node_modules/picomatch', '4.0.0'), copy('node_modules/y/node_modules/picomatch', '2.3.2')] }).code).toBe(0);
  });

  it.skipIf(process.platform === 'win32')('accepts npm audit exit codes 0 and 1 and fails closed on anything else', () => {
    // 0: no vulnerabilities; 1: vulnerabilities found. Both are judged on the JSON report
    expect(gateWithFakeNpm([], { exit: 0 }).code).toBe(0);
    expect(gateWithFakeNpm([picomatch()], { exit: 1 }).code).toBe(0);
    expect(gateWithFakeNpm([otherHigh], { exit: 1 }).code).toBe(1);
    // Any other exit code fails, even with a valid report
    for (const exit of [2, 3, 127, 255]) {
      const r = gateWithFakeNpm([picomatch()], { exit });
      expect(r.code, `exit ${exit}`).toBe(1);
      expect(r.output).toContain(`npm audit failed with exit code ${exit}`);
    }
    // Termination by a signal fails
    for (const signal of ['SIGKILL', 'SIGTERM'] as const) {
      const r = gateWithFakeNpm([picomatch()], { signal });
      expect(r.code, signal).toBe(1);
      expect(r.output).toContain(`terminated by signal ${signal}`);
    }
    // npm cannot be run at all
    const missing = gateWithFakeNpm([picomatch()], { noNpm: true });
    expect(missing.code).toBe(1);
    expect(missing.output).toContain('could not run npm audit');
  });

  it('passes with no advisories and fails closed on unusable input', () => {
    expect(gate([]).code).toBe(0);
    // The registry lookup must succeed for the exception to apply
    expect(gate([picomatch()], { published: {} as { picomatch: string[] } }).code).toBe(1);
    const dir = join(root, 'broken');
    mkdirSync(dir, { recursive: true });
    for (const [file, body] of [['error.json', '{"error":{"code":"ENOAUDIT"}}'], ['format.json', '{"auditReportVersion":1}'], ['text.json', 'not json']]) {
      writeFileSync(join(dir, file), body);
      const r = spawnSync('node', ['scripts/audit-gate.mjs', dir, '--audit-file', join(dir, file), '--now', BEFORE_EXPIRY], { encoding: 'utf8' });
      expect(r.status, file).toBe(1);
    }
  });
});
