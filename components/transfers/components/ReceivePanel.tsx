import { useTheme } from '@/components/theme';
import { Button, Card, Input, SectionHeader } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import React, { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTransferDraft } from '../infrastructure/hooks/useTransferDraft';
import { useTransferSubmit } from '../infrastructure/hooks/useTransferSubmit';
import { receiveTransfer } from '../infrastructure/services/transfersService';
import { deleteTransferPhotos, uploadPendingTransferPhotos } from '../infrastructure/services/transferPhotosService';
import {
  droppedUploadedPhotos,
  optionalPhotoPath,
  transferPhotoPath,
  withDamagedPhotoPaths,
  type TransferPhotoDraft,
} from '../utils/transferPhotos';
import type { TransferDetail } from '../utils/transferModel';
import {
  lineNeedsSerials,
  maxReceive,
  receiveAllOk,
  validateReceive,
  type ReceiveDraft,
  type ReceiveLineDraft,
  type ReceivePayloadItem,
  type ReceiveSummary,
} from '../utils/transferRules';
import { receiveConfirmText, sentLineText, unitsText } from '../utils/transferTexts';
import { ConfirmTransferSheet } from './ConfirmTransferSheet';
import { QuantityStepper } from './QuantityStepper';
import { SerialsTextField } from './SerialsTextField';
import { TransferPhotoField } from './TransferPhotoField';

type Props = {
  detail: TransferDetail;
  online: boolean;
  onDone: (message: string) => void;
};

type Review = { items: ReceivePayloadItem[]; summary: ReceiveSummary };

const EMPTY_LINE: ReceiveLineDraft = { ok: 0, damaged: 0, okSerialsText: '', damagedSerialsText: '' };

/** Fotos de avería que viajan: solo las de líneas con unidades averiadas en esta recepción. */
function damagedPhotosToSend(draft: ReceiveDraft, items: ReceivePayloadItem[]): Record<string, TransferPhotoDraft> {
  const photos: Record<string, TransferPhotoDraft> = {};
  for (const item of items) {
    const photo = draft.lines[item.item_id]?.damagedPhoto;
    if (item.condition === 'damaged' && photo) photos[item.item_id] = photo;
  }
  return photos;
}

/**
 * Recibir: por línea cuánto llegó bien y cuánto averiado (≤ en tránsito),
 * seriales si salieron con seriales, «Falta» y notas. Se permite parcial.
 */
export function ReceivePanel({ detail, online, onDone }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { order } = detail;
  const { draft, setDraft, clearDraft } = useTransferDraft(detail, 'receive');
  const submit = useTransferSubmit();
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const pendingItems = detail.items.filter((item) => maxReceive(item) > 0);

  const updateLine = (itemId: string, patch: Partial<ReceiveLineDraft>) => {
    const current = draft.lines[itemId] ?? EMPTY_LINE;
    setDraft({ ...draft, lines: { ...draft.lines, [itemId]: { ...current, ...patch } } });
    if (lineErrors[itemId]) setLineErrors(({ [itemId]: _removed, ...rest }) => rest);
  };

  const openReview = () => {
    const result = validateReceive(detail, draft);
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
    const { reportMissing, notes, photo } = draft;
    const linePhotos = damagedPhotosToSend(draft, review.items);
    const pathsByItem: Record<string, string> = {};
    for (const [itemId, linePhoto] of Object.entries(linePhotos)) pathsByItem[itemId] = transferPhotoPath(order.id, linePhoto);
    const items = withDamagedPhotoPaths(review.items, pathsByItem);
    const photoPath = optionalPhotoPath(order.id, photo);
    const pending = [...(photo ? [photo] : []), ...Object.values(linePhotos)];
    const result = await submit.run(
      'transfer_receive',
      { id: order.id, items, reportMissing, notes: notes.trim(), photoPath },
      (idempotencyKey) =>
        receiveTransfer({ transferOrderId: order.id, items, reportMissing, notes, photoPath, idempotencyKey }),
      pending.length
        ? async () => {
            // Cada foto que sube queda marcada: si otra falla, el reintento no la repite.
            let next = draft;
            await uploadPendingTransferPhotos(order.id, pending, (uploaded) => {
              if (next.photo?.id === uploaded.id) next = { ...next, photo: uploaded };
              const lines = { ...next.lines };
              for (const [itemId, line] of Object.entries(lines)) {
                if (line.damagedPhoto?.id === uploaded.id) lines[itemId] = { ...line, damagedPhoto: uploaded };
              }
              next = { ...next, lines };
              setDraft(next);
            });
          }
        : undefined
    );
    if (!result) return;
    // Una foto de avería que subió en un intento anterior y luego la línea
    // quedó sin averías no la cita el traslado: se borra.
    void deleteTransferPhotos(
      order.id,
      droppedUploadedPhotos(
        Object.values(draft.lines).map((line) => line.damagedPhoto),
        pending
      )
    );
    setReview(null);
    clearDraft();
    const received = review.summary.ok + review.summary.damaged;
    onDone(
      (received > 0
        ? `Recibiste ${unitsText(received)} de ${result.orderNumber} en ${order.destinationWarehouse.name}.`
        : `Informaste que no llegó el resto de ${result.orderNumber}.`) +
        (result.replayed ? ' (Ya estaba registrado; no se repitió.)' : '')
    );
  };

  return (
    <View style={styles.container}>
      <SectionHeader title="Recibir" hint={`${pendingItems.length} producto${pendingItems.length === 1 ? '' : 's'} en camino`} />
      <Text style={[styles.help, { color: colors.text.secondary }]}>
        Cuenta lo que llegó a {order.destinationWarehouse.name}. Puedes recibir una parte ahora y el resto después.
      </Text>
      <Button
        title="Llegó todo en buen estado"
        variant="outline"
        size="sm"
        icon="done-all"
        onPress={() => setDraft(receiveAllOk(detail, draft))}
        disabled={submit.submitting}
      />

      {pendingItems.map((item) => {
        const line = draft.lines[item.id] ?? EMPTY_LINE;
        const max = maxReceive(item);
        const needsSerials = lineNeedsSerials(item, 'in_transit');
        return (
          <Card key={item.id} variant="outlined" style={styles.card}>
            <Text style={[styles.sent, { color: colors.text.primary }]}>{sentLineText(item, order)}</Text>
            <Text style={[styles.meta, { color: colors.text.secondary }]}>
              {item.productSku ? `SKU ${item.productSku} · ` : ''}Por recibir: {max}
              {item.receivedQuantity > 0 ? ` · Ya recibido: ${item.receivedQuantity}` : ''}
            </Text>
            <QuantityStepper
              label="Llegó bien"
              productName={item.productName}
              value={line.ok}
              max={max - line.damaged}
              onChange={(ok) => updateLine(item.id, { ok })}
              disabled={submit.submitting}
            />
            <QuantityStepper
              label="Llegó averiada"
              productName={item.productName}
              value={line.damaged}
              max={max - line.ok}
              onChange={(damaged) => updateLine(item.id, { damaged })}
              disabled={submit.submitting}
            />
            {needsSerials && line.ok > 0 ? (
              <SerialsTextField
                label="Seriales de las que llegaron bien"
                productName={item.productName}
                value={line.okSerialsText}
                expected={line.ok}
                onChange={(okSerialsText) => updateLine(item.id, { okSerialsText })}
                editable={!submit.submitting}
              />
            ) : null}
            {needsSerials && line.damaged > 0 ? (
              <SerialsTextField
                label="Seriales de las averiadas"
                productName={item.productName}
                value={line.damagedSerialsText}
                expected={line.damaged}
                onChange={(damagedSerialsText) => updateLine(item.id, { damagedSerialsText })}
                editable={!submit.submitting}
              />
            ) : null}
            {line.damaged > 0 ? (
              <TransferPhotoField
                label="Foto de la avería (opcional)"
                photo={line.damagedPhoto ?? null}
                onChange={(damagedPhoto) => {
                  void deleteTransferPhotos(order.id, droppedUploadedPhotos([line.damagedPhoto], [damagedPhoto]));
                  updateLine(item.id, { damagedPhoto });
                }}
                disabled={submit.submitting}
              />
            ) : null}
            {needsSerials && line.ok + line.damaged === 0 ? (
              <Text style={[styles.meta, { color: colors.text.secondary }]}>
                Salió con seriales: al recibir escribe el serial de cada unidad.
              </Text>
            ) : null}
            {lineErrors[item.id] ? (
              <Text style={[styles.error, { color: colors.error.main }]}>{lineErrors[item.id]}</Text>
            ) : null}
          </Card>
        );
      })}

      <Card variant="outlined" style={styles.missingRow}>
        <View style={styles.missingCopy}>
          <Text style={[styles.product, { color: colors.text.primary }]}>Falta: el resto no llegó</Text>
          <Text style={[styles.meta, { color: colors.text.secondary }]}>
            Márcalo si lo que no contaste no va a llegar. El administrador resolverá la diferencia.
          </Text>
        </View>
        <Switch
          value={draft.reportMissing}
          onValueChange={(reportMissing) => setDraft({ ...draft, reportMissing })}
          disabled={submit.submitting}
          accessibilityLabel="Falta: el resto no llegó"
        />
      </Card>

      <Input
        label="Notas de la recepción (opcional)"
        value={draft.notes}
        onChangeText={(notes) => setDraft({ ...draft, notes })}
        multiline
        editable={!submit.submitting}
        style={styles.notes}
      />

      <TransferPhotoField
        label="Foto de lo que llegó (opcional)"
        photo={draft.photo}
        onChange={(photo) => {
          void deleteTransferPhotos(order.id, droppedUploadedPhotos([draft.photo], [photo]));
          setDraft({ ...draft, photo });
        }}
        disabled={submit.submitting}
      />

      {formError ? <Text style={[styles.error, { color: colors.error.main }]}>{formError}</Text> : null}
      {submit.error && !review ? <Text style={[styles.error, { color: colors.error.main }]}>{submit.error}</Text> : null}

      <Button title="Revisar y recibir" icon="move-to-inbox" onPress={openReview} disabled={!online || submit.submitting} />

      <ConfirmTransferSheet
        visible={review !== null}
        title={`Recibir ${order.orderNumber}`}
        summary={
          review
            ? receiveConfirmText(review.summary, order) +
              photosText(draft, review.items) +
              (submit.error ? `\n\n${submit.error}` : '')
            : ''
        }
        confirmLabel="Confirmar recepción"
        submitting={submit.submitting}
        disabled={!online}
        onConfirm={() => void confirm()}
        onClose={() => setReview(null)}
      />
    </View>
  );
}

function photosText(draft: ReceiveDraft, items: ReceivePayloadItem[]): string {
  const count = (draft.photo ? 1 : 0) + Object.keys(damagedPhotosToSend(draft, items)).length;
  return count ? `\n\nFotos adjuntas: ${count}.` : '';
}

const styles = StyleSheet.create({
  container: { gap: Spacing.md },
  help: { ...Typography.caption },
  card: { gap: Spacing.sm },
  sent: { ...Typography.bodySmallStrong },
  product: { ...Typography.bodyStrong },
  meta: { ...Typography.caption },
  error: { ...Typography.bodySmall },
  missingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  missingCopy: { flex: 1, gap: 2 },
  notes: { minHeight: 64, textAlignVertical: 'top' },
});
