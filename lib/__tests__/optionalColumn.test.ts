import { createOptionalColumnGate, isUndefinedColumnError } from '../optionalColumn';

const missingColumn = { code: '42703', message: 'column delivery_order_items.returned_quantity does not exist' };

describe('isUndefinedColumnError', () => {
  it('reconoce el código de Postgres y el mensaje', () => {
    expect(isUndefinedColumnError(missingColumn)).toBe(true);
    expect(isUndefinedColumnError({ message: 'column "returned_quantity" does not exist' })).toBe(true);
  });

  it('no confunde otros errores', () => {
    expect(isUndefinedColumnError({ code: 'PGRST202', message: 'función no encontrada' })).toBe(false);
    expect(isUndefinedColumnError(new Error('sin red'))).toBe(false);
    expect(isUndefinedColumnError(null)).toBe(false);
  });
});

describe('createOptionalColumnGate', () => {
  it('repite sin la columna cuando la base todavía no la tiene y no vuelve a pedirla', async () => {
    const gate = createOptionalColumnGate();
    const attempt = jest.fn(async (withColumn: boolean) =>
      withColumn ? { data: null, error: missingColumn } : { data: [{ id: 'item-1' }], error: null },
    );

    await expect(gate.run(attempt)).resolves.toEqual({ data: [{ id: 'item-1' }], error: null });
    expect(attempt.mock.calls.map(([withColumn]) => withColumn)).toEqual([true, false]);
    expect(gate.available).toBe(false);

    // La segunda consulta ya no gasta un viaje de más.
    attempt.mockClear();
    await gate.run(attempt);
    expect(attempt.mock.calls.map(([withColumn]) => withColumn)).toEqual([false]);
  });

  it('también tolera el error lanzado, como el de las consultas por lotes', async () => {
    const gate = createOptionalColumnGate();
    const attempt = jest.fn(async (withColumn: boolean) => {
      if (withColumn) throw missingColumn;
      return ['fila'];
    });

    await expect(gate.run(attempt)).resolves.toEqual(['fila']);
    expect(gate.available).toBe(false);
  });

  it('con la columna aplicada no reintenta nada', async () => {
    const gate = createOptionalColumnGate();
    const attempt = jest.fn(async () => ({ data: [{ returned_quantity: 1 }], error: null }));

    await expect(gate.run(attempt)).resolves.toEqual({ data: [{ returned_quantity: 1 }], error: null });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(gate.available).toBe(true);
  });

  it('deja pasar cualquier otro error sin desactivar la columna', async () => {
    const gate = createOptionalColumnGate();

    await expect(gate.run(async () => { throw new Error('sin red'); })).rejects.toThrow('sin red');
    await expect(gate.run(async () => ({ data: null, error: { message: 'no autorizado' } }))).resolves.toEqual({
      data: null,
      error: { message: 'no autorizado' },
    });
    expect(gate.available).toBe(true);
  });
});
