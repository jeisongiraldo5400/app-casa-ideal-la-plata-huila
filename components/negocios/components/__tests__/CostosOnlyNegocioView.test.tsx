import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { CostosOnlyNegocioView } from '../CostosOnlyNegocioView';
import { supabase } from '@/lib/supabase';

let mockOnline = true;
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => mockOnline }));
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name) };
});

const rpc = supabase.rpc as unknown as jest.Mock;

describe('CostosOnlyNegocioView (aviso de venta para quien solo tiene el perfil Costos)', () => {
  beforeEach(() => {
    rpc.mockReset();
    mockOnline = true;
  });

  it('muestra número, cliente, vendedor y el costo por producto con cost_get_negocio', async () => {
    rpc.mockResolvedValue({
      data: {
        numero: 20260077, status: 'activo', customer_name: 'Cliente Uno', seller_name: 'Vendedor Uno',
        lines: [{ product_id: 'p1', product_name: 'Nevera', quantity: 1, unit_price: 90, unit_cost: 100, last_unit_cost: 100,
          avg_unit_cost: 100, cost_total: 100, margin_amount: -10, margin_pct: -11.11, below_cost: true, below_margin: false, live: false }],
        totals: { sale: 90, cost: 100, margin_amount: -10, lines_without_cost: 0 },
      },
      error: null,
    });
    render(<CostosOnlyNegocioView negocioId="n1" />);
    expect(await screen.findByTestId('costos-only-negocio')).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('cost_get_negocio', { p_negocio_id: 'n1' });
    expect(screen.getByText(/Cliente Uno · Vendedor Vendedor Uno/)).toBeTruthy();
    expect(screen.getByTestId('negocio-cost-panel')).toBeTruthy();
  });

  it('sin señal avisa y no consulta', () => {
    mockOnline = false;
    render(<CostosOnlyNegocioView negocioId="n1" />);
    expect(screen.getByText('Sin señal')).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('error del servidor con reintento', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'El negocio no existe o fue eliminado.' } });
    render(<CostosOnlyNegocioView negocioId="n1" />);
    await waitFor(() => expect(screen.getByText('El negocio no existe o fue eliminado.')).toBeTruthy());
    expect(screen.getByText('Reintentar')).toBeTruthy();
  });
});
