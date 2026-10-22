import { describe, expect, it } from 'vitest';
import { createPayload, ENDPOINTS, NOW_ISO } from './tui.test-helpers';
import {
  createPairingViewState,
  PAIRING_DIALOG_ESC_HINT,
  PAIRING_QR_TOO_NARROW_LINE,
  QR_DARK_MODULE_GLYPH,
  renderPairingDialogText,
  renderPairingQrRows,
} from './tui';

describe('dialog QR fallback when the budget cannot fit the matrix', () => {
  it('shows the endpoint instead of a clipped QR when the budget cannot fit the matrix', () => {
    const payload = createPayload();
    const state = {
      ...createPairingViewState(ENDPOINTS, NOW_ISO),
      payload,
      qr: renderPairingQrRows(payload),
    };
    const text = renderPairingDialogText(state, new Date(NOW_ISO), 1);
    expect(text).toContain(ENDPOINTS[0]?.url);
    expect(text).toContain(PAIRING_QR_TOO_NARROW_LINE);
    expect(text).not.toContain(QR_DARK_MODULE_GLYPH);
    expect(text).toContain(PAIRING_DIALOG_ESC_HINT);
  });
});
