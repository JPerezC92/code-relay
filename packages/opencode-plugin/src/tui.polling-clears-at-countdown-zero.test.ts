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

describe('payload poll clears at countdown zero', () => {
  it('clears the payload and QR when the countdown reaches zero, then stops', async () => {
    const clock = createClock(NOW_ISO);
    const harness = createIntervalHarness();
    const view = createPairingView(ENDPOINTS, NOW_ISO);
    const payload = createPayload({ expiresAt: '2026-09-19T00:00:10.000Z' });
    const poll = createFetchPayload([{ kind: 'payload', payload }]);
    startPairingPayloadPolling(view, {
      fetchPayload: poll.fetchPayload,
      now: clock.now,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    });

    await flush();
    expect(view.state().payload).not.toBeNull();

    clock.advance(11_000);
    harness.tick();
    await flush();

    expect(view.state().payload).toBeNull();
    expect(view.state().qr).toBeNull();
    expect(harness.isStopped()).toBe(true);
  });
});
