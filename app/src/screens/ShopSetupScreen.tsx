import { useState } from 'react';
import { Button, Choice, Field, Notice, Screen } from '../ui/components';
import { SHOP_TYPES, validateShop, type ShopInput, type ShopType } from '../auth/validation';
import type { AccountService, Business } from '../services/account';

/** S-04 Shop details. Creates the business (owner-only, pilot plan) via create_business. */
export function ShopSetupScreen({ account, onCreated, onSignOut }: { account: AccountService; onCreated: (b: Business) => void; onSignOut: () => void }) {
  const [input, setInput] = useState<ShopInput>({ name: '', type: '', town: '', phone: '' });
  const [errors, setErrors] = useState<ReturnType<typeof validateShop>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ShopInput) => (v: string) => setInput((s) => ({ ...s, [k]: v }));

  async function submit() {
    const e = validateShop(input);
    setErrors(e);
    setFormError(undefined);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      onCreated(await account.createMyBusiness(input));
    } catch {
      setFormError('We couldn\'t save your shop. Check your internet connection and try again. Your details are still here.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Your shop" subtitle="Tell us about your shop. You can change these details later.">
      <Field label="Shop name" value={input.name} onChangeText={set('name')} error={errors.name} autoCapitalize="words" />
      <Choice<ShopType> label="Type of shop" options={SHOP_TYPES} value={input.type} onChange={set('type')} error={errors.type} />
      <Field label="Town or area (optional)" value={input.town} onChangeText={set('town')} error={errors.town} autoCapitalize="words" />
      <Field label="Shop phone (optional)" value={input.phone} onChangeText={set('phone')} error={errors.phone} keyboardType="phone-pad" hint="Shown on receipts, e.g. 0241234567" />
      {formError ? <Notice tone="error" text={formError} /> : null}
      <Button label="Save my shop" onPress={submit} busy={busy} />
      <Button label="Log out" kind="link" onPress={onSignOut} />
    </Screen>
  );
}
