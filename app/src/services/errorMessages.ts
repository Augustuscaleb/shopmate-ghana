/**
 * Plain-language messages for server error codes (07 E-02: what happened + what to do; no codes
 * or technical words). Owner decision (24 Nov 2026): prepared for review and used by the app.
 * The review table is docs/stages/STAGE-1C-2-ERROR-MESSAGES.md; a unit test checks that every
 * code raised by the migrations has a message here.
 */
import type { RpcFailure } from './rpcErrors';

/** E-04: online-only actions attempted offline, or a request with no response. */
export const OFFLINE_MESSAGE = "This needs internet. Your data is safe — try again when you're connected.";
export const GENERIC_MESSAGE = 'Something went wrong on our side. Nothing was changed. Please try again. If it keeps happening, contact support.';
export const UNCONFIRMED_MESSAGE = "Your last change may already have been saved, because the connection dropped before we got an answer. Check the product's history before trying again.";

/** Codes that only a programming mistake can cause: the owner sees the generic message. */
const INTERNAL = new Set([
  'archived_flag_required', 'change_mismatch', 'empty_movement', 'invalid_correction_type', 'invalid_limit', 'invalid_offset',
  'message_data_must_be_object', 'products_required', 'purchase_movement_not_found', 'qty_required', 'request_id_required',
  'request_id_reused', 'type_required', 'unexpected_outflow_movement', 'value_required', 'average_out_of_range',
  'stock_qty_out_of_range', 'stock_value_out_of_range', 'amount_out_of_range',
]);

export const MESSAGES: Readonly<Record<string, string>> = {
  // Access
  not_authenticated: 'You have been logged out. Please log in again.',
  not_a_member: "Your account doesn't have access to this shop. Contact the shop owner if you think this is a mistake.",
  // Products and categories
  name_required: 'Enter a name.',
  name_too_long: 'That name is too long. Please shorten it.',
  duplicate_product_name: 'You already have a product with this name. Use a different name.',
  unit_too_long: 'That unit is too long. Please shorten it.',
  invalid_selling_price: 'Enter a selling price above GH₵ 0.00 (up to GH₵ 1,000,000).',
  invalid_cost_price: 'Enter a cost price of GH₵ 0.00 or more (up to GH₵ 1,000,000).',
  invalid_opening_stock: 'Enter an opening stock of 0 or more (up to 100,000).',
  cost_price_needs_opening_stock: 'A cost price needs some opening stock. Enter the stock you have, or leave the cost empty for now.',
  invalid_low_stock_level: 'Enter a low-stock level of 0 or more (up to 100,000).',
  category_not_found: "That category can't be found. Refresh the list or choose another.",
  category_archived: 'That category is archived. Choose another category.',
  category_in_use: 'This category still has products. Move them to another category first.',
  product_not_found: "This product can't be found. It may have been deleted. Go back and refresh the list.",
  product_archived: 'This product is archived. Restore it before recording a restock.',
  // Cost correction (T4)
  zero_stock: 'There is no stock to value. Record a restock first; its cost becomes the average.',
  negative_stock: 'Stock is below zero. Record the missing restock or correct the count first.',
  zero_cost_for_unknown_cost: "A cost of GH₵ 0.00 can't be set this way. If the item really cost nothing, enter it when adding the product.",
  reason_required: 'Please give a short reason.',
  reason_too_long: 'That reason is too long. Please shorten it.',
  set_cost_first: 'This product has no cost price yet. Set its cost price first, then try again.',
  // Restock (T5)
  invalid_qty: 'Enter a quantity of at least 1 (up to 100,000).',
  qty_limit_exceeded: 'That quantity is too large. The most is 100,000 at a time.',
  invalid_purchase_cost: 'Enter the total purchase cost: GH₵ 0.00 or more, up to GH₵ 1,000,000.',
  invalid_paid_now: 'Amount paid now must be GH₵ 0.00 or more, and not more than the purchase cost.',
  invalid_paid_from: 'Choose where the money came from: cash drawer, MoMo or other.',
  paid_from_required: 'Choose where the money came from: cash drawer, MoMo or other.',
  invalid_purchase_date: "That date isn't possible. Choose today or a past date after your shop was set up.",
  supplier_name_too_long: 'That supplier name is too long. Please shorten it.',
  note_too_long: 'That note is too long. Please shorten it (300 characters at most).',
  // Stock adjustment (T6)
  invalid_reason: 'Choose a reason from the list.',
  count_or_change_required: 'Enter either the counted quantity or the change, not both.',
  invalid_count: 'Enter a counted quantity of 0 or more.',
  invalid_qty_change: 'Enter a change other than 0 (up to 100,000).',
  count_below_zero: "The count can't be below 0.",
  reason_requires_decrease: 'This reason is only for stock going down.',
  insufficient_stock: "There isn't that much in stock. Correct the count first, or enter a smaller number.",
  note_required: 'Please add a short note explaining this change.',
  // Supplier payments (T7)
  purchase_not_found: "This purchase can't be found. Go back and refresh the list.",
  invalid_amount: 'Enter an amount above GH₵ 0.00, up to GH₵ 1,000,000.',
  amount_exceeds_unpaid: "That's more than is still owed on this purchase. Enter the amount owed or less.",
  nothing_owed: 'Nothing is owed on this purchase any more.',
  invalid_payment_date: "That date isn't possible. Choose today or a date after the purchase.",
  // Return to supplier (T8)
  invalid_credit_amount: 'Enter the credit as GH₵ 0.00 or more.',
  invalid_credit_type: 'Choose how the supplier settled it: cash refund, MoMo refund, or less to pay.',
  credit_exceeds_unpaid: "That credit is more than is still owed on this purchase. Choose a refund instead, or enter a smaller amount.",
  purchase_required: 'Choose which purchase to reduce.',
  purchase_product_mismatch: "That purchase is for a different product. Choose a purchase of this product.",
  // Purchase correction (T9)
  invalid_cost_change: 'Enter a cost change other than GH₵ 0.00.',
  invalid_corrected_cost: "The corrected cost can't be below GH₵ 0.00 or above GH₵ 1,000,000.",
  invalid_corrected_qty: 'The corrected quantity must be at least 1.',
  refund_required: 'You have paid more than the corrected cost. Record the refund the supplier gave you.',
  refund_not_needed: "No refund is needed for this correction. Remove the refund and try again.",
  invalid_refund_amount: "The refund can't be below GH₵ 0.00.",
  invalid_refund_method: 'Choose how the refund was received: cash or MoMo.',
  // Needs attention (T10)
  attention_item_not_found: "This item can't be found. Go back and refresh the list.",
  not_acknowledgeable: 'This item clears only when the problem is fixed. Use one of the actions on the card.',
};

/** PostgreSQL unique violation from a direct write (categories: one name per shop). */
const UNIQUE_VIOLATION = '23505';
export const DUPLICATE_NAME_MESSAGE = 'That name is already used. Choose a different name.';

export function isInternalCode(code: string): boolean {
  return INTERNAL.has(code);
}

/** The message to show for a failed call. */
export function messageFor(failure: RpcFailure): string {
  if (failure.kind === 'no_response') return OFFLINE_MESSAGE;
  if (failure.sqlState === UNIQUE_VIOLATION) return DUPLICATE_NAME_MESSAGE;
  if (INTERNAL.has(failure.code)) return GENERIC_MESSAGE;
  return MESSAGES[failure.code] ?? GENERIC_MESSAGE;
}
