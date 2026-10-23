import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { NegocioCostPanel } from '../NegocioCostPanel';
import { parseNegocioCostResult } from '@/lib/negocios/negocioCosts';
import { COST_HELP } from '@/lib/costos/costHelp';

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name) };
});


const result = parseNegocioCostResult({
  lines: [
    { product_id: 'p1', product_name: 'Nevera', quantity: 1, unit_price: 90, unit_cost: 100, last_unit_cost: 100,
      avg_unit_cost: 100, cost_total: 100, margin_amount: -10, margin_pct: -11.11, below_cost: true, below_margin: false, live: false },
    { product_id: 'p2', product_name: 'Lavadora', quantity: 1, unit_price: 1000, unit_cost: 790, last_unit_cost: 800,
      avg_unit_cost: 790, cost_total: 790, margin_amount: 210, margin_pct: 21, below_cost: false, below_margin: false, live: false },
  ],
  totals: { sale: 1090, cost: 890, margin_amount: 200, lines_without_cost: 0 },
})!;

describe('NegocioCostPanel (móvil): ganancia, pérdida y ayudas', () => {
  it('muestra «Pérdida» y «Ganancia» con pesos y %, y el total con su %', () => {
    render(<NegocioCostPanel result={result} showTotals />);
    expect(screen.getByText('Pérdida')).toBeTruthy();
    expect(screen.getAllByText(/^\$\s10 \(\u221211,1 %\)$/)).toHaveLength(1);
    expect(screen.getAllByText(/^\$\s210 \(21 %\)$/)).toHaveLength(1);
    expect(screen.getByText('Ganancia total')).toBeTruthy();
    expect(screen.getAllByText(/^\$\s200 \(18,4 %\)$/)).toHaveLength(1);
    expect(screen.queryByText('Margen %')).toBeNull();
  });

  it('un toque en «?» muestra la frase del término', () => {
    render(<NegocioCostPanel result={result} showTotals />);
    expect(screen.queryByText(COST_HELP.costo_promedio)).toBeNull();
    fireEvent.press(screen.getAllByLabelText('Qué es: Costo promedio')[0]);
    expect(screen.getByText(COST_HELP.costo_promedio)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Cerrar ayuda'));
    expect(screen.queryByText(COST_HELP.costo_promedio)).toBeNull();
    expect(screen.getByLabelText('Qué es: Costo fijado')).toBeTruthy();
  });

  it('con costo fijado al activar lo dice; con costo de hoy, el promedio', () => {
    const view = render(<NegocioCostPanel result={result} showTotals />);
    expect(screen.getByText(/La ganancia se calcula con el costo fijado al activar\./)).toBeTruthy();
    expect(screen.queryByText(/costo promedio\./)).toBeNull();

    const live = parseNegocioCostResult({
      lines: [{ product_id: 'p3', product_name: 'Estufa', quantity: 1, unit_price: 500, unit_cost: 400, last_unit_cost: 400,
        avg_unit_cost: 400, cost_total: 400, margin_amount: 100, margin_pct: 25, below_cost: false, below_margin: false, live: true }],
      totals: null,
    })!;
    view.unmount();
    render(<NegocioCostPanel result={live} />);
    expect(screen.getByText(/La ganancia se calcula con el costo promedio\./)).toBeTruthy();
    expect(screen.queryByText(/fijado al activar/)).toBeNull();
  });
});
