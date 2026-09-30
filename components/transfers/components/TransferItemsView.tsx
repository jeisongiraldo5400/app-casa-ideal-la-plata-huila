import { useTheme } from '@/components/theme';
import { Card, SectionHeader } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TransferDetail } from '../utils/transferModel';
import { maxReceive } from '../utils/transferRules';

/** Líneas del traslado en solo lectura (cantidades por etapa). */
export function TransferItemsView({ detail }: { detail: TransferDetail }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  return (
    <View style={styles.container}>
      <SectionHeader title="Productos" hint={`${detail.items.length}`} />
      {detail.items.map((item) => {
        const parts = [`Pedido: ${item.quantity}`];
        if (item.dispatchedQuantity > 0 || detail.order.dispatchedAt) parts.push(`Despachado: ${item.dispatchedQuantity}`);
        if (item.receivedQuantity > 0) parts.push(`Recibido: ${item.receivedQuantity}`);
        if (item.damagedQuantity > 0) parts.push(`Averiado: ${item.damagedQuantity}`);
        const pending = maxReceive(item);
        if (pending > 0) parts.push(`En camino: ${pending}`);
        if (item.returnPendingQuantity > 0) parts.push(`Volviendo al origen: ${item.returnPendingQuantity}`);
        if (item.returnedQuantity > 0) parts.push(`Devuelto: ${item.returnedQuantity}`);
        if (item.writtenOffQuantity > 0) parts.push(`De baja: ${item.writtenOffQuantity}`);
        return (
          <Card key={item.id} variant="outlined" style={styles.card}>
            <Text style={[styles.product, { color: colors.text.primary }]}>{item.productName}</Text>
            {item.productSku ? <Text style={[styles.meta, { color: colors.text.secondary }]}>SKU {item.productSku}</Text> : null}
            <Text style={[styles.meta, { color: colors.text.secondary }]}>{parts.join(' · ')}</Text>
            {item.serials.length ? (
              <Text style={[styles.meta, { color: colors.text.secondary }]}>
                Seriales: {item.serials.map((serial) => serial.serialNumber).join(', ')}
              </Text>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.md },
  card: { gap: 2 },
  product: { ...Typography.bodyStrong },
  meta: { ...Typography.caption },
});
