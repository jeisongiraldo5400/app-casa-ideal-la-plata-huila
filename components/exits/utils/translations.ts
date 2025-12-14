// Utilidades de traducción para el módulo de salidas

/**
 * Traduce el estado de una orden al español
 */
export const translateOrderStatus = (status: string): string => {
    const translations: Record<string, string> = {
        'pending': 'Pendiente',
        'approved': 'Aprobado',
        'sent_by_remission': 'Enviado por Remisión',
        'in_transit': 'En Tránsito',
        'delivered': 'Entregado',
        'cancelled': 'Cancelado',
        'returned': 'Devuelto',
    };

    return translations[status] || status;
};

/**
 * Traduce el tipo de orden al español
 */
export const translateOrderType = (type: string): string => {
    const translations: Record<string, string> = {
        'customer': 'Cliente',
        'remission': 'Remisión',
    };

    return translations[type] || type;
};

/**
 * Retorna los colores de fondo y texto según el estado
 */
export const getStatusColor = (status: string): { bg: string; text: string } => {
    const colors: Record<string, { bg: string; text: string }> = {
        'pending': { bg: '#FFA726', text: '#000' },
        'approved': { bg: '#66BB6A', text: '#fff' },
        'sent_by_remission': { bg: '#E0E0E0', text: '#424242' },
        'in_transit': { bg: '#42A5F5', text: '#fff' },
        'delivered': { bg: '#26A69A', text: '#fff' },
        'cancelled': { bg: '#EF5350', text: '#fff' },
        'returned': { bg: '#FF7043', text: '#fff' },
    };

    return colors[status] || { bg: '#E0E0E0', text: '#000' };
};

/**
 * Retorna el color para el tipo de orden
 */
export const getTypeColor = (type: string): { bg: string; text: string } => {
    const colors: Record<string, { bg: string; text: string }> = {
        'customer': { bg: '#1E3A8A', text: '#fff' },
        'remission': { bg: '#3B82F6', text: '#fff' },
    };

    return colors[type] || { bg: '#6B7280', text: '#fff' };
};
