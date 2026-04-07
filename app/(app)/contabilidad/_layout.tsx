import { Stack } from 'expo-router';

export default function ContabilidadLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="libro-diario" />
      <Stack.Screen name="estado-resultados" />
    </Stack>
  );
}
