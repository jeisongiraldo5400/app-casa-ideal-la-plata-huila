/** Minimal theme slice for entry picker fields */
export type EntryPickerThemeColors = {
  background: { paper: string };
  divider: string;
  text: { primary: string };
};

export type SupplierEntryOption = {
  id: string;
  name: string | null;
  nit: string | null;
};

export type WarehouseEntryOption = {
  id: string;
  name: string | null;
};

export type SupplierPickerFieldProps = {
  supplierId: string | null;
  suppliers: SupplierEntryOption[];
  onSupplierChange: (id: string | null) => void;
  colors: EntryPickerThemeColors;
  colorScheme: 'light' | 'dark';
};

export type WarehousePickerFieldProps = {
  warehouseId: string | null;
  warehouses: WarehouseEntryOption[];
  onWarehouseChange: (id: string | null) => void;
  colors: EntryPickerThemeColors;
  colorScheme: 'light' | 'dark';
};

export type EntryOptionPickerFieldProps = {
  /** Formik-style: '' = ninguno */
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  modalTitle: string;
  colors: EntryPickerThemeColors;
  colorScheme: 'light' | 'dark';
};
