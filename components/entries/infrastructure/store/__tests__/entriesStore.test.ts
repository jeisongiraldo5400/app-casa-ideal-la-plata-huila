import { supabase } from '@/lib/supabase';
import { useEntriesStore } from '../entriesStore';

// Mock de supabase
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

describe('entriesStore', () => {
  beforeEach(() => {
    // Resetear el store antes de cada test
    useEntriesStore.getState().reset();
    jest.clearAllMocks();
  });

  describe('setEntryType', () => {
    it('should set entry type and update step', () => {
      const { setEntryType } = useEntriesStore.getState();
      
      setEntryType('PO_ENTRY');
      
      const state = useEntriesStore.getState();
      expect(state.entryType).toBe('PO_ENTRY');
      expect(state.step).toBe('setup');
      expect(state.setupStep).toBe('supplier');
    });

    it('should start at warehouse step for INITIAL_LOAD', () => {
      const { setEntryType } = useEntriesStore.getState();

      setEntryType('INITIAL_LOAD');

      const state = useEntriesStore.getState();
      expect(state.entryType).toBe('INITIAL_LOAD');
      expect(state.setupStep).toBe('warehouse');
    });
  });

  describe('setQuantity', () => {
    it('should set quantity correctly', () => {
      const { setQuantity } = useEntriesStore.getState();
      
      setQuantity(5);
      
      expect(useEntriesStore.getState().currentQuantity).toBe(5);
    });

    it('should not set negative quantity', () => {
      const { setQuantity } = useEntriesStore.getState();
      
      setQuantity(-5);
      
      expect(useEntriesStore.getState().currentQuantity).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      const { setEntryType, setQuantity, reset } = useEntriesStore.getState();
      
      // Modificar el estado
      setEntryType('PO_ENTRY');
      setQuantity(10);
      
      // Resetear
      reset();
      
      const state = useEntriesStore.getState();
      expect(state.entryType).toBeNull();
      expect(state.currentQuantity).toBe(1);
      expect(state.step).toBe('flow-selection');
      expect(state.entryItems).toEqual([]);
      expect(state.scannedItemsProgress.size).toBe(0);
    });
  });

  describe('startEntry', () => {
    it('should not go to scanning without purchase order when PO_ENTRY', () => {
      const { setEntryType, setSupplier, setWarehouse, startEntry } =
        useEntriesStore.getState();

      setEntryType('PO_ENTRY');
      setSupplier('supplier-1');
      setWarehouse('warehouse-1');
      startEntry();

      const state = useEntriesStore.getState();
      expect(state.step).toBe('setup');
      expect(state.error).toMatch(/orden de compra/i);
    });
  });

  describe('finalizeEntry', () => {
    it('should return error for PO_ENTRY without purchase order before insert', async () => {
      const mockProduct = { id: 'product-1', name: 'P' } as any;
      useEntriesStore.setState({
        entryType: 'PO_ENTRY',
        supplierId: 'supplier-1',
        warehouseId: 'warehouse-1',
        purchaseOrderId: null,
        entryItems: [{ product: mockProduct, quantity: 1, barcode: 'x' }],
      });

      const { finalizeEntry } = useEntriesStore.getState();
      const { error } = await finalizeEntry('user-1');

      expect(error?.message).toMatch(/orden de compra/i);
    });
  });

  describe('registeredEntriesCache', () => {
    it('should initialize with empty cache', () => {
      const state = useEntriesStore.getState();
      expect(state.registeredEntriesCache).toEqual({});
    });

    it('should update cache when entries are registered', async () => {
      const mockOrder = {
        id: 'order-1',
        order_number: 'OC-1',
        supplier_id: 'supplier-1',
        status: 'pending' as const,
        items: [],
        supplier: { id: 'supplier-1', name: 'Test Supplier' },
      };

      useEntriesStore.setState({ purchaseOrders: [mockOrder as any] });

      (supabase.from as jest.Mock).mockImplementation(() => ({
        select: () => ({
          eq: () => ({
            is: () =>
              Promise.resolve({
                data: [
                  { product_id: 'product-1', quantity: 10 },
                  { product_id: 'product-1', quantity: 5 },
                ],
                error: null,
              }),
          }),
        }),
      }));

      const { selectPurchaseOrder } = useEntriesStore.getState();

      await selectPurchaseOrder('order-1');

      const state = useEntriesStore.getState();
      expect(state.registeredEntriesCache['order-1']).toBeDefined();
      expect(state.registeredEntriesCache['order-1']['product-1']).toBe(15);
    });
  });

  describe('validateProductAgainstOrder', () => {
    it('should return invalid if no purchase order selected', () => {
      const { validateProductAgainstOrder } = useEntriesStore.getState();
      
      const result = validateProductAgainstOrder('product-1', 10);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('No hay orden de compra seleccionada');
    });
  });

  describe('scannedItemsProgress', () => {
    it('should initialize with empty Map', () => {
      const state = useEntriesStore.getState();
      expect(state.scannedItemsProgress.size).toBe(0);
    });

    it('should update when product is added to entry', async () => {
      const { addProductToEntry } = useEntriesStore.getState();

      const mockProduct = {
        id: 'product-1',
        name: 'Test Product',
        barcode: '123456',
        sku: 'SKU-001',
      } as any;

      useEntriesStore.setState({
        entryType: 'PO_ENTRY',
        purchaseOrderId: 'order-1',
        currentProduct: mockProduct,
        selectedPurchaseOrder: {
          id: 'order-1',
          items: [
            {
              product_id: 'product-1',
              quantity: 100,
              product: mockProduct,
            },
          ],
        } as any,
        registeredEntriesCache: { 'order-1': {} },
      });

      await addProductToEntry(mockProduct, 5, '123456');

      const state = useEntriesStore.getState();
      expect(state.entryItems.length).toBe(1);
    });
  });
});

