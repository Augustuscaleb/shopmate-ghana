# 08 — Visual Design Direction (revision 2)

**Status: APPROVED, governing (25 Nov 2026).**
- **Spec 08 revision 2,** approved by the owner at Checkpoint **C-1a** (written specification approval), as part of **product specification revision 5.2**.
- It includes decisions V-1 – V-6 and the no-text-scaling-cap requirement.
- It replaces revision 1, which was part of specification revision 5.1 and "provisionally approved"; revision 1 is in the git history at commit `9900cef`.
- It supersedes the visual parts of [STAGE-1C-2-VISUAL-DESIGN.md](../stages/STAGE-1C-2-VISUAL-DESIGN.md).
- [design-preview.html](design-preview.html) shows revision 1 and is kept for reference only.

**Still required: Checkpoint C-1b,** the owner's physical review of the component gallery, icon set and contrast table on the Galaxy A06 and the iPhone after increment 1C-3.2. **No screen may be redesigned before C-1b is approved.** C-1b can lead to adjustments of this revision.

Evidence markers as in the rest of the specification: **[A]** a reasoned design decision, to be confirmed with pilot users; **[V]** validated by research.

Scope: what the app looks like, how screens are laid out and behave visually, and the accessibility and performance rules. Business rules stay in specs 04 and 05. The Stage 1C-3 delivery plan stays in [STAGE-1C-3-PLAN.md](../stages/STAGE-1C-3-PLAN.md); §16 here references it rather than repeating it. Where this page states behaviour (cost states, margin, navigation), it repeats the approved plan decisions, so designers and testers have one place to look.

## 0. What changes from revision 1 (summary)

| Area | Revision 1 | Revision 2 (proposed) | Why |
|---|---|---|---|
| Platforms | Android phone | Android and iOS, phones and tablets, **portrait and landscape** | Owner decisions P-2 and multi-device (25 Nov 2026) |
| Font | "Roboto, the Android system font" | **The native system font** on each platform (Roboto on Android, San Francisco on iOS); no custom font | P-4; iOS is now in scope |
| Text size | "up to 130 %" | **Every system text size, up to the largest, with no cap anywhere, including the tab bar.** Layouts adapt instead (wrapping, spacing, responsive navigation). Tested at 100 %, 130 % and the largest | Accessibility; iOS Dynamic Type; owner correction (25 Nov 2026) |
| Icons | Material Symbols (outlined) | **Lightweight custom icons drawn from plain views**; no SVG or icon-font package | I-1 (it also matches what the app already does) |
| Headers | Shop Green header fill | **Light headers** with ink titles; green kept for the main action, the selected tab and accents | A calmer, more premium look; green keeps its meaning as "the thing to press" |
| Colour roles | Flat palette | The same brand palette, **plus meaning-based roles and three contrast corrections** (§3.3) | Two current pairs fail WCAG AA (§3.3) |
| Components | Short list | A complete reusable component set (§5.3) | One consistent look instead of three styling generations |
| Layout | Phone only | Layout classes **compact, medium, expanded and short** (§6) | Phones in landscape, tablets |
| Safe areas | Not covered | Real safe-area insets from `react-native-safe-area-context`, from increment 1C-3.5 (§6.5) | S-1 |
| Products | Not covered | Product row, **read-only Product Details with Edit**, four cost states, margin rule, category counts (§9) | P-3, M-1, A-1, C-0 |
| Motion | "No heavy animations" | Defined motion tokens and rules, Reduce Motion (§8) | Polish without slowing the A06 |
| Accessibility | TalkBack only | **TalkBack and VoiceOver**, keyboard behaviour, focus order, Reduce Motion (§13) | iOS in scope |
| Performance | General | **Galaxy A06 as the performance reference device**, with criteria (§14) | Low-end Android is the main market |

Unchanged: design goals, personality, the brand colours, the payment-method markers, the national-colours guidance, language and tone, the simplicity rules, and the pilot-validation questions (plus new ones).

## 1. Design goals (unchanged, one addition)

| Goal | Why | Evidence |
|---|---|---|
| **Readable in bright sunlight**, on low-cost screens | Shops are often open-fronted; budget phones have dimmer screens | [A] |
| **Fast at the counter**: big targets, few steps | Owners serve customers while recording | [A]; tools must be easier than paper [V] |
| **Trustworthy and calm**: it handles money | Owners worry about losing records | Kippa outage [V]; data-trust concern [A] |
| **Familiar and local without clichés** | Feels made for Ghana: GH₵, MoMo, "the book" | [A] |
| **Light on data and battery** | Data cost; power cuts | Usage gap and outages [V] |
| **Works on every screen the shop uses** (new) | One owner may use an Android phone, an iPhone and a tablet, held upright or sideways | Owner decision, 25 Nov 2026 |

## 2. Personality (unchanged)

**Practical · warm · trustworthy · encouraging.** Like a reliable shop assistant, not a bank and not a game. Celebrate small wins sparingly.

**Visual direction name: "Market ledger, modern".** A calm, confident ledger book: plenty of warm white, ink-dark figures, green only where action or success is meant, and gold for the moments worth celebrating. It shouldn't look like a generic template or like the old screens with a new colour.

## 3. Colour

### 3.1 Brand palette (unchanged values)
Shop Green `#0B6B4F` · Deep Green `#084C38` · Market Gold `#F4B400` (dark text only) · Warm White `#FAF8F3` · White `#FFFFFF` · Ink `#1C1B19` · Stone `#5A5550` · Sand `#E4DFD5`. The status colours and payment-method markers are as in revision 1, with the corrections in §3.3.

### 3.2 Meaning-based colour roles (new)
Screens use **roles**, not raw colours, so the look stays consistent and can be adjusted in one place.

| Role | Value | Use |
|---|---|---|
| `bg` | Warm White `#FAF8F3` | Screen background |
| `surface` | White `#FFFFFF` | Cards, sheets, the list rows' background |
| `headerBg` | **`#EEF6F1`** (new, a very light green) | Screen headers (light) |
| `textPrimary` | Ink `#1C1B19` | Main text, figures |
| `textSecondary` | Stone `#5A5550` | Captions, labels |
| `brand` | Shop Green `#0B6B4F` | Primary buttons, selected tab, links, key accents |
| `brandPressed` | Deep Green `#084C38` | Pressed primary button |
| `onBrand` | White | Text on Shop Green |
| `accent` | Market Gold `#F4B400` | Key-figure underline, celebration (dark text only) |
| `divider` | Sand `#E4DFD5` | Decorative dividers and card borders only |
| `controlBorder` | **`#857E74`** (new) | Outlines of inputs, checkboxes and other controls |
| `success` / `successBg` | **`#166B3E`** (corrected) / `#E3F3EA` | "In stock", "Saved", "Synced" |
| `warning` / `warningBg` | `#8A5300` / `#FFF4D6` | Low stock, pending, "couldn't refresh" |
| `danger` / `dangerBg` | `#B42318` / `#FDECEA` | Out of stock, negative stock, "Loss", errors, destructive actions |
| `neutral` | `#6B6B6B` | Pending, archived labels |
| `info` / `infoBg` | `#3949AB` / `#E8EAF6` | MoMo marker, information notes |

### 3.3 Contrast check (WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text and for the outlines of controls)
All values were measured for this proposal.

| Pair | Ratio | Result |
|---|---|---|
| Ink on Warm White / on White | 16.2 / 17.2 | Pass |
| Stone on Warm White / on White / on tint | 6.9 / 7.4 / 6.4 | Pass |
| Shop Green text on Warm White / on White | 6.1 / 6.5 | Pass |
| White on Shop Green / on Deep Green | 6.5 / 10.0 | Pass |
| Ink on the new light header `#EEF6F1` | 15.6 | Pass |
| Stone / Shop Green on the light header | 6.7 / 5.9 | Pass |
| Amber text on amber background | 5.8 | Pass |
| Red text on red background / on White | 5.8 / 6.6 | Pass |
| Neutral grey on White / on Warm White | 5.3 / 5.0 | Pass |
| MoMo blue on White / on `#E8EAF6` | 7.7 / 6.5 | Pass |
| Ink on Market Gold | 9.3 | Pass |
| **White on Market Gold** | **1.85** | **Fail**: never used (already a rule) |
| **Current success green `#1E7F4F` on tint `#E3F3EA`** ("In stock" chip today) | **4.35** | **Fail** for normal text → corrected to **`#166B3E` (5.7)** |
| **Sand `#E4DFD5` as an input outline** | **1.33** | **Fail** for controls → inputs use **`#857E74` (4.0)**; Sand stays for decorative dividers only |

The two failing pairs exist in the app today. They are corrected when the new colour roles are introduced (increment 1C-3.2); decision **V-3** in §17 covers whether to fix them sooner.

### 3.4 Rules (unchanged)
- Never rely on colour alone: every status has a word, and an icon where useful.
- No mobile network brand colours or logos; "MoMo" appears as a word.
- National colours only in muted form; no flag, Black Star or Kente reproductions as decoration.

## 4. Typography

- **The native system font only (P-4):** Roboto on Android, San Francisco on iOS. No custom font, no font package and no font file. Weight alone gives the hierarchy.
- **Tabular figures** for money and stock, so columns line up.
- **The cedi sign (₵)** must render. Fallback "GHS" if a device can't show it (test on 3+ low-end devices).
- **Text size, with no cap (owner requirement):** the app follows the phone's text-size setting (Android font scale, iOS Dynamic Type) **up to the largest supported setting, everywhere, including the tab bar**. Readable text is never capped and never has text scaling switched off.
  - **When larger text creates a layout constraint, the layout adapts:**
    - text wraps onto more lines instead of being cut off with "…" (where shortening is unavoidable, the full text stays available to screen readers and on the next screen);
    - rows, buttons and bars grow taller;
    - side-by-side items stack vertically;
    - figures shown side by side stack;
    - screens scroll;
    - on larger layout classes, navigation can move to a more spacious arrangement.
  - **Clipping is never solved by limiting text scaling.**
  - **Tested** at 100 %, about 130 % and the largest setting.
  - **Graphic marks aren't text:** an icon or a logo mark is drawn as a shape (§7), not as a letter, so it has no text-scaling exception.

| Style | Size (sp/pt) | Weight | Use |
|---|---|---|---|
| Display | 32 (single) / 24 (two side by side; stacked on narrow screens or large text) | Bold | Today's revenue, the selling price on Details |
| Title | 22 | Bold | Screen titles (in the light header) |
| Heading | 18 | Semibold | Card and section headings |
| Body | 16 | Regular | Default text (minimum for content) |
| Label | 16 | Semibold | Field labels, button text |
| Caption | 14 | Regular | Secondary information (**never smaller**) |
| Number | as the style it sits in | Bold, tabular | Amounts and quantities |

## 5. Layout and components

### 5.1 Spacing and shape
- **Spacing:** steps of 4, 8, 12, 16, 24, 32 and 48 dp. 16 dp screen padding on compact screens, 24 dp on medium and expanded.
- **Radii:** 8 dp for small elements (chips' inner parts, inputs), **12 dp for cards** (unchanged), 20 dp for bottom sheets, full rounding for chips and pills.
- **Depth:** shown by tone and a hairline border (`divider`), **not shadows**, so it stays cheap to draw on low-end phones. No blur.
- **Touch targets:** at least 48 × 48 dp; primary buttons 56 dp high.

### 5.2 Main action placement
- One main (green) action per screen.
- **At the bottom of the screen,** in a bar that stays above the keyboard, on forms and on Product Details.
- Back is always top-left, as in revision 1.

### 5.3 Reusable components
Every screen is built from these; a screen does not invent its own sizes or colours.

| Component | Description and states |
|---|---|
| Text | The text styles in §4 |
| Button | Primary (green, white text), secondary (white, green outline and text), quiet (green text only), destructive (red text, always with a confirmation). States: normal, pressed, disabled with a reason, busy |
| Text field | Label above, hint below, error below in red with an icon. Money fields show a "GH₵" prefix inside the field. Outline `controlBorder`; focused outline `brand`, 2 dp |
| Card | `surface`, 12 dp radius, hairline border |
| List row | One tappable row with a 48 dp or larger target; a title, a secondary line, a right-hand value, an optional quiet action |
| Status badge | A dot plus a word in the role colour (for example "In stock", "Low", "Out of stock", "Negative", "Archived") |
| Chip | Filter and choice chips, with a tick and a tint when selected |
| Banner | Full width under the header: grey offline, amber warning or "couldn't refresh", red failure |
| Bottom sheet | 20 dp top corners and a grab handle. **Height-limited and scrollable; never focuses a field by itself**, so the iPhone keyboard can't push it out of view (the proven price-sheet fix) |
| Skeleton | Placeholder blocks shaped like the content; static under Reduce Motion |
| Empty state | An icon in a tinted circle, a title, one sentence, and one action where useful |
| Toast | A short success message ("Milo sachet saved") that fades out |
| Stat | A label above a figure, for example "In stock / 24 sachets" |
| Updated line | "Updated 10:42", or "Last updated 10:42 · couldn't refresh" with Try again |
| Screen scaffold | Header, banners, the updated line, and a scrolling area with a maximum content width |

## 6. Responsive layout and orientation

### 6.1 Orientation (P-2)
**Portrait and landscape on every device:** Android phones, iPhones, Android tablets and iPads. The layout follows the screen's current width and height, so rotating the device, or using split screen on a tablet, simply moves to another layout class. Nothing typed, scrolled, searched or selected is lost when rotating.

### 6.2 Layout classes
Measured in density-independent pixels (dp, called points on iOS). **The values are provisional** until measured on real devices in Stage 1C-3.

| Class | Rule | Typical example |
|---|---|---|
| **compact** | width below 600 dp | Phones held upright |
| **medium** | width 600 – 839 dp | Galaxy A06 held sideways (about 800 dp); small tablets upright |
| **expanded** | width 840 dp or more | iPhone 13 Pro Max sideways (926 dp); tablets sideways; large tablets and iPads upright |
| **short** (height class, combined with the above) | height below 480 dp | Phones held sideways |

### 6.3 Behaviour by class

| Area | compact | medium | expanded | short (any width) |
|---|---|---|---|---|
| Products list | One column | Two-column card grid | List and Product Details side by side (list about 40 %, at least 320 dp) | One-line header; each pane scrolls |
| Product Details | Full screen | Full screen, content at most 720 dp wide, centred | Right-hand pane | Figures in one row; smaller heading area |
| Forms and sheets | Full width | Centred, at most 640 dp | Centred, at most 640 dp | Height-limited, scrolling; Save / Cancel always reachable |
| Today | One column | Four figures in one row | Two columns | Smaller hero; figures in one row |
| Tab bar | Bottom; at large text sizes the labels wrap to two lines and the bar grows taller | Bottom; as compact | Bottom; as compact | Bottom; labels kept and allowed to wrap; the bar grows with the text, and the content area scrolls |

### 6.4 Two-pane behaviour (expanded)
- Selecting a product shows it in the right pane. Back first clears the selection.
- If the screen becomes compact (rotation or split screen), the selected product opens full screen.

### 6.5 Safe areas (S-1)
- Content never sits under the notch, the Dynamic Island, a camera cut-out, the status bar, the navigation bar or the home indicator, in either orientation.
- From increment **1C-3.5**, the exact insets come from `react-native-safe-area-context`. It is installed only with that increment's approval, in the Expo SDK 58-compatible version, and goes into a new Android development build.
- Until then the app keeps its current fixed allowances, and landscape isn't enabled.

## 7. Iconography (I-1)

- **Lightweight custom icons, drawn from plain views:** one consistent set on a 24 dp grid, with one stroke weight and rounded ends. **No SVG or icon-font package** in Stage 1C-3.
- **Icons and logo marks are drawn as shapes, not as text characters.** For example, the "!" in the alert icon and the "S" logo mark are drawn shapes, so no text-scaling exception is needed.
- **Always paired with a word** in navigation and on buttons. There are no icon-only buttons (rule unchanged).
- Emoji only in friendly messages, never as the only meaning.

## 8. Motion

- **Purpose:** motion confirms, guides or shows progress; it is never decoration.
- **Timing:** quick 120 ms (press), standard 200 ms (screen content appearing), emphasis 280 ms (success); ease-out.
- **What moves:** only opacity and position or scale, using the native animation driver. Nothing runs while the screen is idle.
- **Limits:** list rows appear one after another for at most the first 8 rows. No bounce. No movement on long lists while scrolling.
- **Press feedback:** a slight shrink (to 97 %) on tappable elements.
- **Reduce Motion:** with Android's "Remove animations" or iOS's "Reduce Motion" on, nothing fades, slides, scales or pulses. Content appears immediately. Until the phone's setting is known, motion is reduced.

## 9. Products: presentation and interaction

### 9.1 Product list row
- **Contents:** the product name (up to 2 lines); a grey line with the category and the unit; the selling price on the right in tabular figures; a status badge (stock word and colour); a quiet "Change price" action.
- **Tapping the row opens Product Details.** Tapping "Change price" opens the quick price sheet.

### 9.2 Product Details (read-only, the read-only part of S-37)
**A read-only page:** nothing on it can be changed by typing.

**Order, top to bottom:**
1. **Header:** Back; product name; category tag; status badge; "Updated hh:mm".
2. **Archived banner** if archived: "This product is archived. Restore it to make changes."
3. **Selling price**, in the display style.
4. **Figures** (Stat components):
   - "In stock": quantity and unit, with "Low at {level}" beneath;
   - "Average cost": the cost state, §9.3;
   - "Margin", §9.4;
   - "**Stock value (about)**" (decision V-1): **current stock quantity × current calculated average cost.** It is calculated from the unrounded average, so it equals the stock value the shop has recorded; the rounded average shown on screen isn't used, which avoids rounding differences. **Shown only in cost state 1, and hidden whenever the current calculated cost isn't available** (states 2, 3 and 4).
5. **Information card:** unit; category; low-stock level.
6. **Actions:**
   - **"Edit product"** is the main (green) button, in the bottom bar;
   - "Change price" and "Correct cost price" are secondary buttons;
   - "Archive product" is a destructive action at the end, with a confirmation.

   When archived: "Restore product" replaces Archive, and Edit, Change price and Correct cost price are disabled, with the reason shown.

**Missing information:**
- no category: "No category";
- archived category: "{name} (archived)";
- category not found: "—";
- product deleted or not found: an empty state with "Back to products".

**ⓘ next to "Average cost" and "Margin":** a plain tap opens a 2–3 sentence explanation, for example "Average cost is worked out from your stock value. It changes when you restock or correct a cost. 'About' means it's an estimate." (spec 08 rule "help in context").

**Change notes:** "This product was changed on another device. The latest details are shown." appears only for a change made elsewhere.

### 9.3 Average cost: four states, always visibly different (P-3)

| State | When (summary) | What the owner sees |
|---|---|---|
| **1. Current** | Stock above 0, cost known, stock value not negative | "**Average cost (about)**" and the figure, for example GH₵ 1.10 |
| **2. Last known** | Stock 0 or below, cost known, and a recorded earlier average exists | "**Last known average cost (about)**", the figure, and "as of Wed 12 Nov", with the note "No stock now, so this is the cost when stock was last recorded" |
| **3. Unknown** | Cost not known, or no earlier average, or stock value negative | "Average cost: **Not known**" and the hint "Record a restock with its cost to set it". No figure |
| **4. Temporarily unavailable** | The figures couldn't be loaded (offline, timeout, server error) | "Average cost: **Not available right now**", "couldn't refresh" and Try again. **No figure, not even an old one** |

The exact calculation and data rules (including which history record is used) are in the Stage 1C-3 plan §5.1, so they're defined once.

### 9.4 Margin (M-1)
- **Definition (profit margin):** margin = selling price − average cost; **margin % = (selling price − average cost) ÷ selling price × 100**, as a whole number. Example: price GH₵ 10.00, cost GH₵ 8.00 gives a margin of GH₵ 2.00, which is 20 %. Markup (÷ cost, 25 % here) is never shown.
- **Shown only in cost state 1:** labelled "**Margin (about)**", for example "GH₵ 2.00 · 20 %".
- **Hidden in states 2, 3 and 4:**
  - state 2: "Margin: not shown while there is no stock";
  - state 3: "Not known";
  - state 4: "Not available right now".
- **Cost above price:** a minus sign, the `danger` colour and the word "**Loss**".

**Labels:** confirmed values (selling price, stock quantity, low-stock level) never say "(about)"; estimates always do.

### 9.5 Navigation
- **List → Details** on tapping a row.
- **Details → Edit** with "Edit product". Saving or cancelling returns to Details, which refreshes after a save and shows "… saved".
- **After adding a product,** its read-only Details opens (A-1).
- **Change price and Correct cost price** return to Details.
- **Back from Details** returns to the list with the same search, filters, sort and scroll position.

### 9.6 Categories (C-0)
- Category rows show the **number of products** only if it can be fetched efficiently: one combined request, with no extra request per category and no noticeable slowing, especially on the Galaxy A06. Otherwise the count is left out.
- Rows offer Rename and Archive. Archived categories sit in a section that can be collapsed.

### 9.7 Quick price sheet
- A bottom sheet showing the product name and "now GH₵ …", a large GH₵ price field, Save (green, full width) and Cancel.
- It follows the sheet rules in §5.3: no automatic keyboard, height-limited and scrollable. Tapping outside closes it.

## 10. States and feedback

| State | Presentation |
|---|---|
| Loading (first time) | Skeleton shaped like the content |
| Refreshing | Data stays on screen; the "Updated" line changes when done |
| Refresh failed | Data stays; "Last updated hh:mm · couldn't refresh" and Try again |
| Empty | Empty state (icon, title, one sentence, one action) |
| Error (nothing to show) | What happened, what to do, and Try again |
| Offline | Grey banner: "You're offline. Saving changes needs internet; your typing is kept." Save buttons disabled with the reason |
| Success | Toast, and a short tint flash on the confirmed item (none under Reduce Motion) |
| Conflict | Information note, for example "Someone else changed the price to GH₵ 3.00 while you were editing. Nothing was saved…" |

## 11. Language and tone (unchanged, plus new labels)

The revision 1 rules and word list stay. New fixed wording:
- "Average cost (about)", "Last known average cost (about)", "Not known", "Not available right now";
- "Margin (about)", "Loss", "Stock value (about)";
- "Updated hh:mm", "couldn't refresh";
- "Edit product", "Change price", "Correct cost price", "Archive product", "Restore product".

Dates as "Wed 12 Nov"; amounts as "GH₵ 1,240.50".

## 12. Simplicity rules (unchanged)

The revision 1 rules all stay: one main action, plain taps only, words with every icon, money changes confirmed in words, undo-friendly, no hidden settings, consistent places, gentle language, numbers first, help in context. **Rotation and split screen never require a gesture:** everything still works with simple taps.

## 13. Accessibility

- **Contrast:** WCAG 2.1 AA for all text (§3.3), and 3:1 for the outlines of controls.
- **Colour:** never the only signal; status always has a word.
- **Screen readers:** **TalkBack (Android) and VoiceOver (iOS).**
  - Every button and figure has a spoken label; figures are read with their meaning, for example "Average cost, about 1 cedi 10 pesewas".
  - Reading order follows the visual order. Two panes are read list first, then Details.
- **Text size:** every system size up to the largest (§4), **with no cap anywhere, including the tab bar**. The layout adapts (wrapping, growing, stacking, scrolling); clipping is never solved by limiting text scaling.
- **Keyboard behaviour (on-screen keyboard):**
  - fields never open the keyboard by themselves;
  - the focused field and the Save / Cancel bar stay visible above the keyboard, in portrait and landscape;
  - "Next" moves to the next field in reading order, and the last field's "Done" closes the keyboard;
  - number fields use the number keyboard.
- **Reduce Motion:** §8.
- **Touch:** targets of at least 48 dp; no time limits; no gestures required.
- A hardware keyboard and mouse are **not** in scope for Stage 1C-3. They belong to the browser milestone PW-1.

## 14. Performance (Galaxy A06 as the reference device)

The Samsung Galaxy A06 (Android 16, low-end) is the reference: if it's smooth there, it's acceptable. On the A06:
- **Scrolling** a list of 35 or more products shows no visible stutter (owner observation).
- **Product Details, sheets and forms** open without a visible delay, and the first list load is not slower than at `75f8aa6`.
- **Rotating** the phone does not stutter or trigger extra data loading beyond the normal throttled refresh.
- **Animations** never block taps.

**Design limits that make this possible:**
- no shadows on list rows, no blur, no large images;
- animations only on the native driver, with list entrances capped at 8 rows;
- lists stay virtualised, so they cope with 1,000 or more products;
- skeletons rather than spinners.

**Size:** app size under about 30 MB stays the target, to be measured with builds [A].

## 15. To validate with pilot users (revision 1 questions, plus new ones)

1. The green and gold palette: trustworthy and local?
2. Tile and text sizes at arm's length in daylight?
3. "Profit after expenses" and "Money owed to you" understood?
4. Does ₵ display on their phones?
5. Is the decorative pattern welcome?
6. *(new)* Are the light headers clear enough in sunlight?
7. *(new)* Are "Average cost (about)", "Last known" and "Margin (about)" understood?
8. *(new)* Do owners use phones sideways, and tablets, in the shop?

## 16. Delivery and acceptance (by reference)

Where the work is delivered and how it is accepted is defined in [STAGE-1C-3-PLAN.md](../stages/STAGE-1C-3-PLAN.md):
- §7: increments 1C-3.1 – 1C-3.6 and their acceptance criteria;
- §8.1: device checklists DET, ORI and TAB;
- §6.5 item 4: final iPhone and iPad checks on an approved iOS build before the iOS release gate.

Spec-level acceptance, checked from 1C-3.3 onward:
1. Redesigned screens use only the components in §5.3 and the colour roles in §3.2. An automated check finds no one-off colours or font sizes.
2. Every colour pair in use meets §3.3.
3. Only the system font is used (an automated check).
4. Every screen passes at 100 %, 130 % and the largest text size, in portrait and (from 1C-3.5) landscape, with nothing clipped. An automated check finds **no text-scaling cap** (`maxFontSizeMultiplier`) and **no disabled scaling** (`allowFontScaling={false}`) on any text.
5. TalkBack and VoiceOver can complete: open Products, open Details, Edit, Save, Change price.
6. With Reduce Motion on, nothing animates.
7. The Galaxy A06 criteria in §14 are met.

## 17. Decisions with this revision (V-1 – V-6 agreed by the owner and approved with C-1a, 25 Nov 2026)

| # | Decision | Recommendation |
|---|---|---|
| V-1 | "Stock value (about)" on Product Details | **Agreed:** current stock quantity × current calculated average cost; only in cost state 1; hidden whenever the current cost isn't available |
| V-2 | Light headers with dark text | **Agreed** |
| V-3 | Colour corrections: success text `#166B3E`, input outlines `#857E74`, header `#EEF6F1` | **Agreed:** all three together, in 1C-3.2 |
| V-4 | Checkpoint split | **Agreed:** **C-1a** is written specification approval (this document; **approved 25 Nov 2026**); **C-1b** is a physical review of the component gallery on the Galaxy A06 and the iPhone after 1C-3.2, before any screen redesign |
| V-5 | Numbering | **Agreed:** spec 08 revision 2; specification set revision 5.2 (on C-1a approval) |
| V-6 | Follow-up documentation | **Done with adoption (25 Nov 2026):** `03-screens.md` updated (S-30, S-31, S-37), `design-preview.html` marked as revision 1, `STAGE-1C-2-VISUAL-DESIGN.md` marked as superseded |
| C-1a | Approval of this written specification | **APPROVED by the owner (25 Nov 2026)** |
| C-1b | Physical review of the component gallery on the Galaxy A06 and the iPhone, after 1C-3.2 and before any screen redesign | **Pending (mandatory)** |
