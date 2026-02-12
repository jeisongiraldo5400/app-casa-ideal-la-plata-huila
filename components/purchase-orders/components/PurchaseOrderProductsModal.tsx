import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { PurchaseOrderItem } from '../types';

interface PurchaseOrderProductsModalProps {
    visible: boolean;
    onClose: () => void;
    orderId: string;
    orderNumber: string;
}

export function PurchaseOrderProductsModal({
    visible,
    onClose,
    orderId,
    orderNumber,
}: PurchaseOrderProductsModalProps) {
    const { isDark } = useTheme();
    const colors = getColors(isDark);

    const [items, setItems] = useState<PurchaseOrderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [visibleCount, setVisibleCount] = useState(10);

    useEffect(() => {
        if (visible && orderId) {
            loadOrderItems();
        }
    }, [visible, orderId]);

    useEffect(() => {
        setVisibleCount(10);
    }, [searchTerm]);

    const loadOrderItems = async () => {
        setLoading(true);
        setError(null);

        try {
            // 1. Cargar items de la orden de compra
            const { data: orderItems, error: orderError } = await supabase
                .from('purchase_order_items')
                .select(`
                    id,
                    product_id,
                    quantity,
                    product:products(id, name, sku, barcode)
                `)
                .eq('purchase_order_id', orderId)
                .is('deleted_at', null);

            if (orderError) {
                console.error('Error loading order items:', orderError);
                setError(orderError.message);
                setLoading(false);
                return;
            }

            // 2. Cargar entradas de inventario registradas para esta orden
            const { data: entriesData, error: entriesError } = await supabase
                .from('inventory_entries')
                .select('product_id, quantity')
                .eq('purchase_order_id', orderId)
                .is('deleted_at', null);

            if (entriesError) {
                console.error('Error loading inventory entries:', entriesError);
                // Continue without entries data
            }

            // 3. Agrupar entradas por product_id
            const registeredByProduct: Record<string, number> = {};
            (entriesData || []).forEach((entry: { product_id: string; quantity: number }) => {
                registeredByProduct[entry.product_id] =
                    (registeredByProduct[entry.product_id] || 0) + entry.quantity;
            });

            // 4. Transformar items con progreso
            const transformedItems: PurchaseOrderItem[] = (orderItems || []).map((item: any) => {
                const quantity = item.quantity || 0;
                const registered = Math.min(registeredByProduct[item.product_id] || 0, quantity);
                const pending = Math.max(quantity - registered, 0);

                return {
                    id: item.id,
                    product_id: item.product_id,
                    product_name: item.product?.name || 'Producto sin nombre',
                    product_sku: item.product?.sku || null,
                    product_barcode: item.product?.barcode || null,
                    quantity,
                    registered_quantity: registered,
                    pending_quantity: pending,
                    is_complete: pending === 0,
                };
            });

            setItems(transformedItems);
            setLoading(false);
        } catch (err: any) {
            console.error('Error loading order items:', err);
            setError(err.message || 'Error al cargar los productos');
            setLoading(false);
        }
    };

    // Filtrar items por búsqueda
    const filteredItems = useMemo(() => {
        if (!searchTerm) return items;
        const term = searchTerm.toLowerCase();
        return items.filter(item =>
            item.product_name.toLowerCase().includes(term) ||
            (item.product_sku?.toLowerCase().includes(term)) ||
            (item.product_barcode?.toLowerCase().includes(term))
        );
    }, [items, searchTerm]);

    // Paginar items
    const visibleItems = filteredItems.slice(0, visibleCount);
    const hasMoreItems = filteredItems.length > visibleCount;

    // Calcular totales
    const totals = useMemo(() => {
        const total_items = items.length;
        const completed_items = items.filter(i => i.is_complete).length;
        const pending_items = total_items - completed_items;
        const total_quantity = items.reduce((sum, i) => sum + i.quantity, 0);
        const registered_quantity = items.reduce((sum, i) => sum + i.registered_quantity, 0);
        const pending_quantity = items.reduce((sum, i) => sum + i.pending_quantity, 0);
        const progress = total_quantity > 0 ? (registered_quantity / total_quantity) * 100 : 0;

        return {
            total_items,
            completed_items,
            pending_items,
            total_quantity,
            registered_quantity,
            pending_quantity,
            progress,
        };
    }, [items]);

    const handleClose = () => {
        setSearchTerm('');
        setVisibleCount(10);
        onClose();
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
            onRequestClose={handleClose}
        >
            <View style={styles.overlay}>
                <View style={[styles.modalContainer, { backgroundColor: colors.background.paper }]}>
                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: colors.divider }]}>
                        <View style={styles.headerContent}>
                            <MaterialIcons name="inventory" size={24} color={colors.primary.main} />
                            <View style={styles.headerText}>
                                <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
                                    Productos de la Orden
                                </Text>
                                <Text style={[styles.headerSubtitle, { color: colors.text.secondary }]}>
                                    OC #{orderNumber}
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                            <MaterialIcons name="close" size={24} color={colors.text.secondary} />
                        </TouchableOpacity>
                    </View>

                    {/* Progreso general */}
                    {!loading && !error && (
                        <View style={[styles.progressSection, { backgroundColor: colors.background.default }]}>
                            <View style={styles.progressHeader}>
                                <Text style={[styles.progressTitle, { color: colors.text.primary }]}>
                                    Progreso de Entradas
                                </Text>
                                <View style={[styles.progressBadge, { backgroundColor: colors.primary.main }]}>
                                    <Text style={[styles.progressBadgeText, { color: colors.primary.contrastText }]}>
                                        {Math.round(totals.progress)}%
                                    </Text>
                                </View>
                            </View>
                            <View style={[styles.progressBar, { backgroundColor: colors.divider }]}>
                                <View
                                    style={[
                                        styles.progressFill,
                                        {
                                            width: `${totals.progress}%`,
                                            backgroundColor: totals.progress >= 100 ? colors.success.main : colors.primary.main
                                        }
                                    ]}
                                />
                            </View>
                            <View style={styles.progressStats}>
                                <View style={styles.statItem}>
                                    <Text style={[styles.statValue, { color: colors.success.main }]}>
                                        {totals.completed_items}
                                    </Text>
                                    <Text style={[styles.statLabel, { color: colors.text.secondary }]}>
                                        Completados
                                    </Text>
                                </View>
                                <View style={styles.statItem}>
                                    <Text style={[styles.statValue, { color: colors.warning.main }]}>
                                        {totals.pending_items}
                                    </Text>
                                    <Text style={[styles.statLabel, { color: colors.text.secondary }]}>
                                        Pendientes
                                    </Text>
                                </View>
                                <View style={styles.statItem}>
                                    <Text style={[styles.statValue, { color: colors.text.primary }]}>
                                        {totals.registered_quantity}/{totals.total_quantity}
                                    </Text>
                                    <Text style={[styles.statLabel, { color: colors.text.secondary }]}>
                                        Unidades
                                    </Text>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Contenido */}
                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={colors.primary.main} />
                            <Text style={[styles.loadingText, { color: colors.text.secondary }]}>
                                Cargando productos...
                            </Text>
                        </View>
                    ) : error ? (
                        <View style={styles.errorContainer}>
                            <MaterialIcons name="error-outline" size={48} color={colors.error.main} />
                            <Text style={[styles.errorText, { color: colors.error.main }]}>{error}</Text>
                            <TouchableOpacity
                                style={[styles.retryButton, { backgroundColor: colors.primary.main }]}
                                onPress={loadOrderItems}
                            >
                                <Text style={[styles.retryButtonText, { color: colors.primary.contrastText }]}>
                                    Reintentar
                                </Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.contentWrapper}>
                            {/* Buscador */}
                            <View style={[styles.searchContainer, { backgroundColor: colors.background.default }]}>
                                <MaterialIcons name="search" size={20} color={colors.text.secondary} />
                                <TextInput
                                    style={[styles.searchInput, { color: colors.text.primary }]}
                                    placeholder="Buscar por nombre, SKU o código..."
                                    placeholderTextColor={colors.text.secondary}
                                    value={searchTerm}
                                    onChangeText={setSearchTerm}
                                />
                                {searchTerm.length > 0 && (
                                    <TouchableOpacity onPress={() => setSearchTerm('')}>
                                        <MaterialIcons name="close" size={20} color={colors.text.secondary} />
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* Contador */}
                            <Text style={[styles.itemsCounter, { color: colors.text.secondary }]}>
                                Mostrando {visibleItems.length} de {filteredItems.length} productos
                                {searchTerm.length > 0 && ` (filtrado de ${items.length} total)`}
                            </Text>

                            {/* Lista de productos */}
                            <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
                                {visibleItems.map((item) => (
                                    <View
                                        key={item.id}
                                        style={[
                                            styles.itemCard,
                                            { borderColor: colors.divider, backgroundColor: colors.background.paper },
                                            item.is_complete && { borderColor: colors.success.main, backgroundColor: colors.success.main + '10' },
                                            !item.is_complete && item.registered_quantity > 0 && { borderColor: colors.warning.main, backgroundColor: colors.warning.main + '10' },
                                        ]}
                                    >
                                        <View style={styles.itemHeader}>
                                            <View style={styles.itemInfo}>
                                                <Text style={[styles.itemName, { color: colors.text.primary }]} numberOfLines={2}>
                                                    {item.product_name}
                                                </Text>
                                                {item.product_sku && (
                                                    <Text style={[styles.itemSku, { color: colors.text.secondary }]}>
                                                        SKU: {item.product_sku}
                                                    </Text>
                                                )}
                                                {item.product_barcode && (
                                                    <View style={styles.barcodeRow}>
                                                        <MaterialIcons name="qr-code" size={12} color={colors.text.secondary} />
                                                        <Text style={[styles.itemBarcode, { color: colors.text.secondary }]}>
                                                            {item.product_barcode}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                            <View style={styles.itemStatus}>
                                                {item.is_complete ? (
                                                    <MaterialIcons name="check-circle" size={24} color={colors.success.main} />
                                                ) : item.registered_quantity > 0 ? (
                                                    <MaterialIcons name="pending" size={24} color={colors.warning.main} />
                                                ) : (
                                                    <MaterialIcons name="hourglass-empty" size={24} color={colors.text.secondary} />
                                                )}
                                            </View>
                                        </View>

                                        <View style={[styles.itemQuantities, { borderTopColor: colors.divider }]}>
                                            <View style={styles.quantityItem}>
                                                <Text style={[styles.quantityLabel, { color: colors.text.secondary }]}>
                                                    En orden
                                                </Text>
                                                <Text style={[styles.quantityValue, { color: colors.text.primary }]}>
                                                    {item.quantity}
                                                </Text>
                                            </View>
                                            <View style={styles.quantityItem}>
                                                <Text style={[styles.quantityLabel, { color: colors.text.secondary }]}>
                                                    Registrado
                                                </Text>
                                                <Text style={[styles.quantityValue, { color: colors.success.main }]}>
                                                    {item.registered_quantity}
                                                </Text>
                                            </View>
                                            <View style={styles.quantityItem}>
                                                <Text style={[styles.quantityLabel, { color: colors.text.secondary }]}>
                                                    Pendiente
                                                </Text>
                                                <Text style={[styles.quantityValue, {
                                                    color: item.pending_quantity > 0 ? colors.warning.main : colors.success.main
                                                }]}>
                                                    {item.pending_quantity}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                ))}

                                {/* Botón ver más */}
                                {hasMoreItems && (
                                    <TouchableOpacity
                                        style={styles.loadMoreButton}
                                        onPress={() => setVisibleCount(prev => prev + 10)}
                                    >
                                        <Text style={[styles.loadMoreText, { color: colors.primary.main }]}>
                                            Ver más productos ({filteredItems.length - visibleCount} restantes)
                                        </Text>
                                        <MaterialIcons name="expand-more" size={20} color={colors.primary.main} />
                                    </TouchableOpacity>
                                )}

                                {/* Espacio al final */}
                                <View style={{ height: 20 }} />
                            </ScrollView>
                        </View>
                    )}

                    {/* Footer con botón cerrar */}
                    <View style={[styles.footer, { borderTopColor: colors.divider }]}>
                        <TouchableOpacity
                            style={[styles.closeFooterButton, { backgroundColor: colors.primary.main }]}
                            onPress={handleClose}
                        >
                            <Text style={[styles.closeFooterButtonText, { color: colors.primary.contrastText }]}>
                                Cerrar
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        flex: 1,
        maxHeight: '90%',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    headerText: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    headerSubtitle: {
        fontSize: 14,
        marginTop: 2,
    },
    closeButton: {
        padding: 4,
    },
    contentWrapper: {
        flex: 1,
    },
    progressSection: {
        padding: 16,
        margin: 16,
        marginBottom: 0,
        borderRadius: 12,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    progressTitle: {
        fontSize: 16,
        fontWeight: '600',
    },
    progressBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
    },
    progressBadgeText: {
        fontSize: 14,
        fontWeight: '700',
    },
    progressBar: {
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 12,
    },
    progressFill: {
        height: '100%',
        borderRadius: 4,
    },
    progressStats: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    statItem: {
        alignItems: 'center',
    },
    statValue: {
        fontSize: 20,
        fontWeight: '700',
    },
    statLabel: {
        fontSize: 12,
        marginTop: 2,
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
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    errorText: {
        marginTop: 16,
        fontSize: 16,
        textAlign: 'center',
    },
    retryButton: {
        marginTop: 16,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    retryButtonText: {
        fontSize: 14,
        fontWeight: '600',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        margin: 16,
        marginBottom: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        gap: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        padding: 0,
    },
    itemsCounter: {
        fontSize: 12,
        marginHorizontal: 16,
        marginBottom: 8,
    },
    itemsList: {
        flex: 1,
        paddingHorizontal: 16,
    },
    itemCard: {
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    itemInfo: {
        flex: 1,
        marginRight: 12,
    },
    itemName: {
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 4,
    },
    itemSku: {
        fontSize: 12,
        marginBottom: 2,
    },
    barcodeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    itemBarcode: {
        fontSize: 12,
    },
    itemStatus: {
        padding: 4,
    },
    itemQuantities: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
    },
    quantityItem: {
        alignItems: 'center',
    },
    quantityLabel: {
        fontSize: 11,
        marginBottom: 2,
    },
    quantityValue: {
        fontSize: 16,
        fontWeight: '700',
    },
    loadMoreButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        gap: 4,
    },
    loadMoreText: {
        fontSize: 14,
        fontWeight: '500',
    },
    footer: {
        padding: 16,
        borderTopWidth: 1,
    },
    closeFooterButton: {
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    closeFooterButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },
});
