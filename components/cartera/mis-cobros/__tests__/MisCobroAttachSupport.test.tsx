import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import type { MisCobroRow } from '@/lib/cartera/misCobros';
import { MisCobroAttachSupport } from '../MisCobroAttachSupport';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name) };
});
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('@/lib/offline/store/syncStore', () => ({
  useSyncStore: (selector: (state: { online: boolean }) => unknown) => selector({ online: true }),
}));
jest.mock('@/components/negocios/infrastructure/hooks/usePaymentMethodsCatalog', () => ({
  usePaymentMethodsCatalog: () => [
    { id: 'pm-ef', name: 'Efectivo', requiresSupport: false },
    { id: 'pm-con', name: 'Consignación', requiresSupport: true },
  ],
}));
jest.mock('@/lib/pagoSupportAttach', () => ({ attachOrQueuePagoSupport: jest.fn() }));
jest.mock('@/lib/pickPagoSupportFile', () => ({ pickPagoSupportFile: jest.fn(async () => null) }));
jest.mock('@/lib/cartera/carteraCache', () => ({ invalidateCartera: jest.fn() }));

const row: MisCobroRow = {
  payment_id: 'p1',
  negocio_id: 'n1',
  negocio_numero: 20260007,
  customer_name: 'Ana',
  customer_id_number: null,
  installment_number: null,
  paid_at: '2026-09-20T15:00:00.000Z',
  amount: 100_000,
  virtual_receipt_number: 'RV-1',
  receipt_number: null,
  receipt_status: 'emitido',
  payment_method_id: 'pm-con',
  payment_method_name: 'Consignación',
  payment_method_is_cash: false,
  payment_site: 'app_movil',
  payment_kind: 'abono',
  cierre_numero: null,
  local_state: null,
  support_path: null,
} as MisCobroRow;

describe('MisCobroAttachSupport', () => {
  it('fila del servidor sin soporte y método que lo exige: acceso destacado', async () => {
    const { getByLabelText } = render(<MisCobroAttachSupport row={row} />);
    await waitFor(() => expect(getByLabelText('Adjuntar soporte obligatorio del pago')).toBeTruthy());
  });

  it('método opcional: acceso normal', () => {
    const { getByLabelText } = render(<MisCobroAttachSupport row={{ ...row, payment_method_id: 'pm-ef' }} />);
    expect(getByLabelText('Adjuntar soporte del pago')).toBeTruthy();
  });

  it('no se ofrece con soporte, anulado, fila del teléfono (sin el dato) o pendiente de enviar', () => {
    const rows: MisCobroRow[] = [
      { ...row, support_path: 'n1/p1.jpg' },
      { ...row, receipt_status: 'anulado' },
      { ...row, support_path: undefined },
      { ...row, local_state: 'pendiente' } as MisCobroRow,
    ];
    for (const item of rows) {
      const { queryByLabelText, unmount } = render(<MisCobroAttachSupport row={item} />);
      expect(queryByLabelText(/Adjuntar soporte/)).toBeNull();
      unmount();
    }
  });
});
