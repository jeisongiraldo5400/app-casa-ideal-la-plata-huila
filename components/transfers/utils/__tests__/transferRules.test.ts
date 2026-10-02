import { rawDetail, rawItem, rawPendingDispatchDetail } from '../../__fixtures__/transferFixtures';
import { parseTransferDetail, parseTransferItem } from '../transferModel';
import {
  availableModes,
  clampQuantity,
  draftFitsDetail,
  initialDispatchDraft,
  initialMode,
  initialReceiveDraft,
  initialReturnDraft,
  lineInvariantHolds,
  maxDispatch,
  maxReceive,
  maxReturn,
  modeParam,
  parseModeParam,
  parseSerialsText,
  receiveAllOk,
  serialsError,
  validateDispatch,
  validateReceive,
  validateReturn,
} from '../transferRules';

const item = (overrides: Record<string, unknown> = {}) => parseTransferItem(rawItem(overrides));

describe('cantidades máximas por línea', () => {
  it('despachar: hasta lo reservado', () => {
    expect(maxDispatch(item({ quantity: 4, dispatched_quantity: 0 }))).toBe(4);
  });

  it('recibir: lo que sigue en camino, sin lo que vuelve al origen', () => {
    const line = item({
      quantity: 5,
      dispatched_quantity: 5,
      received_quantity: 1,
      written_off_quantity: 1,
      return_pending_quantity: 1,
    });
    // en tránsito = 5 − 1 − 0 − 1 = 3; pendiente de recibir = 3 − 1 = 2
    expect(maxReceive(line)).toBe(2);
    expect(maxReturn(line)).toBe(1);
  });

  it('nunca devuelve negativos aunque el servidor mande datos raros', () => {
    expect(maxReceive(item({ dispatched_quantity: 1, received_quantity: 3 }))).toBe(0);
    expect(maxReturn(item({ return_pending_quantity: -2 }))).toBe(0);
  });

  it('clampQuantity lleva al rango [0, max] en enteros', () => {
    expect(clampQuantity(7, 3)).toBe(3);
    expect(clampQuantity(-1, 3)).toBe(0);
    expect(clampQuantity(2.7, 3)).toBe(2);
    expect(clampQuantity(Number.NaN, 3)).toBe(0);
  });
});

describe('invariante dispatched = received + returned + written_off + en tránsito', () => {
  it('se cumple en una línea coherente', () => {
    expect(
      lineInvariantHolds(
        item({ quantity: 5, dispatched_quantity: 4, received_quantity: 2, returned_quantity: 1, written_off_quantity: 1 })
      )
    ).toBe(true);
  });

  it('falla si se recibió más de lo despachado o se despachó más de lo reservado', () => {
    expect(lineInvariantHolds(item({ quantity: 3, dispatched_quantity: 3, received_quantity: 4 }))).toBe(false);
    expect(lineInvariantHolds(item({ quantity: 2, dispatched_quantity: 3 }))).toBe(false);
  });

  it('falla si lo que vuelve al origen supera lo que sigue en tránsito', () => {
    expect(
      lineInvariantHolds(item({ quantity: 2, dispatched_quantity: 2, received_quantity: 2, return_pending_quantity: 1 }))
    ).toBe(false);
  });
});

describe('seriales escritos a mano', () => {
  it('acepta renglones, comas y punto y coma', () => {
    expect(parseSerialsText(' a1 \nB2, c3;;\n')).toEqual(['a1', 'B2', 'c3']);
    expect(parseSerialsText('')).toEqual([]);
  });

  it('uno por unidad, sin repetidos (normalizados)', () => {
    expect(serialsError(['A1'], 2, { required: false })).toMatch(/un serial por unidad/);
    expect(serialsError(['ab-1', 'AB1'], 2, { required: false })).toMatch(/repetido/);
    expect(serialsError([], 2, { required: false })).toBeNull();
    expect(serialsError([], 2, { required: true })).toMatch(/Indica 2 serial/);
  });

  it('solo los que el servidor espera', () => {
    expect(serialsError(['X9'], 1, { required: true, allowed: new Set(['LAV1']) })).toMatch(/no corresponde/);
    expect(serialsError(['lav-1'], 1, { required: true, allowed: new Set(['LAV1']) })).toBeNull();
  });
});

describe('sacar productos', () => {
  const detail = parseTransferDetail(rawPendingDispatchDetail());

  it('arranca con todo lo reservado y arma la carga de la RPC', () => {
    const draft = initialDispatchDraft(detail);
    const result = validateDispatch(detail, draft);
    expect(result).toEqual({
      ok: true,
      items: [
        { item_id: 'i-1', quantity: 3 },
        { item_id: 'i-2', quantity: 2 },
      ],
      summary: { units: 5, lines: 2, released: 0 },
    });
  });

  it('no elige receptores: quién recibe viene asignado en el traslado', () => {
    expect(initialDispatchDraft(detail)).not.toHaveProperty('receiverIds');
    // Ya no se pide transportador.
    expect(initialDispatchDraft(detail)).not.toHaveProperty('carrierId');
    expect(detail.order.receiver).toEqual({ id: 'u-recv', name: 'Recibe' });
    // Sin receptor asignado también se pueden sacar (lo recibe un admin).
    const unassigned = parseTransferDetail({
      ...rawPendingDispatchDetail(),
      order: { ...rawPendingDispatchDetail().order, receiver: null },
    });
    expect(validateDispatch(unassigned, initialDispatchDraft(unassigned)).ok).toBe(true);
  });

  it('un borrador viejo con receiverIds sigue sirviendo (el campo se ignora)', () => {
    const old = { ...initialDispatchDraft(detail), receiverIds: ['u-otro'] };
    expect(draftFitsDetail(old, detail)).toBe(true);
    expect(validateDispatch(detail, old)).toEqual(validateDispatch(detail, initialDispatchDraft(detail)));
  });

  it('omite las líneas en cero y cuenta lo que vuelve al origen', () => {
    const draft = initialDispatchDraft(detail);
    draft.lines['i-1'] = { quantity: 1, serialsText: 'ab1' };
    draft.lines['i-2'] = { quantity: 0, serialsText: '' };
    const result = validateDispatch(detail, draft);
    expect(result.ok && result.items).toEqual([{ item_id: 'i-1', quantity: 1, serials: ['ab1'] }]);
    expect(result.ok && result.summary.released).toBe(4);
  });

  it('rechaza pasar de lo reservado, seriales incompletos y todo en cero', () => {
    const draft = initialDispatchDraft(detail);
    draft.lines['i-1'] = { quantity: 4, serialsText: '' };
    draft.lines['i-2'] = { quantity: 2, serialsText: 'S1' };
    const result = validateDispatch(detail, draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.lineErrors['i-1']).toMatch(/reservó 3/);
      expect(result.lineErrors['i-2']).toMatch(/un serial por unidad/);
    }
    const zero = initialDispatchDraft(detail);
    zero.lines['i-1'].quantity = 0;
    zero.lines['i-2'].quantity = 0;
    const empty = validateDispatch(detail, zero);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.message).toMatch(/al menos una unidad/);
  });
});

describe('recepción', () => {
  const detail = parseTransferDetail(rawDetail());

  it('arranca en cero y exige marcar algo o informar faltante', () => {
    const draft = initialReceiveDraft(detail);
    const result = validateReceive(detail, draft);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/informa que no llegó el resto/);

    const missing = validateReceive(detail, { ...draft, reportMissing: true });
    expect(missing).toEqual({ ok: true, items: [], summary: { ok: 0, damaged: 0, remaining: 5, reportMissing: true } });
  });

  it('parcial con averiadas: una entrada por estado', () => {
    const draft = initialReceiveDraft(detail);
    draft.lines['i-1'] = { ok: 2, damaged: 1, okSerialsText: '', damagedSerialsText: '' };
    const result = validateReceive(detail, draft);
    expect(result.ok && result.items).toEqual([
      { item_id: 'i-1', quantity: 2, condition: 'ok' },
      { item_id: 'i-1', quantity: 1, condition: 'damaged' },
    ]);
    expect(result.ok && result.summary).toEqual({ ok: 2, damaged: 1, remaining: 2, reportMissing: false });
  });

  it('no deja recibir más de lo que está en camino', () => {
    const draft = initialReceiveDraft(detail);
    draft.lines['i-2'] = { ok: 2, damaged: 1, okSerialsText: '', damagedSerialsText: '' };
    const result = validateReceive(detail, draft);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.lineErrors['i-2']).toMatch(/quedan 2 por recibir/);
  });

  it('«Llegó todo» marca lo pendiente de cada línea', () => {
    const all = receiveAllOk(detail, initialReceiveDraft(detail));
    expect(all.lines['i-1'].ok).toBe(3);
    expect(all.lines['i-2'].ok).toBe(2);
  });

  it('si se despachó con seriales, pide los mismos', () => {
    const withSerials = parseTransferDetail(
      rawDetail({
        items: [
          rawItem({
            quantity: 2,
            dispatched_quantity: 2,
            has_serials: true,
            serials: [
              { serial_number: 'LAV-1', status: 'in_transit', verified: true },
              { serial_number: 'LAV-2', status: 'in_transit', verified: true },
            ],
          }),
        ],
      })
    );
    const draft = initialReceiveDraft(withSerials);
    draft.lines['i-1'] = { ok: 1, damaged: 1, okSerialsText: '', damagedSerialsText: '' };
    const missing = validateReceive(withSerials, draft);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.lineErrors['i-1']).toMatch(/Indica 1 serial/);

    draft.lines['i-1'] = { ok: 1, damaged: 1, okSerialsText: 'lav1', damagedSerialsText: 'LAV-1' };
    const repeated = validateReceive(withSerials, draft);
    expect(repeated.ok).toBe(false);
    if (!repeated.ok) expect(repeated.lineErrors['i-1']).toMatch(/repetido/);

    draft.lines['i-1'] = { ok: 1, damaged: 1, okSerialsText: 'lav1', damagedSerialsText: 'LAV-2' };
    const good = validateReceive(withSerials, draft);
    expect(good.ok && good.items).toEqual([
      { item_id: 'i-1', quantity: 1, condition: 'ok', serials: ['lav1'] },
      { item_id: 'i-1', quantity: 1, condition: 'damaged', serials: ['LAV-2'] },
    ]);
  });
});

describe('devolución al origen', () => {
  const detail = parseTransferDetail(
    rawDetail({
      order: { status: 'with_differences', return_pending_quantity: 1, pending_receipt_quantity: 0 },
      items: [rawItem({ quantity: 3, dispatched_quantity: 3, received_quantity: 2, return_pending_quantity: 1 })],
      permissions: { can_receive: false, can_confirm_return: true },
    })
  );

  it('solo hasta lo que se mandó devolver', () => {
    const draft = initialReturnDraft(detail);
    draft.lines['i-1'] = { quantity: 2, serialsText: '' };
    const over = validateReturn(detail, draft);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.lineErrors['i-1']).toMatch(/se mandaron devolver 1/);

    draft.lines['i-1'] = { quantity: 1, serialsText: '' };
    expect(validateReturn(detail, draft)).toEqual({
      ok: true,
      items: [{ item_id: 'i-1', quantity: 1 }],
      summary: { units: 1, remaining: 0 },
    });
  });
});

describe('modo del detalle según estado y permisos', () => {
  it('por despachar con permiso → despachar', () => {
    const detail = parseTransferDetail(rawPendingDispatchDetail());
    expect(availableModes(detail)).toEqual(['dispatch']);
    expect(initialMode(detail, 'receive')).toBe('dispatch');
  });

  it('en tránsito para quien recibe → recibir; sin permiso → solo ver', () => {
    expect(initialMode(parseTransferDetail(rawDetail()))).toBe('receive');
    expect(initialMode(parseTransferDetail(rawDetail({ permissions: { can_receive: false } })))).toBe('view');
  });

  it('admin con recepción y devolución pendientes elige por la ruta', () => {
    const detail = parseTransferDetail(
      rawDetail({
        order: { status: 'with_differences' },
        items: [rawItem({ quantity: 3, dispatched_quantity: 3, received_quantity: 1, return_pending_quantity: 1 })],
        permissions: { can_receive: true, can_confirm_return: true, is_admin: true },
      })
    );
    expect(availableModes(detail)).toEqual(['receive', 'return']);
    expect(initialMode(detail, 'return')).toBe('return');
    expect(initialMode(detail)).toBe('receive');
  });

  it('?modo= de la ruta', () => {
    expect(parseModeParam('sacar')).toBe('dispatch');
    // Enlaces de versiones anteriores.
    expect(parseModeParam('despachar')).toBe('dispatch');
    expect(modeParam('dispatch')).toBe('sacar');
    expect(parseModeParam(['recibir'])).toBe('receive');
    expect(parseModeParam('devolucion')).toBe('return');
    expect(parseModeParam('otro')).toBeNull();
  });
});

describe('borrador guardado', () => {
  it('se descarta si ya no calza con el traslado recargado', () => {
    const detail = parseTransferDetail(rawDetail());
    const draft = initialReceiveDraft(detail);
    draft.lines['i-1'] = { ok: 3, damaged: 0, okSerialsText: '', damagedSerialsText: '' };
    expect(draftFitsDetail(draft, detail)).toBe(true);

    // Otra persona recibió 2 mientras tanto: ya solo quedan 1 + 2.
    const reloaded = parseTransferDetail(
      rawDetail({ items: [rawItem({ received_quantity: 2 }), rawItem({ id: 'i-2', quantity: 2, dispatched_quantity: 2 })] })
    );
    expect(draftFitsDetail(draft, reloaded)).toBe(false);
  });
});
