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
import { createPairingView, QR_DARK_MODULE_GLYPH, renderPairingDialogText, startPairingPayloadPolling } from './tui';

describe('payload poll keeps the waiting display on a 409 race', () => {
  it('keeps polling with the QR when a 409 state races back to waiting', async () => {
    const clock = createClock(NOW_ISO);
    const harness = createIntervalHarness();
    const view = createPairingView(ENDPOINTS, NOW_ISO);
    const payload = createPayload();
    const poll = createFetchPayload([
      { kind: 'payload', payload },
      { kind: 'not-waiting', state: 'waiting' },
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

    expect(view.state().status).toBe('waiting');
    expect(view.state().payload).toEqual(payload);
    expect(view.state().qr).not.toBeNull();
    expect(harness.isStopped()).toBe(false);
    const text = renderPairingDialogText(view.state(), clock.now());
    expect(text).toContain('status: waiting');
    expect(text).toContain(QR_DARK_MODULE_GLYPH);
    expect(text).not.toContain('waiting for pairing payload…');
  });
});
