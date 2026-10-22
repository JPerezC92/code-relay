import { describe, expect, it } from 'vitest';
import { createPayload, flush, startPairingTuiHarness } from './tui.test-helpers';
import { QR_DARK_MODULE_GLYPH } from './tui';

describe('pairing dialog live countdown while polling', () => {
  it('renders the live countdown and QR inside the dialog while polling', async () => {
    const { fake, harness, clock, poll, runCommand } = await startPairingTuiHarness(120);

    await runCommand();
    poll.enqueue({ kind: 'payload', payload: createPayload() });
    harness.tick();
    await flush();

    const render = fake.dialogRenders[0];
    if (render === undefined) throw new Error('expected the dialog to be open');
    expect(render()).toContain('expiresInSeconds: 120');
    expect(render()).toContain(QR_DARK_MODULE_GLYPH);

    clock.advance(5_000);
    poll.enqueue({ kind: 'unavailable' });
    harness.tick();
    await flush();
    expect(render()).toContain('expiresInSeconds: 115');
    expect(render()).toContain(QR_DARK_MODULE_GLYPH);
  });
});
