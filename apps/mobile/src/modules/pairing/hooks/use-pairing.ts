import { useCallback, useRef, useState } from 'react';
import { PairingServiceError } from '@/modules/pairing/domain/errors/pairing-service.error';
import { pairingService } from '@/modules/pairing/services/pairing.service';

export type PairingStatus = 'idle' | 'pairing' | 'paired' | 'error';

export interface UsePairingResult {
  status: PairingStatus;
  error: string | null;
  isPairing: boolean;
  isPaired: boolean;
  handleScan: (text: string) => Promise<void>;
  reset: () => void;
}

/**
 * Use case for the scanner screen: turns a scanned QR string into a persisted
 * device session and exposes the pairing lifecycle to the camera view.
 */
export function usePairing(): UsePairingResult {
  const [status, setStatus] = useState<PairingStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const handleScan = useCallback(async (text: string): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus('pairing');
    setError(null);
    const result = await pairingService.pairFromQr(text);
    if (result instanceof PairingServiceError) {
      setError(result.message);
      setStatus('error');
      inFlight.current = false;
      return;
    }
    setStatus('paired');
  }, []);

  const reset = useCallback((): void => {
    inFlight.current = false;
    setStatus('idle');
    setError(null);
  }, []);

  return {
    status,
    error,
    isPairing: status === 'pairing',
    isPaired: status === 'paired',
    handleScan,
    reset,
  };
}
