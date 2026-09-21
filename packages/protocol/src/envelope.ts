import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;

export const ENVELOPE_DIRECTIONS = ['host-to-device', 'device-to-host'] as const;

export const envelopeDirectionSchema = z.enum(ENVELOPE_DIRECTIONS);

export type EnvelopeDirection = z.infer<typeof envelopeDirectionSchema>;

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

function base64ByteLength(value: string): number | null {
  if (value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) return null;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

// The AAD delimiter must stay unambiguous, so a pairing id can never contain it.
export const pairingIdSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes('|'), 'pairingId must not contain "|"');

export const nonceSchema = z
  .string()
  .refine((value) => base64ByteLength(value) === 12, 'nonce must be base64 for exactly 12 bytes');

export const tagSchema = z
  .string()
  .refine((value) => base64ByteLength(value) === 16, 'tag must be base64 for exactly 16 bytes');

export const ciphertextSchema = z
  .string()
  .refine((value) => base64ByteLength(value) !== null, 'ciphertext must be base64');

export const envelopeSchema = z.strictObject({
  version: z.literal(PROTOCOL_VERSION),
  direction: envelopeDirectionSchema,
  sequence: z.number().int().nonnegative(),
  pairingId: pairingIdSchema,
  nonce: nonceSchema,
  ciphertext: ciphertextSchema,
  tag: tagSchema,
});

export type Envelope = z.infer<typeof envelopeSchema>;

export class EnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvelopeError';
  }
}

function decodeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function parseEnvelope(raw: string): Envelope | EnvelopeError {
  const parsed = envelopeSchema.safeParse(decodeJson(raw));
  if (!parsed.success) return new EnvelopeError(parsed.error.message);
  return parsed.data;
}

export class ReplayGuard {
  private readonly highest = new Map<EnvelopeDirection, number>();

  accept(direction: EnvelopeDirection, sequence: number): boolean {
    if (!Number.isInteger(sequence) || sequence < 0) return false;
    const previous = this.highest.get(direction);
    if (previous !== undefined && sequence <= previous) return false;
    this.highest.set(direction, sequence);
    return true;
  }

  highestAccepted(direction: EnvelopeDirection): number | undefined {
    return this.highest.get(direction);
  }

  reset(): void {
    this.highest.clear();
  }
}
