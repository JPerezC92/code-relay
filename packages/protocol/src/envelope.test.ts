import { describe, expect, it } from 'vitest';
import { ActionError, parseAction } from './actions';
import { EnvelopeError, ReplayGuard, parseEnvelope } from './envelope';

const validNonce = 'AAAA'.repeat(4);

const validTag = 'AAAA'.repeat(5) + 'AA==';

const validEnvelope = {
  version: 1,
  direction: 'device-to-host',
  sequence: 3,
  pairingId: 'pairing-1',
  nonce: validNonce,
  ciphertext: 'aGVsbG8=',
  tag: validTag,
};

describe('ReplayGuard', () => {
  it('accepts strictly increasing sequences for a direction', () => {
    const guard = new ReplayGuard();

    expect(guard.accept('device-to-host', 1)).toBe(true);
    expect(guard.accept('device-to-host', 2)).toBe(true);
    expect(guard.highestAccepted('device-to-host')).toBe(2);
  });

  it('rejects a replayed sequence', () => {
    const guard = new ReplayGuard();

    expect(guard.accept('device-to-host', 4)).toBe(true);
    expect(guard.accept('device-to-host', 4)).toBe(false);
    expect(guard.highestAccepted('device-to-host')).toBe(4);
  });

  it('rejects a non-increasing sequence', () => {
    const guard = new ReplayGuard();

    expect(guard.accept('host-to-device', 5)).toBe(true);
    expect(guard.accept('host-to-device', 3)).toBe(false);
  });

  it('tracks each direction independently', () => {
    const guard = new ReplayGuard();

    expect(guard.accept('device-to-host', 10)).toBe(true);
    expect(guard.accept('host-to-device', 1)).toBe(true);
    expect(guard.accept('device-to-host', 1)).toBe(false);
    expect(guard.accept('host-to-device', 2)).toBe(true);
  });
});

describe('parseEnvelope', () => {
  it('parses a version 1 envelope', () => {
    const result = parseEnvelope(JSON.stringify(validEnvelope));

    expect(result).not.toBeInstanceOf(EnvelopeError);
    expect(result).toEqual(validEnvelope);
  });

  it('rejects an envelope with an unknown version', () => {
    const result = parseEnvelope(JSON.stringify({ ...validEnvelope, version: 2 }));

    expect(result).toBeInstanceOf(EnvelopeError);
  });

  it('rejects a nonce that is not 12 bytes', () => {
    const result = parseEnvelope(JSON.stringify({ ...validEnvelope, nonce: 'AAAA' }));

    expect(result).toBeInstanceOf(EnvelopeError);
  });

  it('rejects malformed JSON', () => {
    const result = parseEnvelope('{not-json');

    expect(result).toBeInstanceOf(EnvelopeError);
  });

  it('rejects a non-object payload', () => {
    expect(parseEnvelope('null')).toBeInstanceOf(EnvelopeError);
    expect(parseEnvelope('[]')).toBeInstanceOf(EnvelopeError);
  });

  it('rejects a pairingId containing the AAD delimiter', () => {
    const result = parseEnvelope(JSON.stringify({ ...validEnvelope, pairingId: 'pair|ing' }));

    expect(result).toBeInstanceOf(EnvelopeError);
  });
});

describe('permission decision safety', () => {
  it('rejects the always permission decision', () => {
    const result = parseAction({
      type: 'permission.reply',
      sessionID: 'session-1',
      permissionID: 'permission-1',
      decision: 'always',
    });

    expect(result).toBeInstanceOf(ActionError);
  });

  it('rejects a remember field', () => {
    const result = parseAction({
      type: 'permission.reply',
      sessionID: 'session-1',
      permissionID: 'permission-1',
      decision: 'once',
      remember: true,
    });

    expect(result).toBeInstanceOf(ActionError);
  });

  it('accepts once and reject', () => {
    const once = parseAction({
      type: 'permission.reply',
      sessionID: 'session-1',
      permissionID: 'permission-1',
      decision: 'once',
    });
    const reject = parseAction({
      type: 'permission.reply',
      sessionID: 'session-1',
      permissionID: 'permission-1',
      decision: 'reject',
    });

    expect(once).toEqual({
      type: 'permission.reply',
      sessionID: 'session-1',
      permissionID: 'permission-1',
      decision: 'once',
    });
    expect(reject).toEqual({
      type: 'permission.reply',
      sessionID: 'session-1',
      permissionID: 'permission-1',
      decision: 'reject',
    });
  });

  it('rejects malformed action JSON', () => {
    const result = parseAction('{not-json');

    expect(result).toBeInstanceOf(ActionError);
  });
});
