import { randomUUID } from 'node:crypto';
import {
  PROTOCOL_VERSION,
  buildPairingProof,
  buildTranscript,
  derivePairingKey,
  deriveSessionKey,
} from '@coderelay/protocol';
import type {
  Bytes,
  CiphertextBlob,
  PairingCompleteResponse,
  PairingPayload,
  X25519KeyPair,
} from '@coderelay/protocol';
import { createHostPairingCrypto, toBase64 } from './crypto';
import type { HostPairingCrypto } from './crypto';

export const PAIRING_TTL_SECONDS = 120;
export const PAIRING_SECRET_BYTES = 32;

export type PairingState = 'idle' | 'waiting' | 'paired' | 'expired' | 'revoked';

export interface PairingStatus {
  state: PairingState;
  pairingId: string | null;
  expiresAt: string | null;
  expiresInSeconds: number | null;
  deviceCredentialId: string | null;
}

export interface PairingManagerOptions {
  now?: () => Date;
  ttlSeconds?: number;
  hostCrypto?: HostPairingCrypto;
  hostKeyPair?: X25519KeyPair;
}

export interface CreatePairingOptions {
  endpoints: string[];
}

export interface CreatedPairing {
  payload: PairingPayload;
  oneTimeSecret: string;
  pairingId: string;
  expiresAt: string;
}

/** Everything the device sends to `/pair`, already decoded from the wire. */
export interface PairingAttempt {
  pairingId: string;
  devicePublicKey: Bytes;
  sealedSecret: CiphertextBlob;
}

export interface PairingCompletion {
  response: PairingCompleteResponse;
  sessionKey: Bytes;
}

export class PairingManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PairingManagerError';
  }
}

/**
 * X25519 returns an all-zero shared secret for every low-order peer public key,
 * which would drop the peer's contribution from the session. RFC 7748 section 6
 * recommends rejecting that value.
 */
function isLowOrderSharedSecret(sharedSecret: Bytes): boolean {
  for (const byte of sharedSecret) {
    if (byte !== 0) return false;
  }
  return true;
}

export class PairingManager {
  private readonly nowProvider: () => Date;
  private readonly ttlSeconds: number;
  private readonly hostCrypto: HostPairingCrypto;
  private readonly hostKeyPair: X25519KeyPair;
  private phase: PairingState = 'idle';
  private currentPairingId: string | null = null;
  private secretHash: Bytes | null = null;
  private expiresAtMs: number | null = null;
  private deviceCredentialId: string | null = null;

  constructor(options: PairingManagerOptions = {}) {
    this.nowProvider = options.now ?? (() => new Date());
    this.ttlSeconds = options.ttlSeconds ?? PAIRING_TTL_SECONDS;
    this.hostCrypto = options.hostCrypto ?? createHostPairingCrypto();
    this.hostKeyPair = options.hostKeyPair ?? this.hostCrypto.keyAgreement.generateKeyPair();
  }

  get ttl(): number {
    return this.ttlSeconds;
  }

  /** Base64 of the host's raw X25519 public key, published in the QR payload. */
  get hostPublicKey(): string {
    return toBase64(this.hostKeyPair.publicKey);
  }

  createPairing(options: CreatePairingOptions): CreatedPairing | PairingManagerError {
    if (this.phase === 'paired') {
      return new PairingManagerError(
        'A device is already paired; revoke it before creating a new pairing',
      );
    }
    const now = this.nowProvider();
    const pairingId = randomUUID();
    const secretBytes = this.hostCrypto.randomBytes(PAIRING_SECRET_BYTES);
    const oneTimeSecret = toBase64(secretBytes);
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);
    this.phase = 'waiting';
    this.currentPairingId = pairingId;
    this.secretHash = this.hostCrypto.sha256(secretBytes);
    this.expiresAtMs = expiresAt.getTime();
    this.deviceCredentialId = null;
    const payload: PairingPayload = {
      version: PROTOCOL_VERSION,
      endpoints: [...options.endpoints],
      pairingId,
      oneTimeSecret,
      hostPublicKey: this.hostPublicKey,
      expiresAt: expiresAt.toISOString(),
    };
    return { payload, oneTimeSecret, pairingId, expiresAt: payload.expiresAt };
  }

  /**
   * Completes the X25519 handshake. The device's sealed one-time secret is
   * opened with a pairing key derived from the ECDH shared secret and the
   * transcript, compared in constant time to the stored hash, and answered with
   * a confirmation sealed under the derived session key.
   */
  async completePairing(attempt: PairingAttempt): Promise<PairingCompletion | PairingManagerError> {
    if (this.phase === 'revoked') {
      return new PairingManagerError('Pairing has been revoked');
    }
    const pairingId = this.currentPairingId;
    const secretHash = this.secretHash;
    const expiresAtMs = this.expiresAtMs;
    if (
      this.phase !== 'waiting' ||
      pairingId === null ||
      secretHash === null ||
      expiresAtMs === null
    ) {
      return new PairingManagerError('No active pairing to complete');
    }
    if (this.nowProvider().getTime() >= expiresAtMs) {
      this.phase = 'expired';
      this.secretHash = null;
      return new PairingManagerError('Pairing secret has expired');
    }
    if (attempt.pairingId !== pairingId) {
      return new PairingManagerError('Pairing id does not match the active pairing');
    }
    const transcript = buildTranscript({
      version: PROTOCOL_VERSION,
      pairingId,
      hostPublicKey: this.hostPublicKey,
      devicePublicKey: toBase64(attempt.devicePublicKey),
    });
    let sharedSecret: Bytes;
    try {
      sharedSecret = this.hostCrypto.keyAgreement.deriveSharedSecret(
        this.hostKeyPair.privateKey,
        attempt.devicePublicKey,
      );
    } catch {
      this.burn();
      return new PairingManagerError('Device public key could not be used for key agreement');
    }
    if (isLowOrderSharedSecret(sharedSecret)) {
      this.burn();
      return new PairingManagerError('Device public key produced a low-order shared secret');
    }
    const pairingKey = derivePairingKey({
      sharedSecret,
      transcript,
      keyDerivation: this.hostCrypto.keyDerivation,
    });
    let secretBytes: Bytes;
    try {
      secretBytes = await this.hostCrypto.cipher.decrypt({
        key: pairingKey,
        nonce: attempt.sealedSecret.nonce,
        ciphertext: attempt.sealedSecret.ciphertext,
        tag: attempt.sealedSecret.tag,
        aad: transcript,
      });
    } catch {
      this.burn();
      return new PairingManagerError('Sealed pairing secret could not be opened');
    }
    const candidateHash = this.hostCrypto.sha256(secretBytes);
    if (!this.hostCrypto.constantTimeEqual(candidateHash, secretHash)) {
      this.burn();
      return new PairingManagerError('Invalid pairing secret');
    }
    const sessionKey = deriveSessionKey({
      sharedSecret,
      oneTimeSecret: secretBytes,
      transcript,
      keyDerivation: this.hostCrypto.keyDerivation,
    });
    const proof = buildPairingProof({ transcript, sessionKey, hash: this.hostCrypto });
    const sealedConfirmation = await this.hostCrypto.cipher.encrypt({
      key: sessionKey,
      plaintext: proof,
      aad: transcript,
    });
    this.phase = 'paired';
    this.secretHash = null;
    const deviceCredentialId = randomUUID();
    this.deviceCredentialId = deviceCredentialId;
    return {
      response: {
        version: PROTOCOL_VERSION,
        pairingId,
        deviceCredentialId,
        sealedConfirmation: {
          nonce: toBase64(sealedConfirmation.nonce),
          ciphertext: toBase64(sealedConfirmation.ciphertext),
          tag: toBase64(sealedConfirmation.tag),
        },
      },
      sessionKey,
    };
  }

  private burn(): void {
    this.phase = 'revoked';
    this.secretHash = null;
  }

  revoke(): void {
    this.phase = 'revoked';
    this.secretHash = null;
    this.expiresAtMs = null;
    this.deviceCredentialId = null;
  }

  status(): PairingStatus {
    const now = this.nowProvider().getTime();
    const expiresInSeconds =
      this.expiresAtMs === null ? null : Math.max(0, Math.ceil((this.expiresAtMs - now) / 1000));
    const expired =
      this.phase === 'waiting' && this.expiresAtMs !== null && now >= this.expiresAtMs;
    return {
      state: expired ? 'expired' : this.phase,
      pairingId: this.currentPairingId,
      expiresAt: this.expiresAtMs === null ? null : new Date(this.expiresAtMs).toISOString(),
      expiresInSeconds,
      deviceCredentialId: this.deviceCredentialId,
    };
  }

  pairingId(): string | null {
    return this.currentPairingId;
  }

  isPaired(): boolean {
    return this.phase === 'paired';
  }
}

export type PendingSecretTimer = ReturnType<typeof setTimeout>;

export interface PendingPairingSecretOptions {
  ttlMs: number;
  setTimer?: (callback: () => void, milliseconds: number) => PendingSecretTimer;
  clearTimer?: (handle: PendingSecretTimer) => void;
}

/**
 * Holds the one-time secret for the current pairing. The secret is released at
 * most once, is dropped as soon as the pairing leaves `waiting`, and expires
 * with the pairing TTL so it never lingers for the plugin lifetime.
 */
export class PendingPairingSecret {
  private secret: string | null;
  private timer: PendingSecretTimer | null;
  private readonly clearTimer: (handle: PendingSecretTimer) => void;

  constructor(secret: string, options: PendingPairingSecretOptions) {
    this.secret = secret;
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
    const setTimer =
      options.setTimer ?? ((callback, milliseconds) => setTimeout(callback, milliseconds));
    this.timer = setTimer(() => this.clear(), options.ttlMs);
  }

  /** Returns the secret only while the pairing is still waiting, then clears it. */
  take(state: PairingState): string | null {
    if (state !== 'waiting') {
      this.clear();
      return null;
    }
    const secret = this.secret;
    this.clear();
    return secret;
  }

  peek(): string | null {
    return this.secret;
  }

  clear(): void {
    this.secret = null;
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }
}
