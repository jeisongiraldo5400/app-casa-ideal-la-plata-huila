import {
  GRUPO_CON_NEGOCIO,
  ORDEN_DE_OTRO_CLIENTE,
  buildDraftOriginTarget,
  draftOriginGroupBlockReason,
  draftOriginOrderBlockReason,
  evaluateDraftOriginCoverage,
  formatCoverageLine,
  parseDraftSourceCheck,
  parsePreparedDraftOriginChange,
  preparedOriginIsStale,
} from '../draftOriginChange';

describe('evaluateDraftOriginCoverage', () => {
  it('suma las bodegas de la orden y marca lo completo', () => {
    const result = evaluateDraftOriginCoverage(
      [
        { product_id: 'mesa', quantity: 3, product_name: 'Mesa' },
        { product_id: 'silla', quantity: '1' },
      ],
      [
        { product_id: 'mesa', available_quantity: 2, product_name: 'Mesa' },
        { product_id: 'mesa', available_quantity: 1 },
        { product_id: 'silla', available_quantity: 1, product_name: 'Silla' },
      ]
    );
    expect(result.complete).toBe(true);
    expect(result.lines).toEqual([
      { product_id: 'mesa', product_name: 'Mesa', requested_quantity: 3, available_quantity: 3, missing_quantity: 0 },
      { product_id: 'silla', product_name: 'Silla', requested_quantity: 1, available_quantity: 1, missing_quantity: 0 },
    ]);
  });

  it('indica producto por producto lo que falta, también lo que la orden no trae', () => {
    const result = evaluateDraftOriginCoverage(
      [
        { product_id: 'mesa', quantity: 2, product_name: 'Mesa' },
        { product_id: 'mesa', quantity: 2 },
        { product_id: 'cama', quantity: 1, product_name: 'Cama' },
      ],
      [{ product_id: 'mesa', available_quantity: 3 }]
    );
    expect(result.complete).toBe(false);
    expect(result.lines.map((line) => [line.product_id, line.requested_quantity, line.missing_quantity])).toEqual([
      ['mesa', 4, 1],
      ['cama', 1, 1],
    ]);
    expect(formatCoverageLine(result.lines[0])).toBe('Mesa: pide 4, hay 3 (falta 1)');
    expect(formatCoverageLine(result.lines[1])).toBe('Cama: pide 1, la orden no tiene (falta 1)');
  });

  it('sin productos en el borrador no se da por completo', () => {
    expect(evaluateDraftOriginCoverage([], [{ product_id: 'x', available_quantity: 5 }]).complete).toBe(false);
  });

  it('ignora disponibles negativos', () => {
    const result = evaluateDraftOriginCoverage(
      [{ product_id: 'mesa', quantity: 1 }],
      [{ product_id: 'mesa', available_quantity: -2 }]
    );
    expect(result.lines[0].available_quantity).toBe(0);
    expect(formatCoverageLine({ ...result.lines[0], missing_quantity: 2, requested_quantity: 2 })).toContain('faltan 2');
  });
});

describe('órdenes y grupos que sirven para el borrador', () => {
  it('una OE de otro cliente no sirve; una remisión sí', () => {
    expect(draftOriginOrderBlockReason({ order_type: 'customer', customer_id: 'c2' }, 'c1')).toBe(ORDEN_DE_OTRO_CLIENTE);
    expect(draftOriginOrderBlockReason({ order_type: 'customer', customer_id: 'c1' }, 'c1')).toBeNull();
    expect(draftOriginOrderBlockReason({ order_type: 'remission', customer_id: null }, 'c1')).toBeNull();
    expect(
      draftOriginOrderBlockReason({ order_type: 'remission', customer_id: null, unusable_reason: 'Cancelada' }, 'c1')
    ).toBe('Cancelada');
  });

  it('una OE hija con negocio o de otro cliente queda deshabilitada', () => {
    expect(draftOriginGroupBlockReason({ kind: 'own', hasNegocio: false, customerId: null }, 'c1')).toBeNull();
    expect(draftOriginGroupBlockReason({ kind: 'child', hasNegocio: true, customerId: 'c1' }, 'c1')).toBe(GRUPO_CON_NEGOCIO);
    expect(draftOriginGroupBlockReason({ kind: 'child', hasNegocio: false, customerId: 'c2' }, 'c1')).toBe(ORDEN_DE_OTRO_CLIENTE);
    expect(draftOriginGroupBlockReason({ kind: 'child', hasNegocio: false, customerId: 'c1' }, 'c1')).toBeNull();
  });
});

describe('buildDraftOriginTarget', () => {
  const remision = { id: 'r1', order_type: 'remission', order_number: 'OE-1' };

  it('propios de la remisión: remission_id = source = remisión', () => {
    expect(buildDraftOriginTarget(remision, { kind: 'own', sourceOrderId: 'r1', label: 'Propios' })).toEqual({
      remission_id: 'r1',
      source_delivery_order_id: 'r1',
      kind: 'remision',
      label: 'Remisión OE-1 · productos propios',
    });
  });

  it('OE hija de la remisión: solo source', () => {
    expect(
      buildDraftOriginTarget(remision, { kind: 'child', sourceOrderId: 'k1', label: 'Productos de la OE-2' })
    ).toMatchObject({ remission_id: null, source_delivery_order_id: 'k1', kind: 'orden_cliente' });
  });

  it('remisión sin grupo elegido todavía no es destino', () => {
    expect(buildDraftOriginTarget(remision, null)).toBeNull();
    expect(buildDraftOriginTarget(null, null)).toBeNull();
  });

  it('OE de cliente suelta', () => {
    expect(buildDraftOriginTarget({ id: 'k3', order_type: 'customer', order_number: 'OE-3' }, null)).toEqual({
      remission_id: null,
      source_delivery_order_id: 'k3',
      kind: 'orden_cliente',
      label: 'Orden de cliente OE-3',
    });
  });
});

describe('parseDraftSourceCheck', () => {
  it('lee la respuesta del servidor', () => {
    expect(
      parseDraftSourceCheck({
        usable: false,
        reason: 'La orden no trae todo lo del negocio',
        order_number: 'OE-1',
        lines: [
          { product_id: 'mesa', product_name: 'Mesa', requested_quantity: 4, available_quantity: 3, missing_quantity: 1 },
          { nada: true },
        ],
      })
    ).toEqual({
      usable: false,
      reason: 'La orden no trae todo lo del negocio',
      orderNumber: 'OE-1',
      lines: [{ product_id: 'mesa', product_name: 'Mesa', requested_quantity: 4, available_quantity: 3, missing_quantity: 1 }],
    });
  });

  it('una respuesta rara no se da por usable', () => {
    expect(parseDraftSourceCheck(null)).toEqual({ usable: false, reason: null, orderNumber: null, lines: [] });
    expect(parseDraftSourceCheck([{ usable: true }]).usable).toBe(false);
  });
});

describe('parsePreparedDraftOriginChange', () => {
  it('ida y vuelta', () => {
    const change = {
      negocioId: 'n1',
      remission_id: 'r1',
      source_delivery_order_id: 'r1',
      kind: 'remision' as const,
      label: 'Remisión OE-1 · productos propios',
      idempotencyKey: 'key',
      preparedAt: '2026-10-16T10:00:00.000Z',
    };
    expect(parsePreparedDraftOriginChange(JSON.stringify(change))).toEqual(change);
  });

  it('descarta lo vacío o dañado', () => {
    expect(parsePreparedDraftOriginChange(null)).toBeNull();
    expect(parsePreparedDraftOriginChange('{no es json')).toBeNull();
    expect(parsePreparedDraftOriginChange(JSON.stringify({ negocioId: 'n1' }))).toBeNull();
  });
});

describe('preparedOriginIsStale', () => {
  it('solo sigue vigente mientras el negocio es borrador o por firmar', () => {
    expect(preparedOriginIsStale('borrador')).toBe(false);
    expect(preparedOriginIsStale('por_firmar')).toBe(false);
    expect(preparedOriginIsStale('activo')).toBe(true);
    expect(preparedOriginIsStale('anulado')).toBe(true);
    expect(preparedOriginIsStale('entregado')).toBe(true);
  });

  it('sin estado conocido no se borra', () => {
    expect(preparedOriginIsStale(null)).toBe(false);
    expect(preparedOriginIsStale(undefined)).toBe(false);
  });
});
