import { describe, expect, it } from 'vitest';
import type { QrModuleMatrix } from './tui';
import { renderQrMatrixRows, QR_QUIET_ZONE_MODULES } from './tui';

describe('QR half-block packing', () => {
  it.each([
    { upper: 0, lower: 0, glyph: ' ', name: 'light over light' },
    { upper: 1, lower: 0, glyph: '▀', name: 'dark over light' },
    { upper: 0, lower: 1, glyph: '▄', name: 'light over dark' },
    { upper: 1, lower: 1, glyph: '█', name: 'dark over dark' },
  ])('packs $name and preserves the 4-module quiet zone', ({ upper, lower, glyph }) => {
    const matrix: QrModuleMatrix = {
      size: 2,
      get: (row, column) => (column === 0 ? (row === 0 ? upper : lower) : 0),
    };
    const rows = renderQrMatrixRows(matrix);

    expect(QR_QUIET_ZONE_MODULES).toBe(4);
    expect(rows).toEqual(['          ', '          ', `    ${glyph}     `, '          ', '          ']);
    for (const row of rows) expect(row).toHaveLength(10);
  });
});
