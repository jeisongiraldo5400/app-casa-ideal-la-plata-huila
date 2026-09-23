/**
 * De dónde salió la mercancía de un negocio, para el listado.
 *
 * `negocios` apunta tres veces a `delivery_orders` y el dato no se lee de una
 * sola columna:
 *
 * - `delivery_order_id`: la orden de entrega del negocio. `activate_negocio`
 *   la crea (origen bodega) o reutiliza la de origen (remisión / orden de
 *   cliente), así que en esos dos casos coincide con la de origen.
 * - `remission_id`: el negocio se armó con productos propios de una remisión.
 *   Al activar, la orden del negocio ES la remisión.
 * - `source_delivery_order_id`: la orden de origen. Con origen remisión guarda
 *   la MISMA remisión (así lo envía el móvil y así lo usa `activate_negocio`),
 *   por eso la remisión se evalúa primero.
 *
 * Sin ninguna de las dos, la orden se creó al activar sacando de bodega.
 */

/** Un embebido de PostgREST llega como objeto, como arreglo o nulo. */
type OrdenEmbebida = { order_number: string | null } | { order_number: string | null }[] | null;

export type NegocioOrigenTipo = 'remision' | 'orden_cliente' | 'bodega';

export interface NegocioOrigenInput {
  delivery_order_id?: string | null;
  remission_id?: string | null;
  source_delivery_order_id?: string | null;
  /** `delivery_orders` por `delivery_order_id`. */
  delivery_order?: OrdenEmbebida;
  /** `delivery_orders` por `remission_id`. */
  remission?: OrdenEmbebida;
  /** `delivery_orders` por `source_delivery_order_id`. */
  source_delivery_order?: OrdenEmbebida;
}

export interface NegocioOrigen {
  tipo: NegocioOrigenTipo;
  /** «Remisión», «Orden de cliente» o «Desde bodega». */
  etiqueta: string;
  /** Número de la orden del negocio; null si no tiene o si no se pudo leer. */
  ordenNumero: string | null;
  /** Número de la orden de origen; null con origen bodega o si no se pudo leer. */
  origenNumero: string | null;
  /** Línea lista para pintar en la tarjeta. */
  texto: string;
}

const ETIQUETA: Record<NegocioOrigenTipo, string> = {
  remision: 'Remisión',
  orden_cliente: 'Orden de cliente',
  bodega: 'Desde bodega',
};

function numeroDeOrden(embebido: OrdenEmbebida | undefined): string | null {
  if (!embebido) return null;
  const fila = Array.isArray(embebido) ? embebido[0] : embebido;
  const numero = fila?.order_number;
  return typeof numero === 'string' && numero.trim() ? numero.trim() : null;
}

/**
 * Describe la orden y el origen de un negocio del listado.
 *
 * Devuelve null cuando la fila no trae los datos de origen: es lo que pasa sin
 * conexión, donde la lista local (`mapNegociosListFromLocal`) no guarda ni la
 * remisión ni el número de orden. En ese caso la tarjeta no pinta la línea, en
 * vez de inventar un origen que no se sabe.
 */
export function describeNegocioOrigen(negocio: NegocioOrigenInput | null | undefined): NegocioOrigen | null {
  if (!negocio) return null;
  const sinDatosDeOrigen =
    negocio.remission_id === undefined &&
    negocio.source_delivery_order_id === undefined &&
    negocio.delivery_order === undefined;
  if (sinDatosDeOrigen) return null;

  const tipo: NegocioOrigenTipo = negocio.remission_id
    ? 'remision'
    : negocio.source_delivery_order_id
      ? 'orden_cliente'
      : 'bodega';

  const ordenNumero = numeroDeOrden(negocio.delivery_order);
  const origenNumero =
    tipo === 'remision'
      ? numeroDeOrden(negocio.remission)
      : tipo === 'orden_cliente'
        ? numeroDeOrden(negocio.source_delivery_order)
        : null;

  const partes: string[] = [];
  if (ordenNumero) {
    partes.push(`Orden ${ordenNumero}`);
  } else if (!negocio.delivery_order_id) {
    // Solo se afirma «sin orden» cuando la columna está vacía. Si hay orden
    // pero no llegó su número (p. ej. RLS se la oculta a quien mira la lista),
    // se calla en vez de decir algo falso.
    partes.push('Sin orden de entrega');
  }

  // El número del origen se repite cuando la orden del negocio ES la de origen
  // (remisión y orden de cliente): no se imprime dos veces.
  partes.push(
    origenNumero && origenNumero !== ordenNumero
      ? `${ETIQUETA[tipo]} ${origenNumero}`
      : ETIQUETA[tipo]
  );

  return { tipo, etiqueta: ETIQUETA[tipo], ordenNumero, origenNumero, texto: partes.join(' · ') };
}

// ---------------------------------------------------------------------------
// Detalle del negocio
// ---------------------------------------------------------------------------
// El listado recibe los números de orden embebidos en la consulta; el detalle
// los busca aparte, así que necesita decidir el origen ANTES de tener el
// número. De ahí estas dos funciones, que comparten las mismas reglas.

export type NegocioOrigenKind = 'remision' | 'orden_cliente' | 'bodega' | 'desconocido';

export type NegocioOrigenResuelto = {
  kind: NegocioOrigenKind;
  /**
   * Orden de entrega de la que salió la mercancía, para buscar su número.
   * `null` cuando el negocio nace en bodega o cuando no se conoce el origen.
   */
  orderId: string | null;
};

/** Solo las columnas del negocio que deciden el origen. */
export type NegocioOrigenSource = {
  remission_id?: string | null;
  source_delivery_order_id?: string | null;
};

/**
 * @param options.known `false` cuando el negocio se pintó desde la copia del
 * dispositivo, que no guarda estas columnas. Sin el dato no se puede afirmar
 * «desde bodega»: ausencia de columna no es ausencia de origen.
 */
export function resolveNegocioOrigen(
  negocio: NegocioOrigenSource | null | undefined,
  options?: { known?: boolean }
): NegocioOrigenResuelto {
  if (!negocio || options?.known === false) return { kind: 'desconocido', orderId: null };

  const remissionId = negocio.remission_id || null;
  if (remissionId) return { kind: 'remision', orderId: remissionId };

  // Aquí ya no puede ser una remisión (se descartó arriba), así que lo que
  // quede en `source_delivery_order_id` es una OE de cliente preexistente.
  const sourceId = negocio.source_delivery_order_id || null;
  if (sourceId) return { kind: 'orden_cliente', orderId: sourceId };

  return { kind: 'bodega', orderId: null };
}

const ORIGEN_NOMBRE: Record<NegocioOrigenKind, string> = {
  remision: 'Remisión',
  orden_cliente: 'Orden de cliente',
  bodega: 'Desde bodega',
  desconocido: 'Sin datos',
};

/**
 * Texto para la pantalla. Si el número de la orden de origen no llegó (sin
 * conexión, o sin permiso para leer esa orden) se muestra el tipo de origen a
 * secas: saber que fue una remisión ya orienta, y es mejor que un hueco.
 */
export function labelNegocioOrigen(
  origen: NegocioOrigenResuelto,
  orderNumber?: string | null
): string {
  const nombre = ORIGEN_NOMBRE[origen.kind];
  if (!origen.orderId) return nombre;
  const numero = orderNumber?.trim();
  return numero ? `${nombre} ${numero}` : nombre;
}
