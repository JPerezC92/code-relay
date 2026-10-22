import { describe, expect, it } from 'vitest';
import type { PairingFetchLike } from './tui';
import { fetchPairingPayload } from './tui';

describe('fetchPairingPayload 409 mapping', () => {
  it('maps a 409 with a pairing state to not-waiting and a stateless 409 to unavailable', async () => {
    const fetchImpl: PairingFetchLike = async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: 'pairing-not-waiting', state: 'paired' }),
    });
    expect(await fetchPairingPayload('http://127.0.0.1:47821/pairing-payload', fetchImpl)).toEqual({
      kind: 'not-waiting',
      state: 'paired',
    });

    // The pre-phase-09 body shape: without a parsable state the 409 cannot
    // resolve the modal, so it degrades to a retriable unavailable.
    const stateless: PairingFetchLike = async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: 'pairing-not-waiting' }),
    });
    expect(
      await fetchPairingPayload('http://127.0.0.1:47821/pairing-payload', stateless),
    ).toEqual({ kind: 'unavailable' });
  });
});
