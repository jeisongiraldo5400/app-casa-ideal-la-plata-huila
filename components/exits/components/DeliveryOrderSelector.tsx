import { useExitsStore } from '@/components/exits/infrastructure/store/exitsStore';
import { Colors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getStatusColor, getTypeColor, translateOrderStatus, translateOrderType } from '../utils/translations';

export function DeliveryOrderSelector() {
    const {
        exitMode,
        selectedCustomerId,
        selectedUserId,
        deliveryOrders,
        selectedDeliveryOrderId,
        loading,
        searchDeliveryOrdersByCustomer,
        searchDeliveryOrdersByUser,
        selectDeliveryOrder,
        error,
    } = useExitsStore();

    useEffect(() => {
        if (exitMode === 'direct_customer' && selectedCustomerId) {
            searchDeliveryOrdersByCustomer(selectedCustomerId);
        } else if (exitMode === 'direct_user' && selectedUserId) {
            searchDeliveryOrdersByUser(selectedUserId);
        }
    }, [exitMode, selectedCustomerId, selectedUserId, searchDeliveryOrdersByCustomer, searchDeliveryOrdersByUser]);

    const isRemissionMode = exitMode === 'direct_user';
    const orderTypeLabel = isRemissionMode ? 'remisión' : 'orden de entrega';
    const orderTypeLabelPlural = isRemissionMode ? 'remisiones' : 'órdenes de entrega';

    if (loading) {
        return (
            <View style={styles.listContainer}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={Colors.primary.main} />
                    <Text style={styles.loadingText}>Cargando {orderTypeLabelPlural}...</Text>
                </View>
            </View>
        );
    }

    if (deliveryOrders.length === 0) {
        return (
            <View style={styles.listContainer}>
                <View style={styles.emptyContainer}>
                    <MaterialIcons name="inbox" size={64} color={Colors.text.secondary} />
                    <Text style={styles.emptyTitle}>No hay {orderTypeLabelPlural} pendientes</Text>
                    <Text style={styles.emptySubtitle}>
                        {isRemissionMode
                            ? 'Este usuario no tiene remisiones pendientes'
                            : 'Este cliente no tiene órdenes de entrega pendientes'}
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.listContainer}>
            <Text style={styles.title}>Seleccione {isRemissionMode ? 'Remisión' : 'Orden de Entrega'}</Text>
            <Text style={styles.subtitle}>
                {isRemissionMode ? 'Remisiones' : 'Órdenes'} pendientes ({deliveryOrders.length})
            </Text>

            <ScrollView
                style={styles.ordersList}
                contentContainerStyle={styles.ordersListContent}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}>
                {deliveryOrders.map((order: any) => {
                    const isSelected = selectedDeliveryOrderId === order.id;
                    const progress = order.total_quantity > 0 ? order.delivered_quantity / order.total_quantity : 0;
                    const progressPercent = Math.round(progress * 100);
                    const isComplete = order.total_quantity > 0 && order.delivered_quantity >= order.total_quantity;

                    return (
                        <TouchableOpacity
                            key={order.id}
                            style={[
                                styles.orderItem,
                                isSelected && styles.orderItemSelected,
                                isComplete && styles.orderItemComplete,
                            ]}
                            onPress={() => !isComplete && selectDeliveryOrder(order.id)}
                            disabled={isComplete}>

                            <View style={styles.orderHeader}>
                                <View style={styles.orderInfo}>
                                    <View style={styles.idAndBadgesRow}>
                                        <Text style={styles.orderId} numberOfLines={1}>Orden #{order.order_number || order.id.slice(0, 8)}</Text>

                                        <View style={styles.badgesWrapper}>
                                            {/* Badge de Tipo */}
                                            <View style={[
                                                styles.typeBadge,
                                                { backgroundColor: getTypeColor(order.order_type || 'customer').bg }
                                            ]}>
                                                <Text style={[
                                                    styles.typeText,
                                                    { color: getTypeColor(order.order_type || 'customer').text }
                                                ]}>
                                                    {translateOrderType(order.order_type || 'customer')}
                                                </Text>
                                            </View>

                                            {/* Badge de Estado */}
                                            {isComplete ? (
                                                <View style={[styles.statusBadge, styles.status_complete]}>
                                                    <MaterialIcons name="check-circle" size={14} color={Colors.success.main} />
                                                    <Text style={[styles.statusText, { color: Colors.success.main }]}>Comp.</Text>
                                                </View>
                                            ) : (
                                                <View style={[
                                                    styles.statusBadge,
                                                    { backgroundColor: getStatusColor(order.status).bg }
                                                ]}>
                                                    <Text style={[
                                                        styles.statusText,
                                                        { color: getStatusColor(order.status).text }
                                                    ]}>
                                                        {getStatusLabel(order.status)}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </View>
                                {isSelected && !isComplete && (
                                    <View style={styles.selectedIconWrapper}>
                                        <MaterialIcons name="check-circle" size={24} color={Colors.primary.main} />
                                    </View>
                                )}
                            </View>

                            <View style={styles.orderDetails}>
                                {/* Nombre del cliente o usuario asignado */}
                                {(order.customer_name || order.assigned_to_user_name) && (
                                    <View style={styles.detailRow}>
                                        <MaterialIcons name="person" size={16} color={Colors.text.secondary} />
                                        <Text style={styles.detailText}>
                                            {order.customer_name || order.assigned_to_user_name}
                                        </Text>
                                    </View>
                                )}

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
        </View>
    );
}

function getStatusLabel(status: string): string {
    return translateOrderStatus(status);
}

const styles = StyleSheet.create({
    listContainer: {
        marginTop: 8,
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
        maxHeight: 450,
        flexGrow: 0,
    },
    ordersListContent: {
        paddingBottom: 8,
        flexGrow: 0,
    },
    orderItem: {
        padding: 12,
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
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    orderInfo: {
        flex: 1,
    },
    idAndBadgesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
    },
    orderId: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.text.primary,
        flexShrink: 1,
    },
    badgesWrapper: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    selectedIconWrapper: {
        marginLeft: 8,
    },
    typeBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        minWidth: 60,
        alignItems: 'center',
    },
    typeText: {
        fontSize: 11,
        fontWeight: '700',
        textAlign: 'center',
    },
    statusBadge: {
        paddingHorizontal: 6,
        paddingVertical: 3,
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
        backgroundColor: Colors.divider,
    },
    status_cancelled: {
        backgroundColor: Colors.error.light + '30',
    },
    status_complete: {
        backgroundColor: Colors.success.light + '30',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    orderItemComplete: {
        borderColor: Colors.success.main,
        backgroundColor: Colors.success.light + '10',
        opacity: 0.8,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.text.primary,
    },
    orderDetails: {
        gap: 6,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    detailText: {
        fontSize: 13,
        color: Colors.text.secondary,
        flex: 1,
    },
    progressContainer: {
        marginTop: 10,
        paddingTop: 10,
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
        fontSize: 11,
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
