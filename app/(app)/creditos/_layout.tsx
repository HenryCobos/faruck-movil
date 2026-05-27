import { Stack } from 'expo-router';

export default function CreditosLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        // Todos los screens usan push normal → tabs siempre visibles
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      {/* Detalle: push → tab bar permanece visible */}
      <Stack.Screen name="[id]" />
      {/* Nuevo préstamo: slide desde abajo para diferenciar visualmente,
          pero sigue siendo un push (NO modal) → tabs siempre visibles */}
      <Stack.Screen
        name="nuevo"
        options={{ animation: 'slide_from_bottom' }}
      />
      {/* Renovación: igual que nuevo */}
      <Stack.Screen
        name="renovar"
        options={{ animation: 'slide_from_bottom' }}
      />
      {/* Crédito de producto: slide desde abajo igual que nuevo */}
      <Stack.Screen
        name="nuevo-producto"
        options={{ animation: 'slide_from_bottom' }}
      />
      {/* Abono a capital: slide desde abajo */}
      <Stack.Screen
        name="abono-capital"
        options={{ animation: 'slide_from_bottom' }}
      />
      {/* Recibo de abono a capital */}
      <Stack.Screen
        name="recibo-abono"
        options={{ animation: 'slide_from_right' }}
      />
    </Stack>
  );
}
