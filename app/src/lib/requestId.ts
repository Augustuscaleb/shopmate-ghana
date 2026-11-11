import { randomUUID } from 'expo-crypto';

/** Idempotency key for server-function calls (09 §4.3). */
export function newRequestId(): string {
  return randomUUID();
}
