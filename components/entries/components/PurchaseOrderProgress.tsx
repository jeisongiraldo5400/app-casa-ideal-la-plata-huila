import { useEntriesStore } from '@/components/entries/infrastructure/store/entriesStore';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export function PurchaseOrderProgress() {
    // Suscribirse directamente a todos los valores necesarios para el cálculo del progreso
    // Esto asegura que el componente se re-renderice cuando cualquiera de estos valores cambie
    const selectedPurchaseOrder = useEntriesStore((state) => state.selectedPurchaseOrder);
    const purchaseOrderId = useEntriesStore((state) => state.purchaseOrderId);
    const registeredEntriesCache = useEntriesStore((state) => state.registeredEntriesCache);

    // Convertir Map a string JSON estable para evitar loops infinitos
    // El string solo cambia cuando el contenido real del Map cambia
    const scannedItemsProgressString = useEntriesStore((state) => {
        const map = state.scannedItemsProgress;
        const entries = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
        return JSON.stringify(entries);
    });

    // Recalcular el progreso cada vez que cambien los valores
    // useMemo debe llamarse ANTES de cualquier early return para cumplir con las reglas de hooks
    const progress = useMemo(() => {
        if (!selectedPurchaseOrder || !purchaseOrderId) {
            return null;
        }

        // Recrear el Map desde el string JSON
        const scannedItemsEntries: [string, number][] = JSON.parse(scannedItemsProgressString);
        const scannedItemsMap = new Map(scannedItemsEntries);

        // Mostrar TODOS los productos de la orden
        const items = selectedPurchaseOrder.items || [];

        const normalizedItems = items.map((item) => {
            const orderQuantity = item.quantity;
            const rawRegistered =
                registeredEntriesCache[purchaseOrderId]?.[item.product_id] || 0;
            const registered = Math.min(rawRegistered, orderQuantity);
            const maxPendingAfterRegistered = Math.max(
                orderQuantity - registered,
                0
            );
            const sessionScannedRaw = scannedItemsMap.get(item.product_id) || 0;
            const sessionScanned = Math.min(
                sessionScannedRaw,
                maxPendingAfterRegistered
            );
            const pending = Math.max(
                orderQuantity - registered - sessionScanned,
                0
            );
            const isComplete = pending === 0;

            return {
                item,
                orderQuantity,
                registered,
                sessionScanned,
                pending,
                isComplete,
            };
        });

        const totalRequired = normalizedItems.reduce(
            (sum, x) => sum + x.orderQuantity,
            0
        );
        const totalRegistered = normalizedItems.reduce(
            (sum, x) => sum + x.registered,
            0
        );
        const totalScanned = normalizedItems.reduce(
            (sum, x) => sum + x.sessionScanned,
            0
        );
        const totalCompleted = Math.min(
            totalRegistered + totalScanned,
            totalRequired
        );

        return {
            items: normalizedItems,
            totalRequired,
            totalRegistered,
            totalScanned,
            totalCompleted,
        };
    }, [
        selectedPurchaseOrder,
        purchaseOrderId,
        registeredEntriesCache,
        scannedItemsProgressString,
    ]);

    // Estados locales para UI
    const [isExpanded, setIsExpanded] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [visibleCount, setVisibleCount] = useState(5);

    // Reset visibleCount cuando cambia el searchTerm
    useEffect(() => {
        setVisibleCount(5);
    }, [searchTerm]);

    // Early return si no hay progreso o datos necesarios
    if (!progress || !selectedPurchaseOrder) {
        return null;
    }

    const { items, totalRequired, totalRegistered, totalScanned } = progress;

    // Filtrar items por búsqueda
    const filteredItems = items.filter(({ item }) =>
        item.product?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.product?.sku?.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Paginar items
    const visibleItems = filteredItems.slice(0, visibleCount);
    const hasMoreItems = filteredItems.length > visibleCount;

    // Calcular cuánto faltaba al inicio de esta sesión
    const pendingAtStart = Math.max(totalRequired - totalRegistered, 0);

    // Progreso basado en lo escaneado en esta sesión vs lo que faltaba
    const overallProgress = pendingAtStart > 0
        ? Math.min((totalScanned / pendingAtStart) * 100, 100)
        : 100; // Si no faltaba nada, progreso es 100%

    return (
        <Card style={styles.card}>
            {/* Header colapsable */}
            <TouchableOpacity
                style={styles.header}
                onPress={() => setIsExpanded(!isExpanded)}
                activeOpacity={0.7}
            >
                <View style={styles.headerLeft}>
                    <Text style={styles.title}>Progreso de Recepción</Text>
                    <Text style={styles.subtitle}>
                        Orden #{selectedPurchaseOrder.order_number || selectedPurchaseOrder.id.slice(0, 8)} - {selectedPurchaseOrder.supplier?.name || 'Proveedor'}
                    </Text>
                </View>
                <View style={styles.headerRight}>
                    <View style={styles.progressBadge}>
                        <Text style={styles.progressBadgeText}>
                            {Math.round(overallProgress)}%
                        </Text>
                    </View>
                    <MaterialIcons
                        name={isExpanded ? "expand-less" : "expand-more"}
                        size={28}
                        color={Colors.text.secondary}
                    />
                </View>
            </TouchableOpacity>

            {/* Overall Progress Bar - siempre visible */}
            <View style={styles.overallProgressContainer}>
                <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${overallProgress}%` }]} />
                </View>
                <Text style={styles.progressText}>
                    {totalScanned} / {pendingAtStart} unidades escaneadas en esta sesión
                </Text>
                <Text style={styles.progressSubtext}>
                    ({totalRegistered} ya registradas previamente • {totalRequired} total en la orden)
                </Text>
            </View>

            {/* Contenido expandible */}
            {isExpanded && (
                <>
                    {/* Buscador local */}
                    <View style={styles.searchContainer}>
                        <MaterialIcons name="search" size={20} color={Colors.text.secondary} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Buscar por nombre o SKU..."
                            placeholderTextColor={Colors.text.secondary}
                            value={searchTerm}
                            onChangeText={setSearchTerm}
                        />
                        {searchTerm.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchTerm('')}>
                                <MaterialIcons name="close" size={20} color={Colors.text.secondary} />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Contador de productos */}
                    <Text style={styles.itemsCounter}>
                        Mostrando {visibleItems.length} de {filteredItems.length} productos
                        {searchTerm.length > 0 && ` (filtrado de ${items.length} total)`}
                    </Text>

                    {/* Items List */}
                    <View style={styles.itemsList}>
                        {visibleItems.map(({ item, registered, pending, sessionScanned, isComplete }) => {
                            const itemPending = Math.max(pending, 0);
                            const pendingAtStartForItem = item.quantity - registered;

                            // Progreso del item basado en lo escaneado en sesión vs lo que faltaba
                            const itemProgress = pendingAtStartForItem > 0
                                ? Math.min((sessionScanned / pendingAtStartForItem) * 100, 100)
                                : 100;

                            const hasScanned = sessionScanned > 0;

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
                                            {item.product?.barcode && (
                                                <Text style={styles.itemBarcode}>
                                                    <MaterialIcons name="qr-code" size={12} color={Colors.text.secondary} />
                                                    {' '}{item.product.barcode}
                                                </Text>
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
                                                {sessionScanned}
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
                    </View>

                    {/* Botón Ver más */}
                    {hasMoreItems && (
                        <TouchableOpacity
                            style={styles.loadMoreButton}
                            onPress={() => setVisibleCount(prev => prev + 5)}
                        >
                            <Text style={styles.loadMoreText}>
                                Ver más productos ({filteredItems.length - visibleCount} restantes)
                            </Text>
                            <MaterialIcons name="expand-more" size={20} color={Colors.primary.main} />
                        </TouchableOpacity>
                    )}

                    {/* Summary */}
                    <View style={styles.summary}>
                        <View style={styles.summaryRow}>
                            <MaterialIcons name="inventory-2" size={20} color={Colors.text.secondary} />
                            <Text style={styles.summaryText}>
                                {items.filter(x => x.isComplete).length} / {items.length} productos completos
                            </Text>
                        </View>
                    </View>
                </>
            )}
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
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    headerLeft: {
        flex: 1,
        marginRight: 12,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.text.primary,
        marginBottom: 4,
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
        fontSize: 13,
        color: Colors.text.secondary,
    },
    overallProgressContainer: {
        marginBottom: 16,
        paddingBottom: 16,
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
    progressSubtext: {
        fontSize: 12,
        color: Colors.text.secondary,
        textAlign: 'center',
        marginTop: 4,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.background.default,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 12,
        gap: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: Colors.text.primary,
        padding: 0,
    },
    itemsCounter: {
        fontSize: 12,
        color: Colors.text.secondary,
        marginBottom: 12,
        textAlign: 'center',
    },
    itemsList: {
        // Se expande naturalmente
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
    itemBarcode: {
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
    loadMoreButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        marginTop: 4,
        gap: 4,
    },
    loadMoreText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.primary.main,
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
