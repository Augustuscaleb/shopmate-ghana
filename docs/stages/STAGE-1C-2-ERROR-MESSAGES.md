# Stage 1C-2 plain-language error messages — for owner review

**Status: PROPOSED (24 Nov 2026), used by the app from increment 1; wording subject to the owner's review.** Generated from `app/src/services/errorMessages.ts` (the single source). Rules: 07 E-02 (what happened + what to do; no codes or technical words), E-04 (offline). A test (`tests/app-error-handling.test.ts`) checks that every error code the migrations raise is either listed here or deliberately internal, and that nothing here is stale.

## General messages

| When | Message |
|---|---|
| No answer from the server (offline, timeout) | This needs internet. Your data is safe — try again when you're connected. |
| An internal or unknown error | Something went wrong on our side. Nothing was changed. Please try again. If it keeps happening, contact support. |
| An earlier change's outcome is unknown and the owner submits different details | Your last change may already have been saved. Refresh the product and check its current details before trying again. *(owner wording, 25 Nov 2026; replaces the earlier reference to the product's history)* |
| A duplicate name from a direct write (categories) | That name is already used. Choose a different name. |

### Added in increment 2 (for owner review; not yet approved)

| When | Message |
|---|---|
| Sent, but no answer came back (outcome unknown; retry is safe) | The connection dropped before we got an answer, so we can't tell yet whether this was saved. Try again when you're connected — it won't be saved twice. |
| The general "no answer" message above is now used only when nothing was sent (offline) | *(unchanged wording)* |
| Quick price or edit: someone else changed the price meanwhile (nothing saved) | Someone else changed the price to GH₵ {new price} while you were editing. Nothing was saved. Check it, then save again to use your price. |
| Edit: someone else changed other edited fields meanwhile (nothing saved) | Someone else changed this product's {fields} while you were editing. Nothing was saved. The latest values are shown; check them, then save again. |
| Correct cost price: the stock changed after the screen opened (nothing saved) | The stock changed while you were on this screen (now {qty}). Nothing was saved. Check the new figures, then save again. |
| A category add confirmed by reading it back after a lost reply | {name} is saved in your categories. |

### Added in increment 2b (owner wording, 25 Nov 2026)

| When | Message |
|---|---|
| A category rename or archive from a screen that showed an older version (renamed or archived on another device meanwhile); nothing saved, the list reloads | This category was changed on another device. Nothing was saved. The list has been refreshed. Review it and try again. |
| (screen notes, not errors) A product open for editing, or a cost correction, was changed on another device | This product was changed on another device. The latest details are shown. / The stock was changed on another device. The latest figures are shown. |
| (indicator) A refresh failed; the last data stays on screen | Last updated {time} · couldn't refresh |

**Fix in increment 2:** a known code now wins over the generic duplicate message. Before, `duplicate_product_name` (raised with SQLSTATE 23505) showed "That name is already used…" instead of its own message. Test: MSG-03b.

**Category limitation:** the read-back after a lost category add relies on a note kept in the app's memory. It does **not** survive an app restart: after a restart, a retry of a lost add is refused as a duplicate ("That name is already used…") although the category exists and is shown in the list. Category writes do **not** have request-ID idempotency (the Stage 1A grant lets the app insert only `business_id` and `name`).

## Messages by error code (59)

| Area | Code | Message |
|---|---|---|
| Access | `not_authenticated` | You have been logged out. Please log in again. |
| Access | `not_a_member` | Your account doesn't have access to this shop. Contact the shop owner if you think this is a mistake. |
| Products and categories | `name_required` | Enter a name. |
| Products and categories | `name_too_long` | That name is too long. Please shorten it. |
| Products and categories | `duplicate_product_name` | You already have a product with this name. Use a different name. |
| Products and categories | `unit_too_long` | That unit is too long. Please shorten it. |
| Products and categories | `invalid_selling_price` | Enter a selling price above GH₵ 0.00 (up to GH₵ 1,000,000). |
| Products and categories | `invalid_cost_price` | Enter a cost price of GH₵ 0.00 or more (up to GH₵ 1,000,000). |
| Products and categories | `invalid_opening_stock` | Enter an opening stock of 0 or more (up to 100,000). |
| Products and categories | `cost_price_needs_opening_stock` | A cost price needs some opening stock. Enter the stock you have, or leave the cost empty for now. |
| Products and categories | `invalid_low_stock_level` | Enter a low-stock level of 0 or more (up to 100,000). |
| Products and categories | `category_not_found` | That category can't be found. Refresh the list or choose another. |
| Products and categories | `category_archived` | That category is archived. Choose another category. |
| Products and categories | `category_in_use` | This category still has products. Move them to another category first. |
| Products and categories | `product_not_found` | This product can't be found. It may have been deleted. Go back and refresh the list. |
| Products and categories | `product_changed` | Someone else changed this product just now. Nothing was saved. The latest details are shown; check them, then save again. *(increment 2 review; raised by `update_product` when the expected values differ, migration 20261125000300, local only)* |
| Products and categories | `product_archived` | This product is archived. Restore it before recording a restock. |
| Cost correction (T4) | `zero_stock` | There is no stock to value. Record a restock first; its cost becomes the average. |
| Cost correction (T4) | `negative_stock` | Stock is below zero. Record the missing restock or correct the count first. |
| Cost correction (T4) | `zero_cost_for_unknown_cost` | A cost of GH₵ 0.00 can't be set this way. If the item really cost nothing, enter it when adding the product. |
| Cost correction (T4) | `reason_required` | Please give a short reason. |
| Cost correction (T4) | `reason_too_long` | That reason is too long. Please shorten it. |
| Cost correction (T4) | `set_cost_first` | This product has no cost price yet. Set its cost price first, then try again. |
| Restock (T5) | `invalid_qty` | Enter a quantity of at least 1 (up to 100,000). |
| Restock (T5) | `qty_limit_exceeded` | That quantity is too large. The most is 100,000 at a time. |
| Restock (T5) | `invalid_purchase_cost` | Enter the total purchase cost: GH₵ 0.00 or more, up to GH₵ 1,000,000. |
| Restock (T5) | `invalid_paid_now` | Amount paid now must be GH₵ 0.00 or more, and not more than the purchase cost. |
| Restock (T5) | `invalid_paid_from` | Choose where the money came from: cash drawer, MoMo or other. |
| Restock (T5) | `paid_from_required` | Choose where the money came from: cash drawer, MoMo or other. |
| Restock (T5) | `invalid_purchase_date` | That date isn't possible. Choose today or a past date after your shop was set up. |
| Restock (T5) | `supplier_name_too_long` | That supplier name is too long. Please shorten it. |
| Restock (T5) | `note_too_long` | That note is too long. Please shorten it (300 characters at most). |
| Stock adjustment (T6) | `invalid_reason` | Choose a reason from the list. |
| Stock adjustment (T6) | `count_or_change_required` | Enter either the counted quantity or the change, not both. |
| Stock adjustment (T6) | `invalid_count` | Enter a counted quantity of 0 or more. |
| Stock adjustment (T6) | `invalid_qty_change` | Enter a change other than 0 (up to 100,000). |
| Stock adjustment (T6) | `count_below_zero` | The count can't be below 0. |
| Stock adjustment (T6) | `reason_requires_decrease` | This reason is only for stock going down. |
| Stock adjustment (T6) | `insufficient_stock` | There isn't that much in stock. Correct the count first, or enter a smaller number. |
| Stock adjustment (T6) | `note_required` | Please add a short note explaining this change. |
| Supplier payments (T7) | `purchase_not_found` | This purchase can't be found. Go back and refresh the list. |
| Supplier payments (T7) | `invalid_amount` | Enter an amount above GH₵ 0.00, up to GH₵ 1,000,000. |
| Supplier payments (T7) | `amount_exceeds_unpaid` | That's more than is still owed on this purchase. Enter the amount owed or less. |
| Supplier payments (T7) | `nothing_owed` | Nothing is owed on this purchase any more. |
| Supplier payments (T7) | `invalid_payment_date` | That date isn't possible. Choose today or a date after the purchase. |
| Return to supplier (T8) | `invalid_credit_amount` | Enter the credit as GH₵ 0.00 or more. |
| Return to supplier (T8) | `invalid_credit_type` | Choose how the supplier settled it: cash refund, MoMo refund, or less to pay. |
| Return to supplier (T8) | `credit_exceeds_unpaid` | That credit is more than is still owed on this purchase. Choose a refund instead, or enter a smaller amount. |
| Return to supplier (T8) | `purchase_required` | Choose which purchase to reduce. |
| Return to supplier (T8) | `purchase_product_mismatch` | That purchase is for a different product. Choose a purchase of this product. |
| Purchase correction (T9) | `invalid_cost_change` | Enter a cost change other than GH₵ 0.00. |
| Purchase correction (T9) | `invalid_corrected_cost` | The corrected cost can't be below GH₵ 0.00 or above GH₵ 1,000,000. |
| Purchase correction (T9) | `invalid_corrected_qty` | The corrected quantity must be at least 1. |
| Purchase correction (T9) | `refund_required` | You have paid more than the corrected cost. Record the refund the supplier gave you. |
| Purchase correction (T9) | `refund_not_needed` | No refund is needed for this correction. Remove the refund and try again. |
| Purchase correction (T9) | `invalid_refund_amount` | The refund can't be below GH₵ 0.00. |
| Purchase correction (T9) | `invalid_refund_method` | Choose how the refund was received: cash or MoMo. |
| Needs attention (T10) | `attention_item_not_found` | This item can't be found. Go back and refresh the list. |
| Needs attention (T10) | `not_acknowledgeable` | This item clears only when the problem is fixed. Use one of the actions on the card. |

## Screen notes

- **`refund_required` (S-39, increment 7):** the server also returns the exact refund in the error details, as JSON `{"refund_amount": <pesewas>}` (`correct_purchase`, worked out under the purchase lock: the amount paid beyond the corrected cost). The screen must show that amount exactly, formatted as GH₵, and send it back unchanged; the app never calculates or estimates the refund itself. Verified against the real local API by test APPERR-05 (`tests/app-error-handling.test.ts`: details `{ refund_amount: 300 }` for a GH₵ 3.00 excess).
- **`paid_from_required` and `invalid_paid_from`** share one message on purpose.

## Internal codes (21): the owner sees the general message

These can only come from a programming mistake or an impossible range, never from normal use: `archived_flag_required`, `change_mismatch`, `empty_movement`, `invalid_correction_type`, `invalid_limit`, `invalid_offset`, `message_data_must_be_object`, `products_required`, `purchase_movement_not_found`, `qty_required`, `request_id_required`, `request_id_reused`, `type_required`, `unexpected_outflow_movement`, `value_required`, `average_out_of_range`, `stock_qty_out_of_range`, `stock_value_out_of_range`, `amount_out_of_range`. Added in the increment 2 review: `expected_values_required` and `invalid_expected_values` (`update_product` called without, or with malformed, expected values; the app always sends them).
