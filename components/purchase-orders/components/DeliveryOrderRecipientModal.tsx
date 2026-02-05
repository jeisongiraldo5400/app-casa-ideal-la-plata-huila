import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Linking,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { DeliveryOrder } from '../types';

interface DeliveryOrderRecipientModalProps {
    visible: boolean;
    onClose: () => void;
    order: DeliveryOrder;
}

interface CustomerDetails {
    id: string;
    name: string;
    id_number: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
}

interface UserDetails {
    id: string;
    full_name: string | null;
    email: string | null;
}

export function DeliveryOrderRecipientModal({
    visible,
    onClose,
    order,
}: DeliveryOrderRecipientModalProps) {
    const { isDark } = useTheme();
    const colors = getColors(isDark);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [customerDetails, setCustomerDetails] = useState<CustomerDetails | null>(null);
    const [userDetails, setUserDetails] = useState<UserDetails | null>(null);

    const isCustomerOrder = !!order.customer_id;
    const isRemissionOrder = !!order.assigned_to_user_id;

    useEffect(() => {
        if (visible) {
            loadRecipientDetails();
        }
    }, [visible, order.id]);

    const loadRecipientDetails = async () => {
        setLoading(true);
        setError(null);
        setCustomerDetails(null);
        setUserDetails(null);

        try {
            if (isCustomerOrder && order.customer_id) {
                // Cargar detalles del cliente
                const { data: customerData, error: customerError } = await supabase
                    .from('customers')
                    .select('id, name, id_number, phone, email, address, notes')
                    .eq('id', order.customer_id)
                    .single();

                if (customerError) {
                    console.error('Error loading customer:', customerError);
                    setError('Error al cargar información del cliente');
                } else {
                    setCustomerDetails(customerData);
                }
            } else if (isRemissionOrder && order.assigned_to_user_id) {
                // Cargar detalles del usuario
                const { data: userData, error: userError } = await supabase
                    .from('profiles')
                    .select('id, full_name, email')
                    .eq('id', order.assigned_to_user_id)
                    .single();

                if (userError) {
                    console.error('Error loading user:', userError);
                    setError('Error al cargar información del usuario');
                } else {
                    setUserDetails(userData);
                }
            }

            setLoading(false);
        } catch (err: any) {
            console.error('Error loading recipient:', err);
            setError(err.message || 'Error al cargar información');
            setLoading(false);
        }
    };

    const handleCall = (phone: string) => {
        Linking.openURL(`tel:${phone}`);
    };

    const handleEmail = (email: string) => {
        Linking.openURL(`mailto:${email}`);
    };

    const handleOpenMap = (address: string) => {
        const encodedAddress = encodeURIComponent(address);
        Linking.openURL(`https://maps.google.com/?q=${encodedAddress}`);
    };

    const renderCustomerContent = () => {
        if (!customerDetails) return null;

        return (
            <View style={styles.contentContainer}>
                {/* Tipo de orden */}
                <View style={[styles.typeBadge, { backgroundColor: colors.primary.main + '15' }]}>
                    <MaterialIcons name="person" size={20} color={colors.primary.main} />
                    <Text style={[styles.typeBadgeText, { color: colors.primary.main }]}>
                        Entrega a Cliente
                    </Text>
                </View>

                {/* Nombre */}
                <View style={[styles.infoCard, { backgroundColor: colors.background.default }]}>
                    <View style={styles.infoRow}>
                        <MaterialIcons name="badge" size={24} color={colors.text.secondary} />
                        <View style={styles.infoContent}>
                            <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>
                                Nombre del Cliente
                            </Text>
                            <Text style={[styles.infoValue, { color: colors.text.primary }]}>
                                {customerDetails.name}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* NIT/CC */}
                {customerDetails.id_number && (
                    <View style={[styles.infoCard, { backgroundColor: colors.background.default }]}>
                        <View style={styles.infoRow}>
                            <MaterialIcons name="fingerprint" size={24} color={colors.text.secondary} />
                            <View style={styles.infoContent}>
                                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>
                                    NIT / Cédula
                                </Text>
                                <Text style={[styles.infoValue, { color: colors.text.primary }]}>
                                    {customerDetails.id_number}
                                </Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Teléfono */}
                {customerDetails.phone && (
                    <TouchableOpacity
                        style={[styles.infoCard, styles.infoCardClickable, { backgroundColor: colors.background.default }]}
                        onPress={() => handleCall(customerDetails.phone!)}
                    >
                        <View style={styles.infoRow}>
                            <MaterialIcons name="phone" size={24} color={colors.success.main} />
                            <View style={styles.infoContent}>
                                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>
                                    Teléfono
                                </Text>
                                <Text style={[styles.infoValue, { color: colors.success.main }]}>
                                    {customerDetails.phone}
                                </Text>
                            </View>
                            <MaterialIcons name="call" size={20} color={colors.success.main} />
                        </View>
                    </TouchableOpacity>
                )}

                {/* Email */}
                {customerDetails.email && (
                    <TouchableOpacity
                        style={[styles.infoCard, styles.infoCardClickable, { backgroundColor: colors.background.default }]}
                        onPress={() => handleEmail(customerDetails.email!)}
                    >
                        <View style={styles.infoRow}>
                            <MaterialIcons name="email" size={24} color={colors.info.main} />
                            <View style={styles.infoContent}>
                                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>
                                    Correo Electrónico
                                </Text>
                                <Text style={[styles.infoValue, { color: colors.info.main }]}>
                                    {customerDetails.email}
                                </Text>
                            </View>
                            <MaterialIcons name="send" size={20} color={colors.info.main} />
                        </View>
                    </TouchableOpacity>
                )}

                {/* Dirección del cliente */}
                {customerDetails.address && (
                    <TouchableOpacity
                        style={[styles.infoCard, styles.infoCardClickable, { backgroundColor: colors.background.default }]}
                        onPress={() => handleOpenMap(customerDetails.address!)}
                    >
                        <View style={styles.infoRow}>
                            <MaterialIcons name="home" size={24} color={colors.text.secondary} />
                            <View style={styles.infoContent}>
                                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>
                                    Dirección del Cliente
                                </Text>
                                <Text style={[styles.infoValue, { color: colors.text.primary }]}>
                                    {customerDetails.address}
                                </Text>
                            </View>
                            <MaterialIcons name="map" size={20} color={colors.primary.main} />
                        </View>
                    </TouchableOpacity>
                )}

                {/* Dirección de entrega (de la orden) */}
                {order.delivery_address && order.delivery_address !== customerDetails.address && (
                    <TouchableOpacity
                        style={[styles.infoCard, styles.infoCardClickable, { backgroundColor: colors.warning.main + '10' }]}
                        onPress={() => handleOpenMap(order.delivery_address!)}
                    >
                        <View style={styles.infoRow}>
                            <MaterialIcons name="location-on" size={24} color={colors.warning.main} />
                            <View style={styles.infoContent}>
                                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>
                                    Dirección de Entrega
                                </Text>
                                <Text style={[styles.infoValue, { color: colors.text.primary }]}>
                                    {order.delivery_address}
                                </Text>
                            </View>
                            <MaterialIcons name="map" size={20} color={colors.warning.main} />
                        </View>
                    </TouchableOpacity>
                )}

                {/* Notas del cliente */}
                {customerDetails.notes && (
                    <View style={[styles.infoCard, { backgroundColor: colors.background.default }]}>
                        <View style={styles.infoRow}>
                            <MaterialIcons name="notes" size={24} color={colors.text.secondary} />
                            <View style={styles.infoContent}>
                                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>
                                    Notas del Cliente
                                </Text>
                                <Text style={[styles.infoValue, { color: colors.text.primary }]}>
                                    {customerDetails.notes}
                                </Text>
                            </View>
                        </View>
                    </View>
                )}
            </View>
        );
    };

    const renderRemissionContent = () => {
        if (!userDetails) return null;

        return (
            <View style={styles.contentContainer}>
                {/* Tipo de orden */}
                <View style={[styles.typeBadge, { backgroundColor: colors.info.main + '15' }]}>
                    <MaterialIcons name="swap-horiz" size={20} color={colors.info.main} />
                    <Text style={[styles.typeBadgeText, { color: colors.info.main }]}>
                        Remisión Interna
                    </Text>
                </View>

                {/* Nombre */}
                <View style={[styles.infoCard, { backgroundColor: colors.background.default }]}>
                    <View style={styles.infoRow}>
                        <MaterialIcons name="account-circle" size={24} color={colors.text.secondary} />
                        <View style={styles.infoContent}>
                            <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>
                                Usuario Asignado
                            </Text>
                            <Text style={[styles.infoValue, { color: colors.text.primary }]}>
                                {userDetails.full_name || 'Sin nombre'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Email */}
                {userDetails.email && (
                    <TouchableOpacity
                        style={[styles.infoCard, styles.infoCardClickable, { backgroundColor: colors.background.default }]}
                        onPress={() => handleEmail(userDetails.email!)}
                    >
                        <View style={styles.infoRow}>
                            <MaterialIcons name="email" size={24} color={colors.info.main} />
                            <View style={styles.infoContent}>
                                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>
                                    Correo Electrónico
                                </Text>
                                <Text style={[styles.infoValue, { color: colors.info.main }]}>
                                    {userDetails.email}
                                </Text>
                            </View>
                            <MaterialIcons name="send" size={20} color={colors.info.main} />
                        </View>
                    </TouchableOpacity>
                )}

                {/* Dirección de entrega (si existe) */}
                {order.delivery_address && (
                    <TouchableOpacity
                        style={[styles.infoCard, styles.infoCardClickable, { backgroundColor: colors.background.default }]}
                        onPress={() => handleOpenMap(order.delivery_address!)}
                    >
                        <View style={styles.infoRow}>
                            <MaterialIcons name="location-on" size={24} color={colors.text.secondary} />
                            <View style={styles.infoContent}>
                                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>
                                    Dirección de Entrega
                                </Text>
                                <Text style={[styles.infoValue, { color: colors.text.primary }]}>
                                    {order.delivery_address}
                                </Text>
                            </View>
                            <MaterialIcons name="map" size={20} color={colors.primary.main} />
                        </View>
                    </TouchableOpacity>
                )}

                {/* Nota informativa */}
                <View style={[styles.noteCard, { backgroundColor: colors.info.main + '10' }]}>
                    <MaterialIcons name="info-outline" size={20} color={colors.info.main} />
                    <Text style={[styles.noteText, { color: colors.text.secondary }]}>
                        Esta es una remisión interna. El usuario asignado es responsable de recibir estos productos.
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={[styles.modalContainer, { backgroundColor: colors.background.paper }]}>
                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: colors.divider }]}>
                        <View style={styles.headerContent}>
                            <MaterialIcons
                                name={isCustomerOrder ? "person" : "swap-horiz"}
                                size={24}
                                color={colors.primary.main}
                            />
                            <View style={styles.headerText}>
                                <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
                                    {isCustomerOrder ? 'Información del Cliente' : 'Información de Remisión'}
                                </Text>
                                <Text style={[styles.headerSubtitle, { color: colors.text.secondary }]}>
                                    OE #{order.order_number || order.id.slice(0, 8)}
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <MaterialIcons name="close" size={24} color={colors.text.secondary} />
                        </TouchableOpacity>
                    </View>

                    {/* Contenido */}
                    <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
                        {loading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color={colors.primary.main} />
                                <Text style={[styles.loadingText, { color: colors.text.secondary }]}>
                                    Cargando información...
                                </Text>
                            </View>
                        ) : error ? (
                            <View style={styles.errorContainer}>
                                <MaterialIcons name="error-outline" size={48} color={colors.error.main} />
                                <Text style={[styles.errorText, { color: colors.error.main }]}>{error}</Text>
                                <TouchableOpacity
                                    style={[styles.retryButton, { backgroundColor: colors.primary.main }]}
                                    onPress={loadRecipientDetails}
                                >
                                    <Text style={[styles.retryButtonText, { color: colors.primary.contrastText }]}>
                                        Reintentar
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        ) : isCustomerOrder ? (
                            renderCustomerContent()
                        ) : (
                            renderRemissionContent()
                        )}
                    </ScrollView>

                    {/* Footer */}
                    <View style={[styles.footer, { borderTopColor: colors.divider }]}>
                        <TouchableOpacity
                            style={[styles.closeFooterButton, { backgroundColor: colors.primary.main }]}
                            onPress={onClose}
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
        maxHeight: '85%',
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
    scrollContent: {
        flex: 1,
    },
    contentContainer: {
        padding: 16,
    },
    typeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 8,
        marginBottom: 16,
    },
    typeBadgeText: {
        fontSize: 14,
        fontWeight: '600',
    },
    infoCard: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
    },
    infoCardClickable: {
        // Estilos adicionales para cards clickables
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    infoContent: {
        flex: 1,
    },
    infoLabel: {
        fontSize: 12,
        fontWeight: '500',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    infoValue: {
        fontSize: 16,
        fontWeight: '600',
    },
    noteCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 16,
        borderRadius: 12,
        marginTop: 8,
        gap: 12,
    },
    noteText: {
        flex: 1,
        fontSize: 14,
        lineHeight: 20,
    },
    loadingContainer: {
        padding: 60,
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
    },
    errorContainer: {
        padding: 40,
        alignItems: 'center',
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
    footer: {
        padding: 16,
        borderTopWidth: 1,
    },
    closeFooterButton: {
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
    },
    closeFooterButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },
});
