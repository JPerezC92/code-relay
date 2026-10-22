import { describe, expect, it } from 'vitest';
import {
  PAIRING_DIALOG_CHROME_COLUMNS,
  PAIRING_DIALOG_LARGE_COLUMNS,
  PAIRING_DIALOG_MEDIUM_COLUMNS,
  PAIRING_DIALOG_MIN_TERMINAL_WIDTH,
  PAIRING_DIALOG_TEXT_PAD,
  PAIRING_QR_MAX_MODULES_PER_SIDE,
  PAIRING_QR_MAX_WIDTH_COLUMNS,
} from './tui';

describe('pairing width and budget constants', () => {
  it('pins the QR bound and the dialog budget constants as literals', () => {
    expect(PAIRING_QR_MAX_WIDTH_COLUMNS).toBe(77);
    expect(PAIRING_DIALOG_MIN_TERMINAL_WIDTH).toBe(79);
    expect(PAIRING_QR_MAX_MODULES_PER_SIDE).toBe(69);
    expect(PAIRING_DIALOG_CHROME_COLUMNS).toBe(4);
    expect(PAIRING_DIALOG_TEXT_PAD).toBe(2);
    expect(PAIRING_DIALOG_MEDIUM_COLUMNS).toBe(60);
    expect(PAIRING_DIALOG_LARGE_COLUMNS).toBe(80);
  });
});
