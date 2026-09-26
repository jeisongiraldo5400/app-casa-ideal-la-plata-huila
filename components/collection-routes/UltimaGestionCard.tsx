import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui';
import { IconSize, Spacing, Typography, type ThemeColors } from '@/constants/theme';
import {
  formatGestionDate,
  ultimaGestionStatusLabel,
  type UltimaGestion,
} from '@/lib/collection-routes/ultimaGestion';

/** Última novedad de ruta del negocio, en el detalle (sección de cobro). */
export function UltimaGestionCard({ gestion, colors }: { gestion: UltimaGestion | null | undefined; colors: ThemeColors }) {
  if (!gestion) return null;
  const date = formatGestionDate(gestion);
  return (
    <Card variant="outlined" style={styles.card}>
      <View style={styles.row} testID="negocio-ultima-gestion">
        <MaterialIcons
          name={gestion.stop_status === 'reprogramado' ? 'event-repeat' : 'money-off'}
          size={IconSize.md}
          color={colors.warning.dark}
        />
        <View style={styles.copy}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Última gestión en ruta</Text>
          <Text style={[styles.title, { color: colors.text.primary }]}>
            {ultimaGestionStatusLabel(gestion.stop_status)}
            {date ? ` · ${date}` : ''}
          </Text>
          {gestion.outcome_reason ? (
            <Text style={[styles.helper, { color: colors.text.primary }]}>Motivo: {gestion.outcome_reason}</Text>
          ) : null}
          {gestion.notes ? (
            <Text style={[styles.helper, { color: colors.text.secondary }]}>{gestion.notes}</Text>
          ) : null}
          {gestion.gestor_name ? (
            <Text style={[styles.helper, { color: colors.text.secondary }]}>Registró: {gestion.gestor_name}</Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  copy: { flex: 1, gap: 2 },
  label: { ...Typography.label },
  title: { ...Typography.bodyStrong },
  helper: { ...Typography.caption },
});
