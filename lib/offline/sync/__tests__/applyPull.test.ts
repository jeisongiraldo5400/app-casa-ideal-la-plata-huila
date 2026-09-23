import { applyPullPayload, pruneOutOfScopeNegocios } from '../applyPull';
import type { PullPayload } from '../types';

function emptyChanges() {
  return { upserts: [], deleted: [] };
}

describe('applyPullPayload', () => {
  it('aplica upserts y deletes en un lote atómico', async () => {
    const operations: unknown[] = [];
    const records = new Map<
      string,
      { destroyed?: boolean; name?: string; sellerId?: string | null; paymentSite?: string | null }
    >();

    const fakeRecord = (id: string) => ({
      id,
      prepareUpdate: (fn: (record: { name: string }) => void) => {
        const draft = { name: records.get(id)?.name || '' };
        fn(draft as never);
        records.set(id, { ...records.get(id), ...draft });
        return { id, op: 'update' };
      },
      prepareDestroyPermanently: () => {
        records.delete(id);
        return { id, op: 'destroy' };
      },
    });

    const database = {
      get: (table: string) => ({
        find: async (id: string) => {
          if (!records.has(`${table}:${id}`)) throw new Error('not found');
          return fakeRecord(`${table}:${id}`);
        },
        prepareCreate: (fn: (record: Record<string, unknown>) => void) => {
          const record: Record<string, unknown> = { _raw: { id: '' } };
          fn(record);
          const id = `${table}:${String(record._raw && (record._raw as { id?: string }).id || 'new')}`;
          records.set(id, {
            name: String(record.name || ''),
            sellerId: (record.sellerId as string | null | undefined) ?? null,
            paymentSite: (record.paymentSite as string | null | undefined) ?? null,
          });
          return { id, op: 'create' };
        },
        query: () => ({
          fetch: async () => [],
        }),
      }),
      write: async (fn: () => Promise<void>) => fn(),
      batch: async (...ops: unknown[]) => {
        operations.push(...ops);
      },
    };

    const payload: PullPayload = {
      server_time: '2026-08-12T00:00:00Z',
      must_wipe: false,
      truncated: false,
      roles: [],
      customers: {
        upserts: [{ id: 'c1', name: 'Ana', id_number: '1', phone: null, seller_id: 'seller-1', updated_at: null, deleted_at: null }],
        deleted: ['gone'],
      },
      negocios: emptyChanges(),
      negocio_cuotas: emptyChanges(),
      negocio_pagos: {
        upserts: [
          {
            id: 'p1',
            negocio_id: 'n1',
            cuota_id: null,
            amount: 50000,
            paid_at: '2026-09-09T10:00:00Z',
            receipt_number: null,
            virtual_receipt_number: 'RV-2026-0000001',
            receipt_status: 'emitido',
            notes: null,
            payment_site: 'almacen',
            created_at: '2026-09-09T10:00:00Z',
            deleted_at: null,
          },
        ],
        deleted: [],
      },
      collection_routes: emptyChanges(),
      collection_route_stops: emptyChanges(),
      municipios: emptyChanges(),
    };

    await applyPullPayload(database as never, payload, 'user-1');
    expect(operations.length).toBeGreaterThan(0);
    expect(records.get('customers:c1')?.name).toBe('Ana');
    // El vendedor del cliente viaja en el pull: sin él "Mis clientes" no
    // podría filtrarse sin conexión.
    expect(records.get('customers:c1')?.sellerId).toBe('seller-1');
    // El sitio de pago baja del servidor: sin él, un cobro hecho en el almacén
    // se vería como "No registrado" en la app hasta el siguiente pull completo.
    expect(records.get('negocio_pagos:p1')?.paymentSite).toBe('almacen');
  });

  it('no pisa una fila local con cambios pendientes de enviar', async () => {
    const updates: string[] = [];
    const pendingCuota = {
      id: 'q1',
      rowSyncStatus: 'pending',
      prepareUpdate: () => {
        updates.push('q1');
        return { id: 'q1', op: 'update' };
      },
    };
    const syncedCuota = {
      id: 'q2',
      rowSyncStatus: 'synced',
      prepareUpdate: (fn: (record: Record<string, unknown>) => void) => {
        fn({});
        updates.push('q2');
        return { id: 'q2', op: 'update' };
      },
    };
    const database = {
      get: (table: string) => ({
        find: async (id: string) => {
          if (table !== 'negocio_cuotas') throw new Error('not found');
          if (id === 'q1') return pendingCuota;
          if (id === 'q2') return syncedCuota;
          throw new Error('not found');
        },
        prepareCreate: (fn: (record: Record<string, unknown>) => void) => {
          const record: Record<string, unknown> = { _raw: { id: '' } };
          fn(record);
          return { op: 'create' };
        },
        query: () => ({ fetch: async () => [] }),
      }),
      write: async (fn: () => Promise<void>) => fn(),
      batch: async () => undefined,
    };
    const cuota = (id: string) => ({
      id,
      negocio_id: 'n1',
      installment_number: 1,
      due_date: '2026-09-01',
      amount: 100,
      paid_amount: 0,
      late_fee_amount: 0,
      status: 'pendiente',
      updated_at: null,
      deleted_at: null,
    });
    const payload: PullPayload = {
      server_time: '2026-08-12T00:00:00Z',
      must_wipe: false,
      truncated: false,
      roles: [],
      customers: emptyChanges(),
      negocios: emptyChanges(),
      negocio_cuotas: { upserts: [cuota('q1'), cuota('q2')], deleted: [] },
      negocio_pagos: emptyChanges(),
      collection_routes: emptyChanges(),
      collection_route_stops: emptyChanges(),
      municipios: emptyChanges(),
    };

    await applyPullPayload(database as never, payload, 'user-1');
    expect(updates).toEqual(['q2']);
  });
});

describe('applyPullPayload · pronto pago (v6)', () => {
  function capturingDatabase() {
    const created = new Map<string, Record<string, unknown>>();
    const database = {
      get: (table: string) => ({
        find: async () => {
          throw new Error('not found');
        },
        prepareCreate: (fn: (record: Record<string, unknown>) => void) => {
          const record: Record<string, unknown> = { _raw: { id: '' } };
          fn(record);
          created.set(`${table}:${(record._raw as { id: string }).id}`, record);
          return { op: 'create' };
        },
        query: () => ({ fetch: async () => [] }),
      }),
      write: async (fn: () => Promise<void>) => fn(),
      batch: async () => undefined,
    };
    return { database, created };
  }

  const basePago = {
    negocio_id: 'n1',
    cuota_id: null,
    paid_at: '2026-09-14T10:00:00Z',
    receipt_number: null,
    receipt_status: 'emitido',
    notes: null,
    created_at: '2026-09-14T10:00:00Z',
    deleted_at: null,
  };

  function payloadWith(pagos: PullPayload['negocio_pagos']['upserts']): PullPayload {
    return {
      server_time: '2026-09-14T00:00:00Z',
      must_wipe: false,
      truncated: false,
      roles: [],
      customers: emptyChanges(),
      negocios: emptyChanges(),
      negocio_cuotas: emptyChanges(),
      negocio_pagos: { upserts: pagos, deleted: [] },
      collection_routes: emptyChanges(),
      collection_route_stops: emptyChanges(),
      municipios: emptyChanges(),
    };
  }

  it('guarda tipo, descuento (numérico), motivo y pendiente liquidado', async () => {
    const { database, created } = capturingDatabase();
    await applyPullPayload(
      database as never,
      payloadWith([
        {
          ...basePago,
          id: 'pp1',
          amount: 900000,
          virtual_receipt_number: 'RV-2026-0000010',
          payment_kind: 'pronto_pago',
          // PostgREST/jsonb puede traer numeric como texto.
          discount_amount: '100000.50',
          discount_reason: 'Paga todo por adelantado',
          expected_total: '1000000.50',
        },
      ]),
      'user-1'
    );

    expect(created.get('negocio_pagos:pp1')).toMatchObject({
      amount: 900000,
      paymentKind: 'pronto_pago',
      discountAmount: 100000.5,
      discountReason: 'Paga todo por adelantado',
      expectedTotal: 1000000.5,
    });
  });

  it('un servidor sin la migración no envía las columnas: quedan nulas', async () => {
    const { database, created } = capturingDatabase();
    await applyPullPayload(
      database as never,
      payloadWith([{ ...basePago, id: 'p1', amount: 50000, virtual_receipt_number: 'RV-1' }]),
      'user-1'
    );

    expect(created.get('negocio_pagos:p1')).toMatchObject({
      paymentKind: null,
      discountAmount: null,
      discountReason: null,
      expectedTotal: null,
    });
  });
});

describe('pruneOutOfScopeNegocios', () => {
  it('elimina negocios fuera de alcance y conserva los que tienen cambios pendientes', async () => {
    const destroyed: string[] = [];
    const row = (table: string, id: string, extra: Record<string, unknown> = {}) => ({
      id,
      rowSyncStatus: 'synced',
      ...extra,
      prepareDestroyPermanently: () => {
        destroyed.push(`${table}:${id}`);
        return { op: 'destroy' };
      },
    });
    const tables: Record<string, unknown[]> = {
      negocios: [row('negocios', 'keep'), row('negocios', 'reassigned'), row('negocios', 'dirty')],
      negocio_cuotas: [
        row('negocio_cuotas', 'c1', { negocioId: 'reassigned' }),
        row('negocio_cuotas', 'c2', { negocioId: 'dirty', rowSyncStatus: 'pending' }),
      ],
      negocio_pagos: [row('negocio_pagos', 'p1', { negocioId: 'reassigned' })],
    };
    const database = {
      get: (table: string) => ({ query: () => ({ fetch: async () => tables[table] || [] }) }),
      write: async (fn: () => Promise<void>) => fn(),
      batch: async () => undefined,
    };

    const removed = await pruneOutOfScopeNegocios(database as never, ['keep']);
    expect(removed).toBe(1);
    expect(destroyed.sort()).toEqual(['negocio_cuotas:c1', 'negocio_pagos:p1', 'negocios:reassigned']);
  });
});

describe('applyPullPayload · colecciones nuevas del pull (v7)', () => {
  function capturingDatabase() {
    const created = new Map<string, Record<string, unknown>>();
    const database = {
      get: (table: string) => ({
        find: async () => {
          throw new Error('not found');
        },
        prepareCreate: (fn: (record: Record<string, unknown>) => void) => {
          const record: Record<string, unknown> = { _raw: { id: '' } };
          fn(record);
          created.set(`${table}:${(record._raw as { id: string }).id}`, record);
          return { op: 'create' };
        },
        query: () => ({ fetch: async () => [] }),
      }),
      write: async (fn: () => Promise<void>) => fn(),
      batch: async () => undefined,
    };
    return { database, created };
  }

  function basePayload(): PullPayload {
    return {
      server_time: '2026-09-23T00:00:00Z',
      must_wipe: false,
      truncated: false,
      roles: [],
      customers: emptyChanges(),
      negocios: emptyChanges(),
      negocio_cuotas: emptyChanges(),
      negocio_pagos: emptyChanges(),
      collection_routes: emptyChanges(),
      collection_route_stops: emptyChanges(),
      municipios: emptyChanges(),
    };
  }

  it('guarda perfiles, productos del negocio, veredas, departamentos y configuración de crédito', async () => {
    const { database, created } = capturingDatabase();
    await applyPullPayload(
      database as never,
      {
        ...basePayload(),
        negocios: {
          upserts: [
            {
              id: 'n1',
              numero: 20260002,
              status: 'activo',
              deal_date: '2026-09-22',
              total_credit: 600000,
              remaining_balance: 600000,
              customer_id: 'c1',
              codeudor_customer_id: null,
              direccion: 'Calle 10',
              municipio_id: 'm1',
              municipio_name: 'La Plata',
              seller_id: 'u1',
              gestor_cobro_id: null,
              seller_name: 'Ana Vendedora',
              gestor_cobro_name: null,
              updated_at: null,
              deleted_at: null,
            },
          ],
          deleted: [],
        },
        customers: {
          upserts: [
            {
              id: 'c1',
              name: 'Celene Parra',
              id_number: '1004153185',
              phone: '3188624209',
              seller_id: 'u1',
              email: 'celene@correo.com',
              address: 'Vereda Gallego',
              municipio_id: 'm1',
              vereda_id: 'v1',
              phone_secondary: null,
              updated_at: null,
              deleted_at: null,
            },
          ],
          deleted: [],
        },
        municipios: {
          upserts: [{ id: 'm1', nombre: 'La Plata', is_active: true, departamento_id: 'd1' }],
          deleted: [],
        },
        negocio_items: {
          upserts: [
            {
              id: 'i1',
              negocio_id: 'n1',
              product_id: 'p1',
              product_name: 'MESA 4 PTOS RIMAX',
              product_sku: 'MESA-1',
              warehouse_id: 'w1',
              description: null,
              // numeric puede llegar como texto.
              quantity: '1.000',
              unit_price: '200000.00',
              subtotal: '200000.00',
              updated_at: null,
              deleted_at: null,
            },
          ],
          deleted: [],
        },
        veredas: {
          upserts: [{ id: 'v1', nombre: 'Gallego', municipio_id: 'm1', is_active: true }],
          deleted: [],
        },
        departamentos: { upserts: [{ id: 'd1', nombre: 'Huila', is_active: true }], deleted: [] },
        profiles: {
          upserts: [{ id: 'u1', full_name: 'Ana Vendedora', email: 'ana@correo.com' }],
          deleted: [],
        },
        credit_settings: {
          upserts: [
            {
              id: 'cs1',
              formula_type: 'financed_balance',
              interest_rate_monthly_pct: '0.0000',
              rounding_unit: 1000,
              late_fee_rate_pct: '0.0000',
              money_decimal_places: 2,
              min_installments: 1,
              max_installments: 36,
              default_frequency: 'mensual',
              legal_text: null,
              is_active: true,
            },
          ],
          deleted: [],
        },
      },
      'user-1'
    );

    expect(created.get('profiles:u1')).toMatchObject({ fullName: 'Ana Vendedora', email: 'ana@correo.com' });
    expect(created.get('negocios:n1')).toMatchObject({ sellerName: 'Ana Vendedora', gestorCobroName: null });
    expect(created.get('customers:c1')).toMatchObject({
      email: 'celene@correo.com',
      address: 'Vereda Gallego',
      municipioId: 'm1',
      veredaId: 'v1',
    });
    expect(created.get('negocio_items:i1')).toMatchObject({
      productName: 'MESA 4 PTOS RIMAX',
      quantity: 1,
      unitPrice: 200000,
      subtotal: 200000,
    });
    expect(created.get('catalog_municipios:m1')).toMatchObject({ departamentoId: 'd1' });
    expect(created.get('catalog_veredas:v1')).toMatchObject({ nombre: 'Gallego', municipioId: 'm1' });
    expect(created.get('catalog_departamentos:d1')).toMatchObject({ nombre: 'Huila' });
    expect(created.get('credit_settings:cs1')).toMatchObject({
      formulaType: 'financed_balance',
      moneyDecimalPlaces: 2,
      maxInstallments: 36,
      isActive: true,
    });
  });

  it('un servidor sin la migración no envía las colecciones nuevas y el pull sigue funcionando', async () => {
    const { database, created } = capturingDatabase();
    await expect(applyPullPayload(database as never, basePayload(), 'user-1')).resolves.toBeUndefined();
    // Solo se crea la caché de roles; ninguna de las tablas nuevas.
    expect([...created.keys()].filter((key) => !key.startsWith('user_profile_cache:'))).toEqual([]);
  });
});
