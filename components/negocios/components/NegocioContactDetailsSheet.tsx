import { useTheme } from '@/components/theme';
import { Button, FullScreenModal, Input, OptionPickerField } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errorMessage';
import {
  EMPTY_LOCATION_MASTERS,
  fetchLocationMasters,
  type LocationMasters,
} from '@/lib/locations/locationsService';
import {
  negocioContactDetailsChanged,
  negocioContactDetailsError,
  negocioLockedEditMessage,
} from '@/lib/negocios/negocioEditRules';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  updateNegocioContactDetails,
  type NegocioContactDetailsResult,
} from '../infrastructure/services/negocioContactDetailsService';

export type NegocioContactDetailsTarget = {
  id: string;
  numero: number | null;
  status: string;
  direccion: string | null;
  municipio_id: string | null;
  vereda_id: string | null;
  notes: string | null;
  /** Nombres actuales: permiten conservar un municipio o vereda que se desactivó. */
  municipioNombre?: string | null;
  veredaNombre?: string | null;
};

type Props = {
  visible: boolean;
  negocio: NegocioContactDetailsTarget;
  onClose: () => void;
  onSaved: (result: NegocioContactDetailsResult) => void | Promise<void>;
};

/**
 * «Editar dirección y notas» de un negocio activo, entregado o cerrado. Solo
 * con conexión (RPC directo, sin cola offline). Lo demás no se edita: un
 * administrador anula el negocio y se crea otro.
 */
export function NegocioContactDetailsSheet({ visible, negocio, onClose, onSaved }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [masters, setMasters] = useState<LocationMasters>(EMPTY_LOCATION_MASTERS);
  const [departamentoId, setDepartamentoId] = useState('');
  const [municipioId, setMunicipioId] = useState('');
  const [veredaId, setVeredaId] = useState('');
  const [direccion, setDireccion] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setMunicipioId(negocio.municipio_id || '');
    setVeredaId(negocio.vereda_id || '');
    setDireccion(negocio.direccion || '');
    setNotes(negocio.notes || '');
    setDepartamentoId('');
    setErrorText(null);
    fetchLocationMasters()
      .then((loaded) => {
        if (cancelled) return;
        setMasters(loaded);
        const municipio = loaded.municipios.find((m) => m.id === negocio.municipio_id);
        setDepartamentoId(municipio?.departamento_id || '');
      })
      .catch((error) => {
        if (!cancelled) setErrorText(errorMessage(error, 'No fue posible cargar las ubicaciones'));
      });
    return () => {
      cancelled = true;
    };
    // Solo al abrir: un refresco de la ficha no debe pisar lo que se escribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, negocio.id]);

  const municipios = useMemo(() => {
    const options = masters.municipios
      .filter((m) => !departamentoId || m.departamento_id === departamentoId)
      .map((m) => ({ value: m.id, label: m.nombre }));
    // Municipio actual inactivo: no viene en los maestros, pero se puede conservar.
    if (negocio.municipio_id && !masters.municipios.some((m) => m.id === negocio.municipio_id)) {
      options.unshift({ value: negocio.municipio_id, label: `${negocio.municipioNombre || 'Municipio actual'} (inactivo)` });
    }
    return options;
  }, [masters.municipios, departamentoId, negocio.municipio_id, negocio.municipioNombre]);

  const veredas = useMemo(() => {
    const options = masters.veredas
      .filter((v) => v.municipio_id === municipioId)
      .map((v) => ({ value: v.id, label: v.nombre }));
    if (
      negocio.vereda_id &&
      municipioId === negocio.municipio_id &&
      !masters.veredas.some((v) => v.id === negocio.vereda_id)
    ) {
      options.unshift({ value: negocio.vereda_id, label: `${negocio.veredaNombre || 'Vereda actual'} (inactiva)` });
    }
    return options;
  }, [masters.veredas, municipioId, negocio.vereda_id, negocio.municipio_id, negocio.veredaNombre]);

  const input = { direccion, municipioId, veredaId, notes };
  const validationError = negocioContactDetailsError(input);
  const changed = negocioContactDetailsChanged(negocio, input);

  const submit = async () => {
    if (saving) return;
    if (validationError) {
      setErrorText(validationError);
      return;
    }
    try {
      setSaving(true);
      setErrorText(null);
      const result = await updateNegocioContactDetails(negocio.id, input);
      await onSaved(result);
    } catch (error) {
      setErrorText(errorMessage(error, 'No se pudo guardar la dirección'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FullScreenModal
      visible={visible}
      onClose={onClose}
      title="Editar dirección y notas"
      dismissable={!saving}
      footer={
        <View style={styles.footer}>
          <Button title="Cancelar" variant="outline" onPress={onClose} disabled={saving} style={styles.footerButton} />
          <Button
            title="Guardar"
            onPress={() => void submit()}
            loading={saving}
            disabled={!changed || Boolean(validationError)}
            style={styles.footerButton}
            accessibilityLabel="Guardar dirección y notas"
          />
        </View>
      }>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.notice, { backgroundColor: `${colors.info.main}14`, borderColor: `${colors.info.main}55` }]}>
          <Text style={[styles.noticeText, { color: colors.text.primary }]}>
            {negocioLockedEditMessage(negocio.numero, negocio.status)}
          </Text>
        </View>
        {errorText ? (
          <View
            accessibilityRole="alert"
            style={[styles.notice, { backgroundColor: `${colors.error.main}14`, borderColor: `${colors.error.main}55` }]}>
            <Text style={[styles.noticeText, { color: colors.text.primary }]}>{errorText}</Text>
          </View>
        ) : null}
        <OptionPickerField
          value={departamentoId}
          onValueChange={(value) => {
            setDepartamentoId(value);
            setMunicipioId('');
            setVeredaId('');
          }}
          options={masters.departamentos.map((d) => ({ value: d.id, label: d.nombre }))}
          placeholder="Departamento"
          modalTitle="Departamento"
          colors={colors}
          disabled={saving}
        />
        <OptionPickerField
          value={municipioId}
          onValueChange={(value) => {
            setMunicipioId(value);
            setVeredaId('');
          }}
          options={municipios}
          placeholder="Municipio *"
          modalTitle="Municipio"
          colors={colors}
          disabled={saving}
        />
        <OptionPickerField
          value={veredaId}
          onValueChange={setVeredaId}
          options={[{ value: '', label: 'Sin vereda' }, ...veredas]}
          placeholder={municipioId && veredas.length === 0 ? 'El municipio no tiene veredas' : 'Vereda (opcional)'}
          modalTitle="Vereda"
          colors={colors}
          disabled={saving || !municipioId || veredas.length === 0}
        />
        <Input
          label="Dirección de la vivienda *"
          placeholder="Ej: Calle 8 # 10-15"
          value={direccion}
          onChangeText={setDireccion}
          editable={!saving}
          maxLength={500}
          accessibilityLabel="Dirección de la vivienda"
        />
        <Input
          label="Notas"
          placeholder="Ej: casa de portón verde"
          value={notes}
          onChangeText={setNotes}
          editable={!saving}
          multiline
          accessibilityLabel="Notas del negocio"
        />
      </ScrollView>
    </FullScreenModal>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.xl, gap: Spacing.md, paddingBottom: Spacing.xxxl },
  notice: { borderWidth: 1, borderRadius: Radius.control, padding: Spacing.md },
  noticeText: { ...Typography.bodySmall },
  footer: { flexDirection: 'row', gap: Spacing.sm },
  footerButton: { flex: 1 },
});
