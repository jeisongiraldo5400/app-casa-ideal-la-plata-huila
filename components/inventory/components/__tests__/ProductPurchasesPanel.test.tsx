import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { ProductPurchasesPanel } from '../ProductPurchasesPanel';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name) };
});

const rpc = supabase.rpc as unknown as jest.Mock;

const response = {
  product_id: 'p1',
  last_unit_cost: 130,
  avg_unit_cost: 110,
  total: 1,
  summary: { min_unit_cost: 100, max_unit_cost: 130 },
  rows: [
    {
      entry_id: 'e1', created_at: '2026-10-10T15:00:00Z', order_number: 'OC-2026-0002', supplier_name: 'Proveedor Uno',
      supplier_nit: '900123', warehouse_name: 'Centro', quantity: 5, unit_cost: 130, total_cost: 650, received_by_name: 'Ana',
    },
  ],
};

describe('ProductPurchasesPanel (últimas compras en el móvil)', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('cerrado no consulta; al abrir pide 5 y muestra costo, proveedor y NIT', async () => {
    rpc.mockResolvedValue({ data: response, error: null });
    render(<ProductPurchasesPanel productId="p1" online />);
    expect(rpc).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Últimas compras'));
    });
    expect(rpc).toHaveBeenCalledWith('cost_product_purchases', { p_product_id: 'p1', p_limit: 5, p_offset: 0 });
    expect(await screen.findByTestId('product-purchase-row-e1')).toBeTruthy();
    expect(screen.getByText(/Proveedor Uno · NIT 900123/)).toBeTruthy();
    expect(screen.getByText(/OC-2026-0002/)).toBeTruthy();
  });

  it('sin señal avisa y no consulta; al volver la señal consulta', async () => {
    rpc.mockResolvedValue({ data: response, error: null });
    const view = render(<ProductPurchasesPanel productId="p1" online={false} />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Últimas compras'));
    });
    expect(screen.getByTestId('product-purchases-offline')).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
    await act(async () => {
      view.rerender(<ProductPurchasesPanel productId="p1" online />);
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('product-purchase-row-e1')).toBeTruthy();
  });

  it('error del servidor (p. ej. sin el perfil): mensaje con reintento', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Solo el perfil Costos puede ver o registrar costos' } });
    render(<ProductPurchasesPanel productId="p1" online />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Últimas compras'));
    });
    expect(await screen.findByText(/Solo el perfil Costos.*Toca para reintentar/)).toBeTruthy();
  });

  it('caída de red: el mensaje sale en español, no el texto técnico en inglés', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Network request failed' } });
    render(<ProductPurchasesPanel productId="p1" online />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Últimas compras'));
    });
    expect(await screen.findByText(/Sin conexión con el servidor.*Toca para reintentar/)).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();
  });
});
