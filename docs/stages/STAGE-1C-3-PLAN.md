# Stage 1C-3 plan: Product Experience & Visual Redesign

**Status (26 Nov 2026, revision 11): G-1 APPROVED by the owner (25 Nov 2026) for 1C-3.1; 1C-3.1 committed in `7064d4d`, with the Edit-pencil correction (B-3) in `225044d` (CI passed); its device checks are partly done (DET-01, DET-11, DET-15 PASS on both phones). 1C-3.2 APPROVED to start by the owner (26 Nov 2026) and committed in the commit "Stage 1C-3.2: design system v2 and component gallery"; CI #69 passed (after a re-run; the first attempt failed on a CI runner port clash). **C-1b APPROVED by the owner (26 Nov 2026)** after a physical review of the gallery on both phones. **1C-3.3 APPROVED to start (26 Nov 2026), with Today, the tab bar and More brought forward from 1C-3.4 (decision B-5); committed in the commit "Stage 1C-3.3: redesign Today, navigation and Products on the v2 kit"; device checks RD-01 – RD-14 NOT TESTED.** Sign-in and onboarding remain in 1C-3.4. Spec 08 revision 2 APPROVED at C-1a (specification set 5.2) and adopted as [08-visual-design.md](../product-specification/08-visual-design.md). 1C-3.4 (sign-in, onboarding), 1C-3.5 and 1C-3.6 NOT started.** No migration, configuration, dependency or native change has been made for Stage 1C-3. Baseline: commit `75f8aa6` (Stage 1C-2 increment 2b; CI #57 passed).

**Revision 9 correction (failure handling, to match spec 08 revision 2, which governs):** after a failed refresh, the confirmed values read earlier stay on screen, marked as stale, but the average cost becomes state 4 ("no figure, not even an old one", spec 08 §9.3), so margin and Stock value (about) are hidden too. Revision 8 said only "the data is kept", which conflicted with spec 08; §5.1 and DET-06 are corrected below.

How to read this page:
- §1 records the owner's decisions.
- §2 gives the corrected device-testing status and the pre-work.
- §3 – §9 are the plan; §8.1 holds the full device checklists.
- §10 lists what still needs a decision or approval.
- §11 describes the separate future browser milestone **PW-1**.

**Naming:** **PW-1** is the browser milestone; **W-1** is only the owner's decision that schedules it.

## 1. Owner decisions (25 Nov 2026)

| # | Decision | Effect on the plan |
|---|---|---|
| P-1 | **Sequence: BEFORE.** Stage 1C-3 runs before the remaining Stage 1C-2 inventory screens | Product Details delivers the **read-only part of S-37**. The S-37 movement history and the remaining 1C-2 screens (S-33, S-34, S-35, S-36, S-38, S-39) follow Stage 1C-3 and use the new design system |
| P-2 | **Orientation: portrait AND landscape on ALL devices** (revised 25 Nov 2026): Android phones, iPhones, Android tablets, iPads | Width-responsive layouts adapt on rotation (§6). The simplest reliable route is a global orientation unlock in `app.json`, with no package (§6.3). The native change and the development-build requirement are planned in 1C-3.5. **Nothing is changed and no build is created until that increment is approved** |
| P-3 | **Cost information: AVERAGE.** Product Details shows "Average cost (about)" | Four distinct states (§5.1):
1. **current**, calculated as stock value ÷ quantity when valid;
2. **last known**, the newest `product_cost_history` row with `avg_cost` not null, only while `products.cost_known` is true;
3. **unknown**;
4. **temporarily unavailable**.

An unreliable figure is never shown as the current cost |
| P-4 | **Typography: SYSTEM.** The native system font only | No custom font, no font package, no font asset. This applies to every screen, at every system text size (§5.3) |
| P-5 | **PC and browser support: REQUIRED product direction, SEPARATE milestone** | Not built in Stage 1C-3. Defined as future milestone **PW-1 (§11)**. Stage 1C-3 only avoids blocking it. Mobile responsiveness is **not** treated as a PC experience |
| S-1 | **Safe areas: `react-native-safe-area-context` (option S-B)** | Planned for 1C-3.5 (§6.3). The package is installed only when that increment is approved, and it shares the same new development build as the orientation unlock |
| M-1 | **Margin hidden when only the last-known cost is available** | Margin is shown only for state 1, the current calculated cost (§5.1) |
| R-1 | **Browser milestone added to the master roadmap** | Done in this revision, as milestone **PW-1** in the roadmap's §2 and §3.6a |
| W-1 | **Scheduling decision: milestone PW-1 comes AFTER Stage 1C-3** | D11 (Stage 1C migrations in the cloud) must be addressed before any cross-network testing, including browser testing (§11) |
| B-3 | **Product Details Edit: a compact header pencil, not a large button** (owner design feedback, 25 Nov 2026, after the first device run of 1C-3.1). The oversized green "Edit product" bottom-bar button is removed | A pencil icon top-right in the Details header opens the same edit flow; spoken label "Edit product"; 48 dp touch target; disabled when archived, with the reason. Done in 1C-3.1 as a correction after its first device run. Amends spec 08 §5.2, §7 and §9.2 for this action only |
| B-4 | **A restrained control hierarchy; no oversized buttons** (owner, 25 Nov 2026) | A requirement for the **1C-3.2** component gallery (below). It does not change other screens before C-1b |
| B-5 | **1C-3.3 scope: Today, main navigation and Products together** (owner, 26 Nov 2026, with the C-1b approval) | 1C-3.3 redesigns the Products area AND Today, the tab bar (with every text-scaling cap removed), the More tab and the preview tabs, brought forward from 1C-3.4. Sign-in and onboarding stay in 1C-3.4 |
| B-6 | **Confirm only consequential actions** (owner, 26 Nov 2026) | Confirmation dialogs for destructive, irreversible or financially consequential actions (archive; a cost correction, which changes the recorded stock value; later voids and deletions). No prompt for navigation, viewing, opening forms or harmless reversible actions: **Restore** (product or category) now runs at once with a short message |

## 2. Device-testing status and pre-work

### 2.1 Corrected device-testing status (owner-reported; manual evidence, separate from CI)

**iPhone quick price sheet fix (commit `75f8aa6`), iPhone 13 Pro Max (iOS 27.2.1, Expo Go): 6 test scenarios, all owner-reported PASS.** The individual observations are listed under each scenario. There are six scenarios, not more.

| Scenario | Status | Observations reported |
|---|---|---|
| QPS-D1 Open "Change price" | **PASS** | The sheet appeared; the keyboard did **not** open by itself |
| QPS-D2 Tap the price field | **PASS** | The number pad opened when the field was tapped |
| QPS-D3 Use the sheet with the keyboard open | **PASS** | The sheet stayed visible and its field and buttons stayed reachable |
| QPS-D4 Save a new price | **PASS** | Saving worked |
| QPS-D5 Close the sheet | **PASS** | Cancel closed it; tapping the backdrop closed it |
| QPS-D6 About 130 % text size | **PASS** | The sheet stayed usable |

The same sheet steps on the Galaxy A06 after the fix were not reported separately; the owner reported the app working correctly on Android in general.

**Cross-device freshness (Increment 2b):**

| Scenario | Devices | Status |
|---|---|---|
| **XD-01:** a product change made on one phone appeared on the other phone without a manual refresh and without restarting the app | iPhone 13 Pro Max (Expo Go) and Samsung Galaxy A06 (Android 16), same owner account, local stack | **PASS** (owner-reported) |

The trigger that showed the change on the second phone was not recorded: returning to the app, returning to the screen, or the 15-minute refresh. Which product field changed was not recorded either.

**Two-phone checklist MD-01 – MD-18** (planned with two Android phones). Only what the evidence supports is updated:

| Check | Status | Basis |
|---|---|---|
| MD-01 sign in on both phones with the same account | **PARTIAL** | The same account was used on both phones. The device codes (A, B) were not reported |
| MD-04 a price change on phone A seen on phone B after returning to the app, with no restart | **PARTIAL** | XD-01 shows a change appearing without a manual refresh or restart. The exact MD-04 steps (switching away and back) and the "Updated" time change were not recorded |
| MD-02, MD-03, MD-05 – MD-18 | **NOT TESTED** | No specific observation reported |

Totals: 0 PASS, 2 PARTIAL, 16 NOT TESTED, 0 BLOCKED, plus XD-01 PASS recorded separately.

**Increment 2 checklist D2-01 – D2-24:** the individual statuses are **unchanged** at 9 PASS, 4 PARTIAL and 11 NOT TESTED. The new observations don't change any individual check:
- The iPhone sheet checks are a separate, iOS-specific record. They don't upgrade D2-12 (quick price change, already PASS on Android) or D2-21 (130 %, NOT TESTED; it covers several screens).
- XD-01 is cross-device evidence for Increment 2b; it doesn't upgrade D2-17 or D2-18.

**Recording:** these observations are recorded in `docs/testing/DEVICE-TEST-LOG.md`, section "Stage 1C-2 increment 2b" (QPS-D1 – QPS-D6, XD-01, and MD-01 and MD-04 PARTIAL), 25 Nov 2026 (decision L-1). The Increment 2 section of the log is unchanged.

**Automated evidence:** CI #57 passed (`75f8aa6`); locally the database had 1051 tests, the API 177 and the app 124. **Cloud verification:** none; D11 is outstanding.

### 2.2 Pre-work before Stage 1C-3 starts

| Item | Status / action | Blocks |
|---|---|---|
| iPhone quick price sheet fix | **Done:** PASS on the phone (§2.1) | — |
| Cross-device freshness basics | **XD-01 PASS**. MD-01 and MD-04 PARTIAL; the rest NOT TESTED | Recommended, not blocking: run at least MD-09 (edit form open while the other phone changes the product), MD-10 (price clash), MD-11 (category clash) and MD-15 (offline refresh failure) before 1C-3.1, because Product Details reuses that behaviour |
| D2-10 paging | NOT TESTED (only one product) | Seed 35 fictitious products with `scripts/seed-local-products.mjs` (on the owner's computer) and run D2-10 / MD-18. Recommended before 1C-3.3, which redesigns the list |
| Remaining Increment 2 checks (11 NOT TESTED, 4 PARTIAL) | Unchanged | Recommended before the screens they cover are redesigned (1C-3.3), so regressions can be told apart from old issues |
| Review-2 finding 1: the form, Cost correction and Categories screens accept an older answer after a newer one | Open | **Fixed in 1C-3.1** (shared "latest request wins" guard), before Product Details copies the pattern |
| Review-2 finding 3: duplicate first load when the app returns during the first list load | Open | **Fixed in 1C-3.1** (the same guard prevents a second load of the same thing while one is running) |
| Device-test log update with §2.1 | **Done (25 Nov 2026):** recorded in the log's increment 2b section | — |
| D11: Stage 1C migrations in the cloud | **Outstanding** | Not a 1C-3 task and no cloud change is made. It stays the prerequisite for testing on devices on **different networks**; 1C-3 testing uses the local stack on the same Wi-Fi |

## 3. The current application and its UI architecture

- **Navigation:** hand-built, with no navigation library. Five tabs in `HomeScreen.tsx`; a small stack for the Products tab (`navigation/productsStack.ts`); Android Back handled by hand.
- **Three styling generations side by side:**
  - auth and onboarding (6 screens) use `ui/components.tsx`;
  - Today (`HomeScreen.tsx`, about 650 lines) has its own styles (16 dp cards with a shadow, which differs from spec 08);
  - Products (5 screens and the price sheet) use `ui/surfaces.tsx`.
- **Tokens:** `ui/theme.ts` has a flat set of spec 08 colours, 5 type sizes, 5 spacing steps and 4 radii. There are no colour scales, no elevation or meaning-based tokens, and no shared text component.
- **Motion:** `PressableScale`, `FadeIn` and `Skeleton` on React Native's Animated API, with a shared reduced-motion state. No animation library.
- **Icons:** drawn from plain views; inconsistent stroke and size. No SVG.
- **Layout:** no width awareness (no `useWindowDimensions`, no maximum content width). Orientation is locked to portrait in `app.json`; `ios.supportsTablet` is `true`.
- **Strong foundations to keep:**
  - tested services: request IDs, expected-values concurrency, read-back of category writes, freshness and conflict handling;
  - shop isolation through row-level security and the server functions;
  - touch targets of 48 dp or more; status always given as a word, not just a colour; reduced-motion support; no heavy dependencies.

## 4. Scope and objectives

**In scope:**
1. A read-only **Product Details** screen (the read-only part of S-37) and the new flows: list → Details → Edit.
2. **Design system v2:** tokens, a system-font typography component, primitives, and a component gallery, following the approved **spec 08 revision 2** (C-1a), with the physical gallery checkpoint **C-1b** before any screen redesign.
3. The redesign applied to all existing screens: Products (all), Today, the tab bar, More/account, auth and onboarding.
4. **Responsive layouts for portrait and landscape on all devices** (phones and tablets, Android and iOS), including the planned global orientation unlock (§6).
5. Motion, micro-interactions and an accessibility pass.
6. The two Review-2 fixes (§2.2) in 1C-3.1.

**Objectives:**
- a polished, distinctive retail-management product, without behaviour regressions;
- no change to the database structure;
- no new package except `react-native-safe-area-context` (decision S-1, in 1C-3.5);
- smooth on the Galaxy A06.

**Out of scope (unless separately approved):**
- web/browser (a required direction, planned as milestone PW-1, §11); staff accounts; Realtime; offline editing beyond sales; enforcing the device limit; dark mode;
- the S-37 movement history and the remaining 1C-2 screens;
- custom fonts (P-4); native packages other than `react-native-safe-area-context` (S-1); cloud migrations (D11).

## 5. Design and behaviour

### 5.1 Product Details (1C-3.1 builds it with the current components; 1C-3.3 restyles it)

**Contents:**
- name, category, unit, selling price, average cost (about), current stock with its unit, low-stock threshold, stock status (In stock, Low, Out of stock or Negative, as a word plus a colour);
- **"Stock value (about)"** (decision V-1): current stock quantity × the current calculated average cost (unrounded, so it equals the recorded stock value). **Shown only in cost state 1; hidden in states 2, 3 and 4**;
- margin, when allowed (below);
- the "Updated hh:mm" freshness line, and an archived banner when archived.

**Average cost rules (P-3).** The cost has exactly **four states**, kept distinct in the code (a typed `CostInfo` result) and on screen. These are pure functions with automated tests:

| State | When | Shown | Label |
|---|---|---|---|
| **1. Current (calculated)** | `cost_known` and stock > 0 and stock value ≥ 0 | stock value ÷ stock, rounded half-up to the pesewa | **"Average cost (about)"** |
| **2. Last known (from history)** | Stock ≤ 0, `products.cost_known` is **true**, and a history row with `avg_cost` not null exists (rules below) | that `avg_cost`, rounded half-up to the pesewa | **"Last known average cost (about)"**, with "as of {date}" and the note "No stock now, so this is the cost when stock was last recorded" |
| **3. Unknown** | `cost_known` is false (whatever the history says); or stock ≤ 0 with no history row whose `avg_cost` is not null; or stock > 0 with stock value < 0 | **"Not known"** (no figure) | "Average cost", with the hint "Record a restock with its cost to set it" |
| **4. Temporarily unavailable** | The latest read of the figures failed (offline, timeout or a server error): the first load read the product but not its history (when the history is needed), **or any refresh failed** | **"Not available right now"** (no figure; never a guess or an older figure, **not even the figure read before the failed refresh**; spec 08 §9.3) | "Average cost", with "couldn't refresh" and Try again; the next refresh retries |

The four states always look different on screen, so a last-known, unknown or unavailable cost can never be mistaken for the current one. The same four states are used everywhere in this plan: §1, §5.1, the margin rules, the 1C-3.1 tests and the DET checklist.

"Last known" history rule (corrected after review):
- **Why the newest non-null row:** the server writes a history row for every stock movement, and sets `avg_cost` to **null** whenever the stock after the movement is 0 or below, the stock value is negative, or the cost is not known. See `private.apply_movement`, `supabase/migrations/20261123000100_inventory_helpers.sql`, the step "average only when it is meaningful". So when stock is 0 or below, the newest history row normally has `avg_cost` null. The last-known figure is therefore the newest row whose `avg_cost` **is not null**: the average the last time stock was positive and the cost known.
- **Query:** `product_cost_history` for this shop and product, `avg_cost is not null`, ordered by `effective_at` descending, then `created_at` descending, limit 1. One row, read under row-level security through `ProductsService`.
- **Used only while `products.cost_known` is still true** (read in the same refresh as the product). If `cost_known` is false, the state is "Unknown" even if an older non-null row exists.
- A row with `avg_cost` < 0 can't exist (a table check enforces `avg_cost >= 0`), and it's also guarded against.

**Margin rules:**
- **Definition: profit margin, not markup.**
  - margin amount = selling price − average cost;
  - **margin % = (selling price − average cost) ÷ selling price × 100**, rounded half-up to a whole number.

  Markup (÷ cost) is never shown and never called margin. Example: selling price GH₵ 10.00 and cost GH₵ 8.00 give a margin of GH₵ 2.00, which is **20 %**. The markup would be 25 %; it isn't shown.
- **Shown only when the underlying cost is reliable, which means state 1 (current, calculated).** Labelled **"Margin (about)"**, because the average cost is itself an estimate.
- **Hidden for states 2, 3 and 4:**
  - **State 2 (last known):** margin is **not shown** ("Margin: not shown while there is no stock"), because the selling price is current and the cost may be old (owner decision M-1).
  - **State 3 (unknown):** margin shown as "Not known".
  - **State 4 (unavailable):** margin shown as "Not available right now".
- A negative margin (cost above price) is shown with a minus sign, the danger colour and the word "Loss".
- Never labelled as profit for the period. A selling price of 0 isn't possible (the server requires at least GH₵ 0.01), but it's guarded anyway, so there is no division by zero.

**Confirmed values** (selling price, stock quantity, low-stock level) are shown without "(about)". **Estimates** always carry "(about)". A small info line explains: "Average cost is worked out from your stock value; it changes with restocks and corrections."

**Actions:**
- **Edit** is the primary action and opens the existing form.
- "Change price" opens the existing quick price sheet.
- "Correct cost price" opens the existing screen.
- Archive / Restore needs confirmation.

**States:**
- **Archived:** a banner and **Restore**. Edit, Change price and Correct cost price are disabled, with "Restore it to make changes". This matches the existing rule that archived products can't be edited.
- **Category:** archived shows "Name (archived)"; none shows "No category"; not found (shouldn't happen) shows "—".
- **Product not found or deleted:** a safe state with "Back to products".
- **Loading:** a skeleton shaped like the screen.
- **First load failed** (the product couldn't be read): an error saying the product couldn't be loaded, with Try again. No figures are shown (spec 08 §10, "Error (nothing to show)").
- **First load read the product but not its cost history** (needed only with no stock): the figures are shown; the cost is state 4 with "couldn't refresh" and Try again.
- **Refresh failed:** the confirmed values read earlier (name, category, selling price, stock, low-stock level, status) are kept, marked "Last updated hh:mm · couldn't refresh" with a "Couldn't refresh" banner saying when they are from (spec 08 §10). The **average cost becomes state 4**, with no figure, and **margin and Stock value (about) are hidden** (spec 08 §9.3, which governs). The next successful refresh restores the normal state.

**Freshness and concurrency (unchanged rules from Increment 2b):**
- Details reloads on return to the app, when shown again and every 15 minutes, and not while a save is running.
- The note "This product was changed on another device" appears only when this device has no unconfirmed request for the product.
- Edit and quick price keep the re-read, merge and expected-values (`product_changed`) protection.

### 5.2 Navigation and flows

| From | Action | To |
|---|---|---|
| List row (main area) | Tap | **Product Details** (not the form) |
| List row | "Change price" | Quick price sheet (unchanged) |
| Details | Edit | Edit form |
| Edit form | Save | Back to **Details**, refreshed, with "… saved" |
| Edit form | Cancel / Back | Back to Details |
| Details | Change price / Correct cost price | Sheet / cost screen, then back to Details |
| Details | Archive / Restore | Stays on Details, showing the new state |
| Add product | Save | **Details of the new product** (decision A-1; today it returns to the list) |
| Details | Back | **List, with search, filters, sort and scroll position kept** (the list stays mounted, as now) |

Android Back pops one screen at a time. The iOS swipe-back gesture isn't supported by the hand-built stack; its behaviour is recorded during testing and not added in 1C-3 unless approved. The `productsStack.ts` change: a `detail` route, and "saved" returns to Details when it is underneath.

### 5.3 Visual direction: "Market ledger, modern"

The goal is a calm, confident, local-feeling product, not a template and not a new coat of paint.
- **Brand roots kept from spec 08:** Shop Green, Market Gold, Warm White; readable in sunlight.
- **Colour:**
  - Green is used with restraint: primary actions, the selected tab and key accents. It is no longer the fill for every header.
  - Headers become light, with large ink titles.
  - Tonal scales: green, sand/stone neutrals, amber, red, and blue for MoMo.
  - Contrast-checked text/background pairs meet WCAG AA: 4.5:1 for text, 3:1 for large text and icons.
- **Typography (P-4, system font only):**
  - One `AppText` component with variants: display, title, heading, body, label, caption, and number (tabular figures) for money and stock.
  - It uses the platform font (Roboto on Android, San Francisco on iOS) through `fontWeight` only, with no `fontFamily` names.
  - It respects the system text size (Android font scale, iOS Dynamic Type), with no hard upper limit on body text. Text below 14 sp is never used.
  - **No text-scaling cap anywhere, including the tab bar** (owner requirement, 25 Nov 2026). Readable text never uses `maxFontSizeMultiplier` or `allowFontScaling={false}`.
    - Where large text creates a layout constraint, the layout adapts: text wraps (the tab-bar labels may take two lines); rows, buttons and bars grow; items stack; screens scroll; larger layout classes can use roomier navigation.
    - Clipping is never solved by limiting text scaling.
    - Layouts are checked at 100 %, 130 % and the largest system size.
- **Money:** a small "GH₵" prefix, then the amount in bold tabular figures. Negative amounts have a minus sign, a colour and a word.
- **Surfaces:**
  - 12 dp cards with tone and a hairline border, no list shadows (cheap on the A06);
  - 20 dp bottom sheets with a grabber;
  - pills only for chips.
- **Icons (decision I-1):** one redrawn set of lightweight custom icons on a 24 dp grid with a consistent stroke, drawn from plain views. **No SVG package in Stage 1C-3.** Any later SVG package would be a separate native-package decision.
- **Screens:**
  - **Products list:** compact light header with title and count; search at the top; category chips; Sort and Archived together in one "Filters" control; product row with name, a grey category · unit line, the price on the right in tabular figures, a status dot and word, and a quiet "Change price"; the whole row opens Details.
  - **Details:** a hero with the name, category tag and status badge, and a large selling price; stat cards for In stock (with the low-stock level), Average cost (about) and Margin (about); an info card; Edit as the primary button; secondary actions; Archive at the bottom.
  - **Edit and Add forms:** grouped sections; money fields with a "GH₵" prefix; unit chips; errors inline with an icon; a sticky Save / Cancel bar above the keyboard.
  - **Quick price sheet:** a bottom sheet with a grabber, "was GH₵ …", a large amount field and a full-width Save. It keeps the iPhone fix: bounded height, scrolling, no autofocus.
  - **Correct cost price:** a card previewing "now → about after", the reason field, then a result card with the server's figures.
  - **Categories:** a list with the product count per category **only if the counts can be fetched efficiently** (decision C-0): one grouped request, with no extra request per category and no noticeable effect on load time or on the A06. This is checked in 1C-3.3; otherwise the counts are left out. Rename and Archive per row; an archived section that can be collapsed.
  - **Today:** same content. The hero becomes a light card with the revenue figure and "Updated hh:mm"; a 2×2 tile grid; the shared card style (which resolves the spec 08 difference).
  - **Tab bar:** icon and word; a tinted pill on the selected tab with a short animation (none under reduced motion).
  - **More / account:** grouped settings rows.
  - **Auth and onboarding:** same flows and validation, on the new kit.
  - **Empty, loading and error states:** an icon in a tinted circle, a title, one sentence and one action; skeletons shaped like the content; errors saying what happened, what to do, and Try again; success as a toast.

## 6. Portrait and landscape on all devices (P-2)

### 6.1 Width classes (density-independent pixels, provisional)

React Native measures layout in **density-independent pixels (dp)**, the same unit as `useWindowDimensions` (iOS calls them points, with the same meaning). The classes are re-evaluated on every rotation and split-screen change, and are pure, unit-tested functions.

**The breakpoints are PROVISIONAL** until device testing confirms them (§6.5). They are kept in one constant so they can be tuned without touching the screens.

| Class | Width (dp) | Examples (portrait / landscape) |
|---|---|---|
| compact | < 600 | Galaxy A06 portrait (about 360 wide); iPhone 13 Pro Max portrait (428) |
| medium | 600 – 839 | Galaxy A06 landscape (about 800); small tablets in portrait |
| expanded | ≥ 840 | iPhone 13 Pro Max landscape (926); tablets in landscape; large tablets and iPads in portrait |

**Height class (needed because phones now rotate):** **short** is a height under 480 dp, for example phones in landscape (A06 about 360, iPhone 13 Pro Max 428). In short layouts:
- the screen header shrinks to one line;
- tall heroes and hero figures are reduced;
- sheets are limited to the visible height and scroll (the iPhone fix pattern);
- two panes are allowed only if each pane still scrolls.

A wide but short phone in landscape therefore doesn't get the full tablet layout.

### 6.2 Behaviour by class

| Area | compact | medium | expanded | short (any width) |
|---|---|---|---|---|
| Products list | One column | Two-column grid of cards | **List and Details side by side** (list about 40 %, minimum 320 dp) | Header one line; panes scroll |
| Product Details | Full screen | Full screen, content at most 720 dp wide and centred | Right pane; Edit opens full screen or a centred sheet (at most 640 dp) | Stats in one row; hero reduced |
| Forms, sheets | Full width | Centred, at most 640 dp | Centred, at most 640 dp | Height-limited and scrolling; Save / Cancel bar stays visible above the keyboard |
| Today | One column | Stat tiles in one row of 4; activity below | Two columns | Hero reduced; tiles in one row |
| Tab bar | Bottom bar; at large text sizes the labels wrap to two lines and the bar grows (no text-scaling cap) | Bottom bar, as compact | Bottom bar (a side rail is not planned), as compact | Bottom bar; labels wrap; the bar grows with the text and the content scrolls |
| Back | One screen | One screen | In two panes, Back from Details clears the selection first | As for the width class |

**On rotation,** state is kept: the open product, typed text, search, filters, sort and scroll position. When going from a two-pane layout to compact with a product selected, Details is shown full screen. Split-screen and multi-window (Android, iPad Split View and Slide Over) use the same classes.

### 6.3 Orientation unlock: the simplest reliable implementation (investigated; nothing changed)

**Findings:**
- **Today:** `app/app.json` has `"orientation": "portrait"` for the whole app. `ios.supportsTablet` is `true`. `expo-screen-orientation` is not installed.
- **Global unlock, no package:** setting `"orientation": "default"` (or removing the key) in `app.json` allows both orientations everywhere. When the native project is generated (EAS build / prebuild):
  - the Android activity loses its portrait lock;
  - the iOS Info.plist lists portrait and both landscape orientations for iPhone, and all four for iPad, which iPad multitasking requires.

  **No package and no run-time code is needed,** because the app doesn't need to lock or change orientation while running.
- **Android 16 and the target SDK:**
  - **Default vs actual:** the React Native version used by this project defaults to target SDK **36** (`app/node_modules/react-native/gradle/libs.versions.toml`: `targetSdk = "36"`). That's the **default**, not proof of the target in the built app, which Expo's build configuration can override. **The actual target SDK must be confirmed from the 1C-3.5 development build** (for example from the build's merged Android manifest or EAS build logs), and recorded.
  - **If the built app targets SDK 36:** on Android 16, orientation and resizability restrictions are **ignored on large screens** (smallest width 600 dp or more), so Android tablets on Android 16 may already rotate despite today's portrait lock. Phones such as the A06 (smallest width below 600 dp) are not affected; the lock still applies there. To be confirmed on a tablet.
  - **Technical context only:** Android 16 offers a **temporary** app-level opt-out from this large-screen behaviour, expected to be removed in a later Android version. It is noted for completeness; it **doesn't change** the chosen direction, which is to support landscape everywhere through the global unlock and responsive layouts, so the opt-out isn't used.
- **Expo Go:** it reads the app's orientation setting from the app configuration. It is expected to follow the new value without a new build, but this needs checking on the iPhone; Expo Go may differ from a development build. Expo Go results are therefore early checks; the final evidence comes from a development build.
- **Development build:** an orientation change alters the native project, so it takes effect in the installed Android development build only after a **new EAS development build** (profile `development`) is created and installed. That needs owner approval. An iOS development build needs an Apple Developer account and approval; otherwise iOS is tested in Expo Go only.
- **Side effects to handle in the same increment:**
  - **Safe areas in landscape (decision S-1: `react-native-safe-area-context`):** iPhones with a notch or Dynamic Island, and Android cut-outs, intrude on the left or right edge in landscape. Today the app has no safe-area library and uses fixed top and bottom allowances (`ui/layout.ts`).
    - **In 1C-3.5 the fixed allowances are removed and replaced** by real insets from the package, for the status bar, navigation bar, notch and home indicator, on all four edges, in portrait and landscape. Nothing still relies on the fixed values afterwards; the 1C-3.5 checks verify the real insets.
    - **Expo Go already includes `react-native-safe-area-context`,** so iPhone testing in Expo Go can use it as soon as the app's code does.
    - **The installed app still needs the package and a build.** The app's project must list the package as a dependency, and the Android development build must be rebuilt with it, because the current development build doesn't contain it.
    - **Version:** it must be the version compatible with the project's **Expo SDK 58** (Expo's recommended version for that SDK, normally chosen by `npx expo install`). The version is **not** chosen in this plan. It is confirmed at installation time, with 1C-3.5 approval. If Expo's version service can't be reached from the working environment (as seen earlier; IMPLEMENTATION-STATUS note 3), the install is done on the owner's computer, or with the version confirmed from Expo's SDK 58 documentation.
    - It is installed only with the increment's approval, and goes into the same new development build as the orientation unlock.
    - The dependency audit, secret scan and Android bundle check must pass after adding it.
  - **Keyboard in landscape:** the keyboard covers most of a short screen. Forms and sheets must be scrollable and keep Save / Cancel reachable; this is the iPhone fix pattern applied everywhere.

### 6.4 What can be built before the native change
All width and height layouts can be built and unit-tested first. On devices:
- **Phones:** checked by changing text size and, once unlocked, by rotating in Expo Go (iPhone).
- **Tablets:** checked in portrait, or in landscape where the Android 16 large-screen rule already allows it.

The orientation unlock itself is one configuration line, applied at the start of 1C-3.5 with approval.

### 6.5 Device testing plan (portrait and landscape)
1. **Phones (available):**
   - Galaxy A06 and iPhone 13 Pro Max in both orientations: ORI-01 – ORI-10, covering:
     - rotation on the list, Details, Edit and the price sheet;
     - typed text, scroll position and filters kept;
     - the keyboard in landscape;
     - notch and cut-out edges;
     - 130 % text;
     - Remove animations / Reduce Motion;
     - rotating 10 times on Details and Edit with no lost state, no crash and no burst of requests (refreshes stay throttled by the 30-second rule).
   - A06 in landscape needs the new development build. The iPhone is tested in Expo Go.
2. **Android tablet** (when available) with the new build: TAB-01 – TAB-12 in portrait and landscape, covering the grid, two panes, rotation, split-screen, keyboard and text size.
3. **iPad** (when available): Expo Go first, as an early check.
4. **Final iOS verification (required before the iOS release gate and before release for real-shop use):**
   - The final iPhone and iPad checks must all be completed on an approved **iOS development build or TestFlight build**, because Expo Go isn't final evidence. They are:
     - orientation in portrait and landscape;
     - safe areas (notch, Dynamic Island, home indicator);
     - the relevant release-readiness checks: the iOS runs of the DET, ORI and TAB checklists, keyboard behaviour, text size, Reduce Motion and VoiceOver, and a cold-start session restore.
   - **When:** before the **iOS release gate**, the gate at which iOS is released for **real-shop use**, and before any such release. iOS is not released for real-shop use until these checks pass. **Which gate that is (G2, or the pilot gate if iPhones take part in the pilot) is not yet decided:** owner decision **IG-1** (§10), pending evidence on whether iPhones will be in the pilot.
   - Recorded as **NOT TESTED until completed.** Stage 1C-3 itself can be accepted with this item NOT TESTED; it blocks only the iOS release.
   - **Separate approvals (decision B-2, §10):** the Apple Developer account, and the iOS build itself. They are not part of the Android build approval (B-1). **No Apple build or installation is started by this plan.**
5. **Breakpoint confirmation:** for each device, record the measured width × height in dp in both orientations, from a development-only overlay in the component gallery. Adjust the provisional breakpoints if a common device lands awkwardly near a boundary.
6. **Recording:** owner-reported PASS, PARTIAL, NOT TESTED or BLOCKED. Devices not available are recorded as NOT TESTED, never assumed.
7. **The full checklists** (ORI, TAB) are in §8.1.

## 7. Implementation sequence and acceptance criteria

Each increment is implemented only after approval, and reported for review. It is committed and pushed only with approval, and must pass CI. There is no database change and no new package, unless a §10 decision approves one.

### 1C-3.1 Product Details (functional) and the Review-2 fixes
**Status (revision 10): committed in `7064d4d` (CI #58 passed); Edit-pencil correction (B-3) in `225044d` (CI #59 passed). Device checks: DET-01, DET-11 and DET-15 PASS on both phones; the rest NOT TESTED ([device log](../testing/DEVICE-TEST-LOG.md)).**

**Delivers:**
- the `detail` route and the §5.2 flows;
- Product Details built with the current components;
- the average-cost, last-known, unknown and margin rules as pure functions (`products/costInfo.ts`), with a one-row cost-history read in `ProductsService`;
- the archived, category and not-found states;
- freshness and the unconfirmed-request check on Details;
- a shared "latest request wins" guard (`ui/useLatestRequest.ts`, or a pure helper and hook) applied to Details, the form, Cost correction and Categories (Review-2 finding 1). It also prevents a second identical load while one is running (finding 3).

**Acceptance:**
- Tapping a row opens Details, never the form directly. Back keeps the list position, search, filters and sort.
- Details shows every field in §5.1. Estimates are labelled "(about)"; confirmed values aren't.
- Edit opens the existing form. Save and Cancel return to Details (refreshed after a save). After a successful Add, the new product's read-only Details opens (A-1).
- Quick price works from the list and from Details.
- Archived: Restore is available, and changes are blocked with the reason. Not found: a safe state.
- Freshness, the change note and the `product_changed` protection behave as in Increment 2b.
- On the form, Cost correction and Categories, an older answer never replaces a newer one, and no duplicate first load happens.
- **Automated tests:**
  - **costInfo, all four states with their labels:**
    1. **Current:** stock value ÷ quantity, with rounding half-up to the pesewa.
    2. **Last known:** stock 0 or below, `cost_known` true, and the newest non-null history row is used, with its date.
    3. **Unknown:** `cost_known` false, even with an older non-null row; or stock 0 or below with only null rows or none; or stock above 0 with a negative stock value.
    4. **Unavailable:** a failed read, which never falls back to a figure.
  - **Margin:** margin % = (price − cost) ÷ price × 100, for example GH₵ 10.00 / GH₵ 8.00 gives 20 %, not 25 %; rounding; a loss when cost is above price; **shown only for state 1**; **hidden for states 2, 3 and 4**, each with its own wording; the zero-price guard.
  - **Navigation stack:** detail, edit and back flows; save returning to Details; Back.
  - **Latest-request guard:** an older answer is ignored; a duplicate load is skipped.
  - **API (local stack):**
    - the cost-history read returns the latest row only;
    - isolation: another shop reads nothing;
    - **stock-zero fallback, exact behaviour:**
      - create a product with stock and a cost, so a non-null row exists;
      - adjust the stock to 0, so the newest row has `avg_cost` null;
      - the read returns the **earlier non-null row**, giving state 2 with that average and date;
      - with `cost_known` false, the result is state 3 even though the non-null row exists;
    - a product whose history has only null `avg_cost` (created with no cost) gives state 3;
    - a failed read (simulated lost connection) gives state 4.
  - All existing suites green.
- **Devices** (A06, iPhone): DET-01 – DET-14 (§8.1), plus D2-11/12/13 and MD-09/10 again.

### 1C-3.2 Design system v2 and component gallery (no screen redesign yet)
**Status (26 Nov 2026): committed in the commit "Stage 1C-3.2: design system v2 and component gallery". GAL-01 – GAL-13 NOT TESTED; Checkpoint C-1b NOT yet approved.** Code: `app/src/ui/kit/` and `app/src/screens/dev/ComponentGallery.tsx`, reached from a development-only row in the More tab. No existing screen uses the kit yet; no package, native or configuration change.

**Delivers:**
- tokens v2 (meaning-based, with tonal scales and contrast pairs), with the old token names kept as aliases so nothing changes visually;
- `AppText` (system font, P-4);
- primitives in `ui/kit/`: Button, TextField with a money prefix, Card, ListRow, StatusBadge, Chip, Banner, Sheet (with the iPhone keyboard fix pattern), Skeleton variants, EmptyState, Toast, Stat, SectionHeader, ScreenScaffold (header, freshness line, banners, maximum-width scroll area);
- the redrawn icon set;
- `useLayout()` width and height classes (§6.1), with provisional dp breakpoints in one constant, and a development-only overlay showing the current dp size and class;
- a **component gallery** screen reachable only in development builds (`__DEV__`), for review on the A06 and the iPhone;
- the approved [spec 08 revision 2](../product-specification/08-visual-design.md) (C-1a, 25 Nov 2026) applied in the colour roles, tokens and kit;
- **the control hierarchy (owner decision B-4, 25 Nov 2026).** Oversized buttons throughout the app are undesirable; the gallery defines and shows four levels, from lightest to heaviest:
  1. **compact icon-only actions**, only where the meaning is universally clear (for example edit, close, back), always with a spoken label and a 48 dp touch target;
  2. **small text actions** where an icon alone would be ambiguous;
  3. **medium buttons** for ordinary actions;
  4. **large primary buttons** only for genuinely important actions (for example "Save product", "Save price").

  It avoids oversized buttons, excessive padding and unnecessary visual weight, so the interface feels contemporary, refined and commercially polished. Not every button becomes an icon: clarity, usability and accessibility come first. The gallery shows each level in all its states and at 100 %, 130 % and the largest text size. Which existing buttons move to which level is decided screen by screen in 1C-3.3 and 1C-3.4, after C-1b.

**Acceptance:**
- No existing screen changes appearance; all tests green.
- The four control levels (B-4) are in the gallery, each with its intended use, and no gallery control is larger or heavier than its level needs.
- Every primitive is shown in the gallery in all its states (normal, pressed, disabled, loading, error), at 100 %, 130 % and the largest text size, with reduced motion on and off.
- Contrast pairs meet WCAG AA (an automated test on the token pairs).
- System font only: an automated check finds no `fontFamily` and no font assets.
- **No text-scaling cap:** an automated check finds no `maxFontSizeMultiplier` and no `allowFontScaling={false}` in the kit and the gallery; every primitive works at the largest text size by wrapping or growing.
- The three colour corrections (V-3) are applied in the colour roles: success text `#166B3E`, input outlines `#857E74`, light header `#EEF6F1`.
- **Width- and height-class functions are unit-tested.** This includes the **short** height class:
  - below 480 dp is short; 480 dp and above isn't;
  - the A06 and the iPhone 13 Pro Max in landscape are short;
  - a wide but short screen doesn't get the two-pane layout unless each pane can scroll;
  - the class changes when width and height swap on rotation.
- The gallery scrolls smoothly on the A06 (owner observation).

### Checkpoint C-1 (decision V-4: two parts; owner approval required for each)
- **C-1a: written specification approval. APPROVED by the owner (25 Nov 2026).** Spec 08 revision 2 is adopted as [08-visual-design.md](../product-specification/08-visual-design.md), specification set revision 5.2.
- **C-1b: physical review after 1C-3.2.** The owner reviews the component gallery, the icon set and the contrast table on the **Galaxy A06 and the iPhone**, including the largest text size.

**No screen is redesigned until C-1a and C-1b are both approved.** Changes requested at C-1b go back into 1C-3.2. **C-1b: APPROVED by the owner (26 Nov 2026)** after a physical review on the Galaxy A06 and the iPhone 13 Pro Max.

### 1C-3.3 Redesign: Products area
**Status (26 Nov 2026): committed in the commit "Stage 1C-3.3: redesign Today, navigation and Products on the v2 kit". Scope per decision B-5: the Products area (list, rows, search and chips, quick price sheet, Details, Add and Edit forms, Categories, Cost correction) plus Today, the tab bar, the More tab, the account panel and the Sell and Customers previews. Confirmations per B-6. Business logic, data loading, freshness and services unchanged. Device checks RD-01 – RD-14 (§8.1) NOT TESTED.**

**Delivers:** the list, rows, Details, Add and Edit forms, quick price sheet, Categories and Cost correction on the v2 kit and approved tokens, with the empty, loading and error states (§5.3). Behaviour and wording unchanged, apart from approved changes.

**Acceptance:**
- These screens use only kit primitives and v2 tokens; an automated check finds no hard-coded colours or font sizes in them.
- The D2 and MD checks for these screens pass again on the A06 and the iPhone, and the iPhone sheet checks pass again.
- Readable at 130 % and at the largest size, with nothing clipped.
- **A06 performance:** with 35 or more seeded products, scrolling, opening Details and opening the sheet are smooth, with no visible stutter (owner observation), and there is no slower first load than at `75f8aa6`.

### 1C-3.4 Redesign: Today, tab bar, More and account, auth and onboarding
**Scope note (decision B-5, 26 Nov 2026):** Today, the tab bar, More and the account panel, and the text-scaling cap removals (tab bar, brand text, avatar, the logo and alert-icon exceptions) were delivered early in 1C-3.3. 1C-3.4 is now **sign-in and onboarding** (Welcome, Log in, Sign up, Check email, Set new password, Shop setup, Config error), plus its re-checks.

**Delivers:** those screens on the v2 kit. Today moves to the shared card (which resolves the spec 08 difference); the new tab bar. Auth validation, messages and flows unchanged.
- **Removes every existing text-scaling cap:** the tab-bar labels (`maxFontSizeMultiplier` 1.3), the "ShopMate Ghana" brand text and the avatar initials (1.2 each), all in `HomeScreen.tsx`.
- The tab-bar labels wrap to two lines and the bar grows at large sizes; the avatar circle grows with its initials.
- The logo "S" and the alert icon's "!", which currently switch scaling off, are redrawn as shapes (I-1 icon set), so no text-scaling exception remains.

**Acceptance:**
- As for 1C-3.3.
- The Increment 1 checks (D1-01 – D1-12) and the TC-DEV journey steps re-run on the A06, and a cold start on the iPhone.
- At the largest text size, the tab bar shows every label in full (wrapped if needed) on the A06 and the iPhone. No text-scaling cap or disabled scaling remains anywhere in the app (automated check).
- The KI-1 cold-start re-check on the installed build.

### 1C-3.5 Responsive layouts: portrait and landscape on all devices
**Delivers:**
- the §6.2 width- and height-class layouts on Products, Details, forms, sheets and Today;
- the two-pane products view on expanded screens that aren't short;
- state kept on rotation and in split-screen;
- landscape handling of the keyboard;
- exact safe-area insets through `react-native-safe-area-context` (decision S-1), replacing the fixed allowances in `ui/layout.ts`.
- **Only with approval at the start of this increment:**
  1. the global orientation unlock, `"orientation": "default"` in `app/app.json` (§6.3);
  2. installing `react-native-safe-area-context` (the only new package in Stage 1C-3);
  3. one approved **new EAS development build** for Android containing both, and an iOS build only if approved.

**Acceptance:**
- **Phones:**
  - portrait layouts unchanged from 1C-3.4;
  - landscape layouts on the A06 (new build) and the iPhone (Expo Go) are usable;
  - no content under the notch, cut-out or home indicator, using the real insets (S-1);
  - keyboard and forms reachable;
  - ORI-01 – ORI-10 PASS, or recorded with the reason.
- **Tablets:** medium and expanded layouts don't stretch (content has a maximum width, the grid adapts, panes resize); TAB-01 – TAB-12 run on an Android tablet with the new build, or recorded as NOT TESTED or BLOCKED. iPad results in Expo Go are recorded as early checks, not as final orientation evidence.
- Rotation and split-screen keep the selection, typed text, filters, sort and scroll position. In two panes, Back clears the selection first.
- **Unit tests:** width and height classes at the boundaries (599 / 600 / 839 / 840 wide, 479 / 480 high), column counts, pane rules, and the short-layout rules.
- **Breakpoints:** confirmed, or adjusted, from the measured device sizes (§6.5), and the adjustment recorded.
- **Android target SDK:** the actual target SDK of the new development build is confirmed and recorded (§6.3).
- **Final iOS verification:** iPhone and iPad orientation, safe areas and the relevant release-readiness checks on an approved iOS development or TestFlight build. Recorded as **NOT TESTED** until completed (§6.5, item 4). It's required before the iOS release gate and before release for real-shop use, not for accepting 1C-3.5.
- **A06 performance:** rotating does not stutter or reload data beyond the normal throttled refresh (owner observation).

### 1C-3.6 Motion, micro-interactions and accessibility
**Delivers:**
- press feedback on every tappable element;
- list entrances (staggered, at most 8 rows);
- sheet and toast transitions; the tab pill animation;
- all on the native driver, with nothing running while idle, and nothing animating under reduced motion;
- an accessibility pass: screen-reader labels and reading order, focus order on forms, touch targets, contrast, 130 % and the largest text size.

**Acceptance:**
- Animations never block input.
- With Remove animations on (Android) or Reduce Motion (iOS), nothing fades, scales or pulses.
- TalkBack on the A06 and VoiceOver on the iPhone can complete: open Products, open Details, Edit, Save, Change price.
- **A06 performance:** no stutter when opening screens and scrolling with 35 or more products (owner observation; no profiling tool is available).

## 8. Testing requirements

- **Automated (CI, every increment):**
  - pure-rule unit tests: cost information, the navigation stack, width classes and panes, the latest-request guard, status badges, money formatting;
  - API tests for every new read (isolation included);
  - checks for "no fontFamily or font assets", "no hard-coded colours or sizes in redesigned screens", and "no text-scaling cap or disabled scaling" (from 1C-3.4, the whole app);
  - every existing suite green.

  There's no React Native renderer, so screen behaviour is checked on devices.
- **Galaxy A06 (Android 16; low-end; primary performance device):** each increment's checklist; the affected D2, MD and D1 checks; 130 % and the largest text size; Remove animations; scrolling with 35 or more products; a cold start.
- **iPhone 13 Pro Max (iOS, Expo Go):**
  - the same checklists;
  - the keyboard on every form and sheet;
  - safe areas (notch, home indicator);
  - Dynamic Type at a large setting;
  - the iOS swipe-back gesture (record what happens).
- **Cross-device (iPhone and A06, or two Android phones):** MD checks on Details, for example MD-04 with Details open on the second phone, and MD-09 with the form open.
- **Orientation (all devices):** the §6.5 plan, ORI-01 – ORI-10 on phones and TAB-01 – TAB-12 on tablets.
- **Device checklists:** DET, GAL, ORI and TAB are written out in full in §8.1 and copied into the device-test log for each increment. The gallery checks for C-1b (GAL-01 – GAL-13) were defined with 1C-3.2.
- **Evidence:** owner-reported PASS, PARTIAL, NOT TESTED or BLOCKED per check, always separate from CI. No cloud verification until D11.

### 8.1 Device checklists (written out; all NOT TESTED)

Each check has a status of PASS, PARTIAL, NOT TESTED or BLOCKED (owner-reported), and is recorded separately from CI.

**DET: Product Details (1C-3.1; repeated after 1C-3.3).** Devices: Galaxy A06 and iPhone 13 Pro Max; DET-13 with two devices.

| ID | Steps | Expected result |
|---|---|---|
| DET-01 | Tap a product row's main area | Product Details opens; the edit form does **not** open |
| DET-02 | Look at Details for a product with stock and a cost | Name, category, unit, selling price, "Average cost (about)" with a figure, stock with its unit, low-stock level, stock-status word and colour, "Margin (about)" with the amount and %, "Stock value (about)" equal to stock × average cost, "Updated hh:mm" |
| DET-03 | Check the margin figure for a known case (for example price GH₵ 10.00, average cost GH₵ 8.00) | GH₵ 2.00 and **20 %** (not 25 %); estimates say "(about)"; the selling price and stock have no "(about)" |
| DET-04 | Adjust the product's stock to 0 (when Adjust stock exists; until then a product seeded and adjusted to 0 on the local stack), then open Details | "Last known average cost (about)" with "as of {date}" and the no-stock note; margin **not shown** ("Margin: not shown while there is no stock"); **Stock value (about) hidden** |
| DET-05 | Open Details for a product created with no cost | "Average cost: Not known" with the restock hint; margin "Not known"; Stock value (about) hidden |
| DET-06 | (a) Details open for a product with stock and a cost; airplane mode on; leave the app for at least 30 seconds and return (or tap Try again). (b) Separately, airplane mode on, then open a product from the list | (a) Price and stock stay, with "Last updated hh:mm · couldn't refresh" and the "Couldn't refresh" banner; Average cost "Not available right now", no figure (not even the earlier one); Margin "Not available right now"; Stock value (about) hidden. (b) "We couldn't load this product" or the offline message, with Try again; no figures. In both, after reconnecting and Try again, the correct state shows |
| DET-07 | A product whose cost is above its price | Margin shows a minus sign, the danger colour and the word "Loss" |
| DET-08 | Archive the product from Details (confirm) | Stays on Details; "Archived" banner; Edit, Change price and Correct cost price disabled with "Restore it to make changes"; Restore restores it |
| DET-09 | A product in an archived category; a product with no category | "{Name} (archived)"; "No category" |
| DET-10 | Edit → change a field → Save | Returns to **Details**, refreshed, showing the change and "… saved" |
| DET-11 | Edit → Cancel (and separately, Android Back from Edit) | Returns to Details; nothing changed |
| DET-12 | From a scrolled, filtered and searched list, open Details, then Back | List with the same search text, filters, sort and scroll position |
| DET-13 | Two devices: Details open on B; A changes the price; B returns to the app or the screen | B shows the new price without a restart; "This product was changed on another device" appears only for the other device's change |
| DET-14 | Add a product and save (A-1) | The new product's read-only Details opens |
| DET-15 | On Details, look top-right in the header; tap the pencil. With TalkBack or VoiceOver on, move to it. Then archive the product and look again (owner decision B-3) | A compact pencil, no large green Edit button anywhere on the page; one tap (an easy target) opens the edit form, and Back returns to Details; the screen reader says "Edit product, button"; when archived it is dimmed, does nothing, and is announced as disabled with "Archived. Restore it to make changes." |

**GAL: component gallery, Checkpoint C-1b (1C-3.2).** Devices: Galaxy A06 and iPhone 13 Pro Max, the app run in development mode (Expo Go or the development build connected to the development server). C-1b is the owner's decision after these checks; requested changes go back into 1C-3.2.

| ID | Steps | Expected result |
|---|---|---|
| GAL-01 | Open the More tab; tap "Component gallery (Development only)"; then Back at the top, and separately (A06) the Android system Back | The gallery opens with a light header; both Backs return to More. The row doesn't appear in a release build |
| GAL-02 | Look at "This screen" at the top | Shows the screen size in dp, the layout class (compact on both phones upright), the text size in % and Reduce Motion |
| GAL-03 | "Control hierarchy (B-4)": compare the four levels | Icon action, text action, medium button and large primary are visibly lighter to heavier; nothing looks oversized or heavy; the purpose of each is clear |
| GAL-04 | "Buttons": press and hold each kind; tap "Save price"; read the disabled one; tap "Archive product" | Pressed state shows; "Save price" shows a spinner, then a toast; the disabled button shows its reason; Archive asks for confirmation first |
| GAL-05 | "Icon actions" and "Screen header": tap the pencils; with TalkBack or VoiceOver on, move to them | Easy to tap (48 dp target); read as "Edit product, button" or the shown label; the disabled one is announced as disabled with its reason; the light header reads clearly |
| GAL-06 | "Text fields": tap a field; type 1.234 in Selling price | The keyboard opens only when tapped; GH₵ prefix shown; the outline turns green when focused; a red error with an icon appears; the typed text stays |
| GAL-07 | "Bottom sheet": open it; tap the price field; with the keyboard open, scroll the sheet; close it with Close, Cancel and the backdrop | The keyboard doesn't open by itself; the field and "Save price" stay reachable above the keyboard; each way closes the sheet |
| GAL-08 | "Chips", "Cards", "Rows", "Banners", "Feedback", "Loading": tap chips, rows and "Show a toast"; switch the loading example | Selected chips show a tick; badges always have a word; the long product name wraps; the toast appears and fades; skeletons look like the content; the empty state has one action |
| GAL-09 | "Typography", "Colour", "Contrast", "Icons", "Spacing" | Text is legible in daylight; every kit pair in the contrast table says Pass; the icons look like one family and are recognisable |
| GAL-10 | Set the phone's text size to about 130 %, then the largest; scroll the whole gallery | Nothing is cut off or overlapping; labels wrap; buttons and rows grow; figures stack ("Cards" says 1 per row); the header and section bar still work |
| GAL-11 | Turn on Remove animations (A06) / Reduce Motion (iPhone); press buttons, show a toast, open the sheet, look at "Loading" and "Motion" | Nothing fades, scales or pulses; content appears at once; "Motion" says Reduce Motion is on |
| GAL-12 | Galaxy A06: scroll the whole gallery quickly, up and down; tap the section chips | Scrolling stays smooth with no visible stutter; jumping to a section is immediate |
| GAL-13 | Record the size shown in "This screen" on each phone (plan §6.5 item 5) | A06 and iPhone widths and heights in dp are recorded, to confirm the provisional breakpoints |

**RD: redesigned screens (1C-3.3).** Devices: Galaxy A06 and iPhone 13 Pro Max, local development stack, fictitious data. The D2, MD, DET and QPS checks for these screens are also repeated (plan acceptance).

| ID | Steps | Expected result |
|---|---|---|
| RD-01 | Open the app and look at Today | Light header with the ShopMate mark, the greeting, the shop name and the date, reference and Pilot tags; Today's revenue card with the gold edge; three figure tiles; quick actions as calm cards; recent activity. No large green blocks |
| RD-02 | On Today: pull down to refresh; tap the Products tile; tap each quick action | Refresh shows the spinner and "Updated hh:mm"; Products opens the list; Add a product opens the form; Record a sale and View reports open their previews |
| RD-03 | Use the bottom tab bar: every tab, then the system Back (A06) | The selected tab is green with a tinted pill and a word; Back steps back as before (Products screens, then Today, then leave) |
| RD-04 | More tab, then the avatar on Today | Shop details, the Later list and Log out on light cards; the avatar opens Shop and account with Back; the gallery row shows only in development mode |
| RD-05 | Products list: search, category chips, Sort, Archived, scroll, pull to refresh | Search with Clear; chips show a tick when selected; rows show name, category and unit, price and a stock badge with a word; "Change price" is a small text action; behaviour as before |
| RD-06 | Tap "Change price" on a row; tap the field; save a new price; also close with Cancel, Close and the backdrop | The sheet has the GH₵ prefix, does not open the keyboard by itself, stays in view with the keyboard (iPhone fix), and saves as before |
| RD-07 | Open a product (Details); tap the ⓘ; tap the pencil; Back | Light header with the pencil top-right; price card; figure cards with the four cost states; Details card; actions; Edit opens the form and Back returns |
| RD-08 | Archive a product from Details, then Restore it | Archive asks for confirmation first; Restore happens at once, without a prompt, with a short message |
| RD-09 | Add a product, then edit one; type a wrong price | GH₵ prefix on money fields; the Save button sits in a bar above the keyboard and stays reachable; errors show in red with an icon; typing is kept; after Add the new product's Details opens |
| RD-10 | Correct cost price from Details: enter a cost and a reason; Save correction | A confirmation states the new cost per unit and the stock value before and after; Cancel sends nothing; confirming saves as before and shows the result |
| RD-11 | Categories: add, rename, archive and restore | Archive asks first; restore runs at once; behaviour and messages as before |
| RD-12 | Set the text size to about 130 %, then the largest; visit Today, the tab bar, the list, Details, the form and the sheet | Nothing is cut off; tab labels wrap and the bar grows; figure tiles stack; buttons and rows grow |
| RD-13 | Turn on Remove animations (A06) / Reduce Motion (iPhone) | Nothing fades, scales or pulses; toasts simply appear and disappear |
| RD-14 | Galaxy A06 with 35 or more seeded products: scroll the list, open Details, open the sheet | Smooth, with no visible stutter; the first list load is not slower than before |

**ORI: phones in portrait and landscape (1C-3.5).** Devices: Galaxy A06 (new development build) and iPhone 13 Pro Max (Expo Go, early; final on an iOS build, §6.5 item 4).

| ID | Steps | Expected result |
|---|---|---|
| ORI-01 | Rotate to landscape on the Products list | The layout adapts by width and height class; nothing is cut off; the header is one line (short) |
| ORI-02 | Rotate on Product Details | Details stays open on the same product; all fields reachable by scrolling |
| ORI-03 | Type in the Edit form, then rotate both ways | Typing kept; Save / Cancel reachable; no data lost |
| ORI-04 | Open the quick price sheet and rotate, with and without the keyboard | The sheet stays usable; field and buttons reachable; typed price kept |
| ORI-05 | Landscape with the keyboard open on a form | The focused field and Save / Cancel are visible or reachable by scrolling |
| ORI-06 | Landscape: check the notch, Dynamic Island, cut-out and home indicator edges | No text or button under them; the real insets are applied |
| ORI-07 | Scroll and filter the list, then rotate | Scroll position, search, filters and sort kept |
| ORI-08 | About 130 % and the largest system text size, in landscape | Readable; nothing clipped; the tab-bar labels shown in full (wrapping allowed); sheets scroll |
| ORI-09 | Remove animations (Android) / Reduce Motion (iOS) on, then rotate | No fades or scaling; the layout still adapts |
| ORI-10 | Rotate 10 times on Details and on the Edit form | No crash; no lost state; no burst of server requests (refreshes stay throttled) |

**TAB: tablets in portrait and landscape (1C-3.5).** Devices: an Android tablet with the new development build; an iPad in Expo Go (early), then on an iOS build (final).

| ID | Steps | Expected result |
|---|---|---|
| TAB-01 | Open Products in portrait | A medium or expanded layout as measured; a grid or list without stretched rows |
| TAB-02 | Rotate to landscape on Products | Expanded: list and Details side by side, list about 40 % (at least 320 dp) |
| TAB-03 | Select products one after another in two panes | The right pane shows each selection; the list keeps its scroll position |
| TAB-04 | In two panes, press Back | The selection clears first; a second Back behaves as on a phone |
| TAB-05 | Edit from the Details pane, Save | Edit opens full screen or as a centred sheet (at most 640 dp); after saving, the Details pane is refreshed |
| TAB-06 | Rotate from two panes to portrait with a product selected | Details shown full screen if the class becomes compact; otherwise the panes resize; the selection is kept |
| TAB-07 | Type in a form, then rotate | Typing kept |
| TAB-08 | Split-screen / multi-window (Android split screen; iPad Split View and Slide Over) at a narrow width | The layout follows the window's width class (it can be compact); nothing breaks |
| TAB-09 | Keyboard in both orientations on forms and the price sheet | The field and Save / Cancel reachable |
| TAB-10 | Today in portrait and landscape | Tiles in one row (medium) or two columns (expanded); nothing stretched |
| TAB-11 | About 130 % and the largest text size | Readable; nothing clipped |
| TAB-12 | Remove animations / Reduce Motion, then rotate and open screens | No animation; the layouts are correct |

## 9. Risks and dependencies

| Risk | Mitigation |
|---|---|
| Redesign scope grows | Written spec approval (C-1a), kit first, then the physical gallery review (C-1b); one area per increment; a list of what's out of scope |
| Regressions in tested flows | Behaviour stays in tested services and pure modules; affected checklists re-run per increment |
| Galaxy A06 performance | No list shadows, no blur, native-driver animations only, capped staggering, checks with 35 or more products. A06 smoothness is an acceptance criterion in 1C-3.3, 1C-3.5 and 1C-3.6 |
| iOS-only layout and keyboard issues | The shared Sheet carries the proven iPhone fix; keyboard checks on every form |
| Expo Go differs from development builds (orientation especially) | Expo Go results recorded as early checks; final orientation evidence needs the new build |
| Spec 08 conflict | Written revision approved at C-1a and the gallery confirmed at C-1b, before any screen redesign |
| Cost shown wrongly | Pure, tested rules; "(about)" and "last known" labels; no guess on unknown or unavailable |
| Phones in landscape (approved for all devices) | A height class ("short") on top of the width classes; forms and sheets height-limited and scrolling; ORI checks on both phones |
| Notch and cut-outs in landscape | `react-native-safe-area-context` (decision S-1) gives exact insets; it needs the new development build and the dependency checks before use |
| A new native package (`react-native-safe-area-context`) | The version compatible with Expo SDK 58, confirmed at installation (not chosen in this plan); dependency audit and bundle checks; installed only with 1C-3.5 approval; the Android development build rebuilt with it |
| Breakpoints wrong for real devices | Provisional dp values in one constant; measured on each device (§6.5) and adjusted |
| Android 16 already rotating tablets despite the portrait lock | Likely if the built app targets SDK 36 (the React Native default; the actual target confirmed from the 1C-3.5 build); checked on a tablet; the global unlock makes the behaviour the same everywhere; the temporary opt-out isn't used |
| iPhone and iPad behaviour only checked in Expo Go | Final iOS verification (orientation, safe areas, release-readiness checks) on an approved iOS development or TestFlight build before the iOS release gate and real-shop use; NOT TESTED until done (§6.5 item 4) |
| Tablets not available | Layouts unit-tested; tablet checks recorded as NOT TESTED until devices are available |
| Mobile layouts mistaken for a PC experience | PC and browser support is a separate milestone (PW-1, §11) with its own design, security and testing; Stage 1C-3 claims nothing for PCs |

**Dependencies:**
- devices: the A06, the iPhone, a second phone, and a tablet for 1C-3.5;
- the owner's local stack with migration `20261125000300`;
- 35 seeded fictitious products;
- an EAS development build for 1C-3.5 (approval needed; orientation is part of the native project);
- an Apple Developer account and an approved iOS development or TestFlight build, for the final iOS verification before the iOS release gate and real-shop use (decision B-2; separate approvals).

**Unchanged, outside Stage 1C-3:**
- D11 cloud migrations: outstanding; no cloud change in this milestone; a prerequisite for testing across different networks;
- web/browser (milestone PW-1, §11), staff accounts, Realtime, offline editing beyond sales, device-limit enforcement, dark mode;
- the S-37 movement history and the remaining 1C-2 screens;
- custom fonts; native packages other than `react-native-safe-area-context` unless separately approved.

## 10. Decisions and approvals still needed

| # | Question | Recommendation |
|---|---|---|
| ~~T-1~~ | ~~Phones in landscape~~ | **Decided 25 Nov 2026:** landscape on all devices (P-2); global unlock with no package (§6.3) |
| ~~S-1~~ | ~~Safe areas~~ | **Decided:** `react-native-safe-area-context`, in 1C-3.5 (§6.3) |
| ~~M-1~~ | ~~Margin with last-known cost~~ | **Decided:** hidden |
| ~~A-1~~ | ~~Add product → Details~~ | **DECIDED / APPROVED (25 Nov 2026):** after successfully adding a product, open its read-only Product Details |
| ~~I-1~~ | ~~Icons~~ | **DECIDED / APPROVED (25 Nov 2026):** lightweight custom icons drawn from plain views; no SVG package in Stage 1C-3 |
| ~~C-0~~ | ~~Category product counts~~ | **DECIDED / APPROVED (25 Nov 2026):** shown only if fetched efficiently (one grouped request, no extra requests per category, no noticeable performance impact); checked in 1C-3.3, otherwise left out |
| B-1 | Approval at the start of 1C-3.5 of the global orientation unlock in `app.json`, installing `react-native-safe-area-context` (the Expo SDK 58-compatible version), and the new EAS **Android** development build containing both | Approve when 1C-3.5 starts |
| B-2 | **Separate approvals** for iOS: (1) the Apple Developer account; (2) an iOS development build or TestFlight build for the final iPhone and iPad orientation, safe-area and release-readiness checks | Before the iOS release gate and before release for real-shop use; NOT TESTED until then. Not started |
| ~~L-1~~ | ~~Device-test log update~~ | **Done (25 Nov 2026):** QPS-D1 – QPS-D6, XD-01, and MD-01 and MD-04 PARTIAL recorded in the log's increment 2b section |
| ~~R-1~~ | ~~Browser milestone in the master roadmap~~ | **Done:** milestone PW-1 in the roadmap (§2 phase table and order, §3.4, §3.6a) |
| ~~W-1~~ | ~~When milestone PW-1 starts~~ | **Decided:** PW-1 after Stage 1C-3; D11 addressed before any cross-network testing |
| IG-1 | **Which gate is the iOS release gate:** G2, or the pilot gate if iPhones take part in the pilot. Not decided; there's no evidence yet on pilot iPhone participation (also in the roadmap's §9) | Owner decides once pilot device plans are known |
| ~~V-1 – V-6~~ | ~~Spec 08 revision decisions~~ | **Approved with C-1a (25 Nov 2026):** Stock value (about) only in cost state 1; light headers; the three colour corrections in 1C-3.2; C-1 split into C-1a and C-1b; spec 08 revision 2 and specification set 5.2; follow-up documentation after C-1a approval |
| ~~C-1a~~ | ~~Written spec 08 revision 2 approval~~ | **APPROVED (25 Nov 2026):** adopted as [08-visual-design.md](../product-specification/08-visual-design.md); specification set 5.2 |
| ~~C-1b~~ | ~~Physical gallery review on the A06 and the iPhone after 1C-3.2~~ | **APPROVED (26 Nov 2026)** by the owner after reviewing the gallery on both phones |
| ~~G-1~~ | ~~Approval to start 1C-3.1~~ | **APPROVED (25 Nov 2026)** for 1C-3.1 only; implemented in the working tree (not committed) |

## 11. Future milestone PW-1: PC and browser support (Windows and macOS)

**Status: REQUIRED product direction (owner, 25 Nov 2026); a SEPARATE milestone scheduled AFTER Stage 1C-3 (scheduling decision W-1); NOT part of Stage 1C-3; not yet planned in detail.** Recorded in the master roadmap as milestone **PW-1** (§2 and §3.6a; decision R-1). Its own detailed plan is written and approved before any browser work starts.

**Why it's separate:** a phone app that adapts to a wide window is not a PC product. PW-1 needs its own navigation, input model, security design and testing.

**Scope (to be planned in detail):**
1. **Browser access on Windows and macOS:** the app served to current Chrome, Edge, Firefox and Safari. Technical basis to be decided: Expo web with `react-native-web` and `react-dom` (new packages; approval) or a separate web front end, compared in the PW-1 plan.
2. **Responsive desktop layouts and navigation:**
   - a side navigation rail or sidebar instead of the bottom tab bar;
   - multi-column screens (list, Details and history together);
   - wide tables for product and stock lists, with sorting, column visibility and paging;
   - no stretched phone layouts.
3. **Secure browser authentication and session handling:**
   - The phone's secure storage (`expo-secure-store`, SEC-05) isn't available in browsers. PW-1 needs its own reviewed design: where the session lives (memory plus a refresh strategy, or cookie-based sessions through a small server component), protection against cross-site scripting and request forgery, a session timeout and "log out of this browser", and shared or public computers in shops (no "remember me" by default).
   - Applying security requirements SEC-01 – SEC-08 to browsers.
   - Device registration and plan limits for browsers (with the device-limit requirement).
4. **Larger-screen workflows suitable for shop owners:**
   - keyboard-first data entry: tab order, Enter to save, shortcuts for search and add;
   - faster bulk work (for example editing several prices, reviewing stock);
   - printing or exporting lists;
   - mouse and hover states;
   - copy and paste of amounts.
5. **Browser compatibility and performance testing:**
   - a browser matrix (Windows 10/11 with Chrome and Edge; macOS with Safari and Chrome; Firefox), at 1280 – 1920 px widths and 100 – 200 % browser zoom;
   - accessibility with NVDA and VoiceOver and keyboard-only use;
   - load time and bundle size on a modest PC and a slow connection;
   - the same shop isolation, concurrency and freshness rules verified in the browser, including a browser and a phone at the same time.

**Prerequisites:**
- Stage 1C-3 complete (scheduling decision W-1);
- **D11 addressed before any cross-network testing** (the Stage 1C migrations applied to the cloud and re-verified with owner approval; a browser on another network can't reach the local stack);
- the Stage 1C-3 design system (shared tokens and components);
- an owner decision on the technical basis and on browser session security;
- the hosting choice for the web app.

**What Stage 1C-3 does now so it doesn't block PW-1:**
- new mobile-only APIs are used only behind a platform guard;
- layouts are driven by width;
- press styles that would also work with hover;
- kit primitives written so they could also render on the web.

Nothing is built or claimed for PCs in Stage 1C-3.
