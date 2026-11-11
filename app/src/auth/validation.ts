/**
 * Input validation for sign-up and shop setup. Rules mirror the database
 * constraints (supabase/migrations) so owners see a friendly message before
 * the server rejects anything.
 */
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export const SHOP_TYPES = [
  { value: 'provision', label: 'Provision store' },
  { value: 'minimart', label: 'Mini-mart' },
  { value: 'boutique', label: 'Boutique' },
  { value: 'other', label: 'Other' },
] as const;
export type ShopType = (typeof SHOP_TYPES)[number]['value'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Same pattern as the database: 0XXXXXXXXX or +233XXXXXXXXX
const GHANA_PHONE_RE = /^(\+233|0)[0-9]{9}$/;

export function normalisePhone(input: string): string {
  return input.replace(/[\s-]/g, '');
}

export function validateEmail(email: string): string | undefined {
  return EMAIL_RE.test(email.trim()) ? undefined : 'Enter a valid email address.';
}

export function validateFullName(name: string): string | undefined {
  const n = name.trim();
  if (!n) return 'Enter your name.';
  if (n.length > 100) return 'Name is too long (100 characters maximum).';
  return undefined;
}

export type ShopInput = { name: string; type: ShopType | ''; town: string; phone: string };

export function validateShop(input: ShopInput): FieldErrors<keyof ShopInput> {
  const errors: FieldErrors<keyof ShopInput> = {};
  const name = input.name.trim();
  if (!name) errors.name = 'Enter the shop name.';
  else if (name.length > 100) errors.name = 'Shop name is too long (100 characters maximum).';
  if (!SHOP_TYPES.some((t) => t.value === input.type)) errors.type = 'Choose the type of shop.';
  if (input.town.trim().length > 100) errors.town = 'Town is too long (100 characters maximum).';
  const phone = normalisePhone(input.phone);
  if (phone && !GHANA_PHONE_RE.test(phone)) {
    errors.phone = 'Enter a Ghana phone number, e.g. 0241234567 or +233241234567.';
  }
  return errors;
}
