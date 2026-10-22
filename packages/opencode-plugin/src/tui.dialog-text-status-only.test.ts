import { describe, expect, it } from 'vitest';
import { ENDPOINTS, NOW_ISO } from './tui.test-helpers';
import { createPairingViewState, QR_DARK_MODULE_GLYPH, renderPairingDialogText } from './tui';

describe('dialog status-only line without a payload', () => {
  it('falls back to a waiting line without payload or QR', () => {
    const text = renderPairingDialogText(createPairingViewState(ENDPOINTS, NOW_ISO), new Date(NOW_ISO));
    expect(text).toContain('waiting for pairing payload…');
    expect(text).not.toContain(QR_DARK_MODULE_GLYPH);
  });
});
