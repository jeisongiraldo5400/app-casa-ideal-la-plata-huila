import { useEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { CATALOGOS_HABILITADOS } from '@/constants/features';
import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { ActionBar, BackButton, Button, Card, IconButton, Pagination, ScreenErrorBoundary, ScreenState, SearchField } from '@/components/ui';
import {
  CatalogImageViewer,
  ProductPickerRow,
  ShareLinkCreateForm,
  ShareLinkResultSheet,
  useCatalogAccess,
  useCatalogosStore,
  type ImagePreviewTarget,
} from '@/components/catalogos';
import { usePublishedProductSearch } from '@/components/catalogos/infrastructure/hooks/usePublishedProductSearch';
import { useProductSelection } from '@/components/catalogos/infrastructure/hooks/useProductSelection';
import type { CreateShareLinkRequest, ShareLinkResult } from '@/components/catalogos/infrastructure/hooks/useShareLinkFlow';
import type { SnapshotProgress } from '@/components/catalogos/infrastructure/services/catalogSnapshotService';
import { shareProducts } from '@/components/catalogos/infrastructure/services/quickShareService';
import { shareLinkByWhatsApp } from '@/components/catalogos/utils/shareActions';
import { buildShareMessage } from '@/components/catalogos/utils/shareMessages';
import { pluralize } from '@/lib/catalogos/labels';
import { catalogSiteUrl } from '@/lib/catalogos/shareLinks';
import { hasErrors, validateShareLinkInput, type ShareLinkErrors } from '@/lib/catalogos/validators';
import { errorMessage } from '@/lib/errorMessage';

const SCREEN_TITLE = 'Enviar productos por WhatsApp';

export default function EnviarProductoScreen() {
  // Módulo oculto en esta versión (constants/features.ts).
  if (!CATALOGOS_HABILITADOS) return <Redirect href="/(tabs)" />;
  return (
    <ScreenErrorBoundary screen={SCREEN_TITLE}>
      <EnviarProductoInner />
    </ScreenErrorBoundary>
  );
}

/**
 * «Enviar productos por WhatsApp»: elegir una o varias fichas publicadas y
 * mandarlas en UN enlace. Dos pasos: elegir (casillas, la selección se
 * conserva al paginar y al buscar) y revisar y enviar.
 */
function EnviarProductoInner() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const access = useCatalogAccess();
  const search = usePublishedProductSearch();
  const selection = useProductSelection();
  const fetchList = useCatalogosStore((state) => state.fetchList);

  const [step, setStep] = useState<'pick' | 'review'>('pick');
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState<SnapshotProgress | null>(null);
  const [errors, setErrors] = useState<ShareLinkErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ShareLinkResult | null>(null);
  const [publicTitle, setPublicTitle] = useState('');
  const [preview, setPreview] = useState<ImagePreviewTarget | null>(null);

  const count = selection.selected.length;
  const reviewing = step === 'review' && count > 0;

  // Si se quitan todos desde el resumen, se vuelve a elegir.
  useEffect(() => {
    if (count === 0 && step === 'review') setStep('pick');
  }, [count, step]);

  // En el resumen, «atrás» (botón o el del teléfono) vuelve a elegir sin perder la selección.
  useEffect(() => {
    if (!reviewing) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep('pick');
      return true;
    });
    return () => subscription.remove();
  }, [reviewing]);

  const screenOptions = {
    title: SCREEN_TITLE,
    headerLeft: () => <BackButton onPress={reviewing ? () => setStep('pick') : undefined} />,
  };
  const siteConfigured = catalogSiteUrl() !== null;

  if (!access.loading && !(access.canManageCatalog && access.canCreateShareLink)) {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: colors.background.default }]}>
        <Stack.Screen options={screenOptions} />
        <ScreenState icon="lock-outline" title="Sin acceso" description="Tu usuario no puede compartir catálogos." />
      </View>
    );
  }

  const send = async ({ label, hours, delivery }: CreateShareLinkRequest): Promise<boolean> => {
    if (count === 0) return false;
    const validation = validateShareLinkInput({ label, hours });
    setErrors(validation);
    if (hasErrors(validation)) return false;

    setCreating(true);
    setProgress(null);
    setSubmitError(null);
    try {
      const sent = await shareProducts({ products: selection.selected, label, hours, onProgress: setProgress });
      const trimmedLabel = label.trim();
      const whatsApp =
        delivery === 'whatsapp' ? await shareLinkByWhatsApp(buildShareMessage({ url: sent.url, label: trimmedLabel })) : null;
      // Siempre queda el enlace a mano: abrir WhatsApp no garantiza que se haya enviado.
      setPublicTitle(sent.publicTitle);
      setResult({ url: sent.url, label: trimmedLabel, expiresAt: sent.expiresAt, reissued: false, whatsApp });
      // La edición nueva (o el enlace nuevo) tiene que verse al volver a la lista.
      void fetchList({ force: true });
      return true;
    } catch (caught) {
      setSubmitError(errorMessage(caught, count === 1 ? 'No fue posible enviar el producto.' : 'No fue posible enviar los productos.'));
      return false;
    } finally {
      setCreating(false);
      setProgress(null);
    }
  };

  const countLabel = pluralize(count, 'seleccionado', 'seleccionados');

  return (
    <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
      <Stack.Screen options={screenOptions} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {reviewing ? (
          <>
            <Card style={styles.list}>
              <Text style={[styles.title, { color: colors.text.primary }]}>
                Vas a enviar {pluralize(count, 'producto', 'productos')}
              </Text>
              <Text style={[styles.hint, { color: colors.text.secondary }]}>
                {count === 1 ? 'Le llega en un enlace.' : 'Le llegan todos juntos en un solo enlace.'}
              </Text>
              {selection.selected.map((item) => (
                <View key={item.productId} style={styles.summaryRow}>
                  <Text style={[styles.summaryName, { color: colors.text.primary }]} numberOfLines={2}>
                    {item.displayName}
                  </Text>
                  <IconButton
                    icon="close"
                    color={colors.text.secondary}
                    onPress={() => selection.remove(item.productId)}
                    disabled={creating}
                    accessibilityLabel={`Quitar ${item.displayName}`}
                  />
                </View>
              ))}
              <Button title="Añadir más productos" icon="add" variant="outline" size="sm" onPress={() => setStep('pick')} disabled={creating} />
            </Card>

            <ShareLinkCreateForm
              disabled={!siteConfigured}
              creating={creating}
              progress={progress}
              errors={errors}
              submitError={submitError}
              notice={
                siteConfigured
                  ? 'El enlace es solo tuyo; los administradores también pueden verlo.'
                  : 'Falta configurar la dirección del catálogo: no se pueden generar enlaces.'
              }
              onCreate={send}
            />
          </>
        ) : (
          <>
            <Text style={[styles.hint, { color: colors.text.secondary }]}>
              Elige uno o varios productos (hasta {selection.max}) y mándalos en un solo enlace por WhatsApp. Solo aparecen
              los que ya están publicados en el catálogo: son los únicos que el cliente puede ver.
            </Text>

            <SearchField
              value={search.query}
              onChangeText={search.setQuery}
              placeholder="Buscar producto"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />

            {search.error ? (
              <ScreenState tone="error" icon="error-outline" title="No se pudieron cargar los productos" description={search.error} actionLabel="Reintentar" onAction={() => void search.reload()} variant="inline" />
            ) : search.loading && search.items.length === 0 ? (
              <ScreenState loading title="Buscando productos…" variant="inline" />
            ) : search.items.length === 0 ? (
              <ScreenState
                icon="search-off"
                title="Sin productos para enviar"
                description={search.query.trim() ? 'Nada publicado coincide con la búsqueda.' : 'Todavía no hay productos publicados en el catálogo.'}
                variant="inline"
              />
            ) : (
              <Card style={styles.list}>
                {search.items.map((item) => (
                  <ProductPickerRow
                    key={item.productId}
                    variant="checkbox"
                    item={item}
                    selected={selection.isSelected(item.productId)}
                    pending={false}
                    onToggle={() => selection.toggle(item)}
                    onPreview={() => setPreview({ title: item.displayName, coverUrl: item.coverImageUrl, slug: item.slug })}
                  />
                ))}
                <Pagination
                  page={search.page}
                  pageSize={search.pageSize}
                  total={search.totalCount}
                  onChange={search.setPage}
                  itemLabel="productos"
                />
              </Card>
            )}
          </>
        )}
      </ScrollView>

      {reviewing ? null : (
        <ActionBar style={styles.bar}>
          {selection.limitReached ? (
            <Text style={[styles.limit, { color: colors.warning.dark }]} accessibilityLiveRegion="polite">
              Máximo {selection.max} productos por envío. Quita alguno para añadir otro.
            </Text>
          ) : null}
          <Button
            title={count === 0 ? 'Elige al menos un producto' : `${countLabel} · Continuar`}
            icon="send"
            onPress={() => setStep('review')}
            disabled={count === 0}
            style={styles.primary}
          />
        </ActionBar>
      )}

      <ShareLinkResultSheet result={result} publicTitle={publicTitle} onClose={() => setResult(null)} />
      <CatalogImageViewer target={preview} onClose={() => setPreview(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  content: { padding: Spacing.xl, gap: Spacing.lg, paddingBottom: Spacing.xxxl },
  title: { ...Typography.bodyStrong },
  hint: { ...Typography.bodySmall },
  list: { gap: Spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  summaryName: { ...Typography.body, flex: 1 },
  bar: { flexWrap: 'wrap' },
  limit: { ...Typography.metadata, width: '100%' },
  primary: { flex: 1 },
});
