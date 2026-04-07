import { Stack } from 'expo-router';

export default function ClientesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="nuevo" options={{ presentation: 'modal' }} />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="editar" options={{ presentation: 'modal' }} />
      <Stack.Screen name="estado-cuenta" />
    </Stack>
  );
}
