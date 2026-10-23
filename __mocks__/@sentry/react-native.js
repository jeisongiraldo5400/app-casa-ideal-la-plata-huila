// Mock global de Sentry para las pruebas. El paquete real arranca un
// setInterval al importarse (AsyncExpiringMap) que nunca se limpia y deja
// workers de Jest abiertos («A worker process has failed to exit gracefully»).
// Cualquier pantalla que importe `@/components/ui` lo trae vía
// ScreenErrorBoundary. Las pruebas que necesitan más lo mockean por su cuenta.
module.exports = {
  init: jest.fn(),
  wrap: (component) => component,
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setTag: jest.fn(),
  setUser: jest.fn(),
};
