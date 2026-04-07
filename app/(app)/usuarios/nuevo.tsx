import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usuariosService } from '@/services/usuarios.service';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Colors } from '@/constants/colors';

const schema = z.object({
  nombre:    z.string().min(2, 'Mínimo 2 caracteres'),
  apellido:  z.string().min(2, 'Mínimo 2 caracteres'),
  email:     z.string().email('Correo inválido'),
  telefono:  z.string().optional(),
  rol:       z.enum(['admin', 'oficial', 'cajero', 'auditor']),
  password:  z.string().min(8, 'Mínimo 8 caracteres'),
  password2: z.string(),
}).refine(d => d.password === d.password2, {
  message: 'Las contraseñas no coinciden',
  path: ['password2'],
});

type FormData = z.infer<typeof schema>;

const ROLES = [
  { value: 'admin',   label: 'Administrador', icon: '👑' },
  { value: 'oficial', label: 'Oficial de Crédito', icon: '💼' },
  { value: 'cajero',  label: 'Cajero', icon: '💳' },
  { value: 'auditor', label: 'Auditor', icon: '🔍' },
];

export default function NuevoUsuarioScreen() {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { rol: 'cajero' },
  });

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      await usuariosService.crear({
        email: data.email,
        password: data.password,
        nombre: data.nombre,
        apellido: data.apellido,
        telefono: data.telefono,
        rol: data.rol,
      });
      Alert.alert(
        '✅ Usuario creado',
        `${data.nombre} ${data.apellido} puede iniciar sesión con:\nCorreo: ${data.email}\nContraseña: la que ingresaste`,
        [{ text: 'Aceptar', onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo crear el usuario');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeIcon}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nuevo Usuario</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>

          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>💡</Text>
            <Text style={styles.infoText}>
              Al crear un usuario, recibirá sus credenciales de acceso. Podrá iniciar sesión inmediatamente.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos Personales</Text>
            <Controller control={control} name="nombre"
              render={({ field: { onChange, value } }) => (
                <Input label="Nombre *" placeholder="Juan" value={value} onChangeText={onChange} error={errors.nombre?.message} />
              )} />
            <Controller control={control} name="apellido"
              render={({ field: { onChange, value } }) => (
                <Input label="Apellido *" placeholder="Pérez" value={value} onChangeText={onChange} error={errors.apellido?.message} />
              )} />
            <Controller control={control} name="telefono"
              render={({ field: { onChange, value } }) => (
                <Input label="Teléfono" placeholder="+591 7xxxxxxx" value={value ?? ''} onChangeText={onChange} keyboardType="phone-pad" />
              )} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Rol del Sistema</Text>
            <Controller control={control} name="rol"
              render={({ field: { onChange, value } }) => (
                <Select label="Rol" options={ROLES} value={value} onSelect={onChange} />
              )} />

            <View style={styles.rolesInfo}>
              {ROLES.map(r => (
                <View key={r.value} style={styles.roleInfoRow}>
                  <Text style={styles.roleInfoIcon}>{r.icon}</Text>
                  <View>
                    <Text style={styles.roleInfoTitle}>{r.label}</Text>
                    <Text style={styles.roleInfoDesc}>{
                      r.value === 'admin'   ? 'Acceso total: usuarios, créditos, reportes y contabilidad' :
                      r.value === 'oficial' ? 'Crea y gestiona clientes, garantías y préstamos' :
                      r.value === 'cajero'  ? 'Registra cobros y consulta cronogramas' :
                                             'Solo lectura: reportes y contabilidad'
                    }</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Credenciales de Acceso</Text>
            <Controller control={control} name="email"
              render={({ field: { onChange, value } }) => (
                <Input label="Correo Electrónico *" placeholder="usuario@empresa.com" value={value ?? ''} onChangeText={onChange} keyboardType="email-address" autoCapitalize="none" error={errors.email?.message} />
              )} />
            <Controller control={control} name="password"
              render={({ field: { onChange, value } }) => (
                <Input label="Contraseña *" placeholder="Mínimo 8 caracteres" value={value ?? ''} onChangeText={onChange} isPassword textContentType="newPassword" autoComplete="new-password" error={errors.password?.message} />
              )} />
            <Controller control={control} name="password2"
              render={({ field: { onChange, value } }) => (
                <Input label="Confirmar Contraseña *" placeholder="Repite la contraseña" value={value ?? ''} onChangeText={onChange} isPassword textContentType="newPassword" autoComplete="new-password" error={errors.password2?.message} />
              )} />
          </View>

          <Button title="Crear Usuario" onPress={handleSubmit(onSubmit) as any} loading={saving} size="lg" />
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
  infoCard: {
    flexDirection: 'row', gap: 12, backgroundColor: `${Colors.info}12`,
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: `${Colors.info}30`,
  },
  infoIcon: { fontSize: 20 },
  infoText: { flex: 1, fontSize: 13, color: Colors.info, lineHeight: 18 },
  section: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 18, gap: 12,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  rolesInfo: { gap: 8, marginTop: 4 },
  roleInfoRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  roleInfoIcon: { fontSize: 18, marginTop: 1 },
  roleInfoTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  roleInfoDesc: { fontSize: 11, color: Colors.muted, marginTop: 2, lineHeight: 15 },
});
