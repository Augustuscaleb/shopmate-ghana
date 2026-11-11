# Dependency advisories log

How we handle known vulnerabilities in third-party packages (SEC-42).

**Policy:**
- **High or critical** advisories fail CI (`npm audit --audit-level=high`, in both `/` and `/app`) and must be fixed or explicitly risk-accepted by the owner before merging.
- **Moderate or low** advisories are recorded here, assessed, and reviewed at least **monthly** and at every Expo SDK upgrade.
- **Never** run `npm audit fix --force` on the app. It can install incompatible Expo or React Native versions. Expo packages are upgraded together with `npx expo install --fix` (decision approved 11 November 2026).
- Dependabot opens weekly update proposals; Expo SDK packages are excluded from automatic proposals and upgraded deliberately.

## Open advisories

### ADV-001: `minimatch` denial of service (3 npm audit entries, one underlying issue)

| Field | Value |
|---|---|
| Advisory | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249): "minimatch has potential denial of service via globparts amplification", affected `>=7.0.0 <11.0.1` |
| Severity | Moderate |
| Where | `app/` only (root project: 0 advisories). Chain: `expo@58.0.24` → `@expo/fingerprint@0.21.10` → `minimatch@10.2.6` |
| Why npm shows 3 | npm lists the vulnerable package (`minimatch`) and each package that depends on it (`@expo/fingerprint`, `expo`). It is a single issue |
| npm's suggested fix | Install `expo@52.0.49`: a **downgrade of six SDK versions**, incompatible with the project. Rejected |
| Exposure assessment | `@expo/fingerprint` is a **build-time tool** that runs on the developer's computer or CI to fingerprint project files. It is not bundled into the app that runs on shop owners' phones. The glob patterns it processes come from the project's own configuration, not from users or the network. A malicious pattern would require control of our repository |
| Risk | **Low in practice** (build-time only; no untrusted input) |
| Decision | Accept temporarily; do not force upgrades; adopt Expo's patched release when available |
| First recorded | 11 November 2026 (Stage 1A) |
| Next review | At the next Expo SDK patch release, and no later than 11 December 2026 |
| Status | 🟡 Open, monitored |

## Review history

| Date | Root | App | Notes |
|---|---|---|---|
| 2026-11-11 | 0 | 3 moderate (ADV-001) | Recorded at Stage 1A; CI high/critical gate added in Stage 1B |

## Dependabot proposals (for the owner's decision; Claude does not merge)

| PR | Proposal | Assessment |
|---|---|---|
| [#1](https://github.com/Augustuscaleb/shopmate-ghana/pull/1) | `actions/setup-node` 4 → 7 | Reasonable: removes GitHub's Node.js 20 deprecation warning. Merge only if its CI run passes |
| [#2](https://github.com/Augustuscaleb/shopmate-ghana/pull/2) | `actions/checkout` 4 → 7 | Same as #1 |
| [#3](https://github.com/Augustuscaleb/shopmate-ghana/pull/3) | `@types/node` 22 → 26 | **Not recommended**: we run Node 22. Future major proposals are now ignored |
| [#4](https://github.com/Augustuscaleb/shopmate-ghana/pull/4) | TypeScript 6 → 7 in `/app` | **Not recommended**: Expo SDK 58 pins TypeScript ~6.0.3. Now ignored; TypeScript moves with Expo SDK upgrades |
