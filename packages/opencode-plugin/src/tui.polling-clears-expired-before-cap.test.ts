import { describe, expect, it } from 'vitest';
import {
  createClock,
  createFetchPayload,
  createIntervalHarness,
  createPayload,
  ENDPOINTS,
  flush,
  NOW_ISO,
} from './tui.test-helpers';
import { createPairingView, startPairingPayloadPolling } from './tui';

describe('payload poll clears an expired payload before the attempt-cap stop', () => {
  it('clears an expired QR before stopping at the attempt cap', async () => {
    const clock = createClock(NOW_ISO);
    const harness = createIntervalHarness();
    const view = createPairingView(ENDPOINTS, NOW_ISO);
    const payload = createPayload({ expiresAt: '2026-09-19T00:00:10.000Z' });
    const poll = createFetchPayload([{ kind: 'payload', payload }]);
    startPairingPayloadPolling(view, {
      fetchPayload: poll.fetchPayload,
      now: clock.now,
      maxAttempts: 1,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    });

    await flush();
    expect(view.state().payload).toEqual(payload);

    clock.advance(10_000);
    harness.tick();
    await flush();

    expect(view.state().payload).toBeNull();
    expect(view.state().qr).toBeNull();
    expect(harness.isStopped()).toBe(true);
  });
});
