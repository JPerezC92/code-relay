import { describe, expect, it } from 'vitest';
import {
  createClock,
  createFetchPayload,
  createIntervalHarness,
  ENDPOINTS,
  flush,
  NOW_ISO,
} from './tui.test-helpers';
import { createPairingView, startPairingPayloadPolling } from './tui';

describe('payload poll stops at the bounded attempt count', () => {
  it('stops after the bounded attempt count', async () => {
    const clock = createClock(NOW_ISO);
    const harness = createIntervalHarness();
    const view = createPairingView(ENDPOINTS, NOW_ISO);
    const poll = createFetchPayload([]);
    startPairingPayloadPolling(view, {
      fetchPayload: poll.fetchPayload,
      now: clock.now,
      maxAttempts: 1,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    });

    await flush();
    // The immediate first poll consumed the single attempt; the next tick stops.
    harness.tick();
    await flush();
    expect(harness.isStopped()).toBe(true);
    expect(view.state().payload).toBeNull();
  });
});
