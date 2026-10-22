import { describe, expect, it } from 'vitest';
import {
  createClock,
  createFetchPayload,
  createIntervalHarness,
  createFakeCliPluginContext,
  ENDPOINTS,
  flush,
  NOW_ISO,
} from './tui.test-helpers';
import { createTuiHost, startPairingTui } from './tui';

describe('createTuiHost release', () => {
  it('the returned cleanup disables the keymap layer and invokes the router unregister', async () => {
    const fake = createFakeCliPluginContext();
    const clock = createClock(NOW_ISO);
    const harness = createIntervalHarness();
    const poll = createFetchPayload([]);
    const cleanup = await startPairingTui(createTuiHost(fake.context), {
      detectEndpoints: async () => ENDPOINTS,
      now: clock.now,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
      fetchPayload: poll.fetchPayload,
    });
    await flush();

    const layer = fake.layers[0]?.();
    if (layer === undefined) throw new Error('expected a keymap layer to be registered');
    if (typeof layer.enabled !== 'function') throw new Error('expected a reactive layer enabled()');
    expect(layer.enabled()).toBe(true);
    expect(fake.unregisterRoute).toHaveBeenCalledTimes(0);

    cleanup();

    // V2 gives `keymap.layer` no unregister handle: the real release is the
    // host flipping the layer's `enabled()` to false (tui.tsx createTuiHost)
    // alongside the router's own unregister.
    expect(layer.enabled()).toBe(false);
    expect(fake.unregisterRoute).toHaveBeenCalledTimes(1);
  });
});
