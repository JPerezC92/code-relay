/**
 * Pairing view model returned to the scanner after a successful handshake. The
 * one-time secret and the derived session key never appear here.
 */
export interface PairingResult {
  pairingId: string;
  endpoint: string;
}
