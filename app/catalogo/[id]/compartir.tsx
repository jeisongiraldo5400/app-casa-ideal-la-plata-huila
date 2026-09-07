import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { BackButton, Card, ScreenErrorBoundary, ScreenState, SectionHeader } from '@/components/ui';
import {
  ReissueLinkSheet,
  ShareLinkCreateForm,
  ShareLinkResultSheet,
  ShareLinksPanel,
  useCatalogDetail,
  useCatalogSummary,
  useShareLinkFlow,
} from '@/components/catalogos';
import { pluralize } from '@/lib/catalogos/labels';
import type { CatalogShareLink } from '@/lib/catalogos/types';

export default function CatalogoCompartirScreen() {
  return (
    <ScreenErrorBoundary screen="Compartir catálogo">
      <CatalogoCompartirInner />
    </ScreenErrorBoundary>
  );
}

function CatalogoCompartirInner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { detail, products, loading, error, notFound, isOwner, reload } = useCatalogDetail(id);
  const summary = useCatalogSummary(detail);
  const flow = useShareLinkFlow(detail, products, reload);
  const [reissueTarget, setReissueTarget] = useState<CatalogShareLink | null>(null);
  const screenOptions = { title: 'Compartir', headerLeft: () => <BackButton /> };

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
            <ScreenState icon="search-off" title="No se encontró el catálogo" />
          ) : (
            <ScreenState tone="error" title="No se pudo cargar el catálogo" description={error ?? undefined} actionLabel="Reintentar" onAction={() => void reload()} />
          )}
        </View>
      </View>
    );
  }
  if (!isOwner) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
        <Stack.Screen options={screenOptions} />
        <View style={styles.centered}>
          <ScreenState icon="lock-outline" title="Solo el autor puede compartir" description="Los enlaces de un catálogo los genera quien lo creó." />
        </View>
      </View>
    );
  }
  if (!flow.siteConfigured) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
        <Stack.Screen options={screenOptions} />
        <View style={styles.centered}>
          <ScreenState tone="warning" icon="settings" title="Falta configurar la URL del catálogo" description="Define EXPO_PUBLIC_CATALOG_SITE_URL en la build para poder generar enlaces." />
        </View>
      </View>
    );
  }

  const blocked = flow.readiness.blockers.length > 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
      <Stack.Screen options={screenOptions} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {blocked ? (
          <ScreenState tone="warning" icon="playlist-add-check" title="Aún no se puede compartir" description={flow.readiness.blockers.join(' ')} />
        ) : flow.readiness.warnings.length > 0 ? (
          <Card variant="muted">
            <Text style={[styles.warning, { color: colors.text.primary }]}>{flow.readiness.warnings.join(' ')}</Text>
          </Card>
        ) : (
          <Text style={[styles.ready, { color: colors.text.secondary }]}>
            {pluralize(flow.readiness.productCount, 'ficha lista', 'fichas listas')} para la revista «{detail.publicTitle}».
          </Text>
        )}

        <ShareLinkCreateForm
          disabled={blocked}
          creating={flow.creating}
          progress={flow.progress}
          errors={flow.errors}
          submitError={flow.submitError}
          onCreate={flow.create}
        />

        <View style={styles.section}>
          <SectionHeader title="Enlaces entregados" hint={summary ? pluralize(summary.summary.activeLinkCount, 'activo', 'activos') : undefined} />
          <ShareLinksPanel
            links={detail.shareLinks}
            now={summary?.now ?? Date.now()}
            publicTitle={detail.publicTitle}
            reissuingId={flow.reissuingId}
            onReissue={setReissueTarget}
          />
        </View>
      </ScrollView>

      <ShareLinkResultSheet result={flow.result} publicTitle={detail.publicTitle} onClose={flow.dismissResult} />
      <ReissueLinkSheet
        link={reissueTarget}
        busy={flow.reissuingId !== null}
        onClose={() => setReissueTarget(null)}
        onConfirm={(link, hours) => flow.reissue(link.id, link.label, hours)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl, gap: Spacing.xl },
  section: { gap: Spacing.md },
  warning: { ...Typography.bodySmall },
  ready: { ...Typography.caption },
});
