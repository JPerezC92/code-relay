import { describe, expect, it } from 'vitest';
import { createPayload } from './tui.test-helpers';
import {
  PAIRING_QR_MAX_WIDTH_COLUMNS,
  pairingPayloadJson,
  QR_DARK_MODULE_GLYPH,
  renderQrRows,
} from './tui';

describe('payload QR width bounds', () => {
  it('renders the real payload QR within the maximum width without ANSI', () => {
    const rows = renderQrRows(pairingPayloadJson(createPayload()));
    const width = rows[0]?.length ?? 0;
    expect(width).toBeLessThanOrEqual(PAIRING_QR_MAX_WIDTH_COLUMNS);
    expect(rows).toHaveLength(Math.ceil(width / 2));
    for (const row of rows) {
      expect(row).toHaveLength(width);
      expect(row).toMatch(/^[ ▀▄█]*$/);
    }
    expect(rows.join('\n')).not.toMatch(/\x1b/);
    expect(rows.some((row) => row.includes(QR_DARK_MODULE_GLYPH))).toBe(true);
  });
});
