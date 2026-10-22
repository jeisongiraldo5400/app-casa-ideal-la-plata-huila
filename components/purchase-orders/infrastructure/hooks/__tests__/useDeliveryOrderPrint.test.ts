import { offersClientSheets } from '../useDeliveryOrderPrint';

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(), printAsync: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

const child = (status: string) => ({ status }) as never;

describe('offersClientSheets', () => {
  it('solo en remisiones con al menos un cliente no anulado', () => {
    expect(offersClientSheets({ orderType: 'remission', children: [child('approved')] })).toBe(true);
    expect(offersClientSheets({ orderType: 'remission', children: [child('cancelled')] })).toBe(false);
    expect(offersClientSheets({ orderType: 'remission', children: [] })).toBe(false);
    expect(offersClientSheets({ orderType: 'customer', children: [child('approved')] })).toBe(false);
  });
});
