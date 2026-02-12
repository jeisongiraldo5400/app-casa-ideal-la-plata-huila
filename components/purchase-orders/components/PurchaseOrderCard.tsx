import { useTheme } from '@/components/theme';
import { Card } from '@/components/ui/Card';
import { getColors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    formatDate,
    getPurchaseOrderStatusColor,
    getPurchaseOrderStatusLabel,
} from '../types';
import { PurchaseOrderProductsModal } from './PurchaseOrderProductsModal';

interface PurchaseOrderCardOrder {
    id: string;
    order_number: string | null;
    created_at: string;
    status: string;
    notes: string | null;
    supplier?: {
        name: string;
    } | null;
    created_by_profile?: {
        full_name: string | null;
        email: string | null;
    } | null;
    items?: Array<{
        id: string;
        quantity: number;
        product?: {
            name: string;
        } | null;
    }>;
}

interface PurchaseOrderCardProps {
    order: PurchaseOrderCardOrder;
    showCreatedBy?: boolean;
}

interface ProgressData {
    total_items: number;
    total_quantity: number;
    registered_items: number;
    registered_quantity: number;
    progress_percentage: number;
    is_fully_registered: boolean;
}

export function PurchaseOrderCard({ order, showCreatedBy = true }: PurchaseOrderCardProps) {
    const { isDark } = useTheme();
    const colors = getColors(isDark);

    const [showProductsModal, setShowProductsModal] = useState(false);
    const [progress, setProgress] = useState<ProgressData | null>(null);
    const [loadingProgress, setLoadingProgress] = useState(true);

    const statusColor = getPurchaseOrderStatusColor(order.status, colors);

    // Cargar progreso de entradas
    useEffect(() => {
        loadProgress();
    }, [order.id]);

    const loadProgress = async () => {
        setLoadingProgress(true);
        try {
            // Obtener items de la orden
            const { data: orderItems } = await supabase
                .from('purchase_order_items')
                .select('product_id, quantity')
                .eq('purchase_order_id', order.id)
                .is('deleted_at', null);

            // Obtener entradas registradas
            const { data: entries } = await supabase
                .from('inventory_entries')
                .select('product_id, quantity')
                .eq('purchase_order_id', order.id)
                .is('deleted_at', null);

            // Calcular totales
            const itemsMap: Record<string, { ordered: number; registered: number }> = {};

            (orderItems || []).forEach((item: any) => {
                itemsMap[item.product_id] = {
                    ordered: item.quantity,
                    registered: 0,
                };
            });

            (entries || []).forEach((entry: any) => {
                if (itemsMap[entry.product_id]) {
                    itemsMap[entry.product_id].registered += entry.quantity;
                }
            });

            const items = Object.values(itemsMap);
            const total_items = items.length;
            const total_quantity = items.reduce((sum, i) => sum + i.ordered, 0);
            const registered_quantity = items.reduce((sum, i) => sum + Math.min(i.registered, i.ordered), 0);
            const registered_items = items.filter(i => i.registered >= i.ordered).length;
            const progress_percentage = total_quantity > 0
                ? Math.min((registered_quantity / total_quantity) * 100, 100)
                : 0;
            const is_fully_registered = total_quantity > 0 && registered_quantity >= total_quantity;

            setProgress({
                total_items,
                total_quantity,
                registered_items,
                registered_quantity,
                progress_percentage,
                is_fully_registered,
            });
        } catch (err) {
            console.error('Error loading progress:', err);
        } finally {
            setLoadingProgress(false);
        }
    };

    // Determinar el badge de progreso
    const getProgressBadge = () => {
        if (!progress) {
            return {
                icon: 'hourglass-empty' as const,
                text: 'Cargando...',
                color: colors.text.secondary,
                bgColor: colors.text.secondary + '15',
            };
        }

        if (progress.is_fully_registered) {
            return {
                icon: 'check-circle' as const,
                text: 'Completada',
                color: colors.success.main,
                bgColor: colors.success.main + '15',
            };
        }

        if (progress.registered_quantity === 0) {
            return {
                icon: 'hourglass-empty' as const,
                text: 'Sin entradas',
                color: colors.warning.main,
                bgColor: colors.warning.main + '15',
            };
        }

        const pendingQty = progress.total_quantity - progress.registered_quantity;
        return {
            icon: 'pending' as const,
            text: `${pendingQty} pendiente${pendingQty !== 1 ? 's' : ''}`,
            color: colors.info.main,
            bgColor: colors.info.main + '15',
        };
    };

    const progressBadge = getProgressBadge();

    return (
        <>
            <Card style={[styles.orderCard, { backgroundColor: colors.background.paper }]}>
                {/* Header con número de orden, estado y fecha */}
                <View style={styles.orderHeader}>
                    <View style={styles.orderHeaderLeft}>
                        <Text style={[styles.orderId, { color: colors.text.primary }]}>
                            OC #{order.order_number || order.id.slice(0, 8)}
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                            <Text style={[styles.statusText, { color: statusColor }]}>
                                {getPurchaseOrderStatusLabel(order.status)}
                            </Text>
                        </View>
                    </View>
                    <Text style={[styles.orderDate, { color: colors.text.secondary }]}>
                        {formatDate(order.created_at)}
                    </Text>
                </View>

                {/* Barra de progreso */}
                {progress && (
                    <View style={styles.progressSection}>
                        <View style={styles.progressHeader}>
                            <Text style={[styles.progressLabel, { color: colors.text.secondary }]}>
                                Progreso de entradas
                            </Text>
                            <View style={[styles.progressPercentBadge, { backgroundColor: statusColor + '15' }]}>
                                <Text style={[styles.progressPercentText, { color: statusColor }]}>
                                    {Math.round(progress.progress_percentage)}%
                                </Text>
                            </View>
                        </View>
                        <View style={[styles.progressBar, { backgroundColor: colors.divider }]}>
                            <View
                                style={[
                                    styles.progressFill,
                                    {
                                        width: `${progress.progress_percentage}%`,
                                        backgroundColor: progress.is_fully_registered ? colors.success.main : statusColor
                                    }
                                ]}
                            />
                        </View>
                        <View style={styles.progressStats}>
                            <Text style={[styles.progressStatsText, { color: colors.text.secondary }]}>
                                {progress.registered_quantity} / {progress.total_quantity} unidades
                            </Text>
                            <Text style={[styles.progressStatsText, { color: colors.text.secondary }]}>
                                {progress.registered_items} / {progress.total_items} productos
                            </Text>
                        </View>
                    </View>
                )}

                {/* Badge de estado de progreso */}
                <View style={[styles.progressBadge, { backgroundColor: progressBadge.bgColor }]}>
                    <MaterialIcons name={progressBadge.icon} size={18} color={progressBadge.color} />
                    <Text style={[styles.progressBadgeText, { color: progressBadge.color }]}>
                        {progressBadge.text}
                    </Text>
                </View>

                {/* Proveedor */}
                {order.supplier && (
                    <View style={styles.supplierInfo}>
                        <MaterialIcons name="business" size={16} color={colors.text.secondary} />
                        <Text style={[styles.supplierText, { color: colors.text.primary }]} numberOfLines={1}>
                            {order.supplier.name}
                        </Text>
                    </View>
                )}

                {/* Creado por (opcional) */}
                {showCreatedBy && order.created_by_profile && (
                    <View style={styles.creatorInfo}>
                        <MaterialIcons name="person-outline" size={14} color={colors.text.secondary} />
                        <Text style={[styles.creatorText, { color: colors.text.secondary }]}>
                            Creada por: {order.created_by_profile.full_name || order.created_by_profile.email}
                        </Text>
                    </View>
                )}

                {/* Notas si existen */}
                {order.notes && (
                    <Text style={[styles.orderNotes, { color: colors.text.secondary }]} numberOfLines={2}>
                        {order.notes}
                    </Text>
                )}

                {/* Botón de acción */}
                <View style={[styles.actionsContainer, { borderTopColor: colors.divider }]}>
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: colors.primary.main + '10' }]}
                        onPress={() => setShowProductsModal(true)}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="inventory" size={18} color={colors.primary.main} />
                        <Text style={[styles.actionButtonText, { color: colors.primary.main }]}>
                            Ver productos
                        </Text>
                    </TouchableOpacity>
                </View>
            </Card>

            {/* Modal de productos */}
            <PurchaseOrderProductsModal
                visible={showProductsModal}
                onClose={() => setShowProductsModal(false)}
                orderId={order.id}
                orderNumber={order.order_number || order.id.slice(0, 8)}
            />
        </>
    );
}

const styles = StyleSheet.create({
    orderCard: {
        marginBottom: 16,
        padding: 16,
    },
    orderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    orderHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        flexWrap: 'wrap',
        gap: 8,
    },
    orderId: {
        fontSize: 16,
        fontWeight: '700',
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
    },
    orderDate: {
        fontSize: 12,
    },
    progressSection: {
        marginBottom: 12,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    progressLabel: {
        fontSize: 12,
        fontWeight: '500',
    },
    progressPercentBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    progressPercentText: {
        fontSize: 12,
        fontWeight: '700',
    },
    progressBar: {
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 6,
    },
    progressFill: {
        height: '100%',
        borderRadius: 4,
    },
    progressStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    progressStatsText: {
        fontSize: 11,
    },
    progressBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        marginBottom: 12,
        gap: 6,
    },
    progressBadgeText: {
        fontSize: 13,
        fontWeight: '600',
    },
    supplierInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 8,
    },
    supplierText: {
        fontSize: 14,
        fontWeight: '500',
        flex: 1,
    },
    creatorInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
        gap: 4,
    },
    creatorText: {
        fontSize: 12,
    },
    orderNotes: {
        fontSize: 12,
        marginBottom: 8,
        fontStyle: 'italic',
    },
    actionsContainer: {
        flexDirection: 'row',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        gap: 6,
    },
    actionButtonText: {
        fontSize: 13,
        fontWeight: '600',
    },
});
