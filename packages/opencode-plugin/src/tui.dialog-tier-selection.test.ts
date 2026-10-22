import { describe, expect, it } from 'vitest';
import { create as createQrCode } from 'qrcode';
import { createPayload, startPairingTuiHarness } from './tui.test-helpers';
import { PAIRING_RENEW_PATH, pairingPayloadJson, resolvePairingDialogSize } from './tui';

describe('pairing dialog tier selection', () => {
  it('renews, then opens the dialog, then applies the smallest fitting tier in that order', async () => {
    const { calls, runCommand } = await startPairingTuiHarness(120);

    // Expected tiers are literals derived from the pinned budget constants
    // (medium 60, large 80, chrome 4, pad 2 → budgets 60-4-2 = 54 and
    // 80-4-2 = 74 columns) and the pinned 69-module matrix bound. The fixture
    // matrix band below is measured with the QR primitive itself — never with
    // a module-under-test helper — and it forces the literals: above the
    // medium budget and inside the bound, `large` is the smallest fitting
    // tier at width 120 and 80; at 79 the large tier cannot open (79 < 80)
    // while xlarge's 75-column budget still fits, forcing `xlarge`.
    const json = pairingPayloadJson(createPayload());
    const matrixSize = createQrCode(json).modules.size;
    expect(matrixSize).toBeGreaterThan(54);
    expect(matrixSize).toBeLessThanOrEqual(69);
    expect(resolvePairingDialogSize(json, 120)).toBe('large');
    expect(resolvePairingDialogSize(json, 80)).toBe('large');
    expect(resolvePairingDialogSize(json, 79)).toBe('xlarge');

    await runCommand();

    expect(calls).toEqual([
      `POST http://127.0.0.1:47821${PAIRING_RENEW_PATH}`,
      'dialog.show',
      'dialog.set:large',
    ]);
  });
});
