import { describe, expect, it } from 'vitest';
import { createPayload, ENDPOINTS, NOW_ISO } from './tui.test-helpers';
import {
  createPairingViewState,
  PAIRING_COMMAND_TITLE,
  PAIRING_DIALOG_ESC_HINT,
  QR_DARK_MODULE_GLYPH,
  renderPairingDialogText,
  renderPairingQrRows,
} from './tui';

describe('dialog text with a live payload', () => {
  it('shows status, endpoint, countdown, and QR rows once the payload arrives', () => {
    const state = createPairingViewState(ENDPOINTS, NOW_ISO);
    const payload = createPayload();
    const withPayload = {
      ...state,
      payload,
      qr: renderPairingQrRows(payload),
    };
    const text = renderPairingDialogText(withPayload, new Date(NOW_ISO));
    expect(text).toContain(PAIRING_COMMAND_TITLE);
    expect(text).toContain('status: waiting');
    expect(text).toContain(`endpoint: ${ENDPOINTS[0]?.url}`);
    expect(text).toContain('expiresInSeconds: 120');
    expect(text).toContain(QR_DARK_MODULE_GLYPH);
    expect(text).toContain(PAIRING_DIALOG_ESC_HINT);
    expect(text).not.toMatch(/\x1b/);
    expect(renderPairingDialogText(withPayload, new Date('2026-09-19T00:00:05.000Z'))).toContain(
      'expiresInSeconds: 115',
    );
  });
});
