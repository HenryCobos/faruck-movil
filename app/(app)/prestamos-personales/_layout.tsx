import { Stack } from 'expo-router';

export default function PrestamosPersonalesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: true }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="nuevo" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
