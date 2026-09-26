import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { useOfflineSelection } from '@/components/offline/infrastructure/syncPrefsService';
import { formatLastDownloadTime } from '@/lib/offline/sync/downloadData';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useLocalOfflineOrders } from '../infrastructure/hooks/useLocalOfflineOrders';

/**
 * Solo las remisiones y las órdenes de cliente pueden ser origen de un negocio
 * sin señal; una cancelada no sirve para nada. Lo demás (si ya tiene negocio,
 * si ya no queda saldo) lo decide el servidor al armar la foto.
 */
export function canTakeOrderOffline(order: { order_type?: string | null; status?: string | null }): boolean {
  if (order.status === 'cancelled') return false;
  return order.order_type === 'remission' || order.order_type === 'customer';
}

/**
 * Quién lleva órdenes en el teléfono: quien crea negocios (admin, vendedor o
 * gestor de cobro). Es la misma regla que `fn_mobile_sync_orders_allowed()`
 * (orders_allowed, 20261201120000): el bodeguero puro y el recaudador puro no
 * crean negocios y el servidor les rechazaría la marca.
 */
export function canCarryOrdersOnPhone(roleNames: readonly string[]): boolean {
  const roles = new Set(roleNames.map((name) => name.trim().toLowerCase()));
  return roles.has('admin') || roles.has('vendedor') || roles.has('gestor de cobro');
}

export function useCanCarryOrdersOnPhone(): boolean {
  const { roles } = useUserRoles();
  return canCarryOrdersOnPhone(roles.map((userRole) => userRole.role?.nombre ?? ''));
}

type Props = {
  orderId: string;
  orderNumber?: string | null;
};

/** Marcar no descarga (contrato v2): hay que pulsar «Descargar». */
export const PENDIENTE_DE_DESCARGAR = 'Pendiente de descargar · pulsa Descargar en Preparar el teléfono';

/**
 * «Llevar en el teléfono / Quitar del teléfono» de una orden de entrega, con
 * el distintivo «En el teléfono». Las órdenes nunca bajan todas: el vendedor
 * marca con señal las que va a usar en el campo (la remisión del camión) y su
 * foto baja cuando pulsa «Descargar» en Preparar el teléfono: nada baja solo.
 */
export function OfflineOrderToggle({ orderId, orderNumber }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const selection = useOfflineSelection('ordenes');
  const localOrders = useLocalOfflineOrders();
  const online = useSyncStore((state) => state.online);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  if (!selection.supported) return null;

  const selected = selection.isSelected(orderId);
  const local = localOrders.get(orderId);
  const downloadedAt = formatLastDownloadTime(local?.snapshotAt ?? null);

  const status = !selected
    ? null
    : local && !local.usable
    ? local.unusableReason || 'Ya no se puede usar para un negocio.'
    : local
    ? downloadedAt
      ? `Descargada ${downloadedAt}`
      : 'Descargada'
    : null;
  const pendingDownload = selected && !local;

  const handlePress = async () => {
    if (busy) return;
    setBusy(true);
    // `toggle` nunca lanza y ya avisa si falla: aquí no se muestra otra alerta.
    await selection.toggle(orderId);
    setBusy(false);
  };

  const label = selected ? 'Quitar del teléfono' : 'Llevar en el teléfono';
  return (
    <View style={styles.row} testID={`offline-order-${orderId}`}>
      {selected ? (
        <View style={styles.statusArea}>
          <View style={[styles.chip, { backgroundColor: colors.success.main + '18' }]}>
            <MaterialIcons name="smartphone" size={14} color={colors.success.main} />
            <Text style={[styles.chipText, { color: colors.success.main }]}>En el teléfono</Text>
          </View>
          {status ? (
            <Text
              style={[styles.status, { color: local && !local.usable ? colors.warning.main : colors.text.secondary }]}
              numberOfLines={2}
            >
              {status}
            </Text>
          ) : null}
          {pendingDownload ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Ir a Preparar el teléfono"
              onPress={() => router.push('/datos-sin-conexion' as never)}
              hitSlop={6}
            >
              <Text style={[styles.status, { color: colors.primary.main }]} numberOfLines={2}>
                {PENDIENTE_DE_DESCARGAR}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.statusArea} />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={orderNumber ? `${label}: ${orderNumber}` : label}
        accessibilityState={{ disabled: busy || !online, selected }}
        disabled={busy || !online}
        onPress={handlePress}
        hitSlop={6}
        style={[
          styles.button,
          {
            borderColor: selected ? colors.divider : colors.primary.main,
            opacity: !online ? 0.5 : 1,
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.primary.main} />
        ) : (
          <MaterialIcons
            name={selected ? 'phonelink-erase' : 'phonelink-ring'}
            size={16}
            color={selected ? colors.text.secondary : colors.primary.main}
          />
        )}
        <Text style={[styles.buttonText, { color: selected ? colors.text.secondary : colors.primary.main }]}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  statusArea: { flex: 1, gap: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  chipText: { fontSize: 11, fontWeight: '700' },
  status: { fontSize: 11 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  buttonText: { fontSize: 12, fontWeight: '700' },
});
