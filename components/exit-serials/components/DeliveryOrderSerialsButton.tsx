import { useTheme } from '@/components/theme';
import { Radius, getColors } from '@/constants/theme';
import { formatPaymentDateTime } from '@/lib/localDate';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  DeliveryOrderSerialRecord,
  captureMethodLabel,
  serialStatusLabel,
} from '../infrastructure/services/exitSerialsService';

interface DeliveryOrderSerialsButtonProps {
  serials: DeliveryOrderSerialRecord[] | undefined;
}

const MONOSPACE = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * Botón "Seriales (N)" de un producto de la orden. Al tocarlo despliega los
 * seriales entregados: serial, fecha de la salida, bodega, si se escaneó o se
 * digitó y su estado. Sin seriales no se muestra.
 */
export function DeliveryOrderSerialsButton({ serials }: DeliveryOrderSerialsButtonProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [expanded, setExpanded] = useState(false);

  if (!serials || serials.length === 0) return null;

  const statusColor = (serial: DeliveryOrderSerialRecord) => {
    if (serial.releasedReason === 'returned') return colors.warning.main;
    if (serial.releasedReason === 'exit_cancelled') return colors.text.secondary;
    return colors.success.main;
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${expanded ? 'Ocultar' : 'Ver'} seriales entregados (${serials.length})`}
        onPress={() => setExpanded((current) => !current)}
        style={[styles.button, { backgroundColor: colors.primary.main + '12', borderColor: colors.primary.main + '40' }]}
        activeOpacity={0.7}
      >
        <MaterialIcons name="qr-code-2" size={16} color={colors.primary.main} />
        <Text style={[styles.buttonText, { color: colors.primary.main }]}>Seriales ({serials.length})</Text>
        <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={18} color={colors.primary.main} />
      </TouchableOpacity>

      {expanded ? (
        <View style={[styles.list, { borderColor: colors.divider, backgroundColor: colors.background.default }]}>
          {serials.map((serial, index) => {
            const released = serial.releasedReason !== null;
            const color = statusColor(serial);
            return (
              <View
                key={`${serial.inventoryExitId}-${serial.normalized}-${index}`}
                style={[
                  styles.row,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
                ]}
              >
                <View style={styles.rowTop}>
                  <Text
                    style={[
                      styles.serial,
                      { color: colors.text.primary },
                      released && styles.released,
                    ]}
                  >
                    {serial.serial}
                  </Text>
                  <View style={[styles.status, { backgroundColor: color + '1A' }]}>
                    <Text style={[styles.statusText, { color }]}>{serialStatusLabel(serial.releasedReason)}</Text>
                  </View>
                </View>
                <Text style={[styles.meta, { color: colors.text.secondary }]}>
                  {formatPaymentDateTime(serial.exitCreatedAt)}
                  {serial.warehouseName ? ` · ${serial.warehouseName}` : ''}
                  {` · ${captureMethodLabel(serial.method)}`}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
    gap: 6,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    borderWidth: 1,
    borderRadius: Radius.chip,
    paddingHorizontal: 10,
    minHeight: 34,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  list: {
    borderWidth: 1,
    borderRadius: Radius.chip,
    paddingHorizontal: 10,
  },
  row: {
    paddingVertical: 8,
    gap: 3,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  serial: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: MONOSPACE,
  },
  released: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  status: {
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  meta: {
    fontSize: 11,
  },
});
