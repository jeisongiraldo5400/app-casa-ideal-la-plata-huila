import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Card } from '@/components/ui/Card';
import { useExitsList } from '@/components/exits-list/infrastructure/hooks/useExitsList';
import { Colors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';

export function ExitsList() {
  const { exits, loading, searchQuery } = useExitsList();

  // Formatear fecha y hora
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return {
      date: `${day}/${month}/${year}`,
      time: `${hours}:${minutes}`,
    };
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary.main} />
        <Text style={styles.loadingText}>Cargando salidas...</Text>
      </View>
    );
  }

  // Filtrar salidas por búsqueda
  const filteredExits = exits.filter((item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.product?.name?.toLowerCase().includes(query) ||
      item.product?.sku?.toLowerCase().includes(query) ||
      item.product?.barcode?.toLowerCase().includes(query) ||
      item.creator?.email?.toLowerCase().includes(query) ||
      item.creator?.full_name?.toLowerCase().includes(query)
    );
  });

  if (filteredExits.length === 0) {
    return (
      <Card style={styles.emptyCard}>
        <Text style={styles.emptyText}>
          {searchQuery ? 'No se encontraron salidas' : 'No hay salidas registradas'}
        </Text>
      </Card>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {filteredExits.map((item) => {
        if (!item.product || !item.warehouse) {
          return null;
        }

        const { date, time } = formatDateTime(item.created_at);
        const creatorName = item.creator?.full_name || item.creator?.email || 'Usuario desconocido';

        return (
          <Card key={item.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <View style={styles.itemInfo}>
                <Text style={styles.productName}>{item.product.name || 'Sin nombre'}</Text>
                <Text style={styles.productSku}>SKU: {item.product.sku || 'N/A'}</Text>
                {item.product.barcode && (
                  <Text style={styles.productBarcode}>Código: {item.product.barcode}</Text>
                )}
              </View>
              <View style={styles.quantityContainer}>
                <Text style={styles.quantityLabel}>Cantidad</Text>
                <Text style={styles.quantityValue}>{item.quantity || 0}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.detailsContainer}>
              <View style={styles.detailRow}>
                <MaterialIcons name="local-shipping" size={16} color={Colors.text.secondary} />
                <Text style={styles.detailLabel}>Bodega: </Text>
                <Text style={styles.detailValue}>{item.warehouse.name || 'Sin bodega'}</Text>
              </View>

              <View style={styles.detailRow}>
                <MaterialIcons name="person" size={16} color={Colors.text.secondary} />
                <Text style={styles.detailLabel}>Registrado por: </Text>
                <Text style={styles.detailValue} numberOfLines={1}>
                  {creatorName}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <MaterialIcons name="calendar-today" size={16} color={Colors.text.secondary} />
                <Text style={styles.detailLabel}>Fecha: </Text>
                <Text style={styles.detailValue}>{date}</Text>
              </View>

              <View style={styles.detailRow}>
                <MaterialIcons name="access-time" size={16} color={Colors.text.secondary} />
                <Text style={styles.detailLabel}>Hora: </Text>
                <Text style={styles.detailValue}>{time}</Text>
              </View>
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.text.secondary,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  itemCard: {
    marginBottom: 12,
    padding: 16,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  itemInfo: {
    flex: 1,
    marginRight: 12,
  },
  productName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  productSku: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 2,
  },
  productBarcode: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  quantityContainer: {
    alignItems: 'flex-end',
  },
  quantityLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginBottom: 4,
  },
  quantityValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.error.main,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: 12,
  },
  detailsContainer: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text.secondary,
    marginLeft: 6,
    minWidth: 100,
  },
  detailValue: {
    fontSize: 14,
    color: Colors.text.primary,
    flex: 1,
  },
});

