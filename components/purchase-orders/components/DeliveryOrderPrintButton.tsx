import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { useDeliveryOrderPrint } from '../infrastructure/hooks/useDeliveryOrderPrint';

type Props = {
  orderId: string;
  orderNumber: string | null;
  style?: StyleProp<ViewStyle>;
};

/**
 * «Imprimir / compartir PDF» de una orden de entrega o remisión. PDF carta por
 * la hoja de compartir; cada impresión queda registrada y las siguientes salen
 * «COPIA N.º X». Sin señal avisa en vez de imprimir datos viejos.
 */
export function DeliveryOrderPrintButton({ orderId, orderNumber, style }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { printOrder, printing } = useDeliveryOrderPrint();
  const online = useSyncStore((state) => state.online);

  return (
    <TouchableOpacity
      testID={`print-order-${orderId}`}
      style={[styles.button, { borderColor: colors.primary.main + '40', opacity: printing || !online ? 0.6 : 1 }, style]}
      onPress={() => void printOrder(orderId)}
      disabled={printing}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Imprimir ${orderNumber || 'la orden'}`}
    >
      {printing ? (
        <ActivityIndicator size="small" color={colors.primary.main} />
      ) : (
        <MaterialIcons name="print" size={18} color={colors.primary.main} />
      )}
      <Text style={[styles.text, { color: colors.primary.main }]}>
        {printing ? 'Preparando PDF…' : online ? 'Imprimir / compartir PDF' : 'Imprimir (requiere señal)'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  text: { fontSize: 13, fontWeight: '700' },
});
