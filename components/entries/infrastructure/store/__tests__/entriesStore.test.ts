import { supabase } from '@/lib/supabase';
import { useEntriesStore } from '../entriesStore';

// Mock de supabase
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
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

    it('validates the setup and goes straight to scanning (no intermediate confirmation screen)', () => {
      useEntriesStore.setState({ entryType: 'INITIAL_LOAD', warehouseId: 'warehouse-1', step: 'setup' });

      expect(useEntriesStore.getState().openEntryConfirmation()).toBe(true);
      expect(useEntriesStore.getState().step).toBe('setup');

      useEntriesStore.getState().startEntry();
      expect(useEntriesStore.getState().step).toBe('scanning');
      expect(useEntriesStore.getState().uiStage).toBe('idle');
    });
  });

  describe('guided scanning', () => {
    const originalSearch = useEntriesStore.getState().searchProductByBarcode;

    afterEach(() => {
      useEntriesStore.setState({ searchProductByBarcode: originalSearch });
    });

    it('opens product creation only for a manual entry', async () => {
      useEntriesStore.setState({
        entryType: 'ENTRY',
        warehouseId: 'warehouse-1',
        step: 'scanning',
        searchProductByBarcode: jest.fn(async () => null),
      });

      const result = await useEntriesStore.getState().scanBarcode('UNKNOWN');

      expect(result.status).toBe('not_found');
      expect(useEntriesStore.getState().step).toBe('product-form');
      expect(useEntriesStore.getState().currentScannedBarcode).toBe('UNKNOWN');
    });

    it('resets uiStage when routing an unknown barcode to product creation', async () => {
      useEntriesStore.setState({
        entryType: 'INITIAL_LOAD',
        warehouseId: 'warehouse-1',
        step: 'scanning',
        uiStage: 'product_review',
        searchProductByBarcode: jest.fn(async () => null),
      });

      await useEntriesStore.getState().scanBarcode('UNKNOWN');

      expect(useEntriesStore.getState().step).toBe('product-form');
      expect(useEntriesStore.getState().uiStage).toBe('idle');
    });

    it('ignores a scanBarcode result that resolves after the store was reset', async () => {
      const product = { id: 'product-1', name: 'Producto' } as any;
      let resolveSearch: (value: any) => void = () => undefined;
      useEntriesStore.setState({
        entryType: 'INITIAL_LOAD',
        warehouseId: 'warehouse-1',
        step: 'scanning',
        searchProductByBarcode: jest.fn(
          () => new Promise((resolve) => { resolveSearch = resolve; })
        ),
      });

      const pending = useEntriesStore.getState().scanBarcode('770123');
      useEntriesStore.getState().resetAll();
      resolveSearch(product);
      await pending;

      const state = useEntriesStore.getState();
      expect(state.step).toBe('flow-selection');
      expect(state.currentProduct).toBeNull();
    });

    it('does not toggle global loading while looking up a barcode', async () => {
      const product = { id: 'product-1', name: 'Producto' } as any;
      useEntriesStore.setState({
        entryType: 'INITIAL_LOAD',
        warehouseId: 'warehouse-1',
        step: 'scanning',
        loading: false,
        searchProductByBarcode: jest.fn(async () => {
          expect(useEntriesStore.getState().loading).toBe(false);
          return product;
        }),
      });

      const result = await useEntriesStore.getState().scanBarcode('770123');

      expect(result.status).toBe('found');
      expect(useEntriesStore.getState().loading).toBe(false);
      expect(useEntriesStore.getState().uiStage).toBe('product_review');
    });

    it('does not create an unknown product inside a purchase order', async () => {
      useEntriesStore.setState({
        entryType: 'PO_ENTRY',
        purchaseOrderId: 'order-1',
        warehouseId: 'warehouse-1',
        step: 'scanning',
        searchProductByBarcode: jest.fn(async () => null),
      });

      const result = await useEntriesStore.getState().scanBarcode('UNKNOWN');

      expect(result.status).toBe('error');
      expect(useEntriesStore.getState().step).toBe('scanning');
      expect(useEntriesStore.getState().error).toMatch(/orden de compra/i);
    });

    it('returns a typed result and retains an invalid product for correction', async () => {
      const product = { id: 'product-1', name: 'Producto' } as any;
      useEntriesStore.setState({ currentProduct: product, currentScannedBarcode: '123' });

      const result = await useEntriesStore.getState().addProductToEntry(product, 0, '123');

      expect(result).toEqual({ ok: false, error: 'La cantidad debe ser un número mayor que cero' });
      expect(useEntriesStore.getState().currentProduct).toBe(product);
    });

    it('does not mutate an existing entry item when adding more quantity', async () => {
      const product = { id: 'product-1', name: 'Producto' } as any;
      const existing = { product, quantity: 2, barcode: '123' };
      useEntriesStore.setState({
        currentProduct: product,
        currentScannedBarcode: '123',
        entryItems: [existing],
      });

      const result = await useEntriesStore.getState().addProductToEntry(product, 3, '123');

      expect(result.ok).toBe(true);
      expect(existing.quantity).toBe(2);
      expect(useEntriesStore.getState().entryItems[0]).not.toBe(existing);
      expect(useEntriesStore.getState().entryItems[0].quantity).toBe(5);
    });
  });

  describe('finalizeEntry', () => {
    it('should return an error when another entry is already processing', async () => {
      useEntriesStore.setState({ loading: true });

      const { error } = await useEntriesStore.getState().finalizeEntry('user-1');

      expect(error?.message).toMatch(/procesando/i);
    });

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

      // Las entradas registradas se consultan con .in() (una sola función para 1 o N órdenes).
      const entriesResult = () =>
        Promise.resolve({
          data: [
            { purchase_order_id: 'order-1', product_id: 'product-1', quantity: 10 },
            { purchase_order_id: 'order-1', product_id: 'product-1', quantity: 5 },
          ],
          error: null,
        });
      (supabase.from as jest.Mock).mockImplementation(() => ({
        select: () => ({
          eq: () => ({ is: entriesResult }),
          in: () => ({ is: entriesResult }),
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

  describe('searchProductByBarcode', () => {
    it('should propagate query errors instead of treating them as a missing product', async () => {
      (supabase.from as jest.Mock).mockImplementation(() => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: null,
                  error: { code: '42501', message: 'permission denied' },
                }),
            }),
          }),
        }),
      }));

      await expect(
        useEntriesStore.getState().searchProductByBarcode('123456')
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('returns null when the barcode is not registered', async () => {
      (supabase.from as jest.Mock).mockImplementation(() => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      }));

      await expect(
        useEntriesStore.getState().searchProductByBarcode('UNKNOWN')
      ).resolves.toBeNull();
    });
  });

  describe('createProduct', () => {
    it('should create the product through the idempotent RPC', async () => {
      const product = { id: 'product-1', name: 'Producto' };
      (supabase.rpc as jest.Mock).mockResolvedValue({ data: product, error: null });

      const result = await useEntriesStore.getState().createProduct({
        name: ' Producto ',
        sku: ' SKU-1 ',
        barcode: ' 123456 ',
        category_id: 'category-1',
        brand_id: 'brand-1',
        supplier_id: 'supplier-1',
      });

      expect(result).toEqual({ product, error: null });
      expect(supabase.rpc).toHaveBeenCalledWith(
        'create_inventory_product',
        expect.objectContaining({
          p_name: 'Producto',
          p_sku: 'SKU-1',
          p_barcode: '123456',
          p_idempotency_key: expect.any(String),
        })
      );
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
