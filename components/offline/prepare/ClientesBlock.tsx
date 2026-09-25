import { fetchCustomersPage, type CustomerDirectoryRow } from '@/components/customers/infrastructure/services/customersDirectoryService';
import { useTheme } from '@/components/theme';
import { Card, OptionPickerField, SearchField, SectionHeader, SegmentedControl, StatusChip } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errorMessage';
import { EMPTY_LOCATION_MASTERS, fetchLocationMasters, type LocationMasters } from '@/lib/locations/locationsService';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { OfflineSelectionToggle } from '../OfflineSelectionToggle';
import {
  SELECTION_LIMITS,
  setMisClientes,
  setSyncMode,
  useOfflineSelection,
  type SyncConfig,
  type SyncConfigMeta,
  type SyncMode,
} from '../infrastructure/syncPrefsService';
import { carriedLabel, SelectedList } from './SelectedList';

const MODE_ITEMS = [
  { value: 'todo', label: 'Todos', icon: 'groups' as const },
  { value: 'seleccion', label: 'Elegir', icon: 'checklist' as const },
];

const SEARCH_DEBOUNCE_MS = 350;

function MunicipiosPicker({ online }: { online: boolean }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const municipios = useOfflineSelection('municipios');
  const selectedIds = municipios.selectedIds;
  const [masters, setMasters] = useState<LocationMasters>(EMPTY_LOCATION_MASTERS);
  const [departamentoId, setDepartamentoId] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetchLocationMasters()
      .then((value) => {
        if (!cancelled) setMasters(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const names = useMemo(() => new Map(masters.municipios.map((item) => [item.id, item.nombre])), [masters.municipios]);
  const options = masters.municipios.filter((item) => item.departamento_id === departamentoId);

  return (
    <View style={styles.group} testID="municipios-picker">
      <Text style={[styles.subtitle, { color: colors.text.primary }]}>Municipios</Text>
      <Text style={[styles.caption, { color: colors.text.secondary }]}>
        Todos los clientes de los municipios elegidos (no cuentan contra el tope).
      </Text>
      {selectedIds.length ? (
        <View style={styles.chips}>
          {selectedIds.map((id) => (
            <View key={id} style={[styles.chip, { borderColor: colors.divider }]}>
              <Text style={[styles.caption, { color: colors.text.primary }]}>{names.get(id) ?? 'Municipio'}</Text>
              <Pressable
                accessibilityLabel={`Quitar municipio ${names.get(id) ?? ''}`}
                hitSlop={8}
                disabled={!online}
                onPress={() => void municipios.toggle(id)}
              >
                <MaterialIcons name="close" size={16} color={colors.text.secondary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <OptionPickerField
        value={departamentoId}
        onValueChange={setDepartamentoId}
        options={masters.departamentos.map((item) => ({ value: item.id, label: item.nombre }))}
        placeholder="Elige un departamento"
        modalTitle="Departamento"
        colors={colors}
        disabled={!online}
      />
      {options.map((item) => {
        const checked = municipios.isSelected(item.id);
        return (
          <Pressable
            key={item.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked, disabled: !online }}
            disabled={!online || municipios.isBusy(item.id)}
            onPress={() => void municipios.toggle(item.id)}
            style={[styles.checkRow, { borderColor: colors.divider }]}
          >
            <MaterialIcons
              name={checked ? 'check-box' : 'check-box-outline-blank'}
              size={22}
              color={checked ? colors.primary.main : colors.text.secondary}
            />
            <Text style={[styles.body, { color: colors.text.primary }]}>{item.nombre}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CustomerSearch({ online }: { online: boolean }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<CustomerDirectoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2 || !online) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void fetchCustomersPage({ tab: 'todos', sellerId: null, search: term, page: 1, pageSize: 10 })
        .then((page) => {
          if (!cancelled) setResults(page.customers);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, online]);

  return (
    <View style={styles.group}>
      <Text style={[styles.subtitle, { color: colors.text.primary }]}>Uno a uno</Text>
      <SearchField value={search} onChangeText={setSearch} placeholder="Buscar cliente por nombre o documento…" />
      {loading ? <ActivityIndicator color={colors.primary.main} /> : null}
      {results.map((customer) => (
        <View key={customer.id} style={[styles.resultRow, { borderColor: colors.divider }]}>
          <Text style={[styles.body, { color: colors.text.primary }]} numberOfLines={1}>
            {customer.name}
          </Text>
          <Text style={[styles.caption, { color: colors.text.secondary }]} numberOfLines={1}>
            {[customer.id_number, customer.municipio_name].filter(Boolean).join(' · ') || 'Sin documento'}
          </Text>
          <OfflineSelectionToggle domain="clientes" id={customer.id} compact />
        </View>
      ))}
    </View>
  );
}

/**
 * «Mis clientes»: flag del servidor (`set_mobile_sync_mis_clientes`). No
 * marca ids: no gasta el tope y los clientes que te asignen después entran
 * solos en la próxima descarga.
 */
function MyCustomersToggle({ online, enabled }: { online: boolean; enabled: boolean }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [busy, setBusy] = useState(false);

  const change = async (value: boolean) => {
    if (!online) {
      Alert.alert('Sin conexión', 'Necesitas señal para cambiar qué llevar en el teléfono.');
      return;
    }
    setBusy(true);
    try {
      await setMisClientes(value);
    } catch (err) {
      Alert.alert('No se pudo cambiar', errorMessage(err, 'Inténtalo de nuevo.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.switchRow}>
      <View style={styles.flex}>
        <Text style={[styles.subtitle, { color: colors.text.primary }]}>Mis clientes</Text>
        <Text style={[styles.caption, { color: colors.text.secondary }]}>
          Todos los clientes asignados a ti, también los que te asignen después.
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.primary.main} />
      ) : (
        <Switch
          testID="mis-clientes-switch"
          accessibilityLabel="Llevar mis clientes"
          value={enabled}
          disabled={!online}
          onValueChange={(value) => void change(value)}
          trackColor={{ false: colors.divider, true: colors.primary.light }}
          thumbColor={enabled ? colors.primary.main : colors.text.secondary}
        />
      )}
    </View>
  );
}

function Estimate({ estimated }: { estimated: SyncConfigMeta['estimated'] }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  if (!estimated) return null;
  return (
    <Text style={[styles.caption, { color: colors.text.primary }]} testID="selection-estimate">
      Total estimado al descargar: {estimated.clientes} {estimated.clientes === 1 ? 'cliente' : 'clientes'} ·{' '}
      {estimated.negocios} {estimated.negocios === 1 ? 'negocio' : 'negocios'}.
    </Text>
  );
}

/** Aviso cuando Clientes está en «Elegir» sin nada elegido. */
export const NOTHING_CHOSEN_MESSAGE =
  'No elegiste clientes: solo bajarán los negocios que son tuyos. Activa Mis clientes o elige municipios.';

/**
 * Clientes en «Elegir» sin municipios, sin «Mis clientes» y sin ninguno uno a
 * uno: al descargar el teléfono se quedaría sin clientes (ni sus negocios).
 */
export function clientesNothingChosen(config: SyncConfig, meta: Pick<SyncConfigMeta, 'misClientes'>): boolean {
  return (
    config.clientes.mode === 'seleccion' &&
    !config.clientes.count &&
    !config.municipios.count &&
    !meta.misClientes
  );
}

/** Bloque «Clientes» de «Preparar el teléfono»: Todos / Elegir. */
export function ClientesBlock({
  config,
  meta,
  online,
  dateSlot,
  recaudador = false,
}: {
  config: SyncConfig;
  meta: SyncConfigMeta;
  online: boolean;
  dateSlot: React.ReactNode;
  /** Recaudador puro: solo le bajan clientes de negocios que puede cobrar. */
  recaudador?: boolean;
}) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [changing, setChanging] = useState(false);
  const mode = config.clientes.mode;
  const choosing = mode === 'seleccion';

  const applyMode = useCallback(async (next: SyncMode) => {
    setChanging(true);
    try {
      await setSyncMode('clientes', next);
    } catch (err) {
      Alert.alert('No se pudo cambiar', errorMessage(err, 'Inténtalo de nuevo.'));
    } finally {
      setChanging(false);
    }
  }, []);

  const onChange = (value: string) => {
    if (!online) {
      Alert.alert('Sin conexión', 'Necesitas señal para cambiar qué llevar en el teléfono.');
      return;
    }
    if (value === mode) return;
    if (value === 'todo') {
      void applyMode('todo');
      return;
    }
    const count = config.clientes.count;
    const municipios = config.municipios.count;
    Alert.alert(
      'Elegir clientes',
      `Hoy tienes ${count} ${count === 1 ? 'cliente elegido' : 'clientes elegidos'} y ${municipios} ${municipios === 1 ? 'municipio' : 'municipios'}. Al descargar, el teléfono solo llevará esos y los clientes de tus negocios; el resto se borrará del teléfono (lo pendiente de enviar no se toca).`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cambiar', onPress: () => void applyMode('seleccion') },
      ]
    );
  };

  return (
    <Card style={styles.card}>
      <View testID="domain-card-clientes" style={styles.cardBody}>
        <SectionHeader
          title="Clientes"
          action={
            choosing ? (
              <StatusChip
                label={carriedLabel('clientes', config.clientes.count)}
                tone={config.clientes.count || config.municipios.count || meta.misClientes ? 'success' : 'warning'}
                icon="people"
              />
            ) : (
              <StatusChip label="Todos" tone="info" icon="people" />
            )
          }
        />
        <SegmentedControl items={MODE_ITEMS} value={mode} onChange={onChange} />
        {changing ? <ActivityIndicator color={colors.primary.main} /> : null}
        <Text style={[styles.caption, { color: colors.text.secondary }]}>
          {recaudador
            ? choosing
              ? 'Como recaudador solo bajan clientes de negocios que puedes cobrar: de los municipios y clientes que elijas, van los que tengan un negocio a tu cargo.'
              : 'Como recaudador solo bajan los clientes de los negocios que puedes cobrar (titular y codeudor), no todo el directorio.'
            : choosing
              ? `Van los clientes de tus negocios, los de los municipios elegidos y los que elijas uno a uno (hasta ${SELECTION_LIMITS.clientes}).`
              : 'Se lleva el directorio completo de clientes y todos los negocios de tu alcance.'}
        </Text>
        {clientesNothingChosen(config, meta) ? (
          <Text style={[styles.caption, { color: colors.warning.main }]} testID="clientes-nothing-chosen">
            {NOTHING_CHOSEN_MESSAGE}
          </Text>
        ) : null}
        {choosing ? (
          <>
            <MunicipiosPicker online={online} />
            <MyCustomersToggle online={online} enabled={meta.misClientes} />
            <CustomerSearch online={online} />
            <View style={styles.group}>
              <Text style={[styles.subtitle, { color: colors.text.primary }]}>Elegidos uno a uno</Text>
              <SelectedList domain="clientes" count={config.clientes.count} disabled={!online} />
            </View>
            <Estimate estimated={meta.estimated} />
          </>
        ) : null}
        {dateSlot}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.md },
  cardBody: { gap: Spacing.md },
  group: { gap: Spacing.sm },
  subtitle: { ...Typography.bodySmallStrong },
  body: { ...Typography.bodySmall, flex: 1 },
  caption: { ...Typography.caption },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 44, borderTopWidth: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  flex: { flex: 1 },
  resultRow: { gap: 2, borderTopWidth: 1, paddingTop: Spacing.sm },
});
