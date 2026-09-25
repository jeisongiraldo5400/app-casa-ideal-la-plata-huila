import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import {
  useOfflineSelection,
  type SyncPrefDomain,
} from './infrastructure/syncPrefsService';

export const NOT_ON_PHONE_TITLE = 'No está en el teléfono';
export const NOT_ON_PHONE_MESSAGE =
  'No está en el teléfono. Con señal, márcalo con «Llevar en el teléfono».';

/**
 * ¿Hay que explicar que algo puede faltar porque el dominio está en «Solo lo
 * que elijo»? Solo tiene sentido con datos locales (sin señal).
 */
export function useNotOnPhone(domain: SyncPrefDomain, fromCache: boolean) {
  const selection = useOfflineSelection(domain);
  return fromCache && selection.supported && selection.mode === 'seleccion';
}

type Props = { domain: SyncPrefDomain; fromCache: boolean };

/** Línea para estados vacíos sin señal cuando el dominio está en selección. */
export function NotOnPhoneNotice({ domain, fromCache }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const show = useNotOnPhone(domain, fromCache);
  if (!show) return null;
  return (
    <Text style={[styles.text, { color: colors.text.secondary }]} testID="not-on-phone-notice">
      {NOT_ON_PHONE_MESSAGE}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { ...Typography.caption, textAlign: 'center', marginTop: Spacing.sm, paddingHorizontal: Spacing.lg },
});
