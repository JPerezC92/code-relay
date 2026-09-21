import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { BarcodeScanningResult } from 'expo-camera';
import { Button, StyleSheet, Text, View } from 'react-native';
import { usePairing } from '@/modules/pairing/hooks/use-pairing';

export interface QrScannerScreenProps {
  onPaired: () => void;
}

/**
 * Camera screen that scans the OpenCode pairing QR. The camera stays mounted
 * only while a scan is still needed; once the pairing succeeds the hook reports
 * `isPaired`, the camera unmounts, and `onPaired` hands control to the chat.
 */
export function QrScannerScreen({ onPaired }: QrScannerScreenProps) {
  const { error, isPairing, isPaired, handleScan } = usePairing();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanLocked, setScanLocked] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (isPaired) onPaired();
  }, [isPaired, onPaired]);

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult): void => {
      if (scanLocked || isPairing || isPaired) return;
      setScanLocked(true);
      void handleScan(result.data).finally(() => {
        if (isMounted.current) setScanLocked(false);
      });
    },
    [handleScan, isPairing, isPaired, scanLocked],
  );

  if (permission === null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>CodeRelay</Text>
        <Text style={styles.hint}>Checking camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.hint}>
          Allow CodeRelay to scan the OpenCode pairing QR.
        </Text>
        <Button
          title="Grant camera access"
          onPress={() => {
            void requestPermission();
          }}
        />
        {error !== null ? (
          <Text style={styles.error} testID="pairing-error">
            {error}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan the pairing QR</Text>
      {isPaired ? (
        <Text style={styles.hint} testID="pairing-success">
          Paired. Opening chat…
        </Text>
      ) : (
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleBarcodeScanned}
        />
      )}
      {isPairing ? <Text style={styles.hint}>Pairing…</Text> : null}
      {error !== null ? (
        <Text style={styles.error} testID="pairing-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  camera: {
    width: '100%',
    height: 320,
    marginVertical: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  error: {
    marginTop: 12,
    color: '#b91c1c',
    textAlign: 'center',
  },
});
