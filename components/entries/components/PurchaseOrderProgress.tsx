import { useEntriesStore } from '@/components/entries/infrastructure/store/entriesStore';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export function PurchaseOrderProgress() {
    const {
        selectedPurchaseOrder,
        scannedItemsProgress,
        registeredEntriesCache,
        purchaseOrderId,
    } = useEntriesStore();

    if (!selectedPurchaseOrder || !purchaseOrderId) {
        return null;
    }

    const items = selectedPurchaseOrder.items || [];

    // Calcular cantidades clamped por producto
    const normalizedPerItem = items.map((item) => {
        const rawRegistered = registeredEntriesCache[purchaseOrderId]?.[item.product_id] || 0;
        const registered = Math.min(rawRegistered, item.quantity);
        const pending = Math.max(item.quantity - registered, 0);
        const scannedRaw = scannedItemsProgress.get(item.product_id) || 0;
        const scanned = Math.min(scannedRaw, pending);
        return { item, registered, pending, scanned };
    });

    // Calcular progreso total
    const totalRequired = normalizedPerItem.reduce((sum, x) => sum + x.item.quantity, 0);
    const totalRegistered = normalizedPerItem.reduce((sum, x) => sum + x.registered, 0);
    const totalScannedInSession = normalizedPerItem.reduce((sum, x) => sum + x.scanned, 0);
    const totalCompleted = Math.min(totalRegistered + totalScannedInSession, totalRequired);
    const overallProgress = totalRequired > 0 ? (totalCompleted / totalRequired) * 100 : 0;

    return (
        <Card style={styles.card}>
            <View style={styles.header}>
                <Text style={styles.title}>Progreso de Recepción</Text>
                <View style={styles.progressBadge}>
                    <Text style={styles.progressBadgeText}>
                        {Math.round(overallProgress)}%
                    </Text>
                </View>
            </View>

            <Text style={styles.subtitle}>
                Orden #{selectedPurchaseOrder.id.slice(0, 8)} - {selectedPurchaseOrder.supplier?.name || 'Proveedor'}
            </Text>

            {/* Overall Progress Bar */}
            <View style={styles.overallProgressContainer}>
                <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${overallProgress}%` }]} />
                </View>
                <Text style={styles.progressText}>
                    {totalCompleted} / {totalRequired} unidades recibidas
                </Text>
            </View>

            {/* Items List */}
            <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
                {normalizedPerItem.map(({ item, registered, pending, scanned }) => {
                    const itemPending = Math.max(pending, 0);
                    const itemProgress = itemPending > 0 ? (scanned / itemPending) * 100 : 0;
                    const isComplete = itemPending === 0;
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
                                        {item.product?.name || 'Producto sin nombre'}
                                    </Text>
                                    {item.product?.sku && (
                                      <Text style={styles.itemSku}>SKU: {item.product.sku}</Text>
                                    )}
                                </View>

                                <View style={styles.itemStatus}>
                                    {isComplete ? (
                                        <MaterialIcons name="check-circle" size={32} color={Colors.success.main} />
                                    ) : hasScanned ? (
                                        <MaterialIcons name="pending" size={32} color={Colors.warning.main} />
                                    ) : (
                                        <MaterialIcons name="radio-button-unchecked" size={32} color={Colors.text.secondary} />
                                    )}
                                </View>
                            </View>

                            <View style={styles.itemQuantities}>
                                <View style={styles.quantityBox}>
                                    <Text style={styles.quantityLabel}>Pendiente</Text>
                                    <Text style={styles.quantityValue}>{itemPending}</Text>
                                </View>

                                <View style={[styles.quantityBox, styles.quantityBoxScanned]}>
                                    <Text style={styles.quantityLabel}>Escaneado</Text>
                                    <Text style={[styles.quantityValue, styles.quantityValueScanned]}>
                                        {scanned}
                                    </Text>
                                </View>

                                {registered > 0 && (
                                    <View style={styles.quantityBox}>
                                        <Text style={styles.quantityLabel}>Ya registrado</Text>
                                        <Text style={styles.quantityValue}>{registered}</Text>
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
                        {normalizedPerItem.filter(x => x.pending === 0).length} / {items.length} productos completos
                    </Text>
                </View>
            </View>
        </Card>
    );
}

const styles = StyleSheet.create({
    card: {
        margin: 20,
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

