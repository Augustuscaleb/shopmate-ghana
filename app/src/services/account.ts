import type { SupabaseClient } from '@supabase/supabase-js';
import type { SecureKeyValueStore } from '../lib/chunkedSecureStorage';
import { normalisePhone, type ShopInput } from '../auth/validation';

export type Business = { id: string; name: string; reference_code: string };
export type Device = { deviceId: string; deviceCode: string };

/**
 * Onboarding services. Each server write uses an idempotency key that is saved
 * in secure storage BEFORE the call, so a retry after a crash or lost reply
 * reuses the same key and the server returns the original result (09 §4.3)
 * instead of creating a duplicate shop or device.
 */
export class AccountService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly store: SecureKeyValueStore,
    private readonly newId: () => string,
  ) {}

  /** The owner's business, or null if setup hasn't been done yet. */
  async fetchMyBusiness(): Promise<Business | null> {
    const { data, error } = await this.client
      .from('businesses')
      .select('id, name, reference_code')
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) throw error;
    return (data?.[0] as Business | undefined) ?? null;
  }

  async createMyBusiness(input: ShopInput): Promise<Business> {
    const requestId = await this.pendingRequestId('create_business');
    const { data, error } = await this.client.rpc('create_business', {
      p_request_id: requestId,
      p_name: input.name.trim(),
      p_type: input.type,
      p_town: input.town.trim() || null,
      p_phone: normalisePhone(input.phone) || null,
    });
    if (error) throw error;
    await this.store.deleteItemAsync(this.pendingKey('create_business'));
    return { id: data.business_id, name: input.name.trim(), reference_code: data.reference_code };
  }

  /** Registers this phone once per business (device code A, B, ...) and remembers it. */
  async ensureDevice(businessId: string, label: string): Promise<Device> {
    const key = `shopmate.device.${businessId}`;
    const saved = await this.store.getItemAsync(key);
    if (saved) return JSON.parse(saved) as Device;

    const op = `register_device.${businessId}`;
    const requestId = await this.pendingRequestId(op);
    const { data, error } = await this.client.rpc('register_device', {
      p_request_id: requestId,
      p_business_id: businessId,
      p_label: label,
    });
    if (error) throw error;
    const device: Device = { deviceId: data.device_id, deviceCode: data.device_code };
    await this.store.setItemAsync(key, JSON.stringify(device));
    await this.store.deleteItemAsync(this.pendingKey(op));
    return device;
  }

  private pendingKey(op: string): string {
    return `shopmate.pending.${op}`;
  }

  private async pendingRequestId(op: string): Promise<string> {
    const key = this.pendingKey(op);
    const existing = await this.store.getItemAsync(key);
    if (existing) return existing;
    const id = this.newId();
    await this.store.setItemAsync(key, id);
    return id;
  }
}
