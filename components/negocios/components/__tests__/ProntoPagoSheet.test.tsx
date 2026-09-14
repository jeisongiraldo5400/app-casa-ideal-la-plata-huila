import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProntoPagoSheet } from '../ProntoPagoSheet';
import { buildProntoPagoSummary, PRONTO_PAGO_OFFLINE_MESSAGE } from '@/lib/negocios/prontoPago';
import { formatCOP } from '@/lib/creditCalculator';

// El Icon real carga la fuente de forma asíncrona y hace setState fuera de act(...).
jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name),
  };
});

/** El selector de método usa `useSafeAreaInsets`, que exige el proveedor. */
const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const summary = buildProntoPagoSummary([
  { id: 'c0', installment_number: 0, due_date: '2026-09-01', amount: 200000, paid_amount: 0, late_fee_amount: 0, status: 'mora' },
  { id: 'c1', installment_number: 1, due_date: '2026-10-01', amount: 800000, paid_amount: 0, late_fee_amount: 0, status: 'pendiente' },
]);

function renderSheet(overrides: Partial<React.ComponentProps<typeof ProntoPagoSheet>> = {}) {
  const props: React.ComponentProps<typeof ProntoPagoSheet> = {
    visible: true,
    onClose: jest.fn(),
    subtitle: 'NEG-001 · Cliente',
    loading: false,
    summary,
    decimalPlaces: 2,
    paymentMethods: [
      { id: 'pm-1', name: 'Efectivo' },
      { id: 'pm-2', name: 'Nequi' },
    ],
    saving: false,
    blockedReason: null,
    notice: null,
    onSubmit: jest.fn(),
    ...overrides,
  };
  const utils = render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ProntoPagoSheet {...props} />
    </SafeAreaProvider>
  );
  return { ...utils, props };
}

/** Teclea sobre el texto que pinta el campo, como hace `TextInput`. */
function typeInto(getField: () => { props: { value?: string } }, keys: string) {
  for (const key of keys) {
    const current = String(getField().props.value ?? '');
    fireEvent.changeText(getField() as never, `${current}${key}`);
  }
}

function chooseMethod(utils: ReturnType<typeof renderSheet>, name: string) {
  fireEvent.press(utils.getByText('Seleccione el método'));
  fireEvent.press(utils.getByText(name));
}

describe('ProntoPagoSheet', () => {
  it('muestra el total pendiente y calcula el total a pagar en vivo', () => {
    const utils = renderSheet();
    expect(utils.getByLabelText(`Total pendiente ${formatCOP(1_000_000)}`)).toBeTruthy();
    expect(utils.getByLabelText(`Total a pagar ${formatCOP(1_000_000)}`)).toBeTruthy();

    typeInto(() => utils.getByLabelText('Descuento'), '100000');

    expect(utils.getByLabelText('Descuento').props.value).toBe('100.000');
    expect(utils.getByLabelText(`Total a pagar ${formatCOP(900_000)}`)).toBeTruthy();
  });

  it('acepta centavos en el descuento con los decimales configurados', () => {
    const utils = renderSheet();
    typeInto(() => utils.getByLabelText('Descuento'), '1000,5');
    expect(utils.getByLabelText('Descuento').props.value).toBe('1.000,5');
    expect(utils.getByLabelText(`Total a pagar ${formatCOP(998_999.5)}`)).toBeTruthy();
  });

  it('despliega el detalle de cuotas pendientes', () => {
    const utils = renderSheet();
    fireEvent.press(utils.getByText('Ver cuotas pendientes'));
    expect(utils.getByText('Cuota inicial')).toBeTruthy();
    expect(utils.getByText('Cuota 1')).toBeTruthy();
  });

  it('marca el descuento igual o mayor al pendiente y no deja revisar', () => {
    const utils = renderSheet();
    typeInto(() => utils.getByLabelText('Descuento'), '1000000');

    expect(utils.getByText(/El descuento debe ser menor que el saldo pendiente/)).toBeTruthy();
    chooseMethod(utils, 'Efectivo');
    fireEvent.changeText(utils.getByLabelText('Motivo del descuento'), 'Paga todo');
    fireEvent.press(utils.getByText('Revisar'));

    expect(utils.queryByText('Confirmar pronto pago')).toBeNull();
  });

  it('exige método (no motivo) antes de pasar a la confirmación', () => {
    const utils = renderSheet();
    expect(utils.getByText('Motivo del descuento (opcional)')).toBeTruthy();
    fireEvent.press(utils.getByText('Revisar'));

    expect(utils.queryByText(/motivo del descuento es obligatorio/i)).toBeNull();
    expect(utils.getByText('Seleccione el método de pago')).toBeTruthy();
    expect(utils.queryByText('Confirmar pronto pago')).toBeNull();
  });

  it('confirma con el desglose y envía los valores (descuento $0 permitido)', () => {
    const utils = renderSheet();
    chooseMethod(utils, 'Nequi');
    fireEvent.changeText(utils.getByLabelText('Motivo del descuento'), '  Liquida sin descuento  ');
    fireEvent.changeText(utils.getByLabelText('Número de recibo físico'), 'F-10');
    fireEvent.press(utils.getByText('Revisar'));

    expect(utils.getByText('Todas las cuotas quedarán pagadas y el negocio quedará saldado.')).toBeTruthy();
    fireEvent.press(utils.getByText('Confirmar pronto pago'));

    expect(utils.props.onSubmit).toHaveBeenCalledWith({
      pendingTotal: 1_000_000,
      discountAmount: 0,
      discountReason: 'Liquida sin descuento',
      paymentMethodId: 'pm-2',
      receiptNumber: 'F-10',
      netAmount: 1_000_000,
    });
  });

  it('sin motivo confirma sin la línea «Motivo» y envía null (con descuento > 0)', () => {
    const utils = renderSheet();
    typeInto(() => utils.getByLabelText('Descuento'), '50000');
    chooseMethod(utils, 'Efectivo');
    fireEvent.changeText(utils.getByLabelText('Motivo del descuento'), '   ');
    fireEvent.press(utils.getByText('Revisar'));

    expect(utils.getByText('Confirmar pronto pago')).toBeTruthy();
    expect(utils.queryByText(/^Motivo:/)).toBeNull();
    fireEvent.press(utils.getByText('Confirmar pronto pago'));

    expect(utils.props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ discountAmount: 50_000, discountReason: null, netAmount: 950_000 })
    );
  });

  it('sin conexión o con cola pendiente muestra el motivo y deshabilita el envío', () => {
    const utils = renderSheet({ blockedReason: PRONTO_PAGO_OFFLINE_MESSAGE });
    expect(utils.getByText(PRONTO_PAGO_OFFLINE_MESSAGE)).toBeTruthy();

    chooseMethod(utils, 'Efectivo');
    fireEvent.changeText(utils.getByLabelText('Motivo del descuento'), 'Paga todo');
    fireEvent.press(utils.getByText('Revisar'));

    expect(utils.queryByText('Confirmar pronto pago')).toBeNull();
    expect(utils.props.onSubmit).not.toHaveBeenCalled();
  });

  it('si el pendiente cambia tras «el saldo cambió» vuelve al formulario conservando el descuento', () => {
    const utils = renderSheet();
    typeInto(() => utils.getByLabelText('Descuento'), '50000');
    chooseMethod(utils, 'Efectivo');
    fireEvent.changeText(utils.getByLabelText('Motivo del descuento'), 'Paga todo');
    fireEvent.press(utils.getByText('Revisar'));
    expect(utils.getByText('Confirmar pronto pago')).toBeTruthy();

    const reloaded = buildProntoPagoSummary([{ id: 'c1', amount: 1_005_000, paid_amount: 0 }]);
    utils.rerender(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <ProntoPagoSheet
          {...utils.props}
          summary={reloaded}
          notice={{ tone: 'warning', text: 'El saldo del negocio cambió' }}
        />
      </SafeAreaProvider>
    );

    expect(utils.queryByText('Confirmar pronto pago')).toBeNull();
    expect(utils.getByText('El saldo del negocio cambió')).toBeTruthy();
    expect(utils.getByLabelText('Descuento').props.value).toBe('50.000');
    expect(utils.getByLabelText(`Total a pagar ${formatCOP(955_000)}`)).toBeTruthy();
  });
});
