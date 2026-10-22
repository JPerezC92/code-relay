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
import { createPairingView, QR_DARK_MODULE_GLYPH, startPairingPayloadPolling } from './tui';

describe('payload poll stores the payload and keeps polling', () => {
  it('stores the payload and a block-glyph QR and keeps polling', async () => {
    const clock = createClock(NOW_ISO);
    const harness = createIntervalHarness();
    const view = createPairingView(ENDPOINTS, NOW_ISO);
    const payload = createPayload();
    const poll = createFetchPayload([{ kind: 'payload', payload }]);
    const stop = startPairingPayloadPolling(view, {
      fetchPayload: poll.fetchPayload,
      now: clock.now,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    });

    await flush();
    // The poll must hit the gateway's loopback payload route — a wrong or
    // non-loopback URL would leave the screen dark forever.
    expect(poll.urls).toContain('http://127.0.0.1:47821/pairing-payload');
    expect(view.state().payload).toEqual(payload);
    expect(view.state().qr).not.toBeNull();
    expect(view.state().qr ?? '').toContain(QR_DARK_MODULE_GLYPH);
    expect(view.state().qr ?? '').not.toMatch(/\x1b/);
    expect(harness.isStopped()).toBe(false);
    stop();
    expect(harness.isStopped()).toBe(true);
  });
});
