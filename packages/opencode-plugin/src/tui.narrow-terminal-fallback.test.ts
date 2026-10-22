import { describe, expect, it } from 'vitest';
import { ENDPOINTS, startPairingTuiHarness } from './tui.test-helpers';
import {
  PAIRING_QR_TOO_NARROW_LINE,
  PAIRING_RENEW_PATH,
  PAIRING_ROUTE_NAME,
  QR_DARK_MODULE_GLYPH,
} from './tui';

describe('pairing narrow-terminal fallback', () => {
  it('navigates to the pairing route instead of opening the dialog on narrow terminals', async () => {
    const { calls, fake, runCommand } = await startPairingTuiHarness(8);

    await runCommand();

    expect(calls).toEqual([
      `POST http://127.0.0.1:47821${PAIRING_RENEW_PATH}`,
      `navigate:${PAIRING_ROUTE_NAME}`,
    ]);
    expect(fake.dialogRenders).toHaveLength(0);
    const routeRender = fake.routeRenders[0];
    if (routeRender === undefined) throw new Error('expected the pairing route to be registered');
    expect(routeRender()).toContain(ENDPOINTS[0]?.url);
    expect(routeRender()).toContain(PAIRING_QR_TOO_NARROW_LINE);
    expect(routeRender()).not.toContain(QR_DARK_MODULE_GLYPH);
  });
});
