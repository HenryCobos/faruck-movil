import { Stack } from 'expo-router';

export default function ReportesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="cartera" />
      <Stack.Screen name="morosos" />
    </Stack>
  );
}
