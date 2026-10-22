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
import { createPairingView, renderPairingQrRows, startPairingPayloadPolling } from './tui';

describe('payload poll refreshes the QR on a renewed pairing id', () => {
  it('refreshes the stored QR when a renewal delivers a new pairing id', async () => {
    const clock = createClock(NOW_ISO);
    const harness = createIntervalHarness();
    const view = createPairingView(ENDPOINTS, NOW_ISO);
    const first = createPayload({ pairingId: 'pairing-1' });
    const renewed = createPayload({ pairingId: 'pairing-2' });
    const poll = createFetchPayload([
      { kind: 'payload', payload: first },
      { kind: 'payload', payload: renewed },
    ]);
    startPairingPayloadPolling(view, {
      fetchPayload: poll.fetchPayload,
      now: clock.now,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    });

    await flush();
    expect(view.state().payload?.pairingId).toBe('pairing-1');

    harness.tick();
    await flush();

    expect(view.state().payload?.pairingId).toBe('pairing-2');
    expect(view.state().qr).toBe(renderPairingQrRows(renewed));
  });
});
