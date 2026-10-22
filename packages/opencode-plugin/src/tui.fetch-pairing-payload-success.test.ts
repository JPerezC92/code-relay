import { describe, expect, it } from 'vitest';
import type { PairingFetchLike } from './tui';
import { createPayload, NOW_ISO } from './tui.test-helpers';
import { fetchPairingPayload } from './tui';

describe('fetchPairingPayload success mapping', () => {
  it('returns the payload for a 200 response with a valid body', async () => {
    // The injected clock keeps the parse-path expiry check deterministic.
    const payload = createPayload();
    const fetchImpl: PairingFetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ payload }),
    });
    expect(
      await fetchPairingPayload('http://127.0.0.1:47821/pairing-payload', fetchImpl, () => new Date(NOW_ISO)),
    ).toEqual({ kind: 'payload', payload });
  });
});
