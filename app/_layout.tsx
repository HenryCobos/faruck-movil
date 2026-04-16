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
    // getSession() reads from SecureStore. If the stored refresh token is
    // invalid (e.g. user recreated in DB, token expired), we wipe the cached
    // session so the user lands on login cleanly instead of looping on errors.
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          supabase.auth.signOut().catch(() => {});
          setSession(null);
        } else {
          setSession(session);
          if (session?.user) {
            fetchProfile(session.user.id).catch(() => {});
          }
        }
      })
      .catch(() => {
        supabase.auth.signOut().catch(() => {});
        setSession(null);
      })
      .finally(() => setLoading(false));

    // Handle subsequent auth events (sign-in, sign-out, token refresh).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          setSession(null);
          return;
        }
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
