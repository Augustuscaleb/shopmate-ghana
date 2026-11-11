import { describe, expect, it } from 'vitest';
import { validateEmail, validateShop } from './validation';

describe('Sign-up and shop setup validation', () => {
  it('TC-AUTH-04: accepts Ghana phone formats used by the database and rejects others', () => {
    const base = { name: 'Ama Provisions', type: 'provision' as const, town: 'Accra' };
    expect(validateShop({ ...base, phone: '024 123 4567' })).toEqual({});
    expect(validateShop({ ...base, phone: '+233241234567' })).toEqual({});
    expect(validateShop({ ...base, phone: '' })).toEqual({});
    expect(validateShop({ ...base, phone: '12345' }).phone).toBeDefined();
  });

  it('TC-AUTH-05: requires shop name and a valid shop type; validates email', () => {
    const errors = validateShop({ name: '  ', type: '', town: '', phone: '' });
    expect(errors.name).toBeDefined();
    expect(errors.type).toBeDefined();
    expect(validateEmail('owner@example.test')).toBeUndefined();
    expect(validateEmail('not-an-email')).toBeDefined();
  });
});
