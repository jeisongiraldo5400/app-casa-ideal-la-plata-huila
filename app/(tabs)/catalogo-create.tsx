import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { CATALOGOS_HABILITADOS } from '@/constants/features';
import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { ActionBar, Button, Card, Input, ScreenErrorBoundary, ScreenState } from '@/components/ui';
import { openCreatedCatalog, useCatalogAccess, useCatalogosStore } from '@/components/catalogos';
import { createPrivateCatalog } from '@/components/catalogos/infrastructure/services/catalogsService';
import { errorMessage } from '@/lib/errorMessage';
import { hasErrors, validateCreateCatalog, type CreateCatalogErrors } from '@/lib/catalogos/validators';

export default function CatalogoCreateScreen() {
  // Módulo oculto en esta versión (constants/features.ts).
  if (!CATALOGOS_HABILITADOS) return <Redirect href="/(tabs)" />;
  return (
    <ScreenErrorBoundary screen="Nuevo catálogo">
      <CatalogoCreateInner />
    </ScreenErrorBoundary>
  );
}

function CatalogoCreateInner() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const access = useCatalogAccess();
  const invalidateCatalog = useCatalogosStore((state) => state.invalidateCatalog);
  const [internalTitle, setInternalTitle] = useState('');
  const [errors, setErrors] = useState<CreateCatalogErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!access.loading && !access.canManageCatalog) {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: colors.background.default }]}>
        <ScreenState icon="lock-outline" title="Sin acceso" description="Tu usuario no puede crear catálogos." />
      </View>
    );
  }

  const submit = async () => {
    const validation = validateCreateCatalog({ internalTitle, publicTitle: '' });
    setErrors(validation);
    if (hasErrors(validation)) return;
    setSaving(true);
    setSubmitError(null);
    try {
      const { id } = await createPrivateCatalog({ internalTitle });
      invalidateCatalog(id);
      // La pestaña no se desmonta: la próxima vez debe abrir limpia.
      setInternalTitle('');
      setErrors({});
      // Directo al selector, con el detalle y la lista debajo para que «atrás» los recorra.
      openCreatedCatalog(router, id);
    } catch (caught) {
      setSubmitError(errorMessage(caught, 'No fue posible crear el catálogo.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <Text style={[styles.title, { color: colors.text.primary }]}>Empieza con un nombre</Text>
          <Text style={[styles.hint, { color: colors.text.secondary }]}>
            Luego eliges los productos y lo envías al cliente.
          </Text>
          <Input
            label="¿Cómo quieres llamar este catálogo?"
            value={internalTitle}
            onChangeText={setInternalTitle}
            error={errors.internalTitle}
            placeholder="P. ej. Apartamentos septiembre"
            maxLength={120}
            autoFocus
            returnKeyType="next"
            onSubmitEditing={() => void submit()}
          />
          {submitError ? <Text style={[styles.error, { color: colors.error.main }]}>{submitError}</Text> : null}
        </Card>
      </ScrollView>
      <ActionBar>
        <Button title="Crear y elegir productos" icon="auto-stories" onPress={() => void submit()} loading={saving} style={styles.primary} />
      </ActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { justifyContent: 'center', padding: Spacing.xl },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl },
  card: { gap: Spacing.md },
  title: { ...Typography.section },
  hint: { ...Typography.caption },
  error: { ...Typography.caption },
  primary: { flex: 1 },
});
