import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { PaymentCard, voidReasonFromNotes, type PaymentRow } from '../PaymentCard';
import { formatCOP } from '@/lib/creditCalculator';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name),
  };
});

const abono: PaymentRow = {
  id: 'p1',
  amount: 50000,
  paid_at: '2026-09-10T15:00:00.000Z',
  virtual_receipt_number: 'RV-2026-0000001',
  receipt_number: null,
  receipt_status: 'emitido',
};

const pronto: PaymentRow = {
  ...abono,
  id: 'p2',
  amount: '900000.00',
  virtual_receipt_number: 'RV-2026-0000002',
  payment_kind: 'pronto_pago',
  discount_amount: '100000.00',
  discount_reason: 'Paga todo por adelantado',
  expected_total: '1000000.00',
};

function renderCard(pago: PaymentRow, onVoid?: () => void) {
  return render(<PaymentCard pago={pago} onShare={jest.fn()} onPrint={jest.fn()} onVoid={onVoid} />);
}

describe('PaymentCard · pronto pago', () => {
  it('muestra el chip, el pendiente, el descuento y su motivo', () => {
    const { getByText } = renderCard(pronto);
    expect(getByText('Pronto pago')).toBeTruthy();
    expect(getByText(`Total pendiente: ${formatCOP(1_000_000)}`)).toBeTruthy();
    expect(getByText(`Descuento pronto pago: ${formatCOP(100_000)}`)).toBeTruthy();
    expect(getByText('Motivo del descuento: Paga todo por adelantado')).toBeTruthy();
  });

  it('sin motivo no muestra la línea «Motivo del descuento»', () => {
    for (const discount_reason of [null, '', '   ']) {
      const { queryByText, getByText, unmount } = renderCard({ ...pronto, discount_reason });
      expect(getByText(`Descuento pronto pago: ${formatCOP(100_000)}`)).toBeTruthy();
      expect(queryByText(/Motivo del descuento/)).toBeNull();
      unmount();
    }
  });

  it('un abono no muestra nada del descuento', () => {
    const { queryByText } = renderCard(abono);
    expect(queryByText('Pronto pago')).toBeNull();
    expect(queryByText(/Descuento pronto pago/)).toBeNull();
  });
});

describe('PaymentCard · anular', () => {
  it('solo aparece si la pantalla lo habilita (permiso y conexión)', () => {
    expect(renderCard(abono).queryByText('Anular')).toBeNull();

    const onVoid = jest.fn();
    const { getByLabelText } = renderCard(pronto, onVoid);
    fireEvent.press(getByLabelText('Anular pronto pago RV-2026-0000002'));
    expect(onVoid).toHaveBeenCalledTimes(1);
  });

  it('no se ofrece sobre un pago ya anulado y muestra el motivo de anulación', () => {
    const { queryByText, getByText } = renderCard(
      { ...abono, receipt_status: 'anulado', notes: 'Abono inicial\nAnulado: Pago duplicado' },
      jest.fn()
    );
    expect(queryByText('Anular')).toBeNull();
    expect(getByText('Motivo de anulación: Pago duplicado')).toBeTruthy();
  });

  it('extrae el motivo que agrega void_negocio_pago a las notas', () => {
    expect(voidReasonFromNotes('Anulado: Error de digitación')).toBe('Error de digitación');
    expect(voidReasonFromNotes('Nota previa\nAnulado: Duplicado')).toBe('Duplicado');
    expect(voidReasonFromNotes('Sin anular')).toBeNull();
    expect(voidReasonFromNotes(null)).toBeNull();
  });
});

describe('PaymentCard · adjuntar soporte después', () => {
  const sinSoporte: PaymentRow = { ...abono, support_path: null };

  it('sin handler no ofrece «Adjuntar» (como antes)', () => {
    const { queryByLabelText, getByText } = renderCard(sinSoporte);
    expect(queryByLabelText(/Adjuntar soporte/)).toBeNull();
    expect(getByText('Soporte: Sin adjunto')).toBeTruthy();
  });

  it('con método que lo exige lo destaca y abre el adjunto', () => {
    const onAttachSupport = jest.fn();
    const { getByText, getByLabelText } = render(
      <PaymentCard
        pago={sinSoporte}
        onShare={jest.fn()}
        onPrint={jest.fn()}
        supportState="required_missing"
        onAttachSupport={onAttachSupport}
      />
    );
    expect(getByText('Soporte: Falta (obligatorio para este método)')).toBeTruthy();
    fireEvent.press(getByLabelText('Adjuntar soporte obligatorio del pago'));
    expect(onAttachSupport).toHaveBeenCalledTimes(1);
  });

  it('en cola del teléfono dice que está pendiente de subir', () => {
    const { getByText } = render(
      <PaymentCard pago={sinSoporte} onShare={jest.fn()} onPrint={jest.fn()} supportState="queued" />
    );
    expect(getByText('Soporte: Pendiente de subir')).toBeTruthy();
  });

  it('un pago anulado o con soporte no ofrece «Adjuntar»', () => {
    for (const pago of [
      { ...sinSoporte, receipt_status: 'anulado' },
      { ...abono, support_path: 'n/p1.jpg', support_file_name: 'recibo.jpg' },
    ]) {
      const { queryByLabelText, unmount } = render(
        <PaymentCard pago={pago} onShare={jest.fn()} onPrint={jest.fn()} supportState="missing" onAttachSupport={jest.fn()} />
      );
      expect(queryByLabelText(/Adjuntar soporte/)).toBeNull();
      unmount();
    }
  });
});
