# 02 — User Journeys

**Persona [A]:** *Auntie Ama* runs a provision store in a busy neighbourhood. She has an Android phone she uses mainly for WhatsApp and MoMo. She keeps a notebook for credit customers and sells about 40–80 times a day. She wants to know whether she is really making profit. *(Illustrative persona built from Stage 0 research. Not a real person, and not verified.)*

Screen IDs (S-xx) refer to [03-screens.md](03-screens.md).

---

## J1 — From installation to the first sale (target: under 10 minutes)

| Step | Screen | What happens | Design notes |
|---|---|---|---|
| 1 | — | Owner installs the APK from a shared link (pilot) | Assisted in person or on a WhatsApp video call |
| 2 | S-01 Welcome | Logo, one-line promise, **"Create my shop account"** and "I already have an account" | No marketing slides |
| 3 | S-02 Sign up | Full name, email, password (min. 8 characters, show/hide toggle), agree to Terms & Privacy | Internet required; clear message if offline |
| 4 | (email) | If email confirmation is enabled: "Check your email" screen with a resend button | During the pilot, confirmation may be off if email limits are a problem (see 07) |
| 5 | S-04 Shop details | Shop name, shop type (Provision store / Mini-mart / Boutique / Other), town/area, phone (optional, for receipts) | Three fields plus type, no more |
| 6 | S-05 Starter products | "Add common items to start faster?" Shows a checklist of about 20–40 typical items for the chosen type (e.g. Milo sachet, sugar, sardine, rice 1kg). Owner ticks items and enters **selling price** and **quantity in stock**; cost price is optional now | **Skip** allowed. Names are generic and editable. Sample lists are [A] and refined with pilot shops |
| 7 | S-06 Quick tour | 3 short cards: "Record a sale", "Know who owes you", "See today's profit" | Skippable |
| 8 | S-10 Today | Empty-state dashboard with a big **New Sale** button and a checklist: ☐ Add products ☐ Record first sale ☐ Add a credit customer | Checklist disappears when done |
| 9 | S-20 New Sale | Owner taps product tiles, adjusts quantity, taps **Charge GH₵ X** | |
| 10 | S-21 Payment | Choose **Cash** / **MoMo** / **Credit**. For cash, optional "Amount received" shows change due | |
| 11 | S-22 Sale complete | ✓ "Sale saved", total, status (Synced or "Saved — will upload when online"), **New sale** and **Share receipt** | Celebrate the first sale with a short message |

**Success signal:** first sale recorded in under 10 minutes from opening the app [A — to measure in the pilot].

## J2 — Everyday sale (target: under 15 seconds)

1. Today → **New Sale**.
2. Tap a frequently sold item, which appears in the top row (most sold first). Tap again to add quantity.
3. **Charge** → **Cash** → (optional amount received) → **Done**.
4. The app returns to New Sale, ready for the next customer.

If offline: identical flow. A small banner shows "Offline — sales are saved on this phone".

## J3 — Credit sale with part payment

1. New Sale → add items → **Charge GH₵ 85.00**.
2. Choose **Credit** → pick a customer (search by name) or **+ New customer** (internet needed; offline shows "Pick an existing customer, or record as cash/MoMo and add the customer later").
3. "Paid now (optional)": owner enters **GH₵ 20.00** and chooses Cash or MoMo.
4. Confirmation: "GH₵ 65.00 added to Kofi's balance. New balance: GH₵ 140.00."
5. If the customer's credit limit would be exceeded: a warning "This takes Kofi above the credit limit of GH₵ 100. Continue?" The owner decides; this is a warning, not a block.

## J4 — Customer repays

1. Customers → Kofi → **Record repayment**.
2. Amount (pre-filled suggestion = full balance, editable), method Cash / MoMo, optional MoMo reference, date (defaults to now).
3. Save → "Kofi now owes GH₵ 40.00." Option to **Share receipt** of the repayment.

## J5 — Reminder to a customer

Customers → Kofi → **Send reminder** → WhatsApp opens with an editable message:

> "Hello Kofi, this is Ama's Provisions. Your balance with us is GH₵ 40.00. Thank you for your custom."

The owner sends it personally. Nothing is sent automatically.

## J6 — Restock after a market trip

1. Products → **Restock** (or from the low-stock list).
2. Pick a product → quantity received (option: "in packs: 2 cartons × 24 = 48") → total cost paid or unit cost.
3. Save → stock increases; the amount paid is added to the product's stock value, so the average cost (value ÷ quantity) now reflects old and new stock (see 05 §3).

## J7 — Close the day (cash count)

1. Today → **Close the day**.
2. The app shows **expected cash in drawer** = opening cash + cash sales + cash repayments − cash expenses paid from the drawer.
3. Owner counts the money and enters **counted cash**.
4. Difference shown: "Short by GH₵ 5.00" / "Over by GH₵ 2.00" / "Balanced ✓". Optional note.
5. The app also shows **MoMo received today** for the owner to compare with their MoMo wallet (no entry required).
6. Save. The counted cash can become tomorrow's opening cash.

## J8 — Dealing with a stock discrepancy

1. Today shows **Needs attention: 1 stock issue**.
2. Tap → "Sardine shows **−2** in stock after sales made offline."
3. **Count and correct** → owner enters the actual count (e.g. 10) → reason "Stock count correction" → Save. The flag is resolved; history is kept.

## J9 — Paying for a subscription (from paid launch)

Settings → Subscription → shows plan, paid-until date, amount, and **"Send GH₵ X by MoMo to 0XX XXX XXXX with reference SM-0042."** After the admin confirms the payment, the paid-until date updates. Overdue shops see a gentle banner and a 7-day grace period. **Data is never locked; export always works.**
