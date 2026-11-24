/**
 * Classifies a failed server call (supabase-js returns `{ error }` instead of throwing).
 *
 * - `definite`: the server answered with an error. Nothing was recorded: every Stage 1C write
 *   function rolls back completely, including its request claim (STAGE-1C-PLAN, T1–T10).
 * - `no_response`: the request may or may not have reached the server (no network, timeout,
 *   connection dropped). The outcome is unknown, so a retry must reuse the same request ID.
 */
export type ErrorLike = { message?: unknown; code?: unknown; details?: unknown } | null | undefined;

export type RpcFailure =
  | { kind: 'definite'; code: string; sqlState: string; details: string | null }
  | { kind: 'no_response' };

/** PostgreSQL SQLSTATE (e.g. 22023, P0002, 42501) or a PostgREST code (e.g. PGRST301): the server answered. */
const SERVER_CODE = /^([0-9A-Z]{5}|PGRST\d{3})$/;

export function classifyRpcError(error: ErrorLike): RpcFailure {
  const sqlState = typeof error?.code === 'string' ? error.code : '';
  if (SERVER_CODE.test(sqlState)) {
    const message = typeof error?.message === 'string' ? error.message : '';
    const details = typeof error?.details === 'string' && error.details !== '' ? error.details : null;
    return { kind: 'definite', code: message, sqlState, details };
  }
  return { kind: 'no_response' };
}

const NETWORK_TEXT = /network request failed|failed to fetch|fetch failed|networkerror|network error|timed? ?out|timeout|aborted|connection (?:refused|reset|lost)/i;

/**
 * True only for a genuine connection failure (used to show the "offline" state). Unknown
 * failures without a server answer still count as `no_response` for writes (the safe choice for
 * request IDs), but don't mark the phone offline.
 */
export function looksLikeNetworkFailure(error: ErrorLike): boolean {
  if (classifyRpcError(error).kind === 'definite') return false;
  const message = typeof error?.message === 'string' ? error.message : '';
  const details = typeof error?.details === 'string' ? error.details : '';
  return NETWORK_TEXT.test(`${message} ${details}`);
}
