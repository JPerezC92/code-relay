import { describe, expect, it } from 'vitest';
import {
  createClock,
  createFetchPayload,
  createIntervalHarness,
  createPayload,
  ENDPOINTS,
  flush,
  NOW_ISO,
  pollResolutionCases,
} from './tui.test-helpers';
import { createPairingView, renderPairingDialogText, startPairingPayloadPolling } from './tui';

describe('payload poll resolves the dialog from a 409 state', () => {
  it.each(pollResolutionCases)(
    'resolves the dialog to $status when a 409 carries state $state',
    async ({ state, status, hint }) => {
      const clock = createClock(NOW_ISO);
      const harness = createIntervalHarness();
      const view = createPairingView(ENDPOINTS, NOW_ISO);
      const poll = createFetchPayload([
        { kind: 'payload', payload: createPayload() },
        { kind: 'not-waiting', state },
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

      expect(view.state().status).toBe(status);
      expect(view.state().payload).toBeNull();
      expect(view.state().qr).toBeNull();
      expect(harness.isStopped()).toBe(true);
      const text = renderPairingDialogText(view.state(), clock.now());
      expect(text).toContain(`status: ${status}`);
      expect(text).toContain(hint);
      expect(text).not.toContain('waiting for pairing payload…');
    },
  );
});
