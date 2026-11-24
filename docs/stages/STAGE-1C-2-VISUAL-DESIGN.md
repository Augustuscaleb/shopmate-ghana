# Stage 1C-2 visual design system and motion

**Status (24 Nov 2026): proposal for owner review; foundation partly implemented in increment 1 (uncommitted).** The direction is approved in principle (decision 58). **Spec 08 ([08-visual-design.md](../product-specification/08-visual-design.md)) is the governing design specification**: this page applies and refines it, and where they differ, spec 08 wins until the owner approves a change. No business rule, calculation, API, security behaviour or screen scope changes for a visual effect, and no figures or sample business data are invented.

**Not visually tested.** No screenshots exist: this environment has no Android emulator or web renderer, and the owner hasn't seen increment 1 on a phone yet (§8).

How to read this page: §2 – §3 describe what **is implemented** in the code; §4 lists **proposed rules** not yet applied; §6 lists **deferred** items; §7 records **implementation differences** from spec 08; §8 lists what **needs the phone**.

## 1. Direction (proposed)

A calm, modern business-and-money app: white cards on warm white, one clear green action per screen, big tabular numbers, colour always backed by a word (spec 08 §3, §8). Movement is quick and purposeful (it confirms, orients or shows progress), never decorative; it must feel fast on a low-cost Android phone and readable in sunlight.

## 2. Tokens — implemented (`app/src/ui/theme.ts`)

The spec 08 tokens already in the code are unchanged; increment 1 **added** `tint`, `neutral`, `onGreenMuted` and `radius`.

| Group | Values in the code | Source |
|---|---|---|
| Brand | `shopGreen #0B6B4F`, `deepGreen #084C38`, `marketGold #F4B400` (dark text only) | spec 08 §3 |
| Surfaces | `warmWhite #FAF8F3` (screen), `surface #FFFFFF` (card), `sand #E4DFD5` (borders), **`tint #E3F3EA`** (selected and success backgrounds; was a local constant) | spec 08 §3 |
| Text | `ink #1C1B19`, `stone #5A5550`, **`onGreenMuted #D9EDE3`** (text on the green header; was a literal) | spec 08 §3 |
| Semantic | `ok #1E7F4F`; `warnText #8A5300` on `warnBg #FFF4D6`; `danger #B42318` on `dangerBg #FDECEA`; **`neutral #6B6B6B`** | spec 08 §3 |
| Type (sp) | `keyFigure 32`, `title 22`, `section 18`, `body 16`, `caption 14` (never smaller) | spec 08 §4 |
| Spacing (dp) | `xs 4`, `sm 8`, `md 16`, `lg 24`, `xl 32` | spec 08 §5 |
| Radius (dp) | **`sm 8`, `md 12`, `lg 16`, `pill 999`** | `md 12` = spec 08 cards; see §7 for `lg` |
| Touch (dp) | `min 48`, `primaryButton 56` | spec 08 §5 |
| Motion (`ui/motion.ts`) | `instant 0`, `quick 120`, `standard 200`, `emphasis 280` ms, `pulse 900` ms loop, `pressScale 0.97`, `riseDistance 8` dp; ease-out cubic | this page |
| Stock states (`ui/stockStatus.ts`, D-6) | OK "In stock" (ok on tint); Low "Low" (warning); Out "Out of stock" (danger); Negative "Negative" (danger); `stock_qty <= low_stock_level` as on the server | owner decision D-6 |

## 3. Components and behaviours — implemented in increment 1

| Item | What it does now | Where it is used |
|---|---|---|
| `PressableScale` (`ui/animated.tsx`) | Scales to 0.97 on press over 120 ms and back; the caller's layout style stays on the pressable. **No scaling under reduced motion.** | Today's quick-action tiles; the five tab-bar items |
| `FadeIn` | Fades in and rises 8 dp over 200 ms when it first appears or when its key changes. Never starts because the setting changed; snaps to the final state under reduced motion, or when motion becomes reduced mid-entrance | Content of each tab (keyed by tab) |
| `Skeleton` | Sand block with a 900 ms opacity pulse; static under reduced motion; hidden from screen readers | Today's revenue figure and three stat values on first load (the stats announce "loading") |
| Shared reduce-motion state (`ui/reducedMotionState.ts`, `ui/useReducedMotion.ts`) | One native check and one native subscription for the whole app; **reduced until the setting is known**; reduced if the check fails; removed when unused (§5) | All of the above |
| Five-tab bar | Today · Sell · Products · Customers · More; icon and word on every tab; the selected tab gets a tint pill and a bold green label (**switches without animation**) | Home screen |
| Offline banner | Grey (`#EDECEA`) with a 4 dp `neutral` left border, shown on Today only after a genuine network failure | Today |
| Icons | Existing hand-drawn line icons plus new `PeopleIcon` and `MenuIcon`; always with a word | Tab bar, previews |

Unchanged from before increment 1: `Button`, `Field`, `Choice`, `Notice`, `Loading` (`ui/components.tsx`), the dashboard's cards, empty and error states.

## 4. Proposed rules — not yet applied

| Rule | Status |
|---|---|
| Touch feedback (scale) on every tappable element, including `Button` and list rows | Proposed; only tiles and tabs have it |
| Cards and modals fade and rise on first appearance; no bounce | Proposed; no modals exist yet |
| Success: a short tint flash and check mark on confirmation cards (280 ms) | Proposed; **not implemented** |
| Changing figures and stock indicators cross-fade to the new value (never counting through invented numbers) | Proposed; **not implemented** |
| Animated selected-tab state | Proposed; **not implemented** |
| Only opacity and transform are animated, on the native driver; no layout animation on long lists; nothing runs while idle | Followed by every implemented component |

## 5. Reduced motion — implemented, with known limits

- **API used:** React Native's `AccessibilityInfo.isReduceMotionEnabled()` once, then one `reduceMotionChanged` subscription, shared by the whole app.
- **Android behaviour** (React Native 0.88, `AccessibilityInfoModule.kt`): reports "reduce motion" only when `Settings.Global.TRANSITION_ANIMATION_SCALE` is exactly 0. A content observer watches that setting while the app is in the foreground and re-reads it on every resume, so a change made while the app was in the background is picked up on return.
- **Detected:** Accessibility → "Remove animations" (sets the system animation scales to 0); also Developer options → "Transition animation scale: off".
- **Not detected (documented limitation):** partial scales such as 0.5, a developer setting that turns off only the animator duration scale, and manufacturer-specific options (for example Samsung's "Reduce animations"). **Not verified on any device.**
- **Behaviour when reduced (or not yet known):** entrances snap, the skeleton pulse stops, and touch feedback doesn't scale.
- **Tested:** the shared state (`ui/reducedMotionState.test.ts`: starts reduced, one check and one listener, notifications, a newer event beats an older answer, a failed check stays reduced, clean-up and re-check) and the pure rules (`ui/motion.test.ts`). The React components themselves aren't rendered in tests (no React Native test renderer): typecheck and bundle only.

## 6. Deferred components and behaviours

| Item | When |
|---|---|
| `Card`, `StatusChip`, `EmptyState` shared components | Increment 2 (first list screens), using §2 tokens |
| Touch feedback on `Button`, `Field`, `Choice` rows | With the first screen that needs it; props unchanged |
| Success flash; figure cross-fades; animated selected tab | When a screen needs them (from increment 2) |
| Stock-state chips on screens | Increment 2 (S-30) using `stockStatus.ts` |
| Adoption in existing auth and onboarding screens | Gradually, only where tested behaviour doesn't change |

## 7. Implementation differences from spec 08 (recorded, not approved replacements)

| Spec 08 | Current code | Status |
|---|---|---|
| Cards: 12 dp radius | The Home screen's cards and action tiles use **16 dp** (predates increment 1) | Difference; spec 08 governs |
| No heavy shadows (1 dp border) | The Home screen's cards and tiles use **elevation 2** with a faint shadow (predates increment 1) | Difference; spec 08 governs |

**Recommended alignment (for later screen work, not done in this correction):**
- New screens from increment 2 use spec 08: `radius.md` (12 dp) and a 1 dp Sand border with no elevation.
- The Home screen is aligned in one small, separately reviewed change, when the shared `Card` component replaces its local card style. That keeps the dashboard's appearance consistent and avoids unrelated visual changes now.
- `radius.lg` (16 dp) stays for large hero surfaces only, if the owner approves.

## 8. Needs verification on the phone

- The five-tab bar at 100 % and 130 % font size (labels fit, no clipping).
- Smoothness of the tile and tab press feedback, the tab fade-in and the skeleton pulse on a low-cost Android phone.
- Accessibility → "Remove animations" on: no fades, scaling or pulsing; turning it on or off while the app is open, and while it is in the background.
- The offline banner after a real connection loss, and that it clears after reconnecting and pulling to refresh.
- Android back: overlay, then Today, then leaving the app; More and Log out.
- The KI-1 cold-start re-check on the installed build.

## 9. Dependencies

None added. React Native 0.88's built-in `Animated`, `Easing` and `AccessibilityInfo` are used. No animation library (for example Reanimated) is installed or proposed; adding one would need a compatibility and bundle-size check and the owner's approval first.
