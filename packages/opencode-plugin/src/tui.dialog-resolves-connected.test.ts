import { describe, expect, it } from 'vitest';
import { createPayload, flush, startPairingTuiHarness } from './tui.test-helpers';
import { QR_DARK_MODULE_GLYPH } from './tui';

describe('pairing dialog resolves to connected on a paired 409', () => {
  it('resolves the open dialog to connected when the poll reports a paired 409', async () => {
    const { fake, harness, poll, runCommand } = await startPairingTuiHarness(120);

    await runCommand();
    poll.enqueue({ kind: 'payload', payload: createPayload() });
    harness.tick();
    await flush();
    const render = fake.dialogRenders[0];
    if (render === undefined) throw new Error('expected the dialog to be open');
    expect(render()).toContain(QR_DARK_MODULE_GLYPH);

    poll.enqueue({ kind: 'not-waiting', state: 'paired' });
    harness.tick();
    await flush();

    expect(harness.isStopped()).toBe(true);
    expect(render()).toContain('status: connected');
    expect(render()).toContain('device connected');
    expect(render()).not.toContain('waiting for pairing payload…');
    expect(render()).not.toContain(QR_DARK_MODULE_GLYPH);
  });
});
