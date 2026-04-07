import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usuariosService, UsuarioProfile } from '@/services/usuarios.service';
import { useAuthStore } from '@/stores/auth.store';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Colors, RoleColors } from '@/constants/colors';

const schema = z.object({
  nombre:   z.string().min(2, 'Mínimo 2 caracteres'),
  apellido: z.string().min(2, 'Mínimo 2 caracteres'),
  telefono: z.string().optional(),
  rol:      z.enum(['admin', 'oficial', 'cajero', 'auditor']),
});
type FormData = z.infer<typeof schema>;

const ROLES = [
  { value: 'admin',   label: 'Administrador', icon: '👑' },
  { value: 'oficial', label: 'Oficial de Crédito', icon: '💼' },
  { value: 'cajero',  label: 'Cajero', icon: '💳' },
  { value: 'auditor', label: 'Auditor', icon: '🔍' },
];
const ROL_LABELS: Record<string, string> = {
  admin: 'Administrador', oficial: 'Oficial de Crédito', cajero: 'Cajero', auditor: 'Auditor',
};

export default function EditarUsuarioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { profile: miPerfil } = useAuthStore();

  const [usuario, setUsuario] = useState<UsuarioProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const esMiPerfil = id === miPerfil?.id;

  const { control, handleSubmit, reset, formState: { errors, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  });

  useEffect(() => {
    if (!id) { router.back(); return; }
    usuariosService.getById(id)
      .then(u => {
        setUsuario(u);
        reset({ nombre: u.nombre, apellido: u.apellido, telefono: u.telefono ?? '', rol: u.rol });
      })
      .catch(() => { Alert.alert('Error', 'No se encontró el usuario'); router.back(); })
      .finally(() => setLoading(false));
  }, [id]);

  const onSubmit = async (data: FormData) => {
    if (!id) return;
    setSaving(true);
    try {
      await usuariosService.actualizar(id, data);
      Alert.alert('✅ Guardado', 'Los datos del usuario fueron actualizados.', [{ text: 'Aceptar', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = () => {
    if (!usuario) return;
    const accion = usuario.activo ? 'desactivar' : 'activar';
    Alert.alert(
      `¿${accion.charAt(0).toUpperCase() + accion.slice(1)} usuario?`,
      usuario.activo
        ? 'El usuario perderá acceso al sistema inmediatamente.'
        : 'El usuario recuperará su acceso al sistema.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: accion.charAt(0).toUpperCase() + accion.slice(1),
          style: usuario.activo ? 'destructive' : 'default',
          onPress: async () => {
            await usuariosService.toggleActivo(id!, !usuario.activo);
            setUsuario(u => u ? { ...u, activo: !u.activo } : u);
          },
        },
      ]
    );
  };

  if (loading) return <LoadingScreen />;
  if (!usuario) return null;

  const roleColor = RoleColors[usuario.rol] ?? Colors.muted;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeIcon}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Editar Usuario</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>

          {/* Perfil visual */}
          <View style={styles.profileCard}>
            <View style={[styles.profileAvatar, { backgroundColor: `${roleColor}22` }]}>
              <Text style={styles.profileInitials}>
                {usuario.nombre[0]}{usuario.apellido[0]}
              </Text>
            </View>
            <Text style={styles.profileName}>{usuario.nombre} {usuario.apellido}</Text>
            <Text style={styles.profileEmail}>{usuario.email}</Text>
            <View style={styles.profileMeta}>
              <View style={[styles.rolBadge, { backgroundColor: `${roleColor}18` }]}>
                <Text style={[styles.rolText, { color: roleColor }]}>{ROL_LABELS[usuario.rol]}</Text>
              </View>
              <View style={[styles.activoBadge, { backgroundColor: usuario.activo ? `${Colors.success}18` : `${Colors.danger}18` }]}>
                <Text style={[styles.activoText, { color: usuario.activo ? Colors.success : Colors.danger }]}>
                  {usuario.activo ? '● Activo' : '● Inactivo'}
                </Text>
              </View>
            </View>
            <Text style={styles.profileSince}>
              Miembro desde {new Date(usuario.created_at).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })}
            </Text>
          </View>

          {/* Formulario */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos Personales</Text>
            <Controller control={control} name="nombre"
              render={({ field: { onChange, value } }) => (
                <Input label="Nombre *" value={value} onChangeText={onChange} error={errors.nombre?.message} />
              )} />
            <Controller control={control} name="apellido"
              render={({ field: { onChange, value } }) => (
                <Input label="Apellido *" value={value} onChangeText={onChange} error={errors.apellido?.message} />
              )} />
            <Controller control={control} name="telefono"
              render={({ field: { onChange, value } }) => (
                <Input label="Teléfono" value={value ?? ''} onChangeText={onChange} keyboardType="phone-pad" />
              )} />
          </View>

          {/* Rol — solo cambiable si no es tu propio perfil */}
          {!esMiPerfil && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Rol del Sistema</Text>
              <Controller control={control} name="rol"
                render={({ field: { onChange, value } }) => (
                  <Select label="Rol" options={ROLES} value={value} onSelect={onChange} />
                )} />
            </View>
          )}

          <Button
            title="Guardar Cambios"
            onPress={handleSubmit(onSubmit) as any}
            loading={saving}
            size="lg"
          />

          {/* Activar/Desactivar — solo para otros usuarios */}
          {!esMiPerfil && (
            <TouchableOpacity
              style={[styles.dangerBtn, { borderColor: usuario.activo ? Colors.danger : Colors.success }]}
              onPress={handleToggle}
            >
              <Text style={[styles.dangerBtnText, { color: usuario.activo ? Colors.danger : Colors.success }]}>
                {usuario.activo ? '🔒 Desactivar acceso' : '🔓 Activar acceso'}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  header: {
    backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 18, color: Colors.white },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.white },
  scroll: { padding: 16, gap: 14 },
  profileCard: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 24,
    alignItems: 'center', gap: 8,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  profileAvatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  profileInitials: { fontSize: 28, fontWeight: '900', color: Colors.primary },
  profileName: { fontSize: 20, fontWeight: '800', color: Colors.text },
  profileEmail: { fontSize: 13, color: Colors.muted },
  profileMeta: { flexDirection: 'row', gap: 8, marginTop: 4 },
  rolBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  rolText: { fontSize: 12, fontWeight: '700' },
  activoBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  activoText: { fontSize: 12, fontWeight: '700' },
  profileSince: { fontSize: 11, color: Colors.muted, marginTop: 4 },
  section: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 18, gap: 12,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  dangerBtn: {
    borderRadius: 14, padding: 16, borderWidth: 1.5,
    alignItems: 'center',
  },
  dangerBtnText: { fontSize: 15, fontWeight: '700' },
});
