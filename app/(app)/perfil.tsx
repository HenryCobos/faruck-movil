import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { usuariosService } from '@/services/usuarios.service';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Colors, RoleColors } from '@/constants/colors';

const profileSchema = z.object({
  nombre:   z.string().min(2, 'Mínimo 2 caracteres'),
  apellido: z.string().min(2, 'Mínimo 2 caracteres'),
  telefono: z.string().optional(),
});

const passSchema = z.object({
  passwordActual: z.string().min(1, 'Ingresa tu contraseña actual'),
  passwordNueva:  z.string().min(8, 'Mínimo 8 caracteres'),
  passwordConf:   z.string(),
}).refine(d => d.passwordNueva === d.passwordConf, {
  message: 'Las contraseñas no coinciden', path: ['passwordConf'],
});

type ProfileForm = z.infer<typeof profileSchema>;
type PassForm    = z.infer<typeof passSchema>;

const ROL_LABELS: Record<string, string> = {
  admin: 'Administrador', oficial: 'Oficial de Crédito', cajero: 'Cajero', auditor: 'Auditor',
};
const ROL_ICONS: Record<string, string> = {
  admin: '👑', oficial: '💼', cajero: '💳', auditor: '🔍',
};

export default function PerfilScreen() {
  const insets = useSafeAreaInsets();
  const { profile, signOut, fetchProfile } = useAuthStore();
  const [savingPerfil, setSavingPerfil] = useState(false);
  const [savingPass, setSavingPass] = useState(false);
  const [tab, setTab] = useState<'perfil' | 'seguridad'>('perfil');

  const roleColor = RoleColors[profile?.rol ?? 'cajero'] ?? Colors.muted;

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema) as any,
    defaultValues: {
      nombre:   profile?.nombre ?? '',
      apellido: profile?.apellido ?? '',
      telefono: profile?.telefono ?? '',
    },
  });

  const passForm = useForm<PassForm>({
    resolver: zodResolver(passSchema) as any,
  });

  const onSavePerfil = async (data: ProfileForm) => {
    if (!profile?.id) return;
    setSavingPerfil(true);
    try {
      await usuariosService.actualizarPerfil(profile.id, data);
      await fetchProfile(profile.id);
      Alert.alert('✅ Perfil actualizado', 'Tus datos fueron guardados correctamente.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo guardar');
    } finally {
      setSavingPerfil(false);
    }
  };

  const onCambiarPass = async (data: PassForm) => {
    setSavingPass(true);
    try {
      // Verificamos la contraseña actual reautenticando
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile?.email ?? '',
        password: data.passwordActual,
      });
      if (signInError) throw new Error('La contraseña actual es incorrecta');

      const { error } = await supabase.auth.updateUser({ password: data.passwordNueva });
      if (error) throw error;

      Alert.alert('✅ Contraseña actualizada', 'Tu nueva contraseña está activa.');
      passForm.reset();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo cambiar la contraseña');
    } finally {
      setSavingPass(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Cerrar Sesión', '¿Estás seguro de que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Mi Perfil</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
        >
          {/* Avatar + info */}
          <View style={styles.profileCard}>
            <View style={[styles.avatar, { backgroundColor: `${roleColor}20` }]}>
              <Text style={[styles.avatarInitials, { color: roleColor }]}>
                {profile?.nombre?.[0]}{profile?.apellido?.[0]}
              </Text>
            </View>
            <Text style={styles.profileName}>{profile?.nombre} {profile?.apellido}</Text>
            <Text style={styles.profileEmail}>{profile?.email}</Text>
            <View style={[styles.rolBadge, { backgroundColor: `${roleColor}15` }]}>
              <Text style={styles.rolIcon}>{ROL_ICONS[profile?.rol ?? 'cajero']}</Text>
              <Text style={[styles.rolText, { color: roleColor }]}>{ROL_LABELS[profile?.rol ?? 'cajero']}</Text>
            </View>
          </View>

          {/* Tabs */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'perfil' && styles.tabBtnActive]}
              onPress={() => setTab('perfil')}
            >
              <Text style={[styles.tabBtnText, tab === 'perfil' && styles.tabBtnTextActive]}>
                ✏️ Mis Datos
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'seguridad' && styles.tabBtnActive]}
              onPress={() => setTab('seguridad')}
            >
              <Text style={[styles.tabBtnText, tab === 'seguridad' && styles.tabBtnTextActive]}>
                🔐 Contraseña
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab: Mis Datos */}
          {tab === 'perfil' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Información Personal</Text>
              <Controller control={profileForm.control} name="nombre"
                render={({ field: { onChange, value } }) => (
                  <Input label="Nombre *" value={value} onChangeText={onChange} error={profileForm.formState.errors.nombre?.message} />
                )} />
              <Controller control={profileForm.control} name="apellido"
                render={({ field: { onChange, value } }) => (
                  <Input label="Apellido *" value={value} onChangeText={onChange} error={profileForm.formState.errors.apellido?.message} />
                )} />
              <Controller control={profileForm.control} name="telefono"
                render={({ field: { onChange, value } }) => (
                  <Input label="Teléfono" value={value ?? ''} onChangeText={onChange} keyboardType="phone-pad" />
                )} />

              <View style={styles.readOnly}>
                <Text style={styles.readOnlyLabel}>Correo electrónico</Text>
                <Text style={styles.readOnlyValue}>{profile?.email}</Text>
                <Text style={styles.readOnlyHint}>El correo no se puede cambiar desde aquí</Text>
              </View>

              <Button
                title="Guardar Datos"
                onPress={profileForm.handleSubmit(onSavePerfil) as any}
                loading={savingPerfil}
                size="lg"
              />
            </View>
          )}

          {/* Tab: Contraseña */}
          {tab === 'seguridad' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Cambiar Contraseña</Text>
              <View style={styles.securityNote}>
                <Text style={styles.securityNoteIcon}>🛡️</Text>
                <Text style={styles.securityNoteText}>
                  Usa una contraseña segura de al menos 8 caracteres con letras y números.
                </Text>
              </View>

              <Controller control={passForm.control} name="passwordActual"
                render={({ field: { onChange, value } }) => (
                  <Input label="Contraseña Actual *" value={value ?? ''} onChangeText={onChange} secureTextEntry error={passForm.formState.errors.passwordActual?.message} />
                )} />
              <Controller control={passForm.control} name="passwordNueva"
                render={({ field: { onChange, value } }) => (
                  <Input label="Nueva Contraseña *" value={value ?? ''} onChangeText={onChange} secureTextEntry error={passForm.formState.errors.passwordNueva?.message} />
                )} />
              <Controller control={passForm.control} name="passwordConf"
                render={({ field: { onChange, value } }) => (
                  <Input label="Confirmar Nueva Contraseña *" value={value ?? ''} onChangeText={onChange} secureTextEntry error={passForm.formState.errors.passwordConf?.message} />
                )} />

              <Button
                title="Cambiar Contraseña"
                onPress={passForm.handleSubmit(onCambiarPass) as any}
                loading={savingPass}
                size="lg"
              />
            </View>
          )}

          {/* Cerrar sesión */}
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Text style={styles.signOutIcon}>⎋</Text>
            <Text style={styles.signOutText}>Cerrar Sesión</Text>
          </TouchableOpacity>

          {/* Legal */}
          <View style={styles.legalRow}>
            <TouchableOpacity onPress={() => Linking.openURL('https://henrycobos.github.io/faruck-movil/privacy-policy.html')}>
              <Text style={styles.legalLink}>Política de Privacidad</Text>
            </TouchableOpacity>
            <Text style={styles.legalSep}>·</Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://henrycobos.github.io/faruck-movil/support.html')}>
              <Text style={styles.legalLink}>Soporte</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.version}>Préstamos AB v1.0.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  header: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.white, marginTop: 8 },
  scroll: { padding: 16, gap: 14 },
  profileCard: {
    backgroundColor: Colors.surface, borderRadius: 20, padding: 28,
    alignItems: 'center', gap: 8,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  avatarInitials: { fontSize: 30, fontWeight: '900' },
  profileName: { fontSize: 22, fontWeight: '800', color: Colors.text },
  profileEmail: { fontSize: 13, color: Colors.muted },
  rolBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginTop: 4 },
  rolIcon: { fontSize: 14 },
  rolText: { fontSize: 13, fontWeight: '700' },
  tabRow: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 12, padding: 4,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: Colors.muted },
  tabBtnTextActive: { color: Colors.white },
  section: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 18, gap: 12,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  readOnly: { backgroundColor: Colors.background, borderRadius: 10, padding: 14, gap: 3 },
  readOnlyLabel: { fontSize: 12, fontWeight: '600', color: Colors.muted },
  readOnlyValue: { fontSize: 14, fontWeight: '700', color: Colors.text },
  readOnlyHint: { fontSize: 11, color: Colors.muted },
  securityNote: {
    flexDirection: 'row', gap: 10, backgroundColor: `${Colors.info}10`,
    borderRadius: 10, padding: 12, borderWidth: 1, borderColor: `${Colors.info}25`,
  },
  securityNoteIcon: { fontSize: 20 },
  securityNoteText: { flex: 1, fontSize: 12, color: Colors.info, lineHeight: 18 },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: `${Colors.danger}10`, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: `${Colors.danger}25`,
  },
  signOutIcon: { fontSize: 20, color: Colors.danger },
  signOutText: { fontSize: 15, fontWeight: '700', color: Colors.danger },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 4 },
  legalLink: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  legalSep: { fontSize: 12, color: Colors.muted },
  version: { textAlign: 'center', fontSize: 12, color: Colors.muted, marginTop: 4 },
});
