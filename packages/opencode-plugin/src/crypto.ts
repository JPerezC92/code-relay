import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes as nodeRandomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { GCM_KEY_LENGTH, GCM_NONCE_LENGTH, GCM_TAG_LENGTH, X25519_KEY_LENGTH } from '@coderelay/protocol';
import type {
  Bytes,
  CiphertextBlob,
  CryptoAdapter,
  DecryptParams,
  EncryptParams,
  HashAdapter,
  HkdfParams,
  KeyAgreementAdapter,
  KeyDerivationAdapter,
  X25519KeyPair,
} from '@coderelay/protocol';

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoError';
  }
}

function toBuffer(bytes: Bytes): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function assertKey(key: Bytes): Buffer {
  if (key.byteLength !== GCM_KEY_LENGTH) {
    throw new CryptoError(`AES-256-GCM key must be ${GCM_KEY_LENGTH} bytes`);
  }
  return toBuffer(key);
}

export class HostCryptoAdapter implements CryptoAdapter {
  async encrypt(params: EncryptParams): Promise<CiphertextBlob> {
    const key = assertKey(params.key);
    const nonce = nodeRandomBytes(GCM_NONCE_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(toBuffer(params.aad));
    const ciphertext = Buffer.concat([
      cipher.update(toBuffer(params.plaintext)),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return {
      nonce: Uint8Array.from(nonce),
      ciphertext: Uint8Array.from(ciphertext),
      tag: Uint8Array.from(tag),
    };
  }

  async decrypt(params: DecryptParams): Promise<Bytes> {
    const key = assertKey(params.key);
    if (params.nonce.byteLength !== GCM_NONCE_LENGTH) {
      throw new CryptoError(`AES-256-GCM nonce must be ${GCM_NONCE_LENGTH} bytes`);
    }
    if (params.tag.byteLength !== GCM_TAG_LENGTH) {
      throw new CryptoError(`AES-256-GCM tag must be ${GCM_TAG_LENGTH} bytes`);
    }
    const decipher = createDecipheriv('aes-256-gcm', key, toBuffer(params.nonce));
    decipher.setAAD(toBuffer(params.aad));
    decipher.setAuthTag(toBuffer(params.tag));
    const plaintext = Buffer.concat([
      decipher.update(toBuffer(params.ciphertext)),
      decipher.final(),
    ]);
    return Uint8Array.from(plaintext);
  }
}

export function createHostCrypto(): CryptoAdapter {
  return new HostCryptoAdapter();
}

export function randomBytes(length: number): Bytes {
  return Uint8Array.from(nodeRandomBytes(length));
}

export function toBase64(bytes: Bytes): string {
  return Buffer.from(bytes).toString('base64');
}

export function fromBase64(value: string): Bytes {
  return Uint8Array.from(Buffer.from(value, 'base64'));
}

// RFC 8410 X25519 PKCS#8 and SPKI wrappers. Only the trailing 32 bytes are the
// raw key, which keeps the wire format identical to @noble/curves X25519.
const X25519_PKCS8_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20,
]);
const X25519_SPKI_PREFIX = Uint8Array.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00,
]);

function rawPrivateToKeyObject(privateKey: Bytes): KeyObject {
  if (privateKey.byteLength !== X25519_KEY_LENGTH) {
    throw new CryptoError(`X25519 private key must be ${X25519_KEY_LENGTH} bytes`);
  }
  return createPrivateKey({
    key: Buffer.concat([Buffer.from(X25519_PKCS8_PREFIX), toBuffer(privateKey)]),
    format: 'der',
    type: 'pkcs8',
  });
}

function rawPublicToKeyObject(publicKey: Bytes): KeyObject {
  if (publicKey.byteLength !== X25519_KEY_LENGTH) {
    throw new CryptoError(`X25519 public key must be ${X25519_KEY_LENGTH} bytes`);
  }
  return createPublicKey({
    key: Buffer.concat([Buffer.from(X25519_SPKI_PREFIX), toBuffer(publicKey)]),
    format: 'der',
    type: 'spki',
  });
}

function keyObjectToRawPublic(key: KeyObject): Bytes {
  const jwk = key.export({ format: 'jwk' });
  const encoded = jwk.x;
  if (typeof encoded !== 'string') {
    throw new CryptoError('X25519 public key is missing the "x" JWK member');
  }
  return Uint8Array.from(Buffer.from(encoded, 'base64url'));
}

function keyObjectToRawPrivate(key: KeyObject): Bytes {
  const jwk = key.export({ format: 'jwk' });
  const encoded = jwk.d;
  if (typeof encoded !== 'string') {
    throw new CryptoError('X25519 private key is missing the "d" JWK member');
  }
  return Uint8Array.from(Buffer.from(encoded, 'base64url'));
}

export class HostKeyAgreementAdapter implements KeyAgreementAdapter {
  generateKeyPair(): X25519KeyPair {
    const { publicKey, privateKey } = generateKeyPairSync('x25519');
    return {
      publicKey: keyObjectToRawPublic(publicKey),
      privateKey: keyObjectToRawPrivate(privateKey),
    };
  }

  deriveSharedSecret(privateKey: Bytes, peerPublicKey: Bytes): Bytes {
    const shared = diffieHellman({
      privateKey: rawPrivateToKeyObject(privateKey),
      publicKey: rawPublicToKeyObject(peerPublicKey),
    });
    return Uint8Array.from(shared);
  }
}

export class HostKeyDerivationAdapter implements KeyDerivationAdapter {
  deriveKey({ sharedSecret, salt, info, length }: HkdfParams): Bytes {
    const derived = hkdfSync(
      'sha256',
      toBuffer(sharedSecret),
      toBuffer(salt),
      toBuffer(info),
      length,
    );
    return new Uint8Array(derived);
  }
}

export function createHostKeyAgreement(): KeyAgreementAdapter {
  return new HostKeyAgreementAdapter();
}

export function createHostKeyDerivation(): KeyDerivationAdapter {
  return new HostKeyDerivationAdapter();
}

export function sha256(data: Bytes): Bytes {
  return Uint8Array.from(createHash('sha256').update(toBuffer(data)).digest());
}

export function constantTimeEqual(left: Bytes, right: Bytes): boolean {
  const a = toBuffer(left);
  const b = toBuffer(right);
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

export interface HostPairingCrypto extends HashAdapter {
  keyAgreement: KeyAgreementAdapter;
  keyDerivation: KeyDerivationAdapter;
  cipher: CryptoAdapter;
  constantTimeEqual(left: Bytes, right: Bytes): boolean;
  randomBytes(length: number): Bytes;
}

export function createHostPairingCrypto(): HostPairingCrypto {
  return {
    keyAgreement: createHostKeyAgreement(),
    keyDerivation: createHostKeyDerivation(),
    cipher: createHostCrypto(),
    sha256,
    constantTimeEqual,
    randomBytes,
  };
}
