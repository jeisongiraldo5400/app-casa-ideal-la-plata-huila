export { createCustomer, searchCustomersForNegocio } from './infrastructure/services/customersService';
export type { CreateCustomerInput, CustomerLocationInput, CustomerOption } from './infrastructure/services/customersService';

export { CustomersScreen } from './components/CustomersScreen';
export { CustomerDetailScreen } from './components/CustomerDetailScreen';
export {
  claimCustomer,
  countMyCustomers,
  fetchCustomerSummary,
  fetchCustomersPage,
  CUSTOMERS_PAGE_SIZE,
} from './infrastructure/services/customersDirectoryService';
export type {
  CustomerDirectoryRow,
  CustomersPage,
  CustomersTab,
} from './infrastructure/services/customersDirectoryService';
