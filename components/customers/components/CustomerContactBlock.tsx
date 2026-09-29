import { useTheme } from '@/components/theme';
import { Button, Card } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import type { CustomerSummaryCustomer } from '@/lib/customers/customerSummary';
import { customerPhoneList } from '../domain/customerPhones';

/** Lo mínimo para llamar, escribir y ubicar al cliente. */
export type CustomerContactInfo = Pick<
  CustomerSummaryCustomer,
  'name' | 'id_number' | 'phone' | 'email' | 'address' | 'vereda_name' | 'municipio_name' | 'departamento_name'
> & {
  notes?: string | null;
  /** Segundo teléfono, opcional (20261231240000). */
  phone_secondary?: string | null;
};

interface CustomerContactBlockProps {
  customer: CustomerContactInfo;
  /**
   * Solo los botones (Llamar, WhatsApp si hay número, Mapa), sin tarjeta ni
   * datos: para pantallas que ya muestran al cliente, como la ficha del negocio.
   */
  actionsOnly?: boolean;
}

/** Solo dígitos; los teléfonos se guardan con espacios y signos. */
export function toDialable(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 ? digits : null;
}

/** Colombia: wa.me exige indicativo, y los móviles locales son de 10 dígitos. */
export function toWhatsApp(phone: string | null): string | null {
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

/** Número que sirve para la acción, con el teléfono tal como se muestra. */
type ContactTarget = { label: string; value: string };

/**
 * Con un solo número la acción se abre directo; con dos pregunta a cuál
 * (teléfono 1 o teléfono 2).
 */
function pickAndOpen(targets: ContactTarget[], title: string, toUrl: (value: string) => string, fallback: string) {
  if (targets.length === 0) return;
  if (targets.length === 1) {
    void open(toUrl(targets[0].value), fallback);
    return;
  }
  Alert.alert(title, '¿A qué número?', [
    ...targets.map((target) => ({ text: target.label, onPress: () => void open(toUrl(target.value), fallback) })),
    { text: 'Cancelar', style: 'cancel' as const },
  ]);
}

function ContactActions({ customer, hideUnavailableWhatsApp }: { customer: CustomerContactInfo; hideUnavailableWhatsApp?: boolean }) {
  const phones = customerPhoneList(customer.phone, customer.phone_secondary);
  const dialTargets = phones.flatMap((phone) => {
    const value = toDialable(phone);
    return value ? [{ label: phone, value }] : [];
  });
  const whatsappTargets = phones.flatMap((phone) => {
    const value = toWhatsApp(phone);
    return value ? [{ label: phone, value }] : [];
  });
  const location = contactLocation(customer);
  return (
    <View style={styles.actions}>
      <Button
        title="Llamar"
        icon="phone"
        variant="outline"
        size="sm"
        disabled={dialTargets.length === 0}
        onPress={() => pickAndOpen(dialTargets, 'Llamar', (value) => `tel:${value}`, 'No se pudo abrir el marcador.')}
        style={styles.action}
      />
      {whatsappTargets.length > 0 || !hideUnavailableWhatsApp ? (
        <Button
          title="WhatsApp"
          icon="chat"
          variant="outline"
          size="sm"
          disabled={whatsappTargets.length === 0}
          onPress={() =>
            pickAndOpen(whatsappTargets, 'WhatsApp', (value) => `https://wa.me/${value}`, 'WhatsApp no está instalado.')
          }
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
  const phones = customerPhoneList(customer.phone, customer.phone_secondary);

  return (
    <Card>
      <View style={styles.header}>
        <Text style={[styles.name, { color: colors.text.primary }]}>{customer.name}</Text>
        <Text style={[styles.meta, { color: colors.text.secondary }]}>
          {customer.id_number || 'Sin documento'}
        </Text>
      </View>

      {phones.map((phone, index) => (
        <View key={phone} style={styles.line}>
          <MaterialIcons name="phone" size={18} color={colors.text.secondary} />
          <Text style={[styles.lineText, { color: colors.text.primary }]}>
            {phone}
            {phones.length > 1 ? (
              <Text style={{ color: colors.text.secondary }}>{index === 0 ? '  · Teléfono 1' : '  · Teléfono 2'}</Text>
            ) : null}
          </Text>
        </View>
      ))}
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
