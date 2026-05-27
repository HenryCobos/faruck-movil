import { Stack } from 'expo-router';

export default function CobrosLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: true }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[cuotaId]" />
      <Stack.Screen name="recibo" />
    </Stack>
  );
}
