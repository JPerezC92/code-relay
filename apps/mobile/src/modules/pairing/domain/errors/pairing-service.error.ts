/**
 * Failure returned by the pairing service when a scanned QR cannot be turned
 * into a device session. The message is safe to show in the scanner screen; it
 * never contains the one-time secret.
 */
export class PairingServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PairingServiceError';
  }
}
