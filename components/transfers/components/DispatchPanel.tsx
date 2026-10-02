import { kickNotificationDispatch } from '@/components/notifications/infrastructure/services/dispatchNotifications';
import { useTheme } from '@/components/theme';
import { Button, Card, Input, OptionPickerField, SectionHeader } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { logHandledError } from '@/lib/errorMessage';
import { fetchSellerOptions, type SellerOption } from '@/lib/users/sellersService';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTransferDraft } from '../infrastructure/hooks/useTransferDraft';
import { useTransferSubmit } from '../infrastructure/hooks/useTransferSubmit';
import { dispatchTransfer } from '../infrastructure/services/transfersService';
import { deleteTransferPhotos, uploadPendingTransferPhotos } from '../infrastructure/services/transferPhotosService';
import { droppedUploadedPhotos, optionalPhotoPath } from '../utils/transferPhotos';
import type { TransferDetail } from '../utils/transferModel';
import {
  maxDispatch,
  validateDispatch,
  type DispatchSummary,
  type DispatchPayloadItem,
} from '../utils/transferRules';
import { dispatchConfirmText, receiverLineText, unitsText } from '../utils/transferTexts';
import { ConfirmTransferSheet } from './ConfirmTransferSheet';
import { QuantityStepper } from './QuantityStepper';
import { SerialsTextField } from './SerialsTextField';
import { TransferPhotoField } from './TransferPhotoField';

type Props = {
  detail: TransferDetail;
  online: boolean;
  onDone: (message: string) => void;
};

type Review = { items: DispatchPayloadItem[]; summary: DispatchSummary };

/** Despachar: cantidad por línea (≤ reservada), transportador, notas y seriales opcionales. */
export function DispatchPanel({ detail, online, onDone }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { order } = detail;
  const { draft, setDraft, clearDraft } = useTransferDraft(detail, 'dispatch');
  const submit = useTransferSubmit();
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [serialsOpen, setSerialsOpen] = useState<Record<string, boolean>>({});
  const [people, setPeople] = useState<SellerOption[]>([]);

  useEffect(() => {
    if (!online) return;
    let active = true;
    fetchSellerOptions()
      .then((options) => {
        if (active) setPeople(options);
      })
      .catch((error) => logHandledError('Traslados: transportadores', error));
    return () => {
      active = false;
    };
  }, [online]);

  const carrierOptions = useMemo(
    () =>
      people
        .filter((person) => person.id !== order.carrier?.id)
        .map((person) => ({ value: person.id, label: person.full_name })),
    [order.carrier?.id, people]
  );
  const carrierName = draft.carrierId
    ? people.find((person) => person.id === draft.carrierId)?.full_name ?? null
    : order.carrier?.name ?? null;

  const updateLine = (itemId: string, patch: Partial<{ quantity: number; serialsText: string }>) => {
    const current = draft.lines[itemId] ?? { quantity: 0, serialsText: '' };
    setDraft({ ...draft, lines: { ...draft.lines, [itemId]: { ...current, ...patch } } });
    if (lineErrors[itemId]) setLineErrors(({ [itemId]: _removed, ...rest }) => rest);
  };

  const openReview = () => {
    const result = validateDispatch(detail, draft);
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
    const carrierUserId = draft.carrierId || null;
    const notes = draft.notes;
    const photo = draft.photo;
    const photoPath = optionalPhotoPath(order.id, photo);
    const result = await submit.run(
      'transfer_dispatch',
      { id: order.id, items: review.items, carrierUserId, notes: notes.trim(), photoPath },
      (idempotencyKey) =>
        dispatchTransfer({
          transferOrderId: order.id,
          items: review.items,
          carrierUserId,
          notes,
          photoPath,
          idempotencyKey,
        }),
      photo
        ? () => uploadPendingTransferPhotos(order.id, [photo], (uploaded) => setDraft({ ...draft, photo: uploaded }))
        : undefined
    );
    if (!result) return;
    // El aviso «en camino» ya está en cola; el empujón solo lo adelanta.
    kickNotificationDispatch();
    setReview(null);
    clearDraft();
    onDone(
      `${result.orderNumber} despachado: ${unitsText(review.summary.units)} en camino a ${order.destinationWarehouse.name}.` +
        (result.replayed ? ' (Ya estaba registrado; no se repitió.)' : '')
    );
  };

  return (
    <View style={styles.container}>
      <SectionHeader title="Despachar" hint={`${detail.items.length} producto${detail.items.length === 1 ? '' : 's'}`} />
      <Text style={[styles.help, { color: colors.text.secondary }]}>
        Marca cuántas unidades salen de {order.sourceWarehouse.name}. Lo que no salga vuelve al disponible.
      </Text>

      {detail.items.map((item) => {
        const line = draft.lines[item.id] ?? { quantity: 0, serialsText: '' };
        const max = maxDispatch(item);
        const showSerials = serialsOpen[item.id] || line.serialsText.length > 0;
        return (
          <Card key={item.id} variant="outlined" style={styles.card}>
            <Text style={[styles.product, { color: colors.text.primary }]}>{item.productName}</Text>
            <Text style={[styles.meta, { color: colors.text.secondary }]}>
              {item.productSku ? `SKU ${item.productSku} · ` : ''}Reservado: {max}
              {item.notes ? ` · ${item.notes}` : ''}
            </Text>
            <QuantityStepper
              label="A despachar"
              productName={item.productName}
              value={line.quantity}
              max={max}
              onChange={(quantity) => updateLine(item.id, { quantity })}
              disabled={submit.submitting}
            />
            {showSerials ? (
              <SerialsTextField
                label="Seriales (opcional)"
                productName={item.productName}
                value={line.serialsText}
                expected={line.quantity}
                onChange={(serialsText) => updateLine(item.id, { serialsText })}
                editable={!submit.submitting}
              />
            ) : line.quantity > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setSerialsOpen((open) => ({ ...open, [item.id]: true }))}
              >
                <Text style={[styles.link, { color: colors.primary.main }]}>Agregar seriales (opcional)</Text>
              </Pressable>
            ) : null}
            {lineErrors[item.id] ? (
              <Text style={[styles.error, { color: colors.error.main }]}>{lineErrors[item.id]}</Text>
            ) : null}
          </Card>
        );
      })}

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.primary }]}>Transportador (opcional)</Text>
        <OptionPickerField
          value={draft.carrierId}
          onValueChange={(carrierId) => setDraft({ ...draft, carrierId })}
          options={carrierOptions}
          // El transportador se elige aquí (ya no al crear); un traslado viejo
          // que ya lo traía lo muestra como elegido.
          placeholder={order.carrier ? `Transporta: ${order.carrier.name}` : 'Sin transportador'}
          modalTitle="¿Quién transporta?"
          colors={colors}
          disabled={submit.submitting || !online}
        />
      </View>

      {/* Quién recibe lo asigna el admin al crear el traslado (20261231470000). */}
      <Text style={[styles.label, { color: order.receiver ? colors.text.primary : colors.warning.dark }]}>
        {receiverLineText(order.receiver)}
      </Text>

      <Input
        label="Notas del despacho (opcional)"
        value={draft.notes}
        onChangeText={(notes) => setDraft({ ...draft, notes })}
        multiline
        editable={!submit.submitting}
        style={styles.notes}
      />

      <TransferPhotoField
        label="Foto de la carga (opcional)"
        photo={draft.photo}
        onChange={(photo) => {
          void deleteTransferPhotos(order.id, droppedUploadedPhotos([draft.photo], [photo]));
          setDraft({ ...draft, photo });
        }}
        disabled={submit.submitting}
      />

      {formError ? <Text style={[styles.error, { color: colors.error.main }]}>{formError}</Text> : null}
      {submit.error && !review ? <Text style={[styles.error, { color: colors.error.main }]}>{submit.error}</Text> : null}

      <Button
        title="Revisar y despachar"
        icon="local-shipping"
        onPress={openReview}
        disabled={!online || submit.submitting}
      />

      <ConfirmTransferSheet
        visible={review !== null}
        title={`Despachar ${order.orderNumber}`}
        summary={
          review
            ? dispatchConfirmText(review.summary, order, carrierName) +
              (draft.photo ? '\n\nCon foto de la carga.' : '') +
              (submit.error ? `\n\n${submit.error}` : '')
            : ''
        }
        confirmLabel="Confirmar despacho"
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
  field: { gap: Spacing.xs },
  label: { ...Typography.bodySmallStrong },
  help: { ...Typography.caption },
  card: { gap: Spacing.sm },
  product: { ...Typography.bodyStrong },
  meta: { ...Typography.caption },
  link: { ...Typography.bodySmallStrong },
  error: { ...Typography.bodySmall },
  notes: { minHeight: 64, textAlignVertical: 'top' },
});
