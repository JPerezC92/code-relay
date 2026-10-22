import { describe, expect, it } from 'vitest';
import { startPairingTuiHarness } from './tui.test-helpers';
import {
  PAIRING_COMMAND_CATEGORY,
  PAIRING_COMMAND_NAME,
  PAIRING_COMMAND_TITLE,
  PAIRING_ROUTE_NAME,
} from './tui';

describe('pairing TUI registration shape', () => {
  it('registers the palette command and the pairing route with the required shape', async () => {
    const { fake } = await startPairingTuiHarness(120);

    expect(PAIRING_ROUTE_NAME).toBe('coderelay-pairing');
    expect(fake.routes).toContain('coderelay-pairing');
    const routeRender = fake.routeRenders[0];
    if (routeRender === undefined) throw new Error('expected the pairing route to be registered');
    expect(routeRender()).toContain('CodeRelay pairing');
    const layer = fake.layers[0];
    expect(layer).toBeDefined();
    expect(layer?.bindings.map((binding) => binding.bind)).toEqual(['escape']);
    const command = layer?.commands[0];
    expect(command?.palette).toBe(true);
    expect(command?.id).toBe(PAIRING_COMMAND_NAME);
    expect(command?.id).toBe('coderelay.pair');
    expect(command?.title).toBe(PAIRING_COMMAND_TITLE);
    expect(command?.title).toBe('CodeRelay: Pair device');
    expect(command?.group).toBe(PAIRING_COMMAND_CATEGORY);
    expect(command?.group).toBe('CodeRelay');
  });
});
