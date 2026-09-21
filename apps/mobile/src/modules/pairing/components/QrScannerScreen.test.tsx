import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QrScannerScreen } from '@/modules/pairing/components/QrScannerScreen';
import type { PairingResult } from '@/modules/pairing/domain/entities/pairing';
import { PairingServiceError } from '@/modules/pairing/domain/errors/pairing-service.error';

interface CameraPermission {
  granted: boolean;
}

const mockRequestPermission = jest.fn<Promise<CameraPermission>, []>();
const mockUseCameraPermissions = jest.fn<
  [CameraPermission | null, () => Promise<CameraPermission>],
  []
>();

jest.mock('expo-camera', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const reactNative = jest.requireActual<typeof import('react-native')>('react-native');
  const CameraView = (props: {
    onBarcodeScanned?: (result: { data: string }) => void;
  }) => react.createElement(reactNative.View, { ...props, testID: 'camera-view' });
  return {
    CameraView,
    useCameraPermissions: () => mockUseCameraPermissions(),
  };
});

const mockPairFromQr = jest.fn<Promise<PairingResult | PairingServiceError>, [string]>();

jest.mock('@/modules/pairing/services/pairing.service', () => ({
  pairingService: {
    pairFromQr: (raw: string) => mockPairFromQr(raw),
  },
}));

const VALID_QR = JSON.stringify({
  version: 1,
  endpoints: ['http://192.168.1.20:47821'],
  pairingId: 'pairing-1',
  oneTimeSecret: 'secret',
  hostPublicKey: 'host-key',
  expiresAt: '2026-09-18T00:02:00.000Z',
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestPermission.mockResolvedValue({ granted: false });
  mockUseCameraPermissions.mockReturnValue([{ granted: true }, mockRequestPermission]);
  mockPairFromQr.mockResolvedValue({
    pairingId: 'pairing-1',
    endpoint: 'http://192.168.1.20:47821',
  });
});

describe('QrScannerScreen', () => {
  it('shows the request path and processes no scan when camera access is denied', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: false }, mockRequestPermission]);
    const onPaired = jest.fn();

    await render(<QrScannerScreen onPaired={onPaired} />);

    expect(screen.getByText('Camera access needed')).toBeTruthy();
    expect(screen.queryByTestId('camera-view')).toBeNull();
    expect(mockPairFromQr).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Grant camera access'));

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    expect(mockPairFromQr).not.toHaveBeenCalled();
    expect(onPaired).not.toHaveBeenCalled();
  });

  it('pairs from a valid QR payload through the scan handler', async () => {
    const onPaired = jest.fn();

    await render(<QrScannerScreen onPaired={onPaired} />);

    await fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', { data: VALID_QR });

    await waitFor(() => expect(mockPairFromQr).toHaveBeenCalledWith(VALID_QR));
    await waitFor(() => expect(onPaired).toHaveBeenCalledTimes(1));
  });

  it('shows the error path for an expired or invalid QR and does not pair', async () => {
    const onPaired = jest.fn();
    mockPairFromQr.mockResolvedValue(new PairingServiceError('Pairing secret has expired'));

    await render(<QrScannerScreen onPaired={onPaired} />);

    await fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', {
      data: 'expired-qr',
    });

    await waitFor(() =>
      expect(screen.getByText('Pairing secret has expired')).toBeTruthy(),
    );
    expect(mockPairFromQr).toHaveBeenCalledWith('expired-qr');
    expect(onPaired).not.toHaveBeenCalled();
  });
});
