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
  Modal,
  Keyboard,
} from 'react-native';
import Constants from 'expo-constants';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const insets = useSafeAreaInsets();
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const {
    control,
    handleSubmit,
    getValues,
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
    setResetEmail(getValues('email')?.trim() ?? '');
    setResetModalVisible(true);
  };

  const handleEnviarReset = async () => {
    const email = resetEmail.trim();
    if (!email) {
      Alert.alert('Correo requerido', 'Ingresa el correo con el que te registraste.');
      return;
    }
    Keyboard.dismiss();
    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setResetLoading(false);
    if (error) {
      Alert.alert('Error', 'No se pudo enviar el correo. Verifica que la dirección sea correcta.');
      return;
    }
    setResetModalVisible(false);
    Alert.alert(
      'Correo enviado',
      'Revisa tu bandeja de entrada y sigue las instrucciones para restablecer tu contraseña.',
    );
  };

  return (
    <View style={styles.screen}>
      <Modal
        visible={resetModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!resetLoading) setResetModalVisible(false); }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalCard, { marginBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Restablecer contraseña</Text>
            <Text style={styles.modalDesc}>
              Te enviaremos un enlace a tu correo para crear una nueva contraseña.
            </Text>
            <Input
              label="Correo electrónico"
              placeholder="usuario@empresa.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={resetEmail}
              onChangeText={setResetEmail}
              leftIcon={<Text style={styles.fieldIcon}>✉️</Text>}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => { if (!resetLoading) setResetModalVisible(false); }}
                disabled={resetLoading}
              >
                <Text style={styles.modalBtnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={handleEnviarReset}
                disabled={resetLoading}
              >
                <Text style={styles.modalBtnPrimaryText}>{resetLoading ? 'Enviando…' : 'Enviar enlace'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <StatusBar style="light" />
      <View style={styles.topSection}>
        <View style={[styles.topContent, { paddingTop: insets.top + 32 }]}>
          <View style={styles.logoWrap}>
            <Text style={styles.logoText}>P</Text>
          </View>
          <Text style={styles.appName}>PRÉSTAMOS AB</Text>
          <Text style={styles.tagline}>Herramienta de Gestión Interna</Text>
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
                This is a custom-built software tool developed for one specific pawn shop business. The app is freely downloadable but requires admin-provisioned credentials to function. Without credentials, only this screen is accessible. No purchases, subscriptions, or financial transactions of any kind occur within this app.
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
            Préstamos AB v{appVersion}
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

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  modalDesc: { fontSize: 13, color: Colors.muted, lineHeight: 19 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalBtnGhost: { backgroundColor: Colors.surface2 },
  modalBtnGhostText: { fontSize: 14, fontWeight: '700', color: Colors.muted },
  modalBtnPrimary: { backgroundColor: Colors.accent },
  modalBtnPrimaryText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
