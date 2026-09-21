import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GatewayClientError, getGatewayClient } from '@/shared/transport/gateway-client';
import { QrScannerScreen } from '@/modules/pairing/components/QrScannerScreen';
import { ChatScreen } from '@/modules/session/components/ChatScreen';

export default function App() {
  const [paired, setPaired] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const restore = async (): Promise<void> => {
      const client = getGatewayClient();
      const result = await client.reconnect();
      if (cancelled) return;
      if (result instanceof GatewayClientError) {
        // A revoked or unauthorized credential is unrecoverable; drop it so the
        // next launch starts from a clean pairing. Transport failures keep the
        // stored session for a later retry.
        if (result.code === 'revoked' || result.code === 'unauthorized') {
          await client.disconnect();
          if (cancelled) return;
        }
        setPaired(false);
        setIsRestoring(false);
        return;
      }
      setPaired(true);
      setIsRestoring(false);
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePaired = useCallback((): void => {
    setPaired(true);
  }, []);

  if (isRestoring) {
    return (
      <SafeAreaProvider>
        <View style={[styles.container, styles.centered]}>
          <Text>Connecting…</Text>
          <StatusBar style="auto" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        {paired ? <ChatScreen /> : <QrScannerScreen onPaired={handlePaired} />}
        <StatusBar style="auto" />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
