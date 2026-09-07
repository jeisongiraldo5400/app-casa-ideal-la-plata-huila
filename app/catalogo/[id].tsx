import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { ActionCard, BackButton, Button, Card, HeroActionCard, Metric, ScreenErrorBoundary, ScreenState, SectionHeader } from '@/components/ui';
import {
  ArchiveCatalogButton,
  CatalogHeaderCard,
  CatalogSectionsSummary,
  CatalogTextsSheet,
  ShareLinkRow,
  WebOnlyNotice,
  useCatalogDetail,
  useCatalogSummary,
  useCatalogosStore,
} from '@/components/catalogos';
import { pluralize } from '@/lib/catalogos/labels';

const RECENT_LINKS = 3;

export default function CatalogoDetailScreen() {
  return (
    <ScreenErrorBoundary screen="Catálogo">
      <CatalogoDetailInner />
    </ScreenErrorBoundary>
  );
}

function CatalogoDetailInner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { detail, products, ownerName, loading, error, isNetworkFailure, notFound, isOwner, reload, setDetail } = useCatalogDetail(id);
  const summary = useCatalogSummary(detail);
  const removeFromList = useCatalogosStore((state) => state.removeFromList);
  const [editingTexts, setEditingTexts] = useState(false);

  const screenOptions = {
    title: detail?.internalTitle ?? 'Catálogo',
    headerLeft: () => <BackButton />,
  };

  if (loading && !detail) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
        <Stack.Screen options={screenOptions} />
        <View style={styles.centered}>
          <ScreenState loading title="Cargando catálogo…" variant="inline" />
        </View>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
        <Stack.Screen options={screenOptions} />
        <View style={styles.centered}>
          {notFound ? (
            <ScreenState icon="search-off" title="No se encontró el catálogo" description="Puede que se haya archivado o que no tengas acceso." />
          ) : (
            <ScreenState
              tone="error"
              icon={isNetworkFailure ? 'cloud-off' : 'inbox'}
              title={isNetworkFailure ? 'Sin conexión' : 'No se pudo cargar el catálogo'}
              description={isNetworkFailure ? 'Los catálogos requieren internet.' : (error ?? 'Inténtalo de nuevo en unos segundos.')}
              actionLabel="Reintentar"
              onAction={() => void reload()}
            />
          )}
        </View>
      </View>
    );
  }

  const productItems = detail.sections.flatMap((section) => section.items.filter((item) => item.itemType === 'product'));
  const publishedCount = productItems.filter((item) => products.has(item.referenceId)).length;
  const scope = isOwner ? 'own' : detail.visibility === 'organization' ? 'organization' : 'shared';
  const recentLinks = detail.shareLinks.slice(0, RECENT_LINKS);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
      <Stack.Screen options={screenOptions} />
      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <Text style={[styles.notice, { color: colors.warning.dark }]} accessibilityLiveRegion="polite">
            No se pudo actualizar. Mostrando la última versión cargada.
          </Text>
        ) : null}

        <CatalogHeaderCard catalog={detail} status={summary?.displayStatus ?? detail.status} scope={scope} ownerName={ownerName} />

        <Card variant="outlined" style={styles.metrics}>
          <Metric label="Fichas" value={publishedCount} />
          <Metric label="Capítulos" value={detail.sections.length} align="center" />
          {isOwner && summary ? (
            <>
              <Metric label="Enlaces" value={summary.summary.activeLinkCount} tone={summary.summary.activeLinkCount > 0 ? 'success' : 'default'} align="center" />
              <Metric label="Vistas" value={summary.summary.totalViewCount} align="right" />
            </>
          ) : null}
        </Card>

        {isOwner ? (
          <View style={styles.section}>
            <HeroActionCard
              title="Compartir con un cliente"
              subtitle={summary && summary.summary.activeLinkCount > 0 ? pluralize(summary.summary.activeLinkCount, 'enlace activo', 'enlaces activos') : 'Genera un enlace privado'}
              icon="send"
              onPress={() => router.push(`/catalogo/${detail.id}/compartir` as never)}
            />
            <View style={styles.actionGrid}>
              <ActionCard compact title="Productos" subtitle={pluralize(productItems.length, 'seleccionado', 'seleccionados')} icon="inventory-2" onPress={() => router.push(`/catalogo/${detail.id}/productos` as never)} style={styles.halfCard} />
              <ActionCard compact title="Textos" subtitle="Título e introducción" icon="edit-note" onPress={() => setEditingTexts(true)} style={styles.halfCard} />
            </View>
            <WebOnlyNotice />
          </View>
        ) : (
          <Text style={[styles.readOnly, { color: colors.text.secondary }]}>Catálogo del equipo · solo lectura. Para editarlo, usa el panel web.</Text>
        )}

        <View style={styles.section}>
          <SectionHeader title="Capítulos" hint={pluralize(detail.sections.length, 'capítulo', 'capítulos')} />
          {detail.sections.length === 0 ? (
            <ScreenState
              icon="inventory-2"
              title="Sin productos todavía"
              description={isOwner ? 'Elige las fichas que quieres mostrar; el primer capítulo se crea solo.' : 'Este catálogo aún no tiene contenido.'}
              actionLabel={isOwner ? 'Elegir productos' : undefined}
              onAction={isOwner ? () => router.push(`/catalogo/${detail.id}/productos` as never) : undefined}
            />
          ) : (
            <CatalogSectionsSummary sections={detail.sections} products={products} />
          )}
        </View>

        {isOwner && summary ? (
          <View style={styles.section}>
            <SectionHeader
              title="Enlaces"
              action={
                detail.shareLinks.length > 0 ? (
                  <Button title="Ver todos" variant="ghost" size="sm" onPress={() => router.push(`/catalogo/${detail.id}/compartir` as never)} />
                ) : undefined
              }
            />
            {recentLinks.length === 0 ? (
              <Text style={[styles.readOnly, { color: colors.text.secondary }]}>Aún no has generado enlaces para esta edición.</Text>
            ) : (
              <View style={styles.links}>
                {recentLinks.map((link) => (
                  <ShareLinkRow key={link.id} link={link} now={summary.now} publicTitle={detail.publicTitle} compact />
                ))}
              </View>
            )}
          </View>
        ) : null}

        {isOwner ? (
          <View style={styles.section}>
            <ArchiveCatalogButton
              catalogId={detail.id}
              internalTitle={detail.internalTitle}
              onArchived={() => {
                removeFromList(detail.id);
                router.back();
              }}
            />
          </View>
        ) : null}
      </ScrollView>

      {isOwner ? (
        <CatalogTextsSheet
          visible={editingTexts}
          catalog={detail}
          onClose={() => setEditingTexts(false)}
          onSaved={(values) => setDetail((current) => ({ ...current, ...values }))}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl, gap: Spacing.xl },
  section: { gap: Spacing.md },
  metrics: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  halfCard: { flexBasis: '45%', flexGrow: 1 },
  notice: { ...Typography.metadata },
  readOnly: { ...Typography.caption },
  links: { gap: Spacing.md },
});
