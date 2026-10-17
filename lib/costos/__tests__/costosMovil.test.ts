import { hasCostosRole, isCostosOnlyUser } from '../access';
import { MOBILE_PURCHASES_LIMIT, formatPurchaseDate, parseProductPurchases, supplierLabel } from '../productPurchases';

describe('perfil costos en el teléfono', () => {
  it('solo costos (sin importar mayúsculas)', () => {
    expect(isCostosOnlyUser(['Costos'])).toBe(true);
    expect(isCostosOnlyUser(['costos', 'admin'])).toBe(false);
    expect(isCostosOnlyUser(['vendedor'])).toBe(false);
    expect(isCostosOnlyUser([])).toBe(false);
    expect(hasCostosRole(['admin', ' costos '])).toBe(true);
    expect(hasCostosRole(['admin'])).toBe(false);
  });
});

describe('parseProductPurchases', () => {
  const raw = {
    product_id: 'p1',
    last_unit_cost: '130.00',
    avg_unit_cost: 110,
    total: 7,
    summary: { min_unit_cost: 100, max_unit_cost: '130' },
    rows: [
      ...Array.from({ length: 6 }, (_, i) => ({
        entry_id: `e${i}`, created_at: '2026-10-10T15:00:00Z', order_number: `OC-${i}`, supplier_name: 'Prov',
        supplier_nit: '900', warehouse_name: 'Centro', quantity: '2', unit_cost: i === 0 ? null : '100', total_cost: null,
        received_by_name: 'Ana',
      })),
      { nada: true },
    ],
  };

  it('lee números en texto, se queda con 5 y conserva el total', () => {
    const parsed = parseProductPurchases(raw)!;
    expect(parsed.lastUnitCost).toBe(130);
    expect(parsed.avgUnitCost).toBe(110);
    expect(parsed.minUnitCost).toBe(100);
    expect(parsed.maxUnitCost).toBe(130);
    expect(parsed.total).toBe(7);
    expect(parsed.rows).toHaveLength(MOBILE_PURCHASES_LIMIT);
    expect(parsed.rows[0]).toMatchObject({ entryId: 'e0', unitCost: null, quantity: 2, supplierNit: '900' });
  });

  it('respuesta inválida → null; vacía → sin filas', () => {
    expect(parseProductPurchases(null)).toBeNull();
    expect(parseProductPurchases([])).toBeNull();
    expect(parseProductPurchases({})).toEqual({
      lastUnitCost: null, avgUnitCost: null, minUnitCost: null, maxUnitCost: null, total: 0, rows: [],
    });
  });

  it('textos compactos', () => {
    expect(supplierLabel({ supplierName: 'Prov', supplierNit: '900' })).toBe('Prov · NIT 900');
    expect(supplierLabel({ supplierName: null, supplierNit: '900' })).toBe('Sin proveedor');
    expect(formatPurchaseDate(null)).toBe('—');
    expect(formatPurchaseDate('2026-10-10T15:00:00Z')).toMatch(/10/);
  });
});
