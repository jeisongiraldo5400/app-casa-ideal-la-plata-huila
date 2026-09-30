import {
  labelContractPrintSummary,
  labelNextContractPrint,
  mergeHistoryIntoCache,
  nextOfflineCopyNumber,
  parsePrintHistory,
  parseRegisterPrintResponse,
  printCopyKey,
  rememberCopyNumber,
  summarizeContractPrints,
} from '../printRegistry';

describe('printRegistry', () => {
  const negocioId = 'n1';

  it('la llave del contrato ignora el pago; la del recibo usa id o llave de idempotencia', () => {
    expect(printCopyKey({ negocioId, document: 'contrato', pagoId: 'p1' })).toBe('n1:contrato:');
    expect(printCopyKey({ negocioId, document: 'recibo', pagoId: 'p1' })).toBe('n1:recibo:p1');
    expect(printCopyKey({ negocioId, document: 'recibo', pagoIdempotencyKey: 'k1' })).toBe('n1:recibo:k1');
  });

  it('sin señal numera con el mayor conocido + 1 y la caché nunca baja', () => {
    let cache = {};
    expect(nextOfflineCopyNumber(cache, 'n1:contrato:')).toBe(1);
    cache = rememberCopyNumber(cache, 'n1:contrato:', 3);
    cache = rememberCopyNumber(cache, 'n1:contrato:', 2);
    expect(nextOfflineCopyNumber(cache, 'n1:contrato:')).toBe(4);
  });

  it('siembra la caché con el historial del servidor', () => {
    const events = parsePrintHistory([
      { id: 'e1', document: 'contrato', copy_number: 2, printed_at: '2026-09-30T15:00:00Z', printed_by_name: 'Ana', pago_id: null },
      { id: 'e2', document: 'recibo', copy_number: 1, printed_at: '2026-09-30T14:00:00Z', printed_by_name: null, pago_id: 'p1' },
      { id: 'e3', document: 'factura', copy_number: 1, printed_at: '2026-09-30T14:00:00Z' },
      null,
    ]);
    expect(events).toHaveLength(2);
    const cache = mergeHistoryIntoCache({}, negocioId, events);
    expect(cache).toEqual({ 'n1:contrato:': 2, 'n1:recibo:p1': 1 });
  });

  it('lee la respuesta del registro y descarta números inválidos', () => {
    expect(parseRegisterPrintResponse({ copy_number: 2, printed_at: 'x', printed_by_name: 'Ana' }, 'f')).toEqual({
      number: 2,
      printedAt: 'x',
      printedBy: 'Ana',
    });
    expect(parseRegisterPrintResponse({ copy_number: 0 }, 'f')).toBeNull();
    expect(parseRegisterPrintResponse(null, 'f')).toBeNull();
  });

  it('resume las impresiones del contrato', () => {
    expect(labelContractPrintSummary(summarizeContractPrints([]))).toBe('Contrato sin imprimir');
    const events = parsePrintHistory([
      { id: 'e1', document: 'contrato', copy_number: 2, printed_at: '2026-09-30T15:00:00Z', printed_by_name: 'Ana' },
      { id: 'e0', document: 'contrato', copy_number: 1, printed_at: '2026-09-29T15:00:00Z', printed_by_name: 'Luis' },
    ]);
    const label = labelContractPrintSummary(summarizeContractPrints(events));
    expect(label).toMatch(/^Contrato impreso 2 veces · última 30\/09\/2026 .* por Ana$/);
  });

  it('dice si la próxima impresión del contrato sale original o copia', () => {
    expect(labelNextContractPrint({ count: 0, last: null })).toBe('La próxima impresión sale como original');
    expect(labelNextContractPrint(summarizeContractPrints(parsePrintHistory([
      { id: 'e1', document: 'contrato', format: 'pdf', channel: 'web', copy_number: 1, printed_at: '2026-09-30T15:00:00Z' },
    ])))).toBe('La próxima impresión sale como COPIA N.º 2');
  });
});
