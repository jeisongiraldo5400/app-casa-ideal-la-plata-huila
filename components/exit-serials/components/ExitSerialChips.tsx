import { useTheme } from '@/components/theme';
import { Radius, getColors } from '@/constants/theme';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import {
  ExitSerialRecord,
  SERIAL_RELEASE_SHORT_LABEL,
  serialMatchesQuery,
} from '../infrastructure/services/exitSerialsService';

interface ExitSerialChipsProps {
  serials: ExitSerialRecord[] | undefined;
  /** Texto buscado: resalta el serial que explica por qué la fila coincidió. */
  highlightQuery?: string;
}

const MONOSPACE = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * Chips "S/N …" de una salida. Los seriales liberados (salida anulada o aparato
 * devuelto) se ven atenuados y tachados, con una etiqueta corta del motivo.
 * Sin seriales no ocupa espacio.
 */
export function ExitSerialChips({ serials, highlightQuery = '' }: ExitSerialChipsProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  if (!serials || serials.length === 0) return null;

  return (
    <View style={styles.container} testID="exit-serial-chips">
      {serials.map((serial, index) => {
        const releasedLabel = serial.releasedReason ? SERIAL_RELEASE_SHORT_LABEL[serial.releasedReason] : null;
        const highlighted = serialMatchesQuery(serial, highlightQuery);

        return (
          <View
            key={`${serial.normalized}-${index}`}
            accessible
            accessibilityLabel={`Serial ${serial.serial}${releasedLabel ? `, ${releasedLabel}` : ''}`}
            style={[
              styles.chip,
              {
                borderColor: highlighted ? colors.primary.main : colors.divider,
                backgroundColor: highlighted ? colors.primary.main + '14' : colors.background.default,
              },
              releasedLabel ? styles.released : null,
            ]}
          >
            <Text
              style={[
                styles.serialText,
                { color: colors.text.primary },
                releasedLabel ? styles.strikethrough : null,
              ]}
            >
              S/N {serial.serial}
            </Text>
            {releasedLabel ? (
              <Text style={[styles.releasedLabel, { color: colors.text.secondary }]}>{releasedLabel}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: Radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  released: {
    opacity: 0.6,
  },
  serialText: {
    fontSize: 12,
    fontFamily: MONOSPACE,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  releasedLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
});
