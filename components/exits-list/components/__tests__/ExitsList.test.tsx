import { render } from '@testing-library/react-native';
import React from 'react';
import type { ExitListItem } from '../../infrastructure/store/exitsListStore';
import { ExitsList } from '../ExitsList';

const mockLoadExits = jest.fn();
let mockExits: ExitListItem[] = [];
let mockSearchQuery = '';

jest.mock('@/components/exits-list/infrastructure/hooks/useExitsList', () => ({
  useExitsList: () => ({
    exits: mockExits,
    loading: false,
    searchQuery: mockSearchQuery,
    hasMore: false,
    loadNextPage: jest.fn(),
    loadExits: mockLoadExits,
  }),
}));

jest.mock('@/components/theme', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name),
  };
});

function exit(overrides: Partial<ExitListItem> = {}): ExitListItem {
  return {
    id: 'exit-1',
    product_id: 'product-1',
    product_name: 'Nevera No Frost',
    product_sku: 'NEV-1',
    product_barcode: '770123',
    warehouse_id: 'warehouse-1',
    warehouse_name: 'Principal',
    quantity: 2,
    created_at: '2026-09-10T15:00:00Z',
    created_by: 'user-1',
    created_by_name: 'Bodeguero',
    barcode_scanned: '770123',
    is_cancelled: false,
    cancellation_id: null,
    cancellation_observations: null,
    cancellation_created_at: null,
    serials: [],
    ...overrides,
  };
}

describe('ExitsList · seriales', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchQuery = '';
  });

  it('muestra los seriales de cada salida y marca los liberados con su motivo', () => {
    mockExits = [
      exit({
        serials: [
          { inventoryExitId: 'exit-1', productId: 'product-1', serial: 'AB123', normalized: 'AB123', method: 'scan', releasedReason: null },
          { inventoryExitId: 'exit-1', productId: 'product-1', serial: 'CD456', normalized: 'CD456', method: 'manual', releasedReason: 'exit_cancelled' },
          { inventoryExitId: 'exit-1', productId: 'product-1', serial: 'EF789', normalized: 'EF789', method: 'scan', releasedReason: 'returned' },
        ],
      }),
    ];

    const screen = render(<ExitsList />);

    expect(screen.getByText('S/N AB123')).toBeTruthy();
    expect(screen.getByText('S/N CD456')).toBeTruthy();
    expect(screen.getByText('anulada')).toBeTruthy();
    expect(screen.getByText('devuelto')).toBeTruthy();
    expect(screen.getByLabelText('Serial CD456, anulada')).toBeTruthy();
    expect(screen.getByText('S/N CD456').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ textDecorationLine: 'line-through' })]),
    );
    expect(screen.getByText('S/N AB123').props.style).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ textDecorationLine: 'line-through' })]),
    );
  });

  it('sin seriales la tarjeta se ve como antes', () => {
    mockExits = [exit()];

    const screen = render(<ExitsList />);

    expect(screen.getByText('Nevera No Frost')).toBeTruthy();
    expect(screen.queryByTestId('exit-serial-chips')).toBeNull();
    expect(screen.queryByText(/S\/N/)).toBeNull();
  });
});
