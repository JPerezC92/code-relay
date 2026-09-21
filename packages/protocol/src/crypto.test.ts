import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  type KeyObject,
} from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AAD_DELIMITER,
  GCM_KEY_LENGTH,
  GCM_NONCE_LENGTH,
  GCM_TAG_LENGTH,
  PAIRING_KEY_INFO,
  SESSION_KEY_INFO,
  X25519_KEY_LENGTH,
  buildAad,
  buildPairingProof,
  buildTranscript,
  concatBytes,
  derivePairingKey,
  deriveSessionKey,
  encodeUtf8,
  type Bytes,
  type CiphertextBlob,
  type CryptoAdapter,
  type DecryptParams,
  type EncryptParams,
  type HashAdapter,
  type HkdfParams,
  type KeyAgreementAdapter,
  type KeyDerivationAdapter,
  type X25519KeyPair,
} from './crypto';

// RFC 8410 X25519 PKCS#8 and SPKI wrappers. The trailing 32 bytes are the raw key.
const X25519_PKCS8_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20,
]);
const X25519_SPKI_PREFIX = Uint8Array.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00,
]);

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64Url(value: string): Bytes {
  const unpadded = value.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of unpadded) {
    const index = BASE64URL_ALPHABET.indexOf(character);
    if (index < 0) throw new Error(`Invalid base64url character: ${character}`);
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

function encodeBase64(bytes: Bytes): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const triple = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    output += BASE64_ALPHABET[(triple >> 18) & 0x3f] ?? '';
    output += BASE64_ALPHABET[(triple >> 12) & 0x3f] ?? '';
    output += second === undefined ? '=' : (BASE64_ALPHABET[(triple >> 6) & 0x3f] ?? '');
    output += third === undefined ? '=' : (BASE64_ALPHABET[triple & 0x3f] ?? '');
  }
  return output;
}

function exportRaw(key: KeyObject, member: 'x' | 'd'): Bytes {
  const jwk = key.export({ format: 'jwk' });
  const encoded = jwk[member];
  if (typeof encoded !== 'string') throw new Error(`X25519 key is missing the "${member}" member`);
  return decodeBase64Url(encoded);
}

function importRawPrivate(privateKey: Bytes): KeyObject {
  return createPrivateKey({
    key: Buffer.from(concatBytes(X25519_PKCS8_PREFIX, privateKey)),
    format: 'der',
    type: 'pkcs8',
  });
}

function importRawPublic(publicKey: Bytes): KeyObject {
  return createPublicKey({
    key: Buffer.from(concatBytes(X25519_SPKI_PREFIX, publicKey)),
    format: 'der',
    type: 'spki',
  });
}

class NodeKeyAgreement implements KeyAgreementAdapter {
  generateKeyPair(): X25519KeyPair {
    const { publicKey, privateKey } = generateKeyPairSync('x25519');
    return {
      publicKey: exportRaw(publicKey, 'x'),
      privateKey: exportRaw(privateKey, 'd'),
    };
  }

  deriveSharedSecret(privateKey: Bytes, peerPublicKey: Bytes): Bytes {
    return new Uint8Array(
      diffieHellman({
        privateKey: importRawPrivate(privateKey),
        publicKey: importRawPublic(peerPublicKey),
      }),
    );
  }
}

class NodeKeyDerivation implements KeyDerivationAdapter {
  deriveKey({ sharedSecret, salt, info, length }: HkdfParams): Bytes {
    return new Uint8Array(hkdfSync('sha256', sharedSecret, salt, info, length));
  }
}

class NodeHash implements HashAdapter {
  sha256(data: Bytes): Bytes {
    return new Uint8Array(createHash('sha256').update(data).digest());
  }
}

const FIXED_NONCE = new Uint8Array(GCM_NONCE_LENGTH).fill(7);

class NodeAesGcm implements CryptoAdapter {
  async encrypt({ key, plaintext, aad }: EncryptParams): Promise<CiphertextBlob> {
    const cipher = createCipheriv('aes-256-gcm', key, FIXED_NONCE);
    cipher.setAAD(aad);
    const ciphertext = concatBytes(cipher.update(plaintext), cipher.final());
    return { nonce: FIXED_NONCE, ciphertext, tag: cipher.getAuthTag() };
  }

  async decrypt({ key, nonce, ciphertext, tag, aad }: DecryptParams): Promise<Bytes> {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return concatBytes(decipher.update(ciphertext), decipher.final());
  }
}

const KEY: Bytes = new Uint8Array(GCM_KEY_LENGTH).fill(7);

function asciiBytes(value: string): Bytes {
  return Uint8Array.from(Array.from(value, (character) => character.charCodeAt(0)));
}

function deviceAad(sequence: number): Bytes {
  return buildAad({
    version: 1,
    pairingId: 'pairing-1',
    direction: 'device-to-host',
    sequence,
  });
}

describe('buildAad', () => {
  it('joins version, pairingId, direction, and sequence with the delimiter', () => {
    const aad = buildAad({
      version: 1,
      pairingId: 'pairing-1',
      direction: 'device-to-host',
      sequence: 7,
    });

    expect(Array.from(aad)).toEqual(
      Array.from(asciiBytes(['1', 'pairing-1', 'device-to-host', '7'].join(AAD_DELIMITER))),
    );
  });

  it('produces distinct bytes for every distinct field value', () => {
    const baseline = buildAad({
      version: 1,
      pairingId: 'pairing-1',
      direction: 'device-to-host',
      sequence: 9,
    });
    const otherSequence = buildAad({
      version: 1,
      pairingId: 'pairing-1',
      direction: 'device-to-host',
      sequence: 10,
    });
    const otherPairing = buildAad({
      version: 1,
      pairingId: 'pairing-2',
      direction: 'device-to-host',
      sequence: 9,
    });
    const otherDirection = buildAad({
      version: 1,
      pairingId: 'pairing-1',
      direction: 'host-to-device',
      sequence: 9,
    });

    expect(Array.from(baseline)).not.toEqual(Array.from(otherSequence));
    expect(Array.from(baseline)).not.toEqual(Array.from(otherPairing));
    expect(Array.from(baseline)).not.toEqual(Array.from(otherDirection));
  });
});

describe('X25519 key agreement', () => {
  it('derives equal shared secrets from two parties', () => {
    const agreement = new NodeKeyAgreement();
    const alice = agreement.generateKeyPair();
    const bob = agreement.generateKeyPair();

    expect(alice.publicKey).toHaveLength(X25519_KEY_LENGTH);
    expect(alice.privateKey).toHaveLength(X25519_KEY_LENGTH);
    expect(bob.publicKey).toHaveLength(X25519_KEY_LENGTH);

    const aliceShared = agreement.deriveSharedSecret(alice.privateKey, bob.publicKey);
    const bobShared = agreement.deriveSharedSecret(bob.privateKey, alice.publicKey);

    expect(aliceShared).toHaveLength(X25519_KEY_LENGTH);
    expect(Array.from(aliceShared)).toEqual(Array.from(bobShared));
    expect(Array.from(aliceShared)).not.toEqual(
      Array.from(agreement.deriveSharedSecret(alice.privateKey, alice.publicKey)),
    );
  });
});

describe('buildTranscript', () => {
  const baseTranscript = {
    version: 1,
    pairingId: 'pairing-1',
    hostPublicKey: 'host-public-key',
    devicePublicKey: 'device-public-key-a',
  };

  it('changes when the device public key changes', () => {
    const changed = { ...baseTranscript, devicePublicKey: 'device-public-key-b' };

    expect(Array.from(buildTranscript(baseTranscript))).not.toEqual(
      Array.from(buildTranscript(changed)),
    );
  });

  it('is stable for identical inputs and binds every field', () => {
    const baseline = buildTranscript(baseTranscript);

    expect(Array.from(baseline)).toEqual(Array.from(buildTranscript({ ...baseTranscript })));
    expect(Array.from(baseline)).not.toEqual(
      Array.from(buildTranscript({ ...baseTranscript, version: 2 })),
    );
    expect(Array.from(baseline)).not.toEqual(
      Array.from(buildTranscript({ ...baseTranscript, pairingId: 'pairing-2' })),
    );
    expect(Array.from(baseline)).not.toEqual(
      Array.from(buildTranscript({ ...baseTranscript, hostPublicKey: 'other-host' })),
    );
  });

  it('frames fields with lengths so separators cannot collide', () => {
    const left = buildTranscript({
      version: 1,
      pairingId: 'p',
      hostPublicKey: 'h',
      devicePublicKey: 'a|b',
    });
    const right = buildTranscript({
      version: 1,
      pairingId: 'p',
      hostPublicKey: 'h|a',
      devicePublicKey: 'b',
    });

    expect(Array.from(left)).not.toEqual(Array.from(right));
  });
});

describe('HKDF key derivation', () => {
  it('is deterministic and separated by info', () => {
    const derivation = new NodeKeyDerivation();
    const sharedSecret = new Uint8Array(X25519_KEY_LENGTH).fill(3);
    const salt = new Uint8Array(X25519_KEY_LENGTH).fill(4);

    const first = derivation.deriveKey({
      sharedSecret,
      salt,
      info: encodeUtf8('info-a'),
      length: GCM_KEY_LENGTH,
    });
    const again = derivation.deriveKey({
      sharedSecret,
      salt,
      info: encodeUtf8('info-a'),
      length: GCM_KEY_LENGTH,
    });
    const otherInfo = derivation.deriveKey({
      sharedSecret,
      salt,
      info: encodeUtf8('info-b'),
      length: GCM_KEY_LENGTH,
    });

    expect(first).toHaveLength(GCM_KEY_LENGTH);
    expect(Array.from(first)).toEqual(Array.from(again));
    expect(Array.from(first)).not.toEqual(Array.from(otherInfo));
  });

  it('derives distinct pairing and session keys from the same shared secret', () => {
    const derivation = new NodeKeyDerivation();
    const sharedSecret = new Uint8Array(X25519_KEY_LENGTH).fill(5);
    const transcript = buildTranscript({
      version: 1,
      pairingId: 'pairing-1',
      hostPublicKey: 'host-public-key',
      devicePublicKey: 'device-public-key',
    });

    const pairingKey = derivePairingKey({ sharedSecret, transcript, keyDerivation: derivation });
    const sessionKey = deriveSessionKey({
      sharedSecret,
      oneTimeSecret: new Uint8Array(X25519_KEY_LENGTH).fill(6),
      transcript,
      keyDerivation: derivation,
    });

    expect(pairingKey).toHaveLength(GCM_KEY_LENGTH);
    expect(sessionKey).toHaveLength(GCM_KEY_LENGTH);
    expect(Array.from(pairingKey)).not.toEqual(Array.from(sessionKey));
  });

  it('separates the pairing and session domains by info alone', () => {
    const derivation = new NodeKeyDerivation();
    const sharedSecret = new Uint8Array(X25519_KEY_LENGTH).fill(11);
    const salt = new Uint8Array(X25519_KEY_LENGTH).fill(12);

    const pairingKey = derivation.deriveKey({
      sharedSecret,
      salt,
      info: encodeUtf8(PAIRING_KEY_INFO),
      length: GCM_KEY_LENGTH,
    });
    const sessionKey = derivation.deriveKey({
      sharedSecret,
      salt,
      info: encodeUtf8(SESSION_KEY_INFO),
      length: GCM_KEY_LENGTH,
    });

    expect(PAIRING_KEY_INFO).not.toBe(SESSION_KEY_INFO);
    expect(Array.from(pairingKey)).not.toEqual(Array.from(sessionKey));
  });
});

describe('CryptoAdapter', () => {
  it('round-trips plaintext through a real AES-256-GCM adapter', async () => {
    const crypto = new NodeAesGcm();
    const plaintext = encodeUtf8('relay this prompt');
    const aad = deviceAad(9);

    const encrypted = await crypto.encrypt({ key: KEY, plaintext, aad });

    expect(encrypted.nonce).toHaveLength(GCM_NONCE_LENGTH);
    expect(encrypted.tag).toHaveLength(GCM_TAG_LENGTH);
    expect(Array.from(encrypted.ciphertext)).not.toEqual(Array.from(plaintext));

    const decrypted = await crypto.decrypt({ ...encrypted, key: KEY, aad });

    expect(Array.from(decrypted)).toEqual(Array.from(plaintext));
  });

  it('rejects a payload with a mismatched AAD', async () => {
    const crypto = new NodeAesGcm();
    const plaintext = encodeUtf8('relay this prompt');
    const encrypted = await crypto.encrypt({ key: KEY, plaintext, aad: deviceAad(10) });

    await expect(crypto.decrypt({ ...encrypted, key: KEY, aad: deviceAad(11) })).rejects.toThrow();
  });
});

describe('sealed handshake round-trip', () => {
  it('seals the one-time secret and returns a verifiable confirmation', async () => {
    const agreement = new NodeKeyAgreement();
    const derivation = new NodeKeyDerivation();
    const hash = new NodeHash();
    const cipher = new NodeAesGcm();

    const host = agreement.generateKeyPair();
    const device = agreement.generateKeyPair();
    const transcript = buildTranscript({
      version: 1,
      pairingId: 'pairing-1',
      hostPublicKey: encodeBase64(host.publicKey),
      devicePublicKey: encodeBase64(device.publicKey),
    });

    const deviceShared = agreement.deriveSharedSecret(device.privateKey, host.publicKey);
    const hostShared = agreement.deriveSharedSecret(host.privateKey, device.publicKey);
    expect(Array.from(deviceShared)).toEqual(Array.from(hostShared));

    const oneTimeSecret = new Uint8Array(32).fill(5);
    const devicePairingKey = derivePairingKey({
      sharedSecret: deviceShared,
      transcript,
      keyDerivation: derivation,
    });
    const sealedSecret = await cipher.encrypt({
      key: devicePairingKey,
      plaintext: oneTimeSecret,
      aad: transcript,
    });

    const hostPairingKey = derivePairingKey({
      sharedSecret: hostShared,
      transcript,
      keyDerivation: derivation,
    });
    const openedSecret = await cipher.decrypt({
      key: hostPairingKey,
      nonce: sealedSecret.nonce,
      ciphertext: sealedSecret.ciphertext,
      tag: sealedSecret.tag,
      aad: transcript,
    });
    expect(Array.from(openedSecret)).toEqual(Array.from(oneTimeSecret));

    const deviceSessionKey = deriveSessionKey({
      sharedSecret: deviceShared,
      oneTimeSecret,
      transcript,
      keyDerivation: derivation,
    });
    const hostSessionKey = deriveSessionKey({
      sharedSecret: hostShared,
      oneTimeSecret: openedSecret,
      transcript,
      keyDerivation: derivation,
    });
    expect(Array.from(deviceSessionKey)).toEqual(Array.from(hostSessionKey));

    const hostProof = buildPairingProof({ transcript, sessionKey: hostSessionKey, hash });
    const sealedConfirmation = await cipher.encrypt({
      key: hostSessionKey,
      plaintext: hostProof,
      aad: transcript,
    });
    const deviceProof = await cipher.decrypt({
      key: deviceSessionKey,
      nonce: sealedConfirmation.nonce,
      ciphertext: sealedConfirmation.ciphertext,
      tag: sealedConfirmation.tag,
      aad: transcript,
    });

    expect(Array.from(deviceProof)).toEqual(
      Array.from(buildPairingProof({ transcript, sessionKey: deviceSessionKey, hash })),
    );
  });
});
