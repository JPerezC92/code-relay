import { describe, expect, it } from 'vitest';
import { createPayload } from './tui.test-helpers';
import { PAIRING_QR_MAX_WIDTH_COLUMNS, pairingPayloadJson, renderQrRows } from './tui';

describe('QR quiet-zone shrink under a narrow budget', () => {
  it('does not grow on a wide budget, strips only quiet columns on shrink, and never clips', () => {
    const json = pairingPayloadJson(createPayload());
    const natural = renderQrRows(json);
    const naturalWidth = natural[0]?.length ?? 0;
    const wide = renderQrRows(json, 500);
    expect(wide[0]?.length).toBe(naturalWidth);
    expect(wide[0]?.length).toBeLessThanOrEqual(PAIRING_QR_MAX_WIDTH_COLUMNS);

    const narrowBudget = Math.max(1, naturalWidth - 4);
    const narrowed = renderQrRows(json, narrowBudget);
    expect(narrowed.length).toBeGreaterThan(0);
    for (const row of narrowed) {
      expect(row.length).toBeLessThanOrEqual(narrowBudget);
      expect(row.length).toBeLessThanOrEqual(naturalWidth);
    }
    // At the parity-preserving budget (naturalWidth - 4) the quiet zone drops
    // from 4 to 2 on every side: exactly two quiet columns per side vanish and
    // every module column survives 1:1 — a clipped or squeezed QR would fail
    // this equality. Vertically the two dropped quiet rows per side pack into
    // one all-quiet terminal row per side, so the narrow rows align to the
    // natural rows shifted by one and number exactly two fewer.
    expect(narrowed).toHaveLength(natural.length - 2);
    for (let index = 0; index < narrowed.length; index += 1) {
      expect(narrowed[index]).toBe(natural[index + 1]?.slice(2, -2));
    }

    const clipped = renderQrRows(json, 1);
    expect(clipped).toEqual([]);
  });
});
