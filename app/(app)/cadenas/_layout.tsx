import { Stack } from 'expo-router';

export default function CadenasLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: true }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="nueva" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
