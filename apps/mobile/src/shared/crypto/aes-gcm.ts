/**
 * Device crypto adapter for the CodeRelay protocol.
 *
 * Implements the platform-neutral protocol ports (`CryptoAdapter`,
 * `KeyAgreementAdapter`, `KeyDerivationAdapter`, `HashAdapter`) on top of
 * `expo-crypto` (AES-256-GCM, CSRNG) and `@noble/curves` / `@noble/hashes`
 * (X25519, HKDF-SHA256, SHA-256). The X25519 private key comes from
 * `expo-crypto`'s random source because noble's RNG needs a WebCrypto global
 * that is absent in Expo, and the transcript / KDF info strings stay in the
 * protocol helpers rather than being re-derived here.
 */
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 as sha256Hash } from '@noble/hashes/sha2';
import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  getRandomBytes,
} from 'expo-crypto';
import {
  GCM_KEY_LENGTH,
  GCM_NONCE_LENGTH,
  GCM_TAG_LENGTH,
  X25519_KEY_LENGTH,
} from '@coderelay/protocol';
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

export class DeviceCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceCryptoError';
  }
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function byteAt(bytes: Bytes, index: number): number {
  const value: number | undefined = bytes[index];
  return value === undefined ? 0 : value;
}

/** Standard base64 with padding, matching the protocol's wire schemas. */
export function toBase64(bytes: Bytes): string {
  let output = '';
  for (let index = 0; index < bytes.byteLength; index += 3) {
    const second = index + 1 < bytes.byteLength ? byteAt(bytes, index + 1) : undefined;
    const third = index + 2 < bytes.byteLength ? byteAt(bytes, index + 2) : undefined;
    const chunk = (byteAt(bytes, index) << 16) | ((second ?? 0) << 8) | (third ?? 0);
    output += BASE64_ALPHABET[(chunk >> 18) & 0x3f];
    output += BASE64_ALPHABET[(chunk >> 12) & 0x3f];
    output += second === undefined ? '=' : BASE64_ALPHABET[(chunk >> 6) & 0x3f];
    output += third === undefined ? '=' : BASE64_ALPHABET[chunk & 0x3f];
  }
  return output;
}

/** Decodes standard base64, tolerating the padding the protocol schemas require. */
export function fromBase64(value: string): Bytes {
  const unpadded = value.endsWith('==')
    ? value.slice(0, -2)
    : value.endsWith('=')
      ? value.slice(0, -1)
      : value;
  const bytes = new Uint8Array(Math.floor((unpadded.length * 6) / 8));
  let byteIndex = 0;
  let buffer = 0;
  let bits = 0;
  for (const character of unpadded) {
    const digit = BASE64_ALPHABET.indexOf(character);
    if (digit < 0) throw new DeviceCryptoError('Invalid base64 input');
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[byteIndex] = (buffer >> bits) & 0xff;
      byteIndex += 1;
    }
  }
  return bytes;
}

/** Minimal UTF-8 decoder so the transport never depends on a TextDecoder global. */
export function decodeUtf8(bytes: Bytes): string {
  let output = '';
  let index = 0;
  while (index < bytes.byteLength) {
    const first = byteAt(bytes, index);
    index += 1;
    if (first < 0x80) {
      output += String.fromCharCode(first);
      continue;
    }
    let codePoint = 0;
    let continuations = 0;
    if ((first & 0xe0) === 0xc0) {
      codePoint = first & 0x1f;
      continuations = 1;
    } else if ((first & 0xf0) === 0xe0) {
      codePoint = first & 0x0f;
      continuations = 2;
    } else if ((first & 0xf8) === 0xf0) {
      codePoint = first & 0x07;
      continuations = 3;
    } else {
      output += '\uFFFD';
      continue;
    }
    let valid = true;
    for (let offset = 0; offset < continuations; offset += 1) {
      const next = index < bytes.byteLength ? byteAt(bytes, index) : undefined;
      if (next === undefined || (next & 0xc0) !== 0x80) {
        valid = false;
        break;
      }
      codePoint = (codePoint << 6) | (next & 0x3f);
      index += 1;
    }
    if (!valid || codePoint > 0x10ffff) {
      output += '\uFFFD';
      continue;
    }
    output += String.fromCodePoint(codePoint);
  }
  return output;
}

/** Length-checked, constant-time byte comparison for handshake proofs. */
export function constantTimeEqual(left: Bytes, right: Bytes): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= byteAt(left, index) ^ byteAt(right, index);
  }
  return difference === 0;
}

function assertKeyLength(key: Bytes): void {
  if (key.byteLength !== GCM_KEY_LENGTH) {
    throw new DeviceCryptoError(`AES-256-GCM key must be ${GCM_KEY_LENGTH} bytes`);
  }
}

function createCipherAdapter(): CryptoAdapter {
  return {
    async encrypt(params: EncryptParams): Promise<CiphertextBlob> {
      assertKeyLength(params.key);
      const key = await AESEncryptionKey.import(params.key);
      const sealed = await aesEncryptAsync(params.plaintext, key, {
        nonce: { length: GCM_NONCE_LENGTH },
        tagLength: GCM_TAG_LENGTH,
        // expo-crypto requires the AAD as base64 when it is not raw bytes.
        additionalData: toBase64(params.aad),
      });
      return {
        nonce: await sealed.iv(),
        ciphertext: await sealed.ciphertext({ includeTag: false }),
        tag: await sealed.tag(),
      };
    },

    async decrypt(params: DecryptParams): Promise<Bytes> {
      assertKeyLength(params.key);
      if (params.nonce.byteLength !== GCM_NONCE_LENGTH) {
        throw new DeviceCryptoError(`AES-256-GCM nonce must be ${GCM_NONCE_LENGTH} bytes`);
      }
      if (params.tag.byteLength !== GCM_TAG_LENGTH) {
        throw new DeviceCryptoError(`AES-256-GCM tag must be ${GCM_TAG_LENGTH} bytes`);
      }
      const key = await AESEncryptionKey.import(params.key);
      const sealed = AESSealedData.fromParts(params.nonce, params.ciphertext, params.tag);
      return aesDecryptAsync(sealed, key, {
        output: 'bytes',
        additionalData: toBase64(params.aad),
      });
    },
  };
}

function createKeyAgreementAdapter(): KeyAgreementAdapter {
  return {
    generateKeyPair(): X25519KeyPair {
      // The private key comes from expo-crypto: noble's `randomSecretKey` needs a
      // WebCrypto global that Expo does not provide.
      const privateKey = getRandomBytes(X25519_KEY_LENGTH);
      return { publicKey: x25519.getPublicKey(privateKey), privateKey };
    },

    deriveSharedSecret(privateKey: Bytes, peerPublicKey: Bytes): Bytes {
      if (privateKey.byteLength !== X25519_KEY_LENGTH) {
        throw new DeviceCryptoError(`X25519 private key must be ${X25519_KEY_LENGTH} bytes`);
      }
      if (peerPublicKey.byteLength !== X25519_KEY_LENGTH) {
        throw new DeviceCryptoError(`X25519 public key must be ${X25519_KEY_LENGTH} bytes`);
      }
      return x25519.getSharedSecret(privateKey, peerPublicKey);
    },
  };
}

function createKeyDerivationAdapter(): KeyDerivationAdapter {
  return {
    deriveKey({ sharedSecret, salt, info, length }: HkdfParams): Bytes {
      return hkdf(sha256Hash, sharedSecret, salt, info, length);
    },
  };
}

export interface DeviceCrypto extends HashAdapter {
  cipher: CryptoAdapter;
  keyAgreement: KeyAgreementAdapter;
  keyDerivation: KeyDerivationAdapter;
}

export function createDeviceCrypto(): DeviceCrypto {
  return {
    cipher: createCipherAdapter(),
    keyAgreement: createKeyAgreementAdapter(),
    keyDerivation: createKeyDerivationAdapter(),
    sha256: (data: Bytes): Bytes => sha256Hash(data),
  };
}
