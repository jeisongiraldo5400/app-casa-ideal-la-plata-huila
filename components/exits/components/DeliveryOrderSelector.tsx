import { useExitsStore } from '@/components/exits/infrastructure/store/exitsStore';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function DeliveryOrderSelector() {
    const {
        selectedCustomerId,
        deliveryOrders,
        selectedDeliveryOrderId,
        loading,
        searchDeliveryOrdersByCustomer,
        selectDeliveryOrder,
        error,
    } = useExitsStore();

    useEffect(() => {
        if (selectedCustomerId) {
            searchDeliveryOrdersByCustomer(selectedCustomerId);
        }
    }, [selectedCustomerId, searchDeliveryOrdersByCustomer]);

    if (loading) {
        return (
            <Card style={styles.card}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={Colors.primary.main} />
                    <Text style={styles.loadingText}>Cargando órdenes de entrega...</Text>
                </View>
            </Card>
        );
    }

    if (deliveryOrders.length === 0) {
        return (
            <Card style={styles.card}>
                <View style={styles.emptyContainer}>
                    <MaterialIcons name="inbox" size={64} color={Colors.text.disabled} />
                    <Text style={styles.emptyTitle}>No hay órdenes pendientes</Text>
                    <Text style={styles.emptySubtitle}>
                        Este cliente no tiene órdenes de entrega pendientes
                    </Text>
                </View>
            </Card>
        );
    }

    return (
        <Card style={styles.card}>
            <Text style={styles.title}>Seleccione Orden de Entrega</Text>
            <Text style={styles.subtitle}>
                Órdenes pendientes del cliente ({deliveryOrders.length})
            </Text>

            <ScrollView style={styles.ordersList} showsVerticalScrollIndicator={false}>
                {deliveryOrders.map((order: any) => {
                    const isSelected = selectedDeliveryOrderId === order.id;
                    const progress = order.delivered_quantity / order.total_quantity;
                    const progressPercent = Math.round(progress * 100);

                    return (
                        <TouchableOpacity
                            key={order.id}
                            style={[styles.orderItem, isSelected && styles.orderItemSelected]}
                            onPress={() => selectDeliveryOrder(order.id)}>

                            <View style={styles.orderHeader}>
                                <View style={styles.orderInfo}>
                                    <Text style={styles.orderId}>Orden #{order.id.slice(0, 8)}</Text>
                                    <View style={[styles.statusBadge, styles[`status_${order.status}`]]}>
                                        <Text style={styles.statusText}>{getStatusLabel(order.status)}</Text>
                                    </View>
                                </View>
                                {isSelected && (
                                    <MaterialIcons name="check-circle" size={24} color={Colors.success.main} />
                                )}
                            </View>

                            <View style={styles.orderDetails}>
                                <View style={styles.detailRow}>
                                    <MaterialIcons name="inventory" size={16} color={Colors.text.secondary} />
                                    <Text style={styles.detailText}>
                                        {order.total_items} productos ({order.total_quantity} unidades)
                                    </Text>
                                </View>

                                {order.delivery_address && (
                                    <View style={styles.detailRow}>
                                        <MaterialIcons name="location-on" size={16} color={Colors.text.secondary} />
                                        <Text style={styles.detailText} numberOfLines={1}>
                                            {order.delivery_address}
                                        </Text>
                                    </View>
                                )}

                                <View style={styles.detailRow}>
                                    <MaterialIcons name="calendar-today" size={16} color={Colors.text.secondary} />
                                    <Text style={styles.detailText}>
                                        {new Date(order.created_at).toLocaleDateString('es-CO')}
                                    </Text>
                                </View>
                            </View>

                            {/* Progress bar */}
                            {order.delivered_quantity > 0 && (
                                <View style={styles.progressContainer}>
                                    <View style={styles.progressBar}>
                                        <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                                    </View>
                                    <Text style={styles.progressText}>
                                        {order.delivered_quantity} / {order.total_quantity} entregados ({progressPercent}%)
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {error && (
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}
        </Card>
    );
}

function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
        pending: 'Pendiente',
        preparing: 'Preparando',
        ready: 'Lista',
        delivered: 'Entregada',
        cancelled: 'Cancelada',
    };
    return labels[status] || status;
}

const styles = StyleSheet.create({
    card: {
        marginBottom: 20,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.text.primary,
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: Colors.text.secondary,
        marginBottom: 16,
    },
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 14,
        color: Colors.text.secondary,
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
    },
    emptyTitle: {
        marginTop: 16,
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text.primary,
    },
    emptySubtitle: {
        marginTop: 8,
        fontSize: 14,
        color: Colors.text.secondary,
        textAlign: 'center',
    },
    ordersList: {
        maxHeight: 400,
    },
    orderItem: {
        padding: 16,
        marginBottom: 12,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: Colors.divider,
        backgroundColor: Colors.background.paper,
    },
    orderItemSelected: {
        borderColor: Colors.primary.main,
        backgroundColor: Colors.primary.light + '10',
    },
    orderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    orderInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    orderId: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text.primary,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    status_pending: {
        backgroundColor: Colors.warning.light + '30',
    },
    status_preparing: {
        backgroundColor: Colors.info.light + '30',
    },
    status_ready: {
        backgroundColor: Colors.success.light + '30',
    },
    status_delivered: {
        backgroundColor: Colors.text.disabled + '30',
    },
    status_cancelled: {
        backgroundColor: Colors.error.light + '30',
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.text.primary,
    },
    orderDetails: {
        gap: 8,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    detailText: {
        fontSize: 14,
        color: Colors.text.secondary,
        flex: 1,
    },
    progressContainer: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: Colors.divider,
    },
    progressBar: {
        height: 6,
        backgroundColor: Colors.divider,
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 6,
    },
    progressFill: {
        height: '100%',
        backgroundColor: Colors.success.main,
    },
    progressText: {
        fontSize: 12,
        color: Colors.text.secondary,
        textAlign: 'right',
    },
    errorContainer: {
        marginTop: 16,
        padding: 12,
        backgroundColor: Colors.error.light + '20',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.error.main,
    },
    errorText: {
        fontSize: 14,
        color: Colors.error.main,
        fontWeight: '500',
    },
});
