/**
 * Reading amounts and whole numbers the owner types (05 C-01: money is integer pesewas; no
 * floating point anywhere). Display uses formatCedis (services/dashboard.ts).
 */
export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

/** The largest amount the server accepts for any entered price or cost: GH₵ 1,000,000 (D6). */
export const MAX_ENTERED_PESEWAS = 100_000_000;
/** The largest quantity per movement and the largest low-stock level (D6). */
export const MAX_QTY = 100_000;

/**
 * "12", "12.5", "12.50", "1,250.00", "GH₵ 12.50" → pesewas. At most two decimal places.
 * Returns an error message in plain words for anything else.
 */
export function parseCedis(input: string): ParseResult {
  const text = input.replace(/GH₵|GHS|₵/gi, '').replace(/[\s,]/g, '');
  if (text === '') return { ok: false, error: 'Enter an amount.' };
  const m = /^(\d+)(?:\.(\d{0,2}))?$/.exec(text);
  if (!m) return { ok: false, error: 'Enter an amount like 12.50 (at most two decimal places).' };
  const cedis = m[1].replace(/^0+(?=\d)/, '');
  if (cedis.length > 7) return { ok: false, error: 'That amount is too large. The most is GH₵ 1,000,000.' };
  const pesewas = Number(cedis) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  if (pesewas > MAX_ENTERED_PESEWAS) return { ok: false, error: 'That amount is too large. The most is GH₵ 1,000,000.' };
  return { ok: true, value: pesewas };
}

/** A whole number from 0 (or `min`) to `max`; spaces and thousands commas are ignored. */
export function parseWholeNumber(input: string, { min = 0, max = MAX_QTY }: { min?: number; max?: number } = {}): ParseResult {
  const text = input.replace(/[\s,]/g, '');
  if (text === '') return { ok: false, error: 'Enter a number.' };
  if (!/^\d+$/.test(text)) return { ok: false, error: 'Enter a whole number, like 12.' };
  if (text.replace(/^0+(?=\d)/, '').length > 9) return { ok: false, error: `The most is ${max.toLocaleString('en-GB')}.` };
  const value = Number(text);
  if (value < min) return { ok: false, error: `The least is ${min}.` };
  if (value > max) return { ok: false, error: `The most is ${max.toLocaleString('en-GB')}.` };
  return { ok: true, value };
}

/** Pesewas → the editable text for a money field ("12.50"); no currency sign, no commas. */
export function pesewasToInput(pesewas: number): string {
  if (!Number.isSafeInteger(pesewas) || pesewas < 0) throw new Error('invalid amount');
  return `${Math.floor(pesewas / 100)}.${String(pesewas % 100).padStart(2, '0')}`;
}
