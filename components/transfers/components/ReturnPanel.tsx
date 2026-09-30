import { useTheme } from '@/components/theme';
import { Button, Card, Input, SectionHeader } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTransferDraft } from '../infrastructure/hooks/useTransferDraft';
import { useTransferSubmit } from '../infrastructure/hooks/useTransferSubmit';
import { confirmTransferReturn } from '../infrastructure/services/transfersService';
import type { TransferDetail } from '../utils/transferModel';
import {
  lineNeedsSerials,
  maxReturn,
  returnAll,
  validateReturn,
  type ReturnLineDraft,
  type ReturnPayloadItem,
  type ReturnSummary,
} from '../utils/transferRules';
import { returnConfirmText, unitsText } from '../utils/transferTexts';
import { ConfirmTransferSheet } from './ConfirmTransferSheet';
import { QuantityStepper } from './QuantityStepper';
import { SerialsTextField } from './SerialsTextField';

type Props = {
  detail: TransferDetail;
  online: boolean;
  onDone: (message: string) => void;
};

type Review = { items: ReturnPayloadItem[]; summary: ReturnSummary };

const EMPTY_LINE: ReturnLineDraft = { quantity: 0, serialsText: '' };

/** Confirmar en el origen lo que el administrador mandó devolver. */
export function ReturnPanel({ detail, online, onDone }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { order } = detail;
  const { draft, setDraft, clearDraft } = useTransferDraft(detail, 'return');
  const submit = useTransferSubmit();
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const pendingItems = detail.items.filter((item) => maxReturn(item) > 0);

  const updateLine = (itemId: string, patch: Partial<ReturnLineDraft>) => {
    const current = draft.lines[itemId] ?? EMPTY_LINE;
    setDraft({ ...draft, lines: { ...draft.lines, [itemId]: { ...current, ...patch } } });
    if (lineErrors[itemId]) setLineErrors(({ [itemId]: _removed, ...rest }) => rest);
  };

  const openReview = () => {
    const result = validateReturn(detail, draft);
    if (!result.ok) {
      setLineErrors(result.lineErrors);
      setFormError(result.message);
      return;
    }
    setLineErrors({});
    setFormError(null);
    submit.setError(null);
    setReview({ items: result.items, summary: result.summary });
  };

  const confirm = async () => {
    if (!review) return;
    const { notes } = draft;
    const result = await submit.run(
      'transfer_return',
      { id: order.id, items: review.items, notes: notes.trim() },
      (idempotencyKey) => confirmTransferReturn({ transferOrderId: order.id, items: review.items, notes, idempotencyKey })
    );
    if (!result) return;
    setReview(null);
    clearDraft();
    onDone(
      `Confirmaste que volvieron ${unitsText(review.summary.units)} de ${result.orderNumber} a ${order.sourceWarehouse.name}.` +
        (result.replayed ? ' (Ya estaba registrado; no se repitió.)' : '')
    );
  };

  return (
    <View style={styles.container}>
      <SectionHeader title="Devolución al origen" />
      <Text style={[styles.help, { color: colors.text.secondary }]}>
        El administrador mandó devolver estas unidades a {order.sourceWarehouse.name}. Marca las que ya llegaron.
      </Text>
      <Button
        title="Volvió todo"
        variant="outline"
        size="sm"
        icon="done-all"
        onPress={() => setDraft(returnAll(detail, draft))}
        disabled={submit.submitting}
      />

      {pendingItems.map((item) => {
        const line = draft.lines[item.id] ?? EMPTY_LINE;
        const max = maxReturn(item);
        const needsSerials = lineNeedsSerials(item, 'return_pending');
        return (
          <Card key={item.id} variant="outlined" style={styles.card}>
            <Text style={[styles.product, { color: colors.text.primary }]}>{item.productName}</Text>
            <Text style={[styles.meta, { color: colors.text.secondary }]}>
              {item.productSku ? `SKU ${item.productSku} · ` : ''}Mandadas a devolver: {max}
            </Text>
            <QuantityStepper
              label="Volvieron"
              productName={item.productName}
              value={line.quantity}
              max={max}
              onChange={(quantity) => updateLine(item.id, { quantity })}
              disabled={submit.submitting}
            />
            {needsSerials && line.quantity > 0 ? (
              <SerialsTextField
                label="Seriales de las que volvieron"
                productName={item.productName}
                value={line.serialsText}
                expected={line.quantity}
                onChange={(serialsText) => updateLine(item.id, { serialsText })}
                editable={!submit.submitting}
              />
            ) : null}
            {lineErrors[item.id] ? (
              <Text style={[styles.error, { color: colors.error.main }]}>{lineErrors[item.id]}</Text>
            ) : null}
          </Card>
        );
      })}

      <Input
        label="Notas (opcional)"
        value={draft.notes}
        onChangeText={(notes) => setDraft({ ...draft, notes })}
        multiline
        editable={!submit.submitting}
        style={styles.notes}
      />

      {formError ? <Text style={[styles.error, { color: colors.error.main }]}>{formError}</Text> : null}
      {submit.error && !review ? <Text style={[styles.error, { color: colors.error.main }]}>{submit.error}</Text> : null}

      <Button title="Revisar y confirmar" icon="assignment-return" onPress={openReview} disabled={!online || submit.submitting} />

      <ConfirmTransferSheet
        visible={review !== null}
        title={`Devolución de ${order.orderNumber}`}
        summary={review ? returnConfirmText(review.summary, order) + (submit.error ? `\n\n${submit.error}` : '') : ''}
        confirmLabel="Confirmar devolución"
        submitting={submit.submitting}
        disabled={!online}
        onConfirm={() => void confirm()}
        onClose={() => setReview(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.md },
  help: { ...Typography.caption },
  card: { gap: Spacing.sm },
  product: { ...Typography.bodyStrong },
  meta: { ...Typography.caption },
  error: { ...Typography.bodySmall },
  notes: { minHeight: 64, textAlignVertical: 'top' },
});
