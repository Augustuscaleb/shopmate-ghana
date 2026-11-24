import { describe, expect, it } from 'vitest';
import { classifyRpcError, looksLikeNetworkFailure } from './rpcErrors';

describe('Server error classification', () => {
  it('ERR-01: a PostgreSQL SQLSTATE means the server answered; the code is the message', () => {
    expect(classifyRpcError({ code: '22023', message: 'invalid_qty', details: null })).toEqual({ kind: 'definite', code: 'invalid_qty', sqlState: '22023', details: null });
    expect(classifyRpcError({ code: 'P0002', message: 'product_not_found' }).kind).toBe('definite');
    expect(classifyRpcError({ code: '42501', message: 'not_a_member' }).kind).toBe('definite');
  });

  it('ERR-02: PostgREST codes are server answers too', () => {
    expect(classifyRpcError({ code: 'PGRST301', message: 'JWT expired' }).kind).toBe('definite');
  });

  it('ERR-03: details are kept (e.g. the refund amount for refund_required)', () => {
    const f = classifyRpcError({ code: '22023', message: 'refund_required', details: '{"refund_amount": 300}' });
    expect(f).toMatchObject({ kind: 'definite', details: '{"refund_amount": 300}' });
  });

  it('ERR-04: no code (network failure, timeout, unknown) means no response: outcome unknown', () => {
    expect(classifyRpcError({ code: '', message: 'TypeError: Network request failed' }).kind).toBe('no_response');
    expect(classifyRpcError(new Error('unexpected server result: total') as never).kind).toBe('no_response');
    expect(classifyRpcError(null).kind).toBe('no_response');
  });

  it('ERR-05: only genuine connection failures mark the phone offline', () => {
    expect(looksLikeNetworkFailure({ code: '', message: 'TypeError: Network request failed' })).toBe(true);
    expect(looksLikeNetworkFailure({ code: '', message: 'TypeError: fetch failed' })).toBe(true);
    expect(looksLikeNetworkFailure({ code: '', message: 'AbortError: The operation was aborted' })).toBe(true);
    expect(looksLikeNetworkFailure(new Error('unexpected server result: total') as never)).toBe(false);
    expect(looksLikeNetworkFailure({ code: '22023', message: 'network_something' })).toBe(false);
  });
});
