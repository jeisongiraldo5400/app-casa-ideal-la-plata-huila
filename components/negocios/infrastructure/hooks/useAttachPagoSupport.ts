import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { errorMessage } from '@/lib/errorMessage';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { attachOrQueuePagoSupport, type PagoSupportAttachOutcome } from '@/lib/pagoSupportAttach';
import { pickPagoSupportFile, type PagoSupportSource } from '@/lib/pickPagoSupportFile';
import type { PagoSupportLocalFile } from '@/lib/uploadPagoSupport';

/** Pago al que se le adjunta el soporte después de registrado. */
export type AttachPagoSupportTarget = {
  negocioId: string;
  pagoId: string;
  /** Resumen visible del pago («$ 100.000 · RV-…»). */
  title: string;
  /** Su método exige soporte: la hoja lo destaca. */
  supportRequired: boolean;
  methodName: string | null;
  /** El pago aún está en la cola del teléfono: el soporte va a su carril. */
  pagoIsLocal?: boolean;
};

/**
 * «Adjuntar soporte» a un pago ya registrado. Con señal sube el archivo y
 * llama a `attach_negocio_pago_support`; sin señal lo copia al teléfono y lo
 * encola. `onDone` avisa para recargar la lista.
 */
export function useAttachPagoSupport(options: {
  onDone?: (outcome: PagoSupportAttachOutcome, target: AttachPagoSupportTarget) => void;
  /** Se inyecta en pruebas. */
  pickSupport?: (source: PagoSupportSource) => Promise<PagoSupportLocalFile | null>;
} = {}) {
  const { onDone, pickSupport = pickPagoSupportFile } = options;
  const [target, setTarget] = useState<AttachPagoSupportTarget | null>(null);
  const [file, setFile] = useState<PagoSupportLocalFile | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const open = useCallback((next: AttachPagoSupportTarget) => {
    setFile(null);
    setTarget(next);
  }, []);

  const close = useCallback(() => {
    if (savingRef.current) return;
    setTarget(null);
    setFile(null);
  }, []);

  const pick = useCallback(
    (source: PagoSupportSource) => {
      void pickSupport(source).then((picked) => {
        if (picked) setFile(picked);
      });
    },
    [pickSupport]
  );

  const submit = useCallback(async () => {
    if (!target || !file || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const outcome = await attachOrQueuePagoSupport({
        negocioId: target.negocioId,
        pagoId: target.pagoId,
        file,
        online: useSyncStore.getState().online,
        pagoIsLocal: target.pagoIsLocal,
      });
      savingRef.current = false;
      setTarget(null);
      setFile(null);
      Alert.alert(
        outcome === 'attached' ? 'Soporte adjuntado' : 'Soporte guardado sin conexión',
        outcome === 'attached'
          ? 'El soporte quedó adjunto al pago.'
          : 'Se adjuntará automáticamente cuando se recupere la conexión.'
      );
      onDone?.(outcome, target);
    } catch (error) {
      Alert.alert('Error', errorMessage(error, 'No se pudo adjuntar el soporte'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [target, file, onDone]);

  return {
    target,
    visible: target !== null,
    file,
    saving,
    open,
    close,
    pick,
    removeFile: () => setFile(null),
    submit,
  };
}
