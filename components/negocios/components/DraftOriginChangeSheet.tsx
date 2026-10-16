import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Button, Card, FullScreenModal } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errorMessage';
import { createIdempotencyKey } from '@/lib/idempotency';
import {
  ORIGEN_PREPARADO_SIN_SENAL,
  buildDraftOriginTarget,
  draftOriginGroupBlockReason,
  draftOriginOrderBlockReason,
  evaluateDraftOriginCoverage,
  formatCoverageLine,
  type DraftOriginCoverageLine,
  type DraftOriginItem,
  type DraftSourceCheck,
  type PreparedDraftOriginChange,
} from '../domain/draftOriginChange';
import { useOriginOrderSearch } from '../infrastructure/hooks/useOriginOrderSearch';
import {
  fetchRemissionOriginProducts,
  type DeliveryOrderOption,
  type RemissionOriginGroup,
} from '../infrastructure/services/negociosDeliveryOrdersService';
import { fetchLocalRemissionOriginGroups } from '../infrastructure/services/negociosOfflineOrdersService';
import {
  changeDraftSource,
  checkDraftSource,
  savePreparedDraftOriginChange,
} from '../infrastructure/services/draftOriginChangeService';
import { NegocioOriginGroupsSection } from './NegocioOriginGroupsSection';
import { NegocioOriginOrderPicker } from './NegocioOriginOrderPicker';

type Props = {
  visible: boolean;
  onClose: () => void;
  negocioId: string;
  customerId: string | null;
  items: DraftOriginItem[];
  /** Sin señal (o con la copia del teléfono): solo se prepara el cambio. */
  offline: boolean;
  /** El servidor ya cambió el origen: recargar el negocio. */
  onChanged: (label: string) => void;
  /** Sin señal: el cambio quedó preparado en el teléfono. */
  onPrepared: (change: PreparedDraftOriginChange) => void;
};

/**
 * Cambiar el origen de un borrador: elegir la remisión (y su grupo) u OE de la
 * que sale la mercancía, ver producto por producto si alcanza y confirmar.
 * Con señal el servidor revisa y cambia; sin señal solo se prepara.
 */
export function DraftOriginChangeSheet({
  visible,
  onClose,
  negocioId,
  customerId,
  items,
  offline,
  onChanged,
  onPrepared,
}: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const search = useOriginOrderSearch(visible, offline);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrderOption | null>(null);
  const [groups, setGroups] = useState<RemissionOriginGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<RemissionOriginGroup | null>(null);
  const [serverCheck, setServerCheck] = useState<DraftSourceCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Una clave por destino: un reintento tras perder la respuesta no duplica. */
  const keyRef = useRef<{ target: string; key: string } | null>(null);

  useEffect(() => {
    if (visible) return;
    setSelectedOrder(null);
    setSelectedGroup(null);
    setGroups([]);
    setServerCheck(null);
    setCheckError(null);
    setSaveError(null);
    keyRef.current = null;
  }, [visible]);

  // Las OE de otro cliente se muestran deshabilitadas, con el motivo.
  const orders = useMemo(
    () =>
      search.orders.map((order) => ({
        ...order,
        unusable_reason: draftOriginOrderBlockReason(order, customerId),
      })),
    [search.orders, customerId]
  );

  const isRemission = selectedOrder?.order_type === 'remission';
  useEffect(() => {
    if (!selectedOrder || !isRemission) {
      setGroups([]);
      setGroupsLoading(false);
      return;
    }
    let cancelled = false;
    setGroupsLoading(true);
    const load = selectedOrder.from_local ? fetchLocalRemissionOriginGroups : fetchRemissionOriginProducts;
    load(selectedOrder.id)
      .then((rows) => {
        if (!cancelled) setGroups(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setGroups([]);
          setCheckError(errorMessage(error, 'No se pudieron cargar los productos de la remisión'));
        }
      })
      .finally(() => {
        if (!cancelled) setGroupsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedOrder, isRemission]);

  const target = buildDraftOriginTarget(selectedOrder, selectedGroup);
  const targetKey = target ? `${target.remission_id ?? ''}:${target.source_delivery_order_id}` : null;
  const originItems = isRemission ? selectedGroup?.items ?? [] : selectedOrder?.items ?? [];
  const localCoverage = evaluateDraftOriginCoverage(items, originItems);

  // Con señal, lo que decide es el servidor (cuenta lo vendido por otros).
  useEffect(() => {
    setServerCheck(null);
    setSaveError(null);
    if (!target || offline) return;
    let cancelled = false;
    setChecking(true);
    setCheckError(null);
    checkDraftSource(negocioId, target)
      .then((result) => {
        if (!cancelled) setServerCheck(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) setCheckError(errorMessage(error, 'No se pudo revisar la orden'));
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
    // targetKey resume el destino; `target` cambia de identidad en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, offline, negocioId]);

  const lines: DraftOriginCoverageLine[] = serverCheck?.lines.length ? serverCheck.lines : target ? localCoverage.lines : [];
  const ready = offline ? Boolean(target) && localCoverage.complete : Boolean(serverCheck?.usable);
  const blockText = offline
    ? target && !localCoverage.complete
      ? 'Según lo descargado, la orden no trae todo lo del negocio.'
      : null
    : serverCheck && !serverCheck.usable
      ? serverCheck.reason
      : null;

  const keyFor = (value: string) => {
    if (keyRef.current?.target !== value) keyRef.current = { target: value, key: createIdempotencyKey() };
    return keyRef.current.key;
  };

  const confirm = async () => {
    if (!target || !targetKey || !ready || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (offline) {
        const change: PreparedDraftOriginChange = {
          negocioId,
          ...target,
          idempotencyKey: keyFor(targetKey),
          preparedAt: new Date().toISOString(),
        };
        await savePreparedDraftOriginChange(change);
        onPrepared(change);
        return;
      }
      await changeDraftSource(negocioId, target, keyFor(targetKey));
      keyRef.current = null;
      onChanged(target.label);
    } catch (error: unknown) {
      setSaveError(errorMessage(error, 'No se pudo cambiar el origen del negocio'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FullScreenModal
      visible={visible}
      onClose={onClose}
      title="Cambiar origen"
      subtitle="De dónde sale la mercancía del negocio"
      dismissable={!saving}
      footer={
        <View style={styles.footer}>
          <Button title="Cancelar" variant="outline" onPress={onClose} disabled={saving} style={styles.footerButton} />
          <Button
            title={offline ? 'Preparar cambio' : 'Cambiar origen'}
            icon={offline ? 'schedule' : 'local-shipping'}
            onPress={() => void confirm()}
            loading={saving}
            disabled={!ready || checking}
            style={styles.footerButton}
          />
        </View>
      }>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.helper, { color: colors.text.secondary }]}>
          Se conservan el cliente, los productos, los precios, las cuotas y las fotos. Solo cambia la orden de la que
          sale la mercancía y la bodega de cada producto.
        </Text>
        {offline ? (
          <Card variant="muted" style={styles.notice}>
            <MaterialIcons name="wifi-off" size={20} color={colors.warning.dark} />
            <Text testID="draft-origin-offline-notice" style={[styles.helper, styles.flex, { color: colors.text.primary }]}>
              {ORIGEN_PREPARADO_SIN_SENAL}
            </Text>
          </Card>
        ) : null}

        <NegocioOriginOrderPicker
          query={search.query}
          onQueryChange={search.setQuery}
          orders={orders}
          loading={search.loading}
          error={search.error}
          selectedOrder={selectedOrder}
          onSelect={(order) => {
            setSelectedOrder(order);
            setSelectedGroup(null);
            setCheckError(null);
          }}
          onClearSelection={() => {
            setSelectedOrder(null);
            setSelectedGroup(null);
            setCheckError(null);
          }}
          fromLocal={search.fromLocal}
          colors={colors}
        />

        {isRemission ? (
          <NegocioOriginGroupsSection
            groups={groups}
            loading={groupsLoading}
            selectedGroup={selectedGroup}
            onSelectGroup={setSelectedGroup}
            colors={colors}
            disabledReason={(group) => draftOriginGroupBlockReason(group, customerId)}
          />
        ) : null}

        {target ? (
          <View style={styles.section} testID="draft-origin-coverage">
            <Text style={[styles.label, { color: colors.text.secondary }]}>¿La orden trae lo del negocio?</Text>
            {checking ? (
              <View style={styles.row}>
                <ActivityIndicator color={colors.primary.main} />
                <Text style={[styles.helper, { color: colors.text.secondary }]}>Revisando con el servidor…</Text>
              </View>
            ) : null}
            {lines.map((line) => {
              const ok = line.missing_quantity <= 0;
              return (
                <View key={line.product_id} style={styles.row}>
                  <MaterialIcons
                    name={ok ? 'check-circle' : 'error-outline'}
                    size={20}
                    color={ok ? colors.success.main : colors.error.main}
                  />
                  <Text style={[styles.line, styles.flex, { color: ok ? colors.text.primary : colors.error.main }]}>
                    {formatCoverageLine(line)}
                  </Text>
                </View>
              );
            })}
            {blockText ? (
              <Text style={[styles.helper, { color: colors.error.main, fontWeight: '600' }]}>{blockText}</Text>
            ) : null}
          </View>
        ) : null}

        {checkError || saveError ? (
          <Text accessibilityRole="alert" style={[styles.helper, { color: colors.error.main, fontWeight: '600' }]}>
            {saveError || checkError}
          </Text>
        ) : null}
      </ScrollView>
    </FullScreenModal>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xl * 2 },
  helper: { ...Typography.bodySmall },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md },
  section: { gap: Spacing.sm },
  label: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  line: { ...Typography.body },
  flex: { flex: 1 },
  footer: { flexDirection: 'row', gap: Spacing.sm, flex: 1 },
  footerButton: { flex: 1 },
});
