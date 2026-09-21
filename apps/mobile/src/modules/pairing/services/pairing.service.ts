/**
 * Pairing adapter for the QR scanner screen.
 *
 * The scanner passes the raw QR text in; this module runs the protocol parser
 * (which also enforces expiry) and hands the validated payload to the gateway
 * client, which performs the X25519 handshake and persists the device session.
 * The one-time secret and the derived session key are never logged here.
 */
import { parsePairingPayload } from '@coderelay/protocol';
import { GatewayClientError, getGatewayClient } from '@/shared/transport/gateway-client';
import type { GatewayClient } from '@/shared/transport/gateway-client';
import type { PairingResult } from '@/modules/pairing/domain/entities/pairing';
import { PairingServiceError } from '@/modules/pairing/domain/errors/pairing-service.error';

const gateway: GatewayClient = getGatewayClient();

export const pairingService = {
  async pairFromQr(raw: string): Promise<PairingResult | PairingServiceError> {
    try {
      const payload = parsePairingPayload(raw);
      if (payload instanceof Error) {
        return new PairingServiceError(payload.message);
      }
      const session = await gateway.pair(payload);
      if (session instanceof GatewayClientError) {
        return new PairingServiceError(session.message);
      }
      return { pairingId: session.pairingId, endpoint: session.endpoint };
    } catch (error) {
      return new PairingServiceError(
        error instanceof Error ? error.message : 'Pairing failed',
      );
    }
  },
};
