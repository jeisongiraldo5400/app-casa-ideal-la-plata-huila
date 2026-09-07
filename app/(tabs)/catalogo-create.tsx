import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { ActionBar, Button, Card, Input, ScreenErrorBoundary, ScreenState } from '@/components/ui';
import { useCatalogAccess } from '@/components/catalogos';
import { createPrivateCatalog } from '@/components/catalogos/infrastructure/services/catalogsService';
import { errorMessage } from '@/lib/errorMessage';
import { hasErrors, validateCreateCatalog, type CreateCatalogErrors } from '@/lib/catalogos/validators';

export default function CatalogoCreateScreen() {
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
  const [internalTitle, setInternalTitle] = useState('');
  const [publicTitle, setPublicTitle] = useState('');
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
    const validation = validateCreateCatalog({ internalTitle, publicTitle });
    setErrors(validation);
    if (hasErrors(validation)) return;
    setSaving(true);
    setSubmitError(null);
    try {
      const { id } = await createPrivateCatalog({ internalTitle, publicTitle: publicTitle.trim() || null });
      router.replace(`/catalogo/${id}` as never);
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
            Después eliges los productos y generas el enlace para el cliente. La portada y el diseño se ajustan desde el panel web.
          </Text>
          <Input
            label="Nombre interno"
            value={internalTitle}
            onChangeText={setInternalTitle}
            error={errors.internalTitle}
            placeholder="Solo lo ves tú (p. ej. Familia Pérez)"
            maxLength={120}
            autoFocus
            returnKeyType="next"
          />
          <Input
            label="Título público (opcional)"
            value={publicTitle}
            onChangeText={setPublicTitle}
            error={errors.publicTitle}
            placeholder="Igual al nombre interno si lo dejas vacío"
            maxLength={120}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />
          {submitError ? <Text style={[styles.error, { color: colors.error.main }]}>{submitError}</Text> : null}
        </Card>
      </ScrollView>
      <ActionBar>
        <Button title="Crear catálogo" icon="auto-stories" onPress={() => void submit()} loading={saving} style={styles.primary} />
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
