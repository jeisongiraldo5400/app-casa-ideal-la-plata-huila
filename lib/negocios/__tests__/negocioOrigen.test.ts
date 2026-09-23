import { describeNegocioOrigen, labelNegocioOrigen, resolveNegocioOrigen } from '../negocioOrigen';

describe('describeNegocioOrigen', () => {
  it('remisión: la orden del negocio es la remisión, el número no se repite', () => {
    const origen = describeNegocioOrigen({
      delivery_order_id: 'rem-1',
      remission_id: 'rem-1',
      // El móvil guarda la misma remisión en source_delivery_order_id.
      source_delivery_order_id: 'rem-1',
      delivery_order: { order_number: 'OE-2026-0012' },
      remission: { order_number: 'OE-2026-0012' },
      source_delivery_order: { order_number: 'OE-2026-0012' },
    });

    expect(origen).toMatchObject({
      tipo: 'remision',
      etiqueta: 'Remisión',
      ordenNumero: 'OE-2026-0012',
      texto: 'Orden OE-2026-0012 · Remisión',
    });
  });

  it('orden de cliente: usa source_delivery_order_id cuando no hay remisión', () => {
    const origen = describeNegocioOrigen({
      delivery_order_id: 'oe-7',
      remission_id: null,
      source_delivery_order_id: 'oe-7',
      delivery_order: { order_number: 'OE-2026-0007' },
      remission: null,
      source_delivery_order: { order_number: 'OE-2026-0007' },
    });

    expect(origen).toMatchObject({
      tipo: 'orden_cliente',
      ordenNumero: 'OE-2026-0007',
      texto: 'Orden OE-2026-0007 · Orden de cliente',
    });
  });

  it('bodega: sin remisión ni orden de origen, la orden se creó al activar', () => {
    const origen = describeNegocioOrigen({
      delivery_order_id: 'oe-34',
      remission_id: null,
      source_delivery_order_id: null,
      delivery_order: [{ order_number: 'OE-2026-0034' }],
      remission: null,
      source_delivery_order: null,
    });

    expect(origen).toMatchObject({
      tipo: 'bodega',
      etiqueta: 'Desde bodega',
      origenNumero: null,
      texto: 'Orden OE-2026-0034 · Desde bodega',
    });
  });

  it('borrador sin orden: lo dice y conserva el origen pactado', () => {
    expect(
      describeNegocioOrigen({
        delivery_order_id: null,
        remission_id: 'rem-1',
        source_delivery_order_id: 'rem-1',
        delivery_order: null,
        remission: { order_number: 'OE-2026-0012' },
        source_delivery_order: { order_number: 'OE-2026-0012' },
      })?.texto
    ).toBe('Sin orden de entrega · Remisión OE-2026-0012');

    expect(
      describeNegocioOrigen({
        delivery_order_id: null,
        remission_id: null,
        source_delivery_order_id: null,
        delivery_order: null,
        remission: null,
        source_delivery_order: null,
      })?.texto
    ).toBe('Sin orden de entrega · Desde bodega');
  });

  it('con orden pero sin su número (RLS): no afirma que no haya orden', () => {
    expect(
      describeNegocioOrigen({
        delivery_order_id: 'oe-7',
        remission_id: null,
        source_delivery_order_id: 'oe-7',
        delivery_order: null,
        remission: null,
        source_delivery_order: null,
      })?.texto
    ).toBe('Orden de cliente');
  });

  it('sin conexión: la fila local no trae el origen, así que no se pinta nada', () => {
    // Forma exacta de `mapNegociosListFromLocal`: delivery_order_id null y
    // ninguna columna de origen.
    expect(describeNegocioOrigen({ delivery_order_id: null })).toBeNull();
    expect(describeNegocioOrigen(null)).toBeNull();
    expect(describeNegocioOrigen(undefined)).toBeNull();
  });
});

// --- Detalle del negocio (mismas reglas, sin los números embebidos) ---

describe('resolveNegocioOrigen', () => {
  // `create_negocio` guarda la misma remisión en las dos columnas: si no se
  // mirara `remission_id` primero, toda remisión se leería como OE de cliente.
  it('la remisión manda aunque source_delivery_order_id repita su id', () => {
    expect(
      resolveNegocioOrigen({ remission_id: 'rem-1', source_delivery_order_id: 'rem-1' })
    ).toEqual({ kind: 'remision', orderId: 'rem-1' });
  });

  it('sin remisión, la orden de origen es una OE de cliente', () => {
    expect(
      resolveNegocioOrigen({ remission_id: null, source_delivery_order_id: 'oe-9' })
    ).toEqual({ kind: 'orden_cliente', orderId: 'oe-9' });
  });

  it('sin origen la mercancía sale de bodega (la OE se crea al activar)', () => {
    expect(
      resolveNegocioOrigen({ remission_id: null, source_delivery_order_id: null })
    ).toEqual({ kind: 'bodega', orderId: null });
  });

  it('desde la copia local no se puede afirmar nada del origen', () => {
    expect(resolveNegocioOrigen({}, { known: false })).toEqual({
      kind: 'desconocido',
      orderId: null,
    });
    expect(resolveNegocioOrigen(null)).toEqual({ kind: 'desconocido', orderId: null });
  });
});

describe('labelNegocioOrigen', () => {
  it('nombra el origen con el número de su orden', () => {
    expect(
      labelNegocioOrigen({ kind: 'remision', orderId: 'rem-1' }, 'OE-2026-0007')
    ).toBe('Remisión OE-2026-0007');
    expect(
      labelNegocioOrigen({ kind: 'orden_cliente', orderId: 'oe-9' }, 'OE-2026-0012')
    ).toBe('Orden de cliente OE-2026-0012');
  });

  it('sin número muestra el tipo de origen a secas', () => {
    expect(labelNegocioOrigen({ kind: 'remision', orderId: 'rem-1' }, null)).toBe('Remisión');
    expect(labelNegocioOrigen({ kind: 'orden_cliente', orderId: 'oe-9' }, '   ')).toBe(
      'Orden de cliente'
    );
  });

  it('bodega no lleva número porque no hay orden de origen', () => {
    expect(labelNegocioOrigen({ kind: 'bodega', orderId: null }, 'OE-2026-0007')).toBe(
      'Desde bodega'
    );
  });
});
