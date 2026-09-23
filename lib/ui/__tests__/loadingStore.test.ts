import { NAVIGATION_TIMEOUT_MS, selectIsBusy, startNavigationLoading, useLoadingStore } from '../loadingStore';

describe('loadingStore', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useLoadingStore.getState().reset();
  });

  afterEach(() => {
    useLoadingStore.getState().reset();
    jest.useRealTimers();
  });

  it('está ocioso mientras nadie navega ni carga', () => {
    expect(selectIsBusy(useLoadingStore.getState())).toBe(false);
  });

  it('se ocupa al tocar el menú y se libera cuando la ruta destino monta', () => {
    startNavigationLoading();
    expect(selectIsBusy(useLoadingStore.getState())).toBe(true);

    useLoadingStore.getState().endNavigation();
    expect(selectIsBusy(useLoadingStore.getState())).toBe(false);
  });

  it('sigue ocupado tras montar si la pantalla destino está cargando datos', () => {
    startNavigationLoading();
    useLoadingStore.getState().setScreenLoading('cartera', true);
    useLoadingStore.getState().endNavigation();

    expect(selectIsBusy(useLoadingStore.getState())).toBe(true);

    useLoadingStore.getState().setScreenLoading('cartera', false);
    expect(selectIsBusy(useLoadingStore.getState())).toBe(false);
  });

  it('no se apaga hasta que terminan todas las pantallas que cargan', () => {
    useLoadingStore.getState().setScreenLoading('negocios', true);
    useLoadingStore.getState().setScreenLoading('cartera', true);
    useLoadingStore.getState().setScreenLoading('negocios', false);

    expect(selectIsBusy(useLoadingStore.getState())).toBe(true);

    useLoadingStore.getState().setScreenLoading('cartera', false);
    expect(selectIsBusy(useLoadingStore.getState())).toBe(false);
  });

  it('no duplica el mismo identificador ni cambia el estado al repetir el valor', () => {
    useLoadingStore.getState().setScreenLoading('negocios', true);
    const snapshot = useLoadingStore.getState().loaders;
    useLoadingStore.getState().setScreenLoading('negocios', true);

    // Misma referencia: no hubo re-render innecesario.
    expect(useLoadingStore.getState().loaders).toBe(snapshot);
    expect(useLoadingStore.getState().loaders).toEqual(['negocios']);
  });

  it('apaga la navegación por su cuenta si el destino nunca monta', () => {
    startNavigationLoading();
    jest.advanceTimersByTime(NAVIGATION_TIMEOUT_MS);

    expect(useLoadingStore.getState().navigating).toBe(false);
  });
});
