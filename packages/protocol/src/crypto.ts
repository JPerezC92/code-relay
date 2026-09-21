import type { EnvelopeDirection } from './envelope';

export type Bytes = Uint8Array;

export const GCM_KEY_LENGTH = 32;
export const GCM_NONCE_LENGTH = 12;
export const GCM_TAG_LENGTH = 16;

/** Raw X25519 keys on the wire are base64 of exactly this many bytes. */
export const X25519_KEY_LENGTH = 32;

/** Length of every HKDF-SHA256 derived key (pairing key and session key). */
export const SESSION_KEY_LENGTH = 32;

export const AAD_DELIMITER = '|';

/**
 * Field separator for the canonical transcript. `pairingIdSchema` forbids this
 * byte, and every framed field carries a byte length, so no two distinct
 * transcripts can collide by concatenation.
 */
export const TRANSCRIPT_FIELD_SEPARATOR = '|';

export const PAIRING_KEY_INFO = 'coderelay/v1/pairing-key';
export const SESSION_KEY_INFO = 'coderelay/v1/session-key';

export interface CiphertextBlob {
  nonce: Bytes;
  ciphertext: Bytes;
  tag: Bytes;
}

export interface EncryptParams {
  key: Bytes;
  plaintext: Bytes;
  aad: Bytes;
}

export interface DecryptParams {
  key: Bytes;
  nonce: Bytes;
  ciphertext: Bytes;
  tag: Bytes;
  aad: Bytes;
}

export interface CryptoAdapter {
  encrypt(params: EncryptParams): Promise<CiphertextBlob>;
  decrypt(params: DecryptParams): Promise<Bytes>;
}

export interface AadInput {
  version: number;
  pairingId: string;
  direction: EnvelopeDirection;
  sequence: number;
}

/** Raw X25519 key material. Both members are exactly `X25519_KEY_LENGTH` bytes. */
export interface X25519KeyPair {
  publicKey: Bytes;
  privateKey: Bytes;
}

/**
 * Platform-neutral X25519 key agreement. The host uses `node:crypto` and the
 * device uses `@noble/curves`; both exchange raw 32-byte keys.
 */
export interface KeyAgreementAdapter {
  generateKeyPair(): X25519KeyPair;
  deriveSharedSecret(privateKey: Bytes, peerPublicKey: Bytes): Bytes;
}

export interface HkdfParams {
  sharedSecret: Bytes;
  salt: Bytes;
  info: Bytes;
  length: number;
}

export interface KeyDerivationAdapter {
  deriveKey(params: HkdfParams): Bytes;
}

export interface HashAdapter {
  sha256(data: Bytes): Bytes;
}

export interface TranscriptInput {
  version: number;
  pairingId: string;
  hostPublicKey: string;
  devicePublicKey: string;
}

export function encodeUtf8(value: string): Bytes {
  const bytes: number[] = [];
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code === undefined) continue;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

export function concatBytes(...chunks: Bytes[]): Bytes {
  let total = 0;
  for (const chunk of chunks) total += chunk.byteLength;
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export function buildAad(input: AadInput): Bytes {
  return encodeUtf8(
    [input.version, input.pairingId, input.direction, input.sequence].join(AAD_DELIMITER),
  );
}

function frameTranscriptField(label: string, value: string): string {
  return `${label}:${encodeUtf8(value).byteLength}:${value}`;
}

/**
 * Canonical byte encoding of the handshake transcript. Every field is framed
 * with a label and its byte length so concatenation cannot collide.
 */
export function buildTranscript(input: TranscriptInput): Bytes {
  return encodeUtf8(
    [
      `v${input.version}`,
      frameTranscriptField('pairingId', input.pairingId),
      frameTranscriptField('hostPublicKey', input.hostPublicKey),
      frameTranscriptField('devicePublicKey', input.devicePublicKey),
    ].join(TRANSCRIPT_FIELD_SEPARATOR),
  );
}

export interface PairingKeyParams {
  sharedSecret: Bytes;
  transcript: Bytes;
  keyDerivation: KeyDerivationAdapter;
}

/** `pairingKey = HKDF(sharedSecret, salt = transcript, info = PAIRING_KEY_INFO)`. */
export function derivePairingKey(params: PairingKeyParams): Bytes {
  return params.keyDerivation.deriveKey({
    sharedSecret: params.sharedSecret,
    salt: params.transcript,
    info: encodeUtf8(PAIRING_KEY_INFO),
    length: GCM_KEY_LENGTH,
  });
}

export interface SessionKeyParams {
  sharedSecret: Bytes;
  oneTimeSecret: Bytes;
  transcript: Bytes;
  keyDerivation: KeyDerivationAdapter;
}

/**
 * `sessionKey = HKDF(sharedSecret, salt = oneTimeSecret, info = SESSION_KEY_INFO || transcript)`.
 */
export function deriveSessionKey(params: SessionKeyParams): Bytes {
  return params.keyDerivation.deriveKey({
    sharedSecret: params.sharedSecret,
    salt: params.oneTimeSecret,
    info: concatBytes(encodeUtf8(SESSION_KEY_INFO), params.transcript),
    length: SESSION_KEY_LENGTH,
  });
}

export interface PairingProofParams {
  transcript: Bytes;
  sessionKey: Bytes;
  hash: HashAdapter;
}

/** `proof = sha256(transcript || sessionKey)`, which binds the host to the session. */
export function buildPairingProof(params: PairingProofParams): Bytes {
  return params.hash.sha256(concatBytes(params.transcript, params.sessionKey));
}
