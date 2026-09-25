import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { CATALOGOS_HABILITADOS } from '@/constants/features';
import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { BackButton, Card, Pagination, ScreenErrorBoundary, ScreenState, SearchField } from '@/components/ui';
import {
  ProductPickerRow,
  ShareLinkCreateForm,
  ShareLinkResultSheet,
  useCatalogAccess,
  useCatalogosStore,
} from '@/components/catalogos';
import { usePublishedProductSearch } from '@/components/catalogos/infrastructure/hooks/usePublishedProductSearch';
import type { CreateShareLinkRequest, ShareLinkResult } from '@/components/catalogos/infrastructure/hooks/useShareLinkFlow';
import { shareSingleProduct } from '@/components/catalogos/infrastructure/services/quickShareService';
import { shareLinkByWhatsApp } from '@/components/catalogos/utils/shareActions';
import { buildShareMessage } from '@/components/catalogos/utils/shareMessages';
import { catalogSiteUrl } from '@/lib/catalogos/shareLinks';
import type { PublicCatalogListingItem } from '@/lib/catalogos/publicCatalogTypes';
import { hasErrors, validateShareLinkInput, type ShareLinkErrors } from '@/lib/catalogos/validators';
import { errorMessage } from '@/lib/errorMessage';

export default function EnviarProductoScreen() {
  // Módulo oculto en esta versión (constants/features.ts).
  if (!CATALOGOS_HABILITADOS) return <Redirect href="/(tabs)" />;
  return (
    <ScreenErrorBoundary screen="Enviar un producto">
      <EnviarProductoInner />
    </ScreenErrorBoundary>
  );
}

/**
 * «Enviar un producto»: elegir UNA ficha publicada y mandarla por WhatsApp en
 * un solo paso. En producción, cuatro de cada cinco ediciones tenían un único
 * producto: el vendedor armaba una edición entera para mandar una cosa.
 */
function EnviarProductoInner() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const access = useCatalogAccess();
  const search = usePublishedProductSearch();
  const fetchList = useCatalogosStore((state) => state.fetchList);

  const [chosen, setChosen] = useState<PublicCatalogListingItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState<ShareLinkErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ShareLinkResult | null>(null);
  const [publicTitle, setPublicTitle] = useState('');

  const screenOptions = { title: 'Enviar un producto', headerLeft: () => <BackButton /> };
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
    if (!chosen) return false;
    const validation = validateShareLinkInput({ label, hours });
    setErrors(validation);
    if (hasErrors(validation)) return false;

    setCreating(true);
    setSubmitError(null);
    try {
      const sent = await shareSingleProduct({
        productId: chosen.productId,
        productName: chosen.displayName,
        label,
        hours,
      });
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
      setSubmitError(errorMessage(caught, 'No fue posible enviar el producto.'));
      return false;
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
      <Stack.Screen options={screenOptions} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.hint, { color: colors.text.secondary }]}>
          Elige un producto y mándaselo a tu cliente por WhatsApp. Solo aparecen los que ya están publicados en el
          catálogo: son los únicos que el cliente puede ver.
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
                item={item}
                selected={chosen?.productId === item.productId}
                pending={false}
                onToggle={() => setChosen((current) => (current?.productId === item.productId ? null : item))}
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

        {chosen ? (
          <ShareLinkCreateForm
            disabled={!siteConfigured}
            creating={creating}
            progress={null}
            errors={errors}
            submitError={submitError}
            notice={
              siteConfigured
                ? `Vas a enviar «${chosen.displayName}». Todo el equipo podrá ver este envío en Catálogos.`
                : 'Falta configurar la dirección del catálogo: no se pueden generar enlaces.'
            }
            onCreate={send}
          />
        ) : null}
      </ScrollView>

      <ShareLinkResultSheet result={result} publicTitle={publicTitle} onClose={() => setResult(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  content: { padding: Spacing.xl, gap: Spacing.lg, paddingBottom: Spacing.xxxl },
  hint: { ...Typography.bodySmall },
  list: { gap: Spacing.md },
});
