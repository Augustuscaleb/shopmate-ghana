# 08 — Visual Design Direction

**Status:** Proposal for review. Almost every choice here is **[A]**, a reasoned design decision to be tested with pilot users.

A visual mock-up is in [design-preview.html](design-preview.html). Download it and open it in any browser.

## 1. Design goals

| Goal | Why | Evidence |
|---|---|---|
| **Readable in bright sunlight**, on low-cost screens | Shops are often open-fronted; budget phones have dimmer screens | [A] |
| **Fast at the counter**: big targets, few steps | Owners serve customers while recording | [A]; research: tools must be easier than paper [V] |
| **Trustworthy and calm**: it handles money | Owners worry about losing records | Kippa outage [V]; data-trust concern [A] |
| **Familiar and local without clichés** | Feels made for Ghana: GH₵, MoMo, "the book" | [A] |
| **Light on data and battery** | Data cost; power cuts | Usage gap and outages [V] |

## 2. Personality

**Practical · warm · trustworthy · encouraging.**

Like a reliable shop assistant, not a bank and not a game. Celebrate small wins ("First sale saved! 🎉") sparingly.

## 3. Colour palette (D-01)

| Role | Name | Hex | Use | Contrast notes |
|---|---|---|---|---|
| Primary | Shop Green | `#0B6B4F` | Main buttons, active tab, headers | White text on it ≈ 6.4:1 (passes WCAG AA) |
| Primary dark | Deep Green | `#084C38` | Pressed states, status bar | |
| Accent | Market Gold | `#F4B400` | Highlights, key-figure underline, first-sale celebration | **Dark text only** on gold (never white) |
| Background | Warm White | `#FAF8F3` | Screen background | Softer than pure white in strong light [A] |
| Surface | White | `#FFFFFF` | Cards | |
| Text | Ink | `#1C1B19` | Main text | ≈ 16:1 on white |
| Text secondary | Stone | `#5A5550` | Captions | ≈ 7:1 on white |
| Border | Sand | `#E4DFD5` | Dividers, card borders | |
| Success | Green | `#1E7F4F` | ✓ Synced, "Balanced" | Always with icon + word |
| Warning | Amber text / bg | `#8A5300` / `#FFF4D6` | Low stock, pending, credit-limit warning | |
| Danger | Red text / bg | `#B42318` / `#FDECEA` | Failed sync, negative stock, short cash, void | |
| Neutral status | Grey | `#6B6B6B` | ⏱ Pending | |

**Payment-method markers:** always **icon + word**, never colour alone (colour-blind safe).

| Method | Icon | Colour |
|---|---|---|
| Cash | 💵 banknote | `#1E7F4F` |
| MoMo | 📱 phone | `#3949AB` |
| Credit | 📒 book | `#8A5300` |

**Do not** use any mobile network's brand colours or logos (MTN, Telecel, AirtelTigo). "MoMo" appears only as a word. *Trademark and neutrality.*

**National colours:**
- Red, gold and green appear in our palette in muted form only.
- We avoid the flag, the Black Star and Kente reproductions as decoration. These carry national and cultural meaning, and their use is best validated with users first [A].
- An optional subtle geometric pattern (simple triangles/lines) may be used on the Welcome screen only.

## 4. Typography (D-02)

- **Font: Roboto**, the Android system font. Nothing to download, so it saves data and app size.
- The cedi sign (₵) must render correctly. **Test on 3+ low-end devices.** If ₵ fails on any device, fall back to displaying "GHS".
- **Numbers use tabular figures** so amounts line up in lists.

| Style | Size (sp) | Weight | Use |
|---|---|---|---|
| Key figure | 32 (single) / 24 (two side by side) | Bold | Today's sales/profit, balances. The mock-up showed that two side-by-side figures such as "GH₵ 1,240.50" only just fit at 24 sp on a 360 dp-wide phone. On narrower screens, or with large font settings, they stack vertically |
| Title | 22 | Medium | Screen titles |
| Section | 18 | Medium | Card headings |
| Body | 16 | Regular | Default text (minimum for content) |
| Caption | 14 | Regular | Secondary info (never smaller) |

Must respect the phone's font-size setting up to 130%, without breaking layouts.

## 5. Layout and components (D-03)

| Component | Spec |
|---|---|
| Touch targets | **Minimum 48 × 48 dp**. Primary action buttons are 56 dp high and full width |
| Spacing | 8 dp grid; 16 dp screen padding |
| Cards | White, 12 dp radius, 1 dp Sand border, no heavy shadows (cheap to render) |
| Product tiles (New Sale) | 2 columns on small phones, 3 on larger; name (2 lines max), price, stock badge |
| Bottom bar | 5 tabs, icon + label always visible |
| Primary button | Shop Green, white bold text, 56 dp |
| Secondary button | White, green border and text |
| Destructive button | Red text with a confirmation dialog |
| Number entry | Large numeric keypad layout for amounts, with "GH₵" prefix shown |
| Status chips | Icon + word: ✓ Synced · ⏱ Waiting · ⚠ Needs attention |
| Banners | Full-width, under the header: grey for offline, amber for pending, red for failed |

## 6. Iconography (D-04)

- Material Symbols (outlined), matching Android. **Always paired with a text label** in navigation and buttons.
- Emoji appear only in friendly messages, never as the sole meaning.

## 7. Language and tone (D-05)

- Simple Ghanaian English; short sentences; avoid accounting jargon.
- Write for later translation into Twi (no idioms that won't translate).

| Instead of | Say |
|---|---|
| Accounts receivable | Money owed to you |
| Debtor | Customer who owes |
| COGS | Cost of items sold |
| Net income | Profit after expenses |
| Inventory adjustment | Correct stock |
| Transaction failed to synchronise | This sale couldn't upload |
| Authenticate | Log in |
| Void | Cancel sale (button) — "voided" in history |

- **Amounts:** always `GH₵ 1,240.50`. Dates: "Wed 12 Nov". Times: 24-hour or am/pm per the phone setting.
- **Tone with customers' debts:** neutral and respectful. Reminder templates must never shame customers.

## 8. Accessibility (D-06)

- WCAG 2.1 AA contrast for all text.
- Never rely on colour alone (icons + words).
- Screen-reader labels for all buttons (TalkBack).
- Support large font settings.
- Avoid time-limited interactions.

## 9. Performance-driven design (D-07)

- No heavy images or animations. App icon and illustrations as simple vector shapes.
- Target an installed app size under about 30 MB [A: to be measured with Expo builds].
- Lists virtualised so they stay smooth with 1,000+ products.
- Skeleton loading instead of spinners where possible.

## 10. To validate with pilot users

1. Green/gold palette: does it feel trustworthy and local?
2. Are tile sizes and fonts comfortable at arm's length in daylight?
3. Do owners understand "Profit after expenses" and "Money owed to you"?
4. Does the ₵ sign display on their phones?
5. Is the optional decorative pattern welcome or unnecessary?
