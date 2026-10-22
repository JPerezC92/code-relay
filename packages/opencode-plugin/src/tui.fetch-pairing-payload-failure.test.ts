import { describe, expect, it } from 'vitest';
import type { PairingFetchLike } from './tui';
import { createPayload, NOW_ISO } from './tui.test-helpers';
import { fetchPairingPayload } from './tui';

describe('fetchPairingPayload failure mapping', () => {
  it('maps network failures, malformed bodies, and expired payloads to unavailable', async () => {
    const failing: PairingFetchLike = async () => {
      throw new Error('connection refused');
    };
    expect(await fetchPairingPayload('http://127.0.0.1:47821/pairing-payload', failing)).toEqual({
      kind: 'unavailable',
    });

    const malformed: PairingFetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => 'not-an-object',
    });
    expect(await fetchPairingPayload('http://127.0.0.1:47821/pairing-payload', malformed)).toEqual({
      kind: 'unavailable',
    });

    const expired = createPayload({ expiresAt: '2020-01-01T00:00:00.000Z' });
    const expiredFetch: PairingFetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ payload: expired }),
    });
    expect(
      await fetchPairingPayload(
        'http://127.0.0.1:47821/pairing-payload',
        expiredFetch,
        () => new Date(NOW_ISO),
      ),
    ).toEqual({ kind: 'unavailable' });
  });
});
