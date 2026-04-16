import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/colors';

const loginSchema = z.object({
  email: z.string().email('Ingresa un correo válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const insets = useSafeAreaInsets();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Error al iniciar sesión', 'Correo o contraseña incorrectos. Verifica tus credenciales.');
    }
  };

  const handleForgotPassword = () => {
    Alert.prompt(
      '¿Olvidaste tu contraseña?',
      'Ingresa tu correo electrónico y te enviaremos un enlace para restablecerla.',
      async (email) => {
        if (!email?.trim()) return;
        setResetLoading(true);
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        setResetLoading(false);
        if (error) {
          Alert.alert('Error', 'No se pudo enviar el correo. Verifica que la dirección sea correcta.');
        } else {
          Alert.alert(
            'Correo enviado',
            'Revisa tu bandeja de entrada y sigue las instrucciones para restablecer tu contraseña.',
          );
        }
      },
      'plain-text',
      '',
      'email-address',
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.topSection}>
        <View style={[styles.topContent, { paddingTop: insets.top + 32 }]}>
          <View style={styles.logoWrap}>
            <Text style={styles.logoText}>P</Text>
          </View>
          <Text style={styles.appName}>PRÉSTAMOS AB</Text>
          <Text style={styles.tagline}>Sistema de Créditos con Garantía</Text>
          <Text style={styles.enterpriseBadge}>Sistema Privado · Solo Personal Autorizado</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.formScroll, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Iniciar Sesión</Text>
            <Text style={styles.formSubtitle}>Ingresa tus credenciales para continuar</Text>

            <View style={styles.fields}>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, value } }) => (
                  <Input
                    label="Correo electrónico"
                    placeholder="usuario@empresa.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="emailAddress"
                    value={value}
                    onChangeText={onChange}
                    error={errors.email?.message}
                    leftIcon={<Text style={styles.fieldIcon}>✉️</Text>}
                  />
                )}
              />

              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, value } }) => (
                  <Input
                    label="Contraseña"
                    placeholder="••••••••"
                    value={value}
                    onChangeText={onChange}
                    error={errors.password?.message}
                    isPassword
                    textContentType="password"
                    autoComplete="current-password"
                    leftIcon={<Text style={styles.fieldIcon}>🔒</Text>}
                  />
                )}
              />
            </View>

            <TouchableOpacity style={styles.forgotWrap} onPress={handleForgotPassword} disabled={resetLoading}>
              <Text style={styles.forgotText}>{resetLoading ? 'Enviando...' : '¿Olvidaste tu contraseña?'}</Text>
            </TouchableOpacity>

            <Button
              title="Ingresar al Sistema"
              onPress={handleSubmit(onSubmit)}
              loading={loading}
              size="lg"
            />

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Acceso seguro</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.securityNote}>
              <Text style={styles.securityIcon}>🔐</Text>
              <Text style={styles.securityText}>
                Conexión cifrada SSL. Solo personal autorizado puede acceder al sistema.
              </Text>
            </View>

            <View style={styles.enterpriseNotice}>
              <Text style={styles.enterpriseTitle}>🔒 Sistema de Gestión Privado</Text>
              <Text style={styles.enterpriseText}>
                This is a custom-built, bespoke software tool developed exclusively for one specific pawn shop business and its staff. It is not a service, not a subscription, and not available to any other business or individual. No purchases, subscriptions, or financial transactions of any kind occur within this app.
              </Text>
            </View>
          </View>

          <View style={[styles.legalRow, { marginBottom: insets.bottom + 4 }]}>
            <TouchableOpacity onPress={() => Linking.openURL('https://henrycobos.github.io/faruck-movil/privacy-policy.html')}>
              <Text style={styles.legalLink}>Política de Privacidad</Text>
            </TouchableOpacity>
            <Text style={styles.legalSep}>·</Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://henrycobos.github.io/faruck-movil/support.html')}>
              <Text style={styles.legalLink}>Soporte</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.version, { marginBottom: insets.bottom }]}>
            Préstamos AB v1.0.0
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },

  topSection: {
    backgroundColor: Colors.primary,
    paddingBottom: 32,
  },
  topContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 8,
    gap: 8,
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '900',
    color: Colors.white,
    letterSpacing: -1,
  },
  appName: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.white,
    letterSpacing: 4,
  },
  tagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.5,
  },
  enterpriseBadge: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.3,
    marginTop: -2,
  },

  formScroll: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    gap: 16,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  formSubtitle: {
    fontSize: 14,
    color: Colors.muted,
    marginTop: -8,
  },
  fields: { gap: 14 },
  fieldIcon: { fontSize: 16 },

  forgotWrap: { alignSelf: 'flex-end', marginTop: -8 },
  forgotText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontSize: 12, color: Colors.muted },

  securityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.surface2,
    borderRadius: 10,
    padding: 12,
  },
  securityIcon: { fontSize: 16, marginTop: 1 },
  securityText: { flex: 1, fontSize: 12, color: Colors.muted, lineHeight: 18 },

  enterpriseNotice: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#2563EB',
    padding: 12,
    gap: 6,
  },
  enterpriseTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  enterpriseText: {
    fontSize: 11,
    color: '#3B5BA5',
    lineHeight: 17,
  },

  version: {
    textAlign: 'center',
    fontSize: 12,
    color: Colors.muted,
    marginTop: 4,
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
  },
  legalLink: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  legalSep: { fontSize: 12, color: Colors.muted },
});
