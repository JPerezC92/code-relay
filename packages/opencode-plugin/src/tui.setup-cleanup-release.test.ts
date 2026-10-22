import { describe, expect, it } from 'vitest';
import { createPayload, flush, startPairingTuiHarness } from './tui.test-helpers';
import { QR_DARK_MODULE_GLYPH } from './tui';

describe('setup cleanup releases the wiring, polling, and payload', () => {
  it('the setup cleanup unregisters the wiring, stops polling, and drops the payload', async () => {
    const { fake, harness, poll, calls, runCommand, cleanup } = await startPairingTuiHarness(120);

    await runCommand();
    poll.enqueue({ kind: 'payload', payload: createPayload() });
    harness.tick();
    await flush();
    expect(harness.isStopped()).toBe(false);
    // The payload must be on screen immediately before cleanup.
    expect(fake.dialogRenders[0]?.()).toContain(QR_DARK_MODULE_GLYPH);
    expect(fake.dialogRenders[0]?.()).toContain('expiresInSeconds: 120');

    cleanup();

    expect(harness.isStopped()).toBe(true);
    expect(fake.dialogRenders[0]?.()).toContain('waiting for pairing payload…');
    expect(calls).toContain('keymap.layer.unregister');
    expect(calls).toContain('router.unregister');
  });
});
