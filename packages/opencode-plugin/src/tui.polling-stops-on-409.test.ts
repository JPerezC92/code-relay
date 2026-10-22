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

describe('payload poll clears and stops on a 409', () => {
  it('clears the payload and QR and stops when the route answers 409', async () => {
    const clock = createClock(NOW_ISO);
    const harness = createIntervalHarness();
    const view = createPairingView(ENDPOINTS, NOW_ISO);
    const poll = createFetchPayload([
      { kind: 'payload', payload: createPayload() },
      { kind: 'not-waiting', state: 'paired' },
    ]);
    startPairingPayloadPolling(view, {
      fetchPayload: poll.fetchPayload,
      now: clock.now,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    });

    await flush();
    expect(view.state().payload).not.toBeNull();

    harness.tick();
    await flush();

    expect(view.state().payload).toBeNull();
    expect(view.state().qr).toBeNull();
    expect(harness.isStopped()).toBe(true);
  });
});
