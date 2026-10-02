import { rawDetail, rawOrder } from '../../__fixtures__/transferFixtures';
import { parseTransferDetail, parseTransferSummary, parseTransferTasks, parseTransferWriteResult } from '../transferModel';
import { countTasks, defaultSection, homeCardSubtitle, overdueCount, sortForList } from '../transferTasks';
import {
  assignmentText,
  dispatchConfirmText,
  dueText,
  receiveConfirmText,
  receiverLineText,
  sentLineText,
  transferRouteText,
  viewNotice,
} from '../transferTexts';

describe('parseo de las RPC', () => {
  it('convierte numeric en texto a número y conserva personas y bodegas', () => {
    const order = parseTransferSummary(rawOrder());
    expect(order.totalQuantity).toBe(5);
    expect(order.carrier).toEqual({ id: 'u-carrier', name: 'Darío' });
    expect(transferRouteText(order)).toBe('Principal → La Argentina');
  });

  it('un payload corrupto no tumba la pantalla', () => {
    const detail = parseTransferDetail(null);
    expect(detail.items).toEqual([]);
    expect(detail.permissions.canReceive).toBe(false);
    expect(parseTransferSummary({ status: 'raro' }).status).toBe('draft');
  });

  it('respuesta de escritura con replayed', () => {
    expect(
      parseTransferWriteResult({
        transfer_order_id: 't-1',
        order_number: 'TR-1',
        status: 'in_transit',
        dispatched_quantity: '4.00',
        released_quantity: 1,
        replayed: true,
      })
    ).toEqual({
      transferOrderId: 't-1',
      orderNumber: 'TR-1',
      status: 'in_transit',
      replayed: true,
      quantities: { dispatched_quantity: 4, released_quantity: 1 },
    });
  });
});

describe('textos', () => {
  it('«Te enviaron: N × Producto — sacado el …» (transporta solo en traslados viejos)', () => {
    const detail = parseTransferDetail(rawDetail());
    expect(sentLineText(detail.items[0], detail.order)).toBe(
      'Te enviaron: 3 × Lavadora LG — transporta Darío — sacado el 26/09/2026 10:00 a. m.'
    );
    expect(sentLineText(detail.items[0], { ...detail.order, carrier: null })).toBe(
      'Te enviaron: 3 × Lavadora LG — sacado el 26/09/2026 10:00 a. m.'
    );
  });

  it('vencido en rojo: el texto lo dice', () => {
    const order = parseTransferSummary(rawOrder({ is_overdue: true }));
    expect(dueText(order)).toMatch(/^Vencido desde 28\/09\/2026/);
    expect(dueText(parseTransferSummary(rawOrder({ due_at: null })))).toBeNull();
  });

  it('resúmenes de confirmación', () => {
    const order = parseTransferSummary(rawOrder());
    const dispatchText = dispatchConfirmText({ units: 4, lines: 2, released: 1 }, order);
    expect(dispatchText).toContain('Vas a sacar 4 unidades (2 productos) de Principal → La Argentina.');
    expect(dispatchText).toContain('1 unidad no sale y vuelve al disponible de Principal.');
    expect(dispatchText).not.toMatch(/despach|Transporta|transportador/i);
    expect(dispatchText).toContain('Recibe: Recibe. Le llegará un aviso.');
    expect(
      dispatchConfirmText({ units: 1, lines: 1, released: 0 }, parseTransferSummary(rawOrder({ receiver: null })))
    ).toContain('Sin receptor asignado: solo un administrador podrá recibirlo.');
    expect(receiveConfirmText({ ok: 2, damaged: 1, remaining: 2, reportMissing: false }, order)).toBe(
      'Recibes en La Argentina: 2 unidades en buen estado y 1 unidad averiada.\n2 unidades siguen en camino: puedes recibirlas después.'
    );
    expect(receiveConfirmText({ ok: 0, damaged: 0, remaining: 3, reportMissing: true }, order)).toMatch(
      /faltan 3 unidades: el traslado queda con diferencias/
    );
  });

  it('motivo del modo solo lectura: quien sacó o transporta no recibe', () => {
    const order = parseTransferSummary(rawOrder());
    expect(viewNotice(order, 'u-disp')).toBe('Sacaste los productos de este traslado: lo recibe Recibe en La Argentina.');
    expect(viewNotice(parseTransferSummary(rawOrder({ status: 'pending_dispatch' })), 'x')).toBe(
      'Por sacar: los productos los saca Bodeguero en Principal.'
    );
    expect(viewNotice(parseTransferSummary(rawOrder({ status: 'pending_dispatch', dispatcher: null })), 'x')).toMatch(
      /^Por sacar en Principal: falta asignar quién saca/
    );
    expect(viewNotice(parseTransferSummary(rawOrder({ receiver: null })), 'x')).toBe(
      'Lo recibe un administrador en La Argentina.'
    );
    expect(viewNotice(order, 'u-carrier')).toMatch(/^Transportas este traslado/);
    expect(viewNotice(parseTransferSummary(rawOrder({ status: 'received' })), 'x')).toBe('Traslado recibido completo.');
  });
});

describe('asignados', () => {
  it('«Saca: X · Recibe: Y», o sin asignar', () => {
    expect(assignmentText(parseTransferSummary(rawOrder()))).toBe('Saca: Bodeguero · Recibe: Recibe');
    expect(assignmentText(parseTransferSummary(rawOrder({ dispatcher: null, receiver: null })))).toBe(
      'Saca: sin asignar · Recibe: sin asignar'
    );
    expect(receiverLineText({ id: 'u-1', name: 'Ana' })).toBe('Recibe: Ana');
    expect(receiverLineText(null)).toBe('Sin receptor asignado: solo un administrador podrá recibirlo');
  });
});

describe('tareas', () => {
  const tasks = parseTransferTasks({
    to_dispatch: [rawOrder({ id: 'a', status: 'pending_dispatch' })],
    to_receive: [
      rawOrder({ id: 'b', due_at: '2026-09-30T00:00:00Z' }),
      rawOrder({ id: 'c', is_overdue: true, due_at: '2026-10-05T00:00:00Z' }),
    ],
    carrying: [],
  });

  it('cuenta y ordena vencidos primero', () => {
    expect(countTasks(tasks)).toBe(3);
    expect(tasks.toConfirmReturn).toEqual([]);
    expect(overdueCount(tasks.toReceive)).toBe(1);
    expect(sortForList(tasks.toReceive).map((row) => row.id)).toEqual(['c', 'b']);
  });

  it('abre «Por recibir» si hay vencidos; si no, la primera con algo', () => {
    expect(defaultSection(tasks)).toBe('toReceive');
    expect(defaultSection({ ...tasks, toReceive: [] })).toBe('toDispatch');
    expect(defaultSection(null)).toBe('toDispatch');
  });

  it('subtítulo de la tarjeta de Inicio', () => {
    expect(homeCardSubtitle(tasks)).toBe('2 por recibir · 1 vencido');
    expect(homeCardSubtitle({ ...tasks, toReceive: [] })).toBe('1 por sacar');
    expect(homeCardSubtitle(null)).toBe('Sacar y recibir');
  });
});
