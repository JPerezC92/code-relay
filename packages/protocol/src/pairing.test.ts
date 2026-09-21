import { describe, expect, it } from 'vitest';
import {
  PairingError,
  pairingCompleteResponseSchema,
  pairingRequestSchema,
  parsePairingCompleteResponse,
  parsePairingPayload,
  parsePairingRequest,
} from './pairing';

const now = new Date('2026-09-18T03:05:00.000Z');

const futureExpiry = new Date('2026-09-18T03:10:00.000Z').toISOString();

const pastExpiry = new Date('2026-09-18T03:00:00.000Z').toISOString();

// Base64 for exactly 32 bytes, which is the X25519 raw key length.
const X25519_PUBLIC_KEY = 'A'.repeat(43) + '=';

// Base64 for exactly 32 bytes: the 256-bit one-time pairing secret.
const ONE_TIME_SECRET = 'A'.repeat(43) + '=';

const VALID_NONCE = 'AAAA'.repeat(4);

const VALID_TAG = 'AAAA'.repeat(5) + 'AA==';

const SEALED_BLOB = {
  nonce: VALID_NONCE,
  ciphertext: 'aGVsbG8=',
  tag: VALID_TAG,
};

function validPayload(expiresAt: string) {
  return {
    version: 1,
    endpoints: ['http://192.168.1.20:47821'],
    pairingId: 'pairing-1',
    oneTimeSecret: ONE_TIME_SECRET,
    hostPublicKey: X25519_PUBLIC_KEY,
    expiresAt,
  };
}

function validRequest() {
  return {
    version: 1,
    pairingId: 'pairing-1',
    devicePublicKey: X25519_PUBLIC_KEY,
    sealedSecret: { ...SEALED_BLOB },
  };
}

function validCompleteResponse() {
  return {
    version: 1,
    pairingId: 'pairing-1',
    deviceCredentialId: 'credential-1',
    sealedConfirmation: { ...SEALED_BLOB },
  };
}

describe('parsePairingPayload', () => {
  it('parses a payload whose expiry is in the future', () => {
    const payload = validPayload(futureExpiry);
    const result = parsePairingPayload(JSON.stringify(payload), { now });

    expect(result).not.toBeInstanceOf(PairingError);
    expect(result).toEqual(payload);
  });

  it('rejects a payload whose expiry is in the past', () => {
    const result = parsePairingPayload(JSON.stringify(validPayload(pastExpiry)), { now });

    expect(result).toBeInstanceOf(PairingError);
  });

  it('rejects a payload whose expiry equals now', () => {
    const result = parsePairingPayload(JSON.stringify(validPayload(now.toISOString())), { now });

    expect(result).toBeInstanceOf(PairingError);
  });

  it('rejects an unparseable expiry', () => {
    const result = parsePairingPayload(JSON.stringify(validPayload('not-a-timestamp')), { now });

    expect(result).toBeInstanceOf(PairingError);
  });

  it('rejects malformed JSON', () => {
    const result = parsePairingPayload('{not-json', { now });

    expect(result).toBeInstanceOf(PairingError);
  });

  it('rejects a payload with no endpoints', () => {
    const result = parsePairingPayload(
      JSON.stringify({ ...validPayload(futureExpiry), endpoints: [] }),
      { now },
    );

    expect(result).toBeInstanceOf(PairingError);
  });

  it('rejects a host public key that is not 32 raw bytes', () => {
    const result = parsePairingPayload(
      JSON.stringify({ ...validPayload(futureExpiry), hostPublicKey: 'aGVsbG8=' }),
      { now },
    );

    expect(result).toBeInstanceOf(PairingError);
  });

  it('rejects a one-time secret that is not base64 for exactly 32 bytes', () => {
    const oneByte = parsePairingPayload(
      JSON.stringify({ ...validPayload(futureExpiry), oneTimeSecret: 'QQ==' }),
      { now },
    );
    const short = parsePairingPayload(
      JSON.stringify({ ...validPayload(futureExpiry), oneTimeSecret: 'aGVsbG8=' }),
      { now },
    );

    expect(oneByte).toBeInstanceOf(PairingError);
    expect(short).toBeInstanceOf(PairingError);
  });
});

describe('pairingRequestSchema', () => {
  it('parses a well-formed pairing request', () => {
    const parsed = pairingRequestSchema.safeParse(validRequest());

    expect(parsed.success).toBe(true);
  });

  it('rejects an extra top-level field', () => {
    const parsed = pairingRequestSchema.safeParse({ ...validRequest(), oneTimeSecret: 'leak' });

    expect(parsed.success).toBe(false);
  });

  it('rejects an extra field inside the sealed secret', () => {
    const parsed = pairingRequestSchema.safeParse({
      ...validRequest(),
      sealedSecret: { ...SEALED_BLOB, extra: true },
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects a device public key that is not 32 raw bytes', () => {
    const parsed = pairingRequestSchema.safeParse({
      ...validRequest(),
      devicePublicKey: 'AAAA',
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects a nonce that is not 12 bytes', () => {
    const parsed = pairingRequestSchema.safeParse({
      ...validRequest(),
      sealedSecret: { ...SEALED_BLOB, nonce: 'AAAA' },
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects a pairing id containing the AAD delimiter', () => {
    const parsed = pairingRequestSchema.safeParse({ ...validRequest(), pairingId: 'pair|ing' });

    expect(parsed.success).toBe(false);
  });
});

describe('parsePairingRequest', () => {
  it('parses a JSON-encoded pairing request', () => {
    const result = parsePairingRequest(JSON.stringify(validRequest()));

    expect(result).not.toBeInstanceOf(PairingError);
    expect(result).toEqual(validRequest());
  });

  it('rejects a malformed pairing request', () => {
    expect(parsePairingRequest({ ...validRequest(), devicePublicKey: 'AAAA' })).toBeInstanceOf(
      PairingError,
    );
    expect(parsePairingRequest('{not-json')).toBeInstanceOf(PairingError);
  });
});

describe('parsePairingCompleteResponse', () => {
  it('parses a response that carries the sealed confirmation', () => {
    const result = parsePairingCompleteResponse(validCompleteResponse());

    expect(result).not.toBeInstanceOf(PairingError);
    expect(result).toEqual(validCompleteResponse());
  });

  it('rejects a response that leaks the one-time secret', () => {
    const result = parsePairingCompleteResponse({
      ...validCompleteResponse(),
      oneTimeSecret: 'one-time-secret',
    });

    expect(result).toBeInstanceOf(PairingError);
  });

  it('rejects a response without a sealed confirmation', () => {
    const result = parsePairingCompleteResponse({
      version: 1,
      pairingId: 'pairing-1',
      deviceCredentialId: 'credential-1',
    });

    expect(result).toBeInstanceOf(PairingError);
  });

  it('rejects a schema that does not match on the complete-response side', () => {
    expect(pairingCompleteResponseSchema.safeParse(validCompleteResponse()).success).toBe(true);
    expect(
      pairingCompleteResponseSchema.safeParse({
        ...validCompleteResponse(),
        sealedConfirmation: { ...SEALED_BLOB, tag: 'AAAA' },
      }).success,
    ).toBe(false);
  });
});
