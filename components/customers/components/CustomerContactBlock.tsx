import { useTheme } from '@/components/theme';
import { Button, Card } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import type { CustomerSummaryCustomer } from '@/lib/customers/customerSummary';

/** Lo mínimo para llamar, escribir y ubicar al cliente. */
export type CustomerContactInfo = Pick<
  CustomerSummaryCustomer,
  'name' | 'id_number' | 'phone' | 'email' | 'address' | 'vereda_name' | 'municipio_name' | 'departamento_name'
> & { notes?: string | null };

interface CustomerContactBlockProps {
  customer: CustomerContactInfo;
  /**
   * Solo los botones (Llamar, WhatsApp si hay número, Mapa), sin tarjeta ni
   * datos: para pantallas que ya muestran al cliente, como la ficha del negocio.
   */
  actionsOnly?: boolean;
}

/** Solo dígitos; los teléfonos se guardan con espacios y signos. */
function toDialable(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 ? digits : null;
}

/** Colombia: wa.me exige indicativo, y los móviles locales son de 10 dígitos. */
function toWhatsApp(phone: string | null): string | null {
  const digits = toDialable(phone);
  if (!digits) return null;
  return digits.length === 10 ? `57${digits}` : digits;
}

async function open(url: string, fallbackMessage: string) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('No disponible', fallbackMessage);
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert('No disponible', fallbackMessage);
  }
}

function contactLocation(customer: CustomerContactInfo): string {
  return [customer.address, customer.vereda_name, customer.municipio_name, customer.departamento_name]
    .filter(Boolean)
    .join(', ');
}

function ContactActions({ customer, hideUnavailableWhatsApp }: { customer: CustomerContactInfo; hideUnavailableWhatsApp?: boolean }) {
  const dialable = toDialable(customer.phone);
  const whatsapp = toWhatsApp(customer.phone);
  const location = contactLocation(customer);
  return (
    <View style={styles.actions}>
      <Button
        title="Llamar"
        icon="phone"
        variant="outline"
        size="sm"
        disabled={!dialable}
        onPress={() => dialable && open(`tel:${dialable}`, 'No se pudo abrir el marcador.')}
        style={styles.action}
      />
      {whatsapp || !hideUnavailableWhatsApp ? (
        <Button
          title="WhatsApp"
          icon="chat"
          variant="outline"
          size="sm"
          disabled={!whatsapp}
          onPress={() => whatsapp && open(`https://wa.me/${whatsapp}`, 'WhatsApp no está instalado.')}
          style={styles.action}
        />
      ) : null}
      <Button
        title="Mapa"
        icon="map"
        variant="outline"
        size="sm"
        disabled={!location}
        onPress={() =>
          location &&
          open(
            `https://maps.google.com/?q=${encodeURIComponent(location)}`,
            'No se pudo abrir el mapa.'
          )
        }
        style={styles.action}
      />
    </View>
  );
}

export function CustomerContactBlock({ customer, actionsOnly }: CustomerContactBlockProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  if (actionsOnly) {
    return (
      <View testID="customer-contact-actions">
        <ContactActions customer={customer} hideUnavailableWhatsApp />
      </View>
    );
  }

  const location = contactLocation(customer);

  return (
    <Card>
      <View style={styles.header}>
        <Text style={[styles.name, { color: colors.text.primary }]}>{customer.name}</Text>
        <Text style={[styles.meta, { color: colors.text.secondary }]}>
          {customer.id_number || 'Sin documento'}
        </Text>
      </View>

      {customer.phone ? (
        <View style={styles.line}>
          <MaterialIcons name="phone" size={18} color={colors.text.secondary} />
          <Text style={[styles.lineText, { color: colors.text.primary }]}>{customer.phone}</Text>
        </View>
      ) : null}
      {customer.email ? (
        <View style={styles.line}>
          <MaterialIcons name="mail-outline" size={18} color={colors.text.secondary} />
          <Text style={[styles.lineText, { color: colors.text.primary }]} numberOfLines={1}>
            {customer.email}
          </Text>
        </View>
      ) : null}
      {location ? (
        <View style={styles.line}>
          <MaterialIcons name="place" size={18} color={colors.text.secondary} />
          <Text style={[styles.lineText, { color: colors.text.primary }]}>{location}</Text>
        </View>
      ) : null}
      {customer.notes ? (
        <View style={styles.line}>
          <MaterialIcons name="sticky-note-2" size={18} color={colors.text.secondary} />
          <Text style={[styles.lineText, { color: colors.text.secondary }]}>{customer.notes}</Text>
        </View>
      ) : null}

      <ContactActions customer={customer} />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: Spacing.md },
  name: { ...Typography.headline },
  meta: { ...Typography.metadata },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  lineText: { ...Typography.bodySmall, flex: 1 },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  action: { flex: 1 },
});
