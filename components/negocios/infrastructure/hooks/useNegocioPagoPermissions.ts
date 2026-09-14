import { useEffect, useState } from 'react';
import {
  fetchNegocioPagoPermissions,
  type NegocioPagoPermissions,
} from '../services/negocioPagosService';

export type NegocioPagoPermissionsState = {
  /** null mientras no se sabe (cargando, sin red o detalle local). */
  canRegisterProntoPago: boolean | null;
  canVoidPago: boolean | null;
};

const UNKNOWN: NegocioPagoPermissionsState = { canRegisterProntoPago: null, canVoidPago: null };

/**
 * Consulta en el servidor si el usuario puede registrar pronto pago y anular
 * pagos en el negocio (`can_register_negocio_pronto_pago` / `can_void_negocio_pago`).
 * Solo con conexión; `reloadKey` fuerza la consulta tras recargar el detalle
 * (p. ej. si cambió el gestor asignado).
 */
export function useNegocioPagoPermissions(input: {
  negocioId: string | null | undefined;
  enabled: boolean;
  reloadKey?: unknown;
}): NegocioPagoPermissionsState {
  const { negocioId, enabled, reloadKey } = input;
  const [state, setState] = useState<NegocioPagoPermissionsState>(UNKNOWN);

  useEffect(() => {
    if (!negocioId || !enabled) {
      setState(UNKNOWN);
      return;
    }
    let active = true;
    fetchNegocioPagoPermissions(negocioId)
      .then((permissions: NegocioPagoPermissions) => {
        if (active) setState(permissions);
      })
      .catch(() => {
        // Sin red: se queda en «desconocido» y la pantalla usa el permiso local.
        if (active) setState(UNKNOWN);
      });
    return () => {
      active = false;
    };
  }, [negocioId, enabled, reloadKey]);

  return state;
}
