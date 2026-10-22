import { describe, expect, it } from 'vitest';
import { createPayload, flush, startPairingTuiHarness } from './tui.test-helpers';
import { QR_DARK_MODULE_GLYPH } from './tui';

describe('dialog close releases polling and payload', () => {
  it('dialog close stops polling and clears the payload and QR', async () => {
    const { fake, harness, poll, runCommand } = await startPairingTuiHarness(120);

    await runCommand();
    poll.enqueue({ kind: 'payload', payload: createPayload() });
    harness.tick();
    await flush();
    expect(harness.isStopped()).toBe(false);

    const onClose = fake.dialogClose[0];
    if (onClose === undefined) throw new Error('expected the dialog to register an onClose');
    // The payload must be on screen immediately before close.
    expect(fake.dialogRenders[0]?.()).toContain(QR_DARK_MODULE_GLYPH);
    expect(fake.dialogRenders[0]?.()).toContain('expiresInSeconds: 120');
    onClose();

    expect(harness.isStopped()).toBe(true);
    expect(fake.dialogRenders[0]?.()).toContain('waiting for pairing payload…');
  });
});
