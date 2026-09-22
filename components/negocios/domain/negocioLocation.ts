/**
 * Ubicación de la vivienda del negocio (departamento → municipio → vereda +
 * dirección) rellenada a partir de lo que ya se sabe del cliente o de la orden.
 *
 * Por qué existe: al crear un negocio desde una orden de entrega existente, la
 * orden fijaba el cliente pero no la ubicación, que es obligatoria. El asistente
 * pedía «Seleccione un departamento» con esos campos muy abajo, debajo de la
 * lista de órdenes, y parecía que «Siguiente» no respondía.
 */

export type LocationSource = {
  municipioId: string | null;
  veredaId: string | null;
  address: string | null;
};

export type NegocioLocation = {
  departamentoId: string;
  municipioId: string;
  veredaId: string;
  direccion: string;
};

type MunicipioRef = { id: string; departamento_id: string };

const hasMunicipio = (source: LocationSource | null | undefined): source is LocationSource =>
  Boolean(source?.municipioId);

/**
 * Devuelve la ubicación con los campos vacíos rellenados. Nunca pisa lo que ya
 * está escrito.
 *
 * - El bloque departamento/municipio/vereda sale de una sola fuente, para que
 *   nunca quede un municipio de un departamento y una vereda de otro: primero el
 *   cliente (su vivienda) y, si no tiene municipio, la orden de entrega (las de
 *   cliente siempre lo tienen porque es obligatorio).
 * - Ese bloque sólo se rellena si el municipio está vacío y el departamento
 *   elegido, si lo hay, coincide con el del municipio propuesto.
 * - La dirección, por separado: la del cliente y, si no tiene, la de la orden.
 */
export function resolveNegocioLocation(input: {
  current: NegocioLocation;
  customer?: LocationSource | null;
  order?: LocationSource | null;
  municipios: readonly MunicipioRef[];
}): NegocioLocation {
  const { current, customer, order, municipios } = input;
  const next: NegocioLocation = { ...current };

  const source = hasMunicipio(customer) ? customer : hasMunicipio(order) ? order : null;
  const municipio = source ? municipios.find((m) => m.id === source.municipioId) : undefined;

  if (
    source &&
    municipio &&
    !current.municipioId &&
    (!current.departamentoId || current.departamentoId === municipio.departamento_id)
  ) {
    next.departamentoId = municipio.departamento_id;
    next.municipioId = municipio.id;
    if (!current.veredaId && source.veredaId) next.veredaId = source.veredaId;
  }

  if (!current.direccion.trim()) {
    const address = customer?.address?.trim() || order?.address?.trim() || '';
    if (address) next.direccion = address;
  }

  return next;
}

/**
 * Vacía los campos que siguen con el valor que se rellenó automáticamente para
 * el cliente anterior, para que al cambiar de cliente se use la ubicación del
 * nuevo. Lo que el usuario cambió a mano se respeta.
 */
export function clearAutoFilled(current: NegocioLocation, autoFilled: NegocioLocation | null): NegocioLocation {
  if (!autoFilled) return current;
  const keep = (key: keyof NegocioLocation) =>
    current[key] && current[key] === autoFilled[key] ? '' : current[key];
  const base: NegocioLocation = {
    departamentoId: keep('departamentoId'),
    municipioId: keep('municipioId'),
    veredaId: keep('veredaId'),
    direccion: keep('direccion'),
  };
  // El bloque de ubicación va junto: si el municipio lo eligió el usuario, su
  // departamento y su vereda también se conservan.
  if (base.municipioId) {
    base.departamentoId = current.departamentoId;
    base.veredaId = current.veredaId;
  }
  return base;
}
