import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, FullScreenModal, Input } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { errorMessage } from '@/lib/errorMessage';
import type { PrivateCatalog } from '@/lib/catalogos/types';
import { INTRODUCTION_MAX, hasErrors, normalizeOptionalText, validateCoverText, type CoverTextErrors } from '@/lib/catalogos/validators';
import { updateCatalogCoverText } from '../infrastructure/services/catalogsService';

interface CatalogTextsSheetProps {
  visible: boolean;
  catalog: PrivateCatalog;
  onClose: () => void;
  onSaved: (values: { internalTitle: string; publicTitle: string; introduction: string | null }) => void;
}

/** Formulario simple para cambiar el nombre del catálogo y su bienvenida. */
export function CatalogTextsSheet({ visible, catalog, onClose, onSaved }: CatalogTextsSheetProps) {
  const [internalTitle, setInternalTitle] = useState(catalog.internalTitle);
  const [introduction, setIntroduction] = useState(catalog.introduction ?? '');
  const [errors, setErrors] = useState<CoverTextErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setInternalTitle(catalog.internalTitle);
    setIntroduction(catalog.introduction ?? '');
    setErrors({});
    setSubmitError(null);
  }, [visible, catalog]);

  const save = async () => {
    const validation = validateCoverText({ internalTitle, publicTitle: internalTitle, introduction });
    setErrors(validation);
    if (hasErrors(validation)) return;
    setSaving(true);
    setSubmitError(null);
    try {
      const values = {
        internalTitle: internalTitle.trim(),
        publicTitle: internalTitle.trim(),
        introduction: normalizeOptionalText(introduction, INTRODUCTION_MAX).value,
      };
      await updateCatalogCoverText(catalog.id, values);
      onSaved(values);
      onClose();
    } catch (caught) {
      setSubmitError(errorMessage(caught, 'No fue posible guardar los textos.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FullScreenModal
      visible={visible}
      onClose={onClose}
      title="Nombre y bienvenida"
      subtitle="Lo que verá el cliente en la portada"
      dismissable={!saving}
      footer={
        <>
          <Button title="Cancelar" variant="outline" onPress={onClose} disabled={saving} style={styles.secondary} />
          <Button title="Guardar" onPress={() => void save()} loading={saving} style={styles.primary} />
        </>
      }>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Input
          label="Nombre del catálogo"
          value={internalTitle}
          onChangeText={setInternalTitle}
          error={errors.internalTitle}
          placeholder="P. ej. Apartamentos septiembre"
          maxLength={120}
        />
        <Input
          label="Introducción"
          value={introduction}
          onChangeText={setIntroduction}
          error={errors.introduction ?? submitError ?? undefined}
          placeholder="Unas líneas de bienvenida (opcional)"
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          style={styles.multiline}
          maxLength={INTRODUCTION_MAX}
        />
      </ScrollView>
    </FullScreenModal>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.xl, gap: Spacing.md },
  multiline: { minHeight: 120 },
  secondary: { flex: 1 },
  primary: { flex: 2 },
});
