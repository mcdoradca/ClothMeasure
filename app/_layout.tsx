// app/_layout.tsx — Root layout dla expo-router
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect } from 'react';
import { useMeasurementStore } from '../src/stores/measurementStore';

export default function RootLayout() {
  const loadHistory = useMeasurementStore((s) => s.loadHistory);

  useEffect(() => {
    loadHistory();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: '#0A0A1A' },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="camera" />
        <Stack.Screen name="processing" />
        <Stack.Screen name="result" />
        <Stack.Screen name="history" />
        <Stack.Screen name="guide" />
      </Stack>
    </GestureHandlerRootView>
  );
}
