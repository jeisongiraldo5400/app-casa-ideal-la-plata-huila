import { act, renderHook } from '@testing-library/react-native';
import { voidNegocioPago } from '../../services/negocioPagosService';
import { useVoidNegocioPago } from '../useVoidNegocioPago';

jest.mock('../../services/negocioPagosService', () => ({
  voidNegocioPago: jest.fn(),
}));

const mockedVoid = voidNegocioPago as jest.MockedFunction<typeof voidNegocioPago>;

const abono = { id: 'p1', amount: 100000, paid_at: '2026-09-01T10:00:00Z', virtual_receipt_number: 'RV-1', receipt_status: 'emitido' };
const pronto = {
  id: 'p2',
  amount: 900000,
  paid_at: '2026-09-10T10:00:00Z',
  virtual_receipt_number: 'RV-2',
  receipt_status: 'emitido',
  payment_kind: 'pronto_pago',
  discount_amount: 100000,
};

function setup(pagos: (typeof abono | typeof pronto)[] = [pronto, abono]) {
  const onVoided = jest.fn();
  const onBlocked = jest.fn();
  const hook = renderHook(() => useVoidNegocioPago({ pagos, onVoided, onBlocked }));
  return { ...hook, onVoided, onBlocked };
}

beforeEach(() => jest.clearAllMocks());

describe('useVoidNegocioPago', () => {
  it('con un pronto pago vigente avisa en vez de abrir la anulación de un abono', () => {
    const { result, onBlocked } = setup();
    act(() => result.current.request(abono));

    expect(onBlocked).toHaveBeenCalledWith('Anule primero el pronto pago RV-2 de este negocio');
    expect(result.current.target).toBeNull();
  });

  it('exige motivo, anula y refresca', async () => {
    mockedVoid.mockResolvedValueOnce(undefined);
    const { result, onVoided } = setup();
    act(() => result.current.request(pronto));
    expect(result.current.target).toBe(pronto);

    await act(async () => result.current.confirm('  '));
    expect(mockedVoid).not.toHaveBeenCalled();
    expect(result.current.errorText).toBe('El motivo de anulación es obligatorio');

    await act(async () => result.current.confirm('Pronto pago por error'));
    expect(mockedVoid).toHaveBeenCalledWith('p2', 'Pronto pago por error');
    expect(onVoided).toHaveBeenCalledWith(pronto);
    expect(result.current.target).toBeNull();
  });

  it('muestra el 42501 y la guarda del servidor sin cerrar la hoja', async () => {
    mockedVoid
      .mockRejectedValueOnce({ code: '42501', message: 'Sin permiso para anular pagos de este negocio' })
      .mockRejectedValueOnce({ code: 'P0001', message: 'Anule primero el pronto pago RV-9 de este negocio' });
    const { result, onVoided } = setup([abono]);
    act(() => result.current.request(abono));

    await act(async () => result.current.confirm('Pago duplicado'));
    expect(result.current.errorText).toBe('Sin permiso para anular pagos de este negocio');
    expect(result.current.target).toBe(abono);

    await act(async () => result.current.confirm('Pago duplicado'));
    expect(result.current.errorText).toBe('Anule primero el pronto pago RV-9 de este negocio');
    expect(onVoided).not.toHaveBeenCalled();
  });
});
