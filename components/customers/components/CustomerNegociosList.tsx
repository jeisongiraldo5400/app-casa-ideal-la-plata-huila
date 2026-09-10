import { useTheme } from '@/components/theme';
import { ListCard, ScreenState, SectionHeader, StatusChip } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import { labelCustomerNegocioRole, type CustomerNegocioItem } from '@/lib/customers/customerNegocios';
import { formatNegocioCodigo, labelNegocioStatus, negocioStatusTone } from '@/lib/negocioLabels';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface CustomerNegociosListProps {
  negocios: CustomerNegocioItem[];
  onOpen: (negocioId: string) => void;
}

export function CustomerNegociosList({ negocios, onOpen }: CustomerNegociosListProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  return (
    <View>
      <SectionHeader title="Negocios" hint={negocios.length ? `${negocios.length}` : undefined} />
      {negocios.length === 0 ? (
        <ScreenState
          variant="inline"
          icon="inbox"
          title="Sin negocios"
          description="Este cliente todavía no tiene negocios que puedas ver."
        />
      ) : (
        <View style={styles.list}>
          {negocios.map((negocio) => (
            <ListCard
              key={negocio.negocio_id}
              onPress={() => onOpen(negocio.negocio_id)}
              accessibilityLabel={`Abrir negocio ${negocio.negocio_numero}`}
            >
              <View style={styles.row}>
                <Text style={[styles.code, { color: colors.text.primary }]}>
                  {formatNegocioCodigo(negocio.negocio_numero)}
                </Text>
                <StatusChip label={labelNegocioStatus(negocio.status)} tone={negocioStatusTone(negocio.status)} />
              </View>
              {negocio.role_in_negocio !== 'titular' ? (
                <Text style={[styles.meta, { color: colors.text.secondary }]}>
                  {labelCustomerNegocioRole(negocio.role_in_negocio)}
                </Text>
              ) : null}
              <Text style={[styles.meta, { color: colors.text.secondary }]} numberOfLines={1}>
                {[negocio.direccion, negocio.municipio_name].filter(Boolean).join(' · ')}
              </Text>
              <View style={styles.amounts}>
                <Text style={[styles.meta, { color: colors.text.secondary }]}>
                  Crédito {formatCOP(negocio.total_credit)}
                </Text>
                <Text
                  style={[
                    styles.amount,
                    { color: negocio.has_mora ? colors.error.main : colors.text.primary },
                  ]}
                >
                  Saldo {formatCOP(negocio.remaining_balance)}
                  {negocio.has_mora ? ' · en mora' : ''}
                </Text>
              </View>
            </ListCard>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  code: { ...Typography.bodyStrong },
  meta: { ...Typography.metadata, marginTop: 2 },
  amounts: { marginTop: Spacing.sm, gap: 2 },
  amount: { ...Typography.bodySmallStrong },
});
