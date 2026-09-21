import { z } from 'zod';
import { PROTOCOL_VERSION, ciphertextSchema, nonceSchema, pairingIdSchema, tagSchema } from './envelope';
import { X25519_KEY_LENGTH } from './crypto';

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

/** The one-time pairing secret is a 256-bit value: exactly 32 bytes before base64. */
const ONE_TIME_SECRET_BYTES = 32;

function base64ByteLength(value: string): number | null {
  if (value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) return null;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

/** A raw X25519 public key: base64 of exactly 32 bytes. */
export const x25519PublicKeySchema = z
  .string()
  .refine(
    (value) => base64ByteLength(value) === X25519_KEY_LENGTH,
    `x25519 public key must be base64 for exactly ${X25519_KEY_LENGTH} bytes`,
  );

/** An AES-256-GCM sealed blob with a 12-byte nonce and a 16-byte tag. */
export const sealedBlobSchema = z.strictObject({
  nonce: nonceSchema,
  ciphertext: ciphertextSchema,
  tag: tagSchema,
});

export const pairingPayloadSchema = z.strictObject({
  version: z.literal(PROTOCOL_VERSION),
  endpoints: z.array(z.url()).min(1),
  pairingId: pairingIdSchema,
  oneTimeSecret: z
    .string()
    .refine(
      (value) => base64ByteLength(value) === ONE_TIME_SECRET_BYTES,
      `one-time secret must be base64 for exactly ${ONE_TIME_SECRET_BYTES} bytes`,
    ),
  hostPublicKey: x25519PublicKeySchema,
  expiresAt: z.iso.datetime(),
});

export type PairingPayload = z.infer<typeof pairingPayloadSchema>;

export const pairingRequestSchema = z.strictObject({
  version: z.literal(PROTOCOL_VERSION),
  pairingId: pairingIdSchema,
  devicePublicKey: x25519PublicKeySchema,
  sealedSecret: sealedBlobSchema,
});

export type PairingRequest = z.infer<typeof pairingRequestSchema>;

export const pairingCompleteResponseSchema = z.strictObject({
  version: z.literal(PROTOCOL_VERSION),
  pairingId: pairingIdSchema,
  deviceCredentialId: z.string().min(1),
  sealedConfirmation: sealedBlobSchema,
});

export type PairingCompleteResponse = z.infer<typeof pairingCompleteResponseSchema>;

export class PairingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PairingError';
  }
}

export interface ParsePairingOptions {
  now?: Date;
}

function decodeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function decodeUnknown(raw: unknown): unknown {
  return typeof raw === 'string' ? decodeJson(raw) : raw;
}

function isExpired(expiresAt: string, now: Date): boolean {
  const expiry = new Date(expiresAt).getTime();
  return !Number.isFinite(expiry) || expiry <= now.getTime();
}

export function parsePairingRequest(raw: unknown): PairingRequest | PairingError {
  const parsed = pairingRequestSchema.safeParse(decodeUnknown(raw));
  if (!parsed.success) return new PairingError(parsed.error.message);
  return parsed.data;
}

export function parsePairingCompleteResponse(
  raw: unknown,
): PairingCompleteResponse | PairingError {
  const parsed = pairingCompleteResponseSchema.safeParse(decodeUnknown(raw));
  if (!parsed.success) return new PairingError(parsed.error.message);
  return parsed.data;
}

export function parsePairingPayload(
  raw: string,
  options: ParsePairingOptions = {},
): PairingPayload | PairingError {
  const parsed = pairingPayloadSchema.safeParse(decodeJson(raw));
  if (!parsed.success) return new PairingError(parsed.error.message);
  const now = options.now ?? new Date();
  if (isExpired(parsed.data.expiresAt, now)) return new PairingError('Pairing payload has expired');
  return parsed.data;
}
