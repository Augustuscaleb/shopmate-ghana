/**
 * Strict readers for server results. Money is integer pesewas (05 C-01): anything else is
 * rejected rather than displayed wrongly (as in dashboard.ts).
 */
export class ResultError extends Error {
  constructor(field: string) {
    super(`unexpected server result: ${field}`);
    this.name = 'ResultError';
  }
}

type Obj = Record<string, unknown>;

export function asObject(value: unknown, field = 'result'): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ResultError(field);
  return value as Obj;
}

/** Signed integer pesewas within the safe integer range. */
export function pesewas(o: Obj, field: string): number {
  const v = o[field];
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new ResultError(field);
  return v;
}

/** A whole number of units (stock may be negative, 05 C-120). */
export function wholeNumber(o: Obj, field: string, { min }: { min?: number } = {}): number {
  const v = o[field];
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || (min !== undefined && v < min)) throw new ResultError(field);
  return v;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(o: Obj, field: string): string {
  const v = o[field];
  if (typeof v !== 'string' || !UUID.test(v)) throw new ResultError(field);
  return v;
}

export function text(o: Obj, field: string, { nullable = false }: { nullable?: boolean } = {}): string | null {
  const v = o[field];
  if (v === null && nullable) return null;
  if (typeof v !== 'string') throw new ResultError(field);
  return v;
}

/** A calendar date as the server returns it (YYYY-MM-DD). */
export function isoDate(o: Obj, field: string): string {
  const v = o[field];
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ResultError(field);
  return v;
}

export function bool(o: Obj, field: string): boolean {
  const v = o[field];
  if (typeof v !== 'boolean') throw new ResultError(field);
  return v;
}
