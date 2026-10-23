import { useTheme } from '@/components/theme';
import { BackButton, Button, Card, StackHeader } from '@/components/ui';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { parseUncostedCount, uncostedOrderMessage } from '@/lib/costos/uncostedOrderNotice';
import { MaterialIcons } from '@expo/vector-icons';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

/**
 * Se abre al tocar el aviso «Mercancía sin costo» (perfil Costos,
 * 20261231810000). En el teléfono no se costea: se indica dónde hacerlo en la
 * web. No consulta nada, así que funciona igual sin señal.
 * Como «Preparar el teléfono», el Stack raíz no la declara.
 */
export default function OrdenSinCostoScreen() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const router = useRouter();
  const params = useLocalSearchParams<{ orden?: string; productos?: string }>();
  const orden = typeof params.orden === 'string' ? params.orden : null;
  const productos = parseUncostedCount(params.productos);

  return (
    <ScreenErrorBoundary screen="Mercancía sin costo">
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Mercancía sin costo',
          header: (props: NativeStackHeaderProps) => <StackHeader {...props} />,
          headerLeft: () => <BackButton />,
          headerStyle: { backgroundColor: colors.background.default },
          headerTintColor: colors.text.primary,
          headerTitleStyle: { ...Typography.section },
          headerTitleAlign: 'left',
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        style={{ backgroundColor: colors.background.default }}
        contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.row}>
            <MaterialIcons name="request-quote" size={28} color={colors.warning.dark} />
            <Text style={[Typography.bodyStrong, styles.flex, { color: colors.text.primary }]}>
              {uncostedOrderMessage(orden, productos)}
            </Text>
          </View>
          <Text style={[Typography.body, styles.gap, { color: colors.text.secondary }]}>
            Cóstela para que el margen de las ventas sea correcto.
          </Text>
          <Text style={[Typography.body, styles.gap, { color: colors.text.primary }]}>
            Costéela desde la web: Costos → Costear órdenes.
          </Text>
        </Card>
        <Button title="Volver al inicio" variant="outline" onPress={() => router.replace('/(tabs)')} />
      </ScrollView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, gap: Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  flex: { flex: 1 },
  gap: { marginTop: Spacing.md },
});
