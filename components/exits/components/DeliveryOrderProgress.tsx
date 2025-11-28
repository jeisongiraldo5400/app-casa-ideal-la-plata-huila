import { useExitsStore } from '@/components/exits/infrastructure/store/exitsStore';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export function DeliveryOrderProgress() {
    const {
        selectedDeliveryOrder,
        scannedItemsProgress,
    } = useExitsStore();

    if (!selectedDeliveryOrder) {
        return null;
    }

    const items = selectedDeliveryOrder.items || [];

    // Calcular progreso total
    const totalRequired = items.reduce((sum, item) => sum + item.pending_quantity, 0);
    const totalScanned = Array.from(scannedItemsProgress.values()).reduce((sum, qty) => sum + qty, 0);
    const overallProgress = totalRequired > 0 ? (totalScanned / totalRequired) * 100 : 0;

    return (
        <Card style={styles.card}>
            <View style={styles.header}>
                <Text style={styles.title}>Progreso de Entrega</Text>
                <View style={styles.progressBadge}>
                    <Text style={styles.progressBadgeText}>
                        {Math.round(overallProgress)}%
                    </Text>
                </View>
            </View>

            <Text style={styles.subtitle}>
                Orden #{selectedDeliveryOrder.id.slice(0, 8)} - {selectedDeliveryOrder.customer_name}
            </Text>

            {/* Overall Progress Bar */}
            <View style={styles.overallProgressContainer}>
                <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${overallProgress}%` }]} />
                </View>
                <Text style={styles.progressText}>
                    {totalScanned} / {totalRequired} unidades escaneadas
                </Text>
            </View>

            {/* Items List */}
            <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
                {items.map((item) => {
                    const scanned = scannedItemsProgress.get(item.product_id) || 0;
                    const pending = item.pending_quantity;
                    const itemProgress = pending > 0 ? (scanned / pending) * 100 : 0;
                    const isComplete = scanned >= pending;
                    const hasScanned = scanned > 0;

                    return (
                        <View
                            key={item.id}
                            style={[
                                styles.itemCard,
                                isComplete && styles.itemCardComplete,
                                hasScanned && !isComplete && styles.itemCardInProgress,
                            ]}>

                            <View style={styles.itemHeader}>
                                <View style={styles.itemInfo}>
                                    <Text style={styles.itemName} numberOfLines={2}>
                                        {item.product_name}
                                    </Text>
                                    {item.product_sku && (
                                      <Text style={styles.itemSku}>SKU: {item.product_sku}</Text>
                                    )}
                                    <Text style={styles.itemWarehouse}>
                                        <MaterialIcons name="warehouse" size={12} color={Colors.text.secondary} />
                                        {' '}{item.warehouse_name}
                                    </Text>
                                </View>

                                <View style={styles.itemStatus}>
                                    {isComplete ? (
                                        <MaterialIcons name="check-circle" size={32} color={Colors.success.main} />
                                    ) : hasScanned ? (
                                        <MaterialIcons name="pending" size={32} color={Colors.warning.main} />
                                    ) : (
                                        <MaterialIcons name="radio-button-unchecked" size={32} color={Colors.text.disabled} />
                                    )}
                                </View>
                            </View>

                            <View style={styles.itemQuantities}>
                                <View style={styles.quantityBox}>
                                    <Text style={styles.quantityLabel}>Pendiente</Text>
                                    <Text style={styles.quantityValue}>{pending}</Text>
                                </View>

                                <View style={[styles.quantityBox, styles.quantityBoxScanned]}>
                                    <Text style={styles.quantityLabel}>Escaneado</Text>
                                    <Text style={[styles.quantityValue, styles.quantityValueScanned]}>
                                        {scanned}
                                    </Text>
                                </View>

                                {item.delivered_quantity > 0 && (
                                    <View style={styles.quantityBox}>
                                        <Text style={styles.quantityLabel}>Ya entregado</Text>
                                        <Text style={styles.quantityValue}>{item.delivered_quantity}</Text>
                                    </View>
                                )}
                            </View>

                            {/* Item Progress Bar */}
                            {hasScanned && (
                                <View style={styles.itemProgressContainer}>
                                    <View style={styles.itemProgressBar}>
                                        <View
                                            style={[
                                                styles.itemProgressFill,
                                                isComplete ? styles.itemProgressFillComplete : styles.itemProgressFillPartial,
                                                { width: `${Math.min(itemProgress, 100)}%` },
                                            ]}
                                        />
                                    </View>
                                    <Text style={styles.itemProgressText}>
                                        {Math.round(itemProgress)}%
                                    </Text>
                                </View>
                            )}
                        </View>
                    );
                })}
            </ScrollView>

            {/* Summary */}
            <View style={styles.summary}>
                <View style={styles.summaryRow}>
                    <MaterialIcons name="inventory-2" size={20} color={Colors.text.secondary} />
                    <Text style={styles.summaryText}>
                        {items.filter(item => (scannedItemsProgress.get(item.product_id) || 0) >= item.pending_quantity).length} / {items.length} productos completos
                    </Text>
                </View>
            </View>
        </Card>
    );
}

const styles = StyleSheet.create({
    card: {
        marginBottom: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.text.primary,
    },
    progressBadge: {
        backgroundColor: Colors.primary.main,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    progressBadgeText: {
        fontSize: 14,
        fontWeight: '700',
        color: Colors.primary.contrastText,
    },
    subtitle: {
        fontSize: 14,
        color: Colors.text.secondary,
        marginBottom: 16,
    },
    overallProgressContainer: {
        marginBottom: 20,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: Colors.divider,
    },
    progressBar: {
        height: 8,
        backgroundColor: Colors.divider,
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 8,
    },
    progressFill: {
        height: '100%',
        backgroundColor: Colors.primary.main,
    },
    progressText: {
        fontSize: 14,
        color: Colors.text.secondary,
        textAlign: 'center',
        fontWeight: '600',
    },
    itemsList: {
        maxHeight: 400,
    },
    itemCard: {
        padding: 16,
        marginBottom: 12,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: Colors.divider,
        backgroundColor: Colors.background.paper,
    },
    itemCardInProgress: {
        borderColor: Colors.warning.main,
        backgroundColor: Colors.warning.light + '10',
    },
    itemCardComplete: {
        borderColor: Colors.success.main,
        backgroundColor: Colors.success.light + '10',
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    itemInfo: {
        flex: 1,
        marginRight: 12,
    },
    itemName: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text.primary,
        marginBottom: 4,
    },
    itemSku: {
        fontSize: 12,
        color: Colors.text.secondary,
        marginBottom: 2,
    },
    itemWarehouse: {
        fontSize: 12,
        color: Colors.text.secondary,
        flexDirection: 'row',
        alignItems: 'center',
    },
    itemStatus: {
        justifyContent: 'center',
    },
    itemQuantities: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    quantityBox: {
        flex: 1,
        padding: 8,
        backgroundColor: Colors.background.default,
        borderRadius: 8,
        alignItems: 'center',
    },
    quantityBoxScanned: {
        backgroundColor: Colors.primary.light + '20',
    },
    quantityLabel: {
        fontSize: 11,
        color: Colors.text.secondary,
        marginBottom: 4,
        textTransform: 'uppercase',
        fontWeight: '600',
    },
    quantityValue: {
        fontSize: 20,
        fontWeight: '700',
        color: Colors.text.primary,
    },
    quantityValueScanned: {
        color: Colors.primary.main,
    },
    itemProgressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    itemProgressBar: {
        flex: 1,
        height: 6,
        backgroundColor: Colors.divider,
        borderRadius: 3,
        overflow: 'hidden',
    },
    itemProgressFill: {
        height: '100%',
    },
    itemProgressFillPartial: {
        backgroundColor: Colors.warning.main,
    },
    itemProgressFillComplete: {
        backgroundColor: Colors.success.main,
    },
    itemProgressText: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.text.secondary,
        minWidth: 40,
        textAlign: 'right',
    },
    summary: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: Colors.divider,
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    summaryText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.text.primary,
    },
});
