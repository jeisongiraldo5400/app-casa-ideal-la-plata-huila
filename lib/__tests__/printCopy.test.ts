import { buildNegocioReceiptHtml } from '../negocioReceiptHtml';
import { isReprint, printCopyDetail, printCopyLabel } from '../printCopy';

describe('printCopy', () => {
  const copy = { number: 2, printedAt: '2026-09-30T15:15:00Z', printedBy: 'Ana <Gómez>' };

  it('el original no lleva marca; desde la 2 sí', () => {
    expect(isReprint({ ...copy, number: 1 })).toBe(false);
    expect(printCopyLabel({ ...copy, number: 1 })).toBeNull();
    expect(printCopyLabel(null)).toBeNull();
    expect(printCopyLabel(copy)).toBe('COPIA N.º 2');
    expect(printCopyDetail(copy)).toMatch(/^Impresa el 30\/09\/2026 .* por Ana <Gómez>$/);
    expect(printCopyDetail({ ...copy, printedBy: null })).not.toContain(' por ');
  });

  const receipt = {
    receiptNumber: 'RV-1',
    status: 'emitido',
    paidAt: '2026-09-30T15:00:00Z',
    amount: 1000,
    negocioNumero: 20260202,
    customerName: 'Cliente',
    remainingBalance: 0,
  };

  it('el recibo reimpreso lleva banner y marca de agua, escapados', () => {
    const html = buildNegocioReceiptHtml({ ...receipt, copy });
    expect(html).toContain('<p class="copy-banner"><b>COPIA N.º 2</b>');
    expect(html).toContain('Ana &lt;Gómez&gt;');
    expect(html).toContain('<div class="watermark" aria-hidden="true">COPIA</div>');
    expect(buildNegocioReceiptHtml(receipt)).not.toContain('class="copy-banner"');
  });

  it('un recibo anulado reimpreso conserva la marca ANULADO', () => {
    const html = buildNegocioReceiptHtml({ ...receipt, status: 'anulado', copy });
    expect(html).toContain('aria-hidden="true">ANULADO</div>');
    expect(html).not.toContain('aria-hidden="true">COPIA</div>');
    expect(html).toContain('COPIA N.º 2');
  });
});
