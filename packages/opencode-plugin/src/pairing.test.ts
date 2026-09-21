import { describe, expect, it } from 'vitest';
import {
  buildPairingProof,
  buildTranscript,
  derivePairingKey,
  deriveSessionKey,
} from '@coderelay/protocol';
import type { Bytes, PairingCompleteResponse, PairingPayload } from '@coderelay/protocol';
import { createHostPairingCrypto, fromBase64, toBase64 } from './crypto';
import type { HostPairingCrypto } from './crypto';
import {
  PAIRING_SECRET_BYTES,
  PAIRING_TTL_SECONDS,
  PairingManager,
  PairingManagerError,
  PendingPairingSecret,
} from './pairing';
import type { PairingAttempt, PendingSecretTimer } from './pairing';

function createTimerHarness(): {
  timers: Array<{ callback: () => void; milliseconds: number }>;
  setTimer: (callback: () => void, milliseconds: number) => PendingSecretTimer;
  clearTimer: (handle: PendingSecretTimer) => void;
  fire: (index: number) => void;
} {
  const timers: Array<{ callback: () => void; milliseconds: number }> = [];
  const handle = setTimeout(() => {}, 0);
  handle.unref();
  return {
    timers,
    setTimer: (callback, milliseconds) => {
      timers.push({ callback, milliseconds });
      return handle;
    },
    clearTimer: (value) => {
      clearTimeout(value);
    },
    fire: (index) => {
      timers[index]?.callback();
    },
  };
}

function createClock(start: string) {
  let current = new Date(start);
  return {
    now: (): Date => current,
    advance: (milliseconds: number): void => {
      current = new Date(current.getTime() + milliseconds);
    },
  };
}

function bytesEqual(left: Bytes, right: Bytes): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/**
 * Device-side handshake simulation. The production device uses `@noble/curves`;
 * this test drives the same protocol primitives with the host's node:crypto
 * adapters, so the exchange is node:crypto agreed with itself. The gateway test
 * pins these primitives against the RFC 7748 section 6.1 vector.
 */
async function createDevice(
  payload: PairingPayload,
  crypto: HostPairingCrypto = createHostPairingCrypto(),
): Promise<{
  attempt: PairingAttempt;
  finish: (response: PairingCompleteResponse) => Promise<Bytes>;
}> {
  const keyPair = crypto.keyAgreement.generateKeyPair();
  const oneTimeSecretBytes = fromBase64(payload.oneTimeSecret);
  const transcript = buildTranscript({
    version: payload.version,
    pairingId: payload.pairingId,
    hostPublicKey: payload.hostPublicKey,
    devicePublicKey: toBase64(keyPair.publicKey),
  });
  const sharedSecret = crypto.keyAgreement.deriveSharedSecret(
    keyPair.privateKey,
    fromBase64(payload.hostPublicKey),
  );
  const pairingKey = derivePairingKey({
    sharedSecret,
    transcript,
    keyDerivation: crypto.keyDerivation,
  });
  const sealedSecret = await crypto.cipher.encrypt({
    key: pairingKey,
    plaintext: oneTimeSecretBytes,
    aad: transcript,
  });
  return {
    attempt: {
      pairingId: payload.pairingId,
      devicePublicKey: keyPair.publicKey,
      sealedSecret,
    },
    finish: async (response) => {
      const sessionKey = deriveSessionKey({
        sharedSecret,
        oneTimeSecret: oneTimeSecretBytes,
        transcript,
        keyDerivation: crypto.keyDerivation,
      });
      const proof = buildPairingProof({ transcript, sessionKey, hash: crypto });
      const opened = await crypto.cipher.decrypt({
        key: sessionKey,
        nonce: fromBase64(response.sealedConfirmation.nonce),
        ciphertext: fromBase64(response.sealedConfirmation.ciphertext),
        tag: fromBase64(response.sealedConfirmation.tag),
        aad: transcript,
      });
      if (!bytesEqual(opened, proof)) throw new Error('confirmation proof mismatch');
      return sessionKey;
    },
  };
}

const pairingOptions = {
  endpoints: ['http://192.168.1.20:47821'],
};

const TEST_NOW = new Date('2026-09-18T00:00:00.000Z');

function fixedManager(now: Date = TEST_NOW): PairingManager {
  return new PairingManager({ now: () => now });
}

describe('PairingManager', () => {
  it('creates a 256-bit one-time secret that expires after 120 seconds', () => {
    const clock = createClock('2026-09-18T00:00:00.000Z');
    const manager = new PairingManager({ now: clock.now });
    const created = manager.createPairing(pairingOptions);
    if (created instanceof Error) throw created;
    expect(PAIRING_SECRET_BYTES).toBe(32);
    expect(manager.ttl).toBe(PAIRING_TTL_SECONDS);
    expect(fromBase64(created.oneTimeSecret)).toHaveLength(PAIRING_SECRET_BYTES);
    expect(created.payload.oneTimeSecret).toBe(created.oneTimeSecret);
    expect(created.payload.version).toBe(1);
    expect(created.payload.hostPublicKey).toBe(manager.hostPublicKey);
    expect(fromBase64(created.payload.hostPublicKey)).toHaveLength(32);
    expect(created.expiresAt).toBe('2026-09-18T00:02:00.000Z');
    expect(manager.status().state).toBe('waiting');
    expect(manager.status().expiresInSeconds).toBe(PAIRING_TTL_SECONDS);
    expect(Object.keys(manager.status())).not.toContain('oneTimeSecret');
  });

  it('returns a sealed confirmation the device can verify', async () => {
    const manager = fixedManager();
    const created = manager.createPairing(pairingOptions);
    if (created instanceof Error) throw created;
    const device = await createDevice(created.payload);

    const complete = await manager.completePairing(device.attempt);

    expect(complete).not.toBeInstanceOf(PairingManagerError);
    if (complete instanceof PairingManagerError) throw complete;
    const deviceSessionKey = await device.finish(complete.response);
    expect(Array.from(deviceSessionKey)).toEqual(Array.from(complete.sessionKey));
    expect(complete.response.deviceCredentialId.length).toBeGreaterThan(0);
  });

  it('binds one device slot and refuses secret reuse', async () => {
    const manager = fixedManager();
    const created = manager.createPairing(pairingOptions);
    if (created instanceof Error) throw created;
    const device = await createDevice(created.payload);
    const complete = await manager.completePairing(device.attempt);
    expect(complete).not.toBeInstanceOf(PairingManagerError);
    expect(manager.status().state).toBe('paired');
    const reuse = await manager.completePairing(device.attempt);
    expect(reuse).toBeInstanceOf(PairingManagerError);
  });

  it('burns the pairing after the first failed attempt', async () => {
    const manager = fixedManager();
    const created = manager.createPairing(pairingOptions);
    if (created instanceof Error) throw created;
    const wrongPayload: PairingPayload = {
      ...created.payload,
      oneTimeSecret: toBase64(new Uint8Array(PAIRING_SECRET_BYTES).fill(9)),
    };
    const wrongDevice = await createDevice(wrongPayload);
    expect(await manager.completePairing(wrongDevice.attempt)).toBeInstanceOf(PairingManagerError);
    const correctDevice = await createDevice(created.payload);
    expect(await manager.completePairing(correctDevice.attempt)).toBeInstanceOf(
      PairingManagerError,
    );
    expect(manager.status().state).toBe('revoked');
  });

  it('expires the pairing after 120 seconds', async () => {
    const clock = createClock('2026-09-18T00:00:00.000Z');
    const manager = new PairingManager({ now: clock.now });
    const created = manager.createPairing(pairingOptions);
    if (created instanceof Error) throw created;
    const device = await createDevice(created.payload);
    clock.advance(PAIRING_TTL_SECONDS * 1000);
    expect(manager.status().state).toBe('expired');
    expect(await manager.completePairing(device.attempt)).toBeInstanceOf(PairingManagerError);
  });

  it('refuses a second device until revoke, then allows a fresh pairing', async () => {
    const manager = fixedManager();
    const created = manager.createPairing(pairingOptions);
    if (created instanceof Error) throw created;
    const device = await createDevice(created.payload);
    expect(await manager.completePairing(device.attempt)).not.toBeInstanceOf(PairingManagerError);
    expect(manager.createPairing(pairingOptions)).toBeInstanceOf(PairingManagerError);
    manager.revoke();
    expect(manager.status().state).toBe('revoked');
    const fresh = manager.createPairing(pairingOptions);
    expect(fresh).not.toBeInstanceOf(PairingManagerError);
  });

  it('rejects a pairing id mismatch without burning the active pairing', async () => {
    const manager = fixedManager();
    const created = manager.createPairing(pairingOptions);
    if (created instanceof Error) throw created;
    const device = await createDevice(created.payload);

    const mismatch = await manager.completePairing({
      ...device.attempt,
      pairingId: 'other-pairing',
    });

    expect(mismatch).toBeInstanceOf(PairingManagerError);
    expect(manager.status().state).toBe('waiting');

    const complete = await manager.completePairing(device.attempt);
    expect(complete).not.toBeInstanceOf(PairingManagerError);
    expect(manager.status().state).toBe('paired');
  });

  it('rejects a low-order peer public key that yields an all-zero shared secret', async () => {
    const manager = fixedManager();
    const created = manager.createPairing(pairingOptions);
    if (created instanceof Error) throw created;
    const device = await createDevice(created.payload);

    const result = await manager.completePairing({
      ...device.attempt,
      devicePublicKey: new Uint8Array(32),
    });

    expect(result).toBeInstanceOf(PairingManagerError);
    expect(manager.status().state).toBe('revoked');
  });

  it('rejects a device public key that is not a valid X25519 key', async () => {
    const manager = fixedManager();
    const created = manager.createPairing(pairingOptions);
    if (created instanceof Error) throw created;
    const device = await createDevice(created.payload);

    const result = await manager.completePairing({
      ...device.attempt,
      devicePublicKey: new Uint8Array(8),
    });

    expect(result).toBeInstanceOf(PairingManagerError);
  });
});

describe('PendingPairingSecret', () => {
  it('releases the secret once while waiting and arms a TTL timer', () => {
    const harness = createTimerHarness();
    const pending = new PendingPairingSecret('one-time', {
      ttlMs: PAIRING_TTL_SECONDS * 1000,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    });
    expect(harness.timers[0]?.milliseconds).toBe(PAIRING_TTL_SECONDS * 1000);
    expect(pending.peek()).toBe('one-time');
    expect(pending.take('waiting')).toBe('one-time');
    expect(pending.peek()).toBeNull();
    expect(pending.take('waiting')).toBeNull();
  });

  it('clears the secret when the pairing is no longer waiting', () => {
    const harness = createTimerHarness();
    for (const state of ['paired', 'expired', 'revoked'] as const) {
      const holder = new PendingPairingSecret('one-time', {
        ttlMs: PAIRING_TTL_SECONDS * 1000,
        setTimer: harness.setTimer,
        clearTimer: harness.clearTimer,
      });
      expect(holder.take(state)).toBeNull();
      expect(holder.peek()).toBeNull();
    }
  });

  it('clears the secret when the TTL timer fires', () => {
    const harness = createTimerHarness();
    const pending = new PendingPairingSecret('one-time', {
      ttlMs: PAIRING_TTL_SECONDS * 1000,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    });
    expect(pending.peek()).toBe('one-time');
    harness.fire(0);
    expect(pending.peek()).toBeNull();
  });
});
