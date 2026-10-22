import { describe, expect, it } from 'vitest';
import { createPayload, flush, startPairingTuiHarness } from './tui.test-helpers';
import { PAIRING_DIALOG_ESC_HINT, QR_DARK_MODULE_GLYPH } from './tui';

describe('Esc releases the dialog, polling, and payload', () => {
  it('Esc binding clears the dialog, stops polling, and drops the payload', async () => {
    const { fake, harness, poll, calls, runCommand } = await startPairingTuiHarness(120);

    await runCommand();
    poll.enqueue({ kind: 'payload', payload: createPayload() });
    harness.tick();
    await flush();
    expect(harness.isStopped()).toBe(false);
    expect(fake.dialogRenders[0]?.()).toContain(PAIRING_DIALOG_ESC_HINT);

    const binding = fake.layers[0]?.bindings.find((entry) => entry.bind === 'escape');
    if (binding === undefined) throw new Error('expected an Esc binding');
    // The payload must be on screen immediately before Esc — otherwise the
    // post-Esc emptiness below proves nothing was ever dropped.
    expect(fake.dialogRenders[0]?.()).toContain(QR_DARK_MODULE_GLYPH);
    expect(fake.dialogRenders[0]?.()).toContain('expiresInSeconds: 120');
    binding.run();

    expect(calls).toContain('dialog.clear');
    expect(harness.isStopped()).toBe(true);
    expect(fake.dialogRenders[0]?.()).toContain('waiting for pairing payload…');
    expect(fake.dialogRenders[0]?.()).not.toContain(QR_DARK_MODULE_GLYPH);
  });
});
