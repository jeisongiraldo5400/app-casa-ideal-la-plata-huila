import { useTheme } from '@/components/theme';
import { Card } from '@/components/ui/Card';
import { getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    calculateDeliveryProgress,
    DeliveryOrder,
    formatDate,
    getRecipientInfo,
    getStatusColor,
    getStatusLabel,
} from '../types';
import { DeliveryOrderProductsModal } from './DeliveryOrderProductsModal';
import { DeliveryOrderRecipientModal } from './DeliveryOrderRecipientModal';

interface DeliveryOrderCardProps {
  order: DeliveryOrder;
  showCreatedBy?: boolean;
}

export function DeliveryOrderCard({ order, showCreatedBy = true }: DeliveryOrderCardProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  const [showProductsModal, setShowProductsModal] = useState(false);
  const [showRecipientModal, setShowRecipientModal] = useState(false);

  const statusColor = getStatusColor(order.status, colors);
  const progress = calculateDeliveryProgress(order);
  const recipient = getRecipientInfo(order);

  // Determinar el badge de progreso
  const getProgressBadge = () => {
    if (progress.is_fully_delivered) {
      return {
        icon: 'check-circle' as const,
        text: 'Completada',
        color: colors.success.main,
        bgColor: colors.success.main + '15',
      };
    }

    if (order.delivered_quantity === 0) {
      return {
        icon: 'hourglass-empty' as const,
        text: 'Sin entregas',
        color: colors.warning.main,
        bgColor: colors.warning.main + '15',
      };
    }

    const pendingQty = order.total_quantity - order.delivered_quantity;
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
              OE #{order.order_number || order.id.slice(0, 8)}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {getStatusLabel(order.status)}
              </Text>
            </View>
          </View>
          <Text style={[styles.orderDate, { color: colors.text.secondary }]}>
            {formatDate(order.created_at)}
          </Text>
        </View>

        {/* Barra de progreso mejorada */}
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, { color: colors.text.secondary }]}>
              Progreso de entrega
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
                  backgroundColor: statusColor
                }
              ]}
            />
          </View>
          <View style={styles.progressStats}>
            <Text style={[styles.progressStatsText, { color: colors.text.secondary }]}>
              {order.delivered_quantity} / {order.total_quantity} unidades entregadas
            </Text>
            <Text style={[styles.progressStatsText, { color: colors.text.secondary }]}>
              {progress.completed_items} / {order.total_items} productos
            </Text>
          </View>
        </View>

        {/* Badge de estado de progreso */}
        <View style={[styles.progressBadge, { backgroundColor: progressBadge.bgColor }]}>
          <MaterialIcons name={progressBadge.icon} size={18} color={progressBadge.color} />
          <Text style={[styles.progressBadgeText, { color: progressBadge.color }]}>
            {progressBadge.text}
          </Text>
        </View>

        {/* Información resumida del destinatario */}
        <View style={styles.recipientPreview}>
          <MaterialIcons
            name={recipient.type === 'customer' ? 'person' : 'account-circle'}
            size={16}
            color={colors.text.secondary}
          />
          <Text style={[styles.recipientPreviewText, { color: colors.text.primary }]} numberOfLines={1}>
            {recipient.type === 'customer'
              ? recipient.customer_name || 'Cliente sin nombre'
              : recipient.user_name || recipient.user_email || 'Usuario sin nombre'
            }
          </Text>
          <View style={[styles.recipientTypeBadge, {
            backgroundColor: recipient.type === 'customer'
              ? colors.primary.main + '15'
              : colors.secondary.main + '15'
          }]}>
            <Text style={[styles.recipientTypeText, {
              color: recipient.type === 'customer'
                ? colors.primary.main
                : colors.secondary.main
            }]}>
              {recipient.type === 'customer' ? 'Cliente' : 'Remisión'}
            </Text>
          </View>
        </View>

        {/* Dirección de entrega si existe */}
        {order.delivery_address && (
          <View style={styles.addressInfo}>
            <MaterialIcons name="location-on" size={14} color={colors.text.secondary} />
            <Text style={[styles.addressText, { color: colors.text.secondary }]} numberOfLines={1}>
              {order.delivery_address}
            </Text>
          </View>
        )}

        {/* Creado por (opcional) */}
        {showCreatedBy && order.created_by_name && (
          <View style={styles.creatorInfo}>
            <MaterialIcons name="person-outline" size={14} color={colors.text.secondary} />
            <Text style={[styles.creatorText, { color: colors.text.secondary }]}>
              Creada por: {order.created_by_name}
            </Text>
          </View>
        )}

        {/* Notas si existen */}
        {order.notes && (
          <Text style={[styles.orderNotes, { color: colors.text.secondary }]} numberOfLines={2}>
            {order.notes}
          </Text>
        )}

        {/* Botones de acción */}
        <View style={[styles.actionsContainer, { borderTopColor: colors.divider }]}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.primary.main + '10' }]}
            onPress={() => setShowProductsModal(true)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="inventory-2" size={18} color={colors.primary.main} />
            <Text style={[styles.actionButtonText, { color: colors.primary.main }]}>
              Ver productos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.secondary.main + '10' }]}
            onPress={() => setShowRecipientModal(true)}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={recipient.type === 'customer' ? 'person' : 'account-circle'}
              size={18}
              color={colors.secondary.main}
            />
            <Text style={[styles.actionButtonText, { color: colors.secondary.main }]}>
              Ver destinatario
            </Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Modal de productos */}
      <DeliveryOrderProductsModal
        visible={showProductsModal}
        onClose={() => setShowProductsModal(false)}
        orderId={order.id}
        orderNumber={order.order_number || order.id.slice(0, 8)}
      />

      {/* Modal de destinatario */}
      <DeliveryOrderRecipientModal
        visible={showRecipientModal}
        onClose={() => setShowRecipientModal(false)}
        order={order}
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
  recipientPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  recipientPreviewText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  recipientTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  recipientTypeText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  addressInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 4,
  },
  addressText: {
    fontSize: 12,
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
    gap: 12,
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
