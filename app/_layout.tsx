import React, { useEffect } from 'react';
import { Stack, router, SplashScreen, useSegments, useNavigationContainerRef } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import { notificacionesService } from '@/services/notificaciones.service';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { session, setSession, fetchProfile, setLoading, loading } = useAuthStore();
  const segments = useSegments();
  const navigationRef = useNavigationContainerRef();

  // Cargar sesión inicial
  useEffect(() => {
    // getSession() reads from SecureStore — NO network call, returns instantly.
    // We set loading=false as soon as the session state is known so the splash
    // screen hides immediately.  fetchProfile runs silently in the background.
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        if (session?.user) {
          fetchProfile(session.user.id).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Handle subsequent auth events (sign-in, sign-out, token refresh).
    // Does NOT touch the loading state — that was already resolved above.
    // fetchProfile checks activo===false and auto-signs-out if needed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session?.user) {
          fetchProfile(session.user.id).catch(() => {});
        }
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  // Ocultar splash y programar notificaciones al cargar
  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
      if (session) {
        notificacionesService.programarRecordatoriosDiarios().catch(console.error);
      }
    }
  }, [loading, session]);

  // Redirigir según estado de sesión
  useEffect(() => {
    if (loading) return;
    if (!navigationRef.isReady()) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      // Sin sesión → ir a login
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      // Con sesión y estando en login → ir al app
      router.replace('/(app)');
    }
  }, [session, loading, segments]);

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </SafeAreaProvider>
  );
}
