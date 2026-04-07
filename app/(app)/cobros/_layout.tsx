import { Stack } from 'expo-router';

export default function CobrosLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[cuotaId]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="recibo" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
