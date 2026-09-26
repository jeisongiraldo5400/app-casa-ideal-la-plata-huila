import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';
import { BarcodeScanner } from '@/components/scanning';

let mockCameraProps: Record<string, any> = {};
const mockRequestPermission = jest.fn(async () => undefined);
const mockGetPermission = jest.fn(async () => undefined);
let mockPermission: { granted: boolean; canAskAgain?: boolean } = { granted: true };

jest.mock('expo-camera', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useCameraPermissions: () => [mockPermission, mockRequestPermission, mockGetPermission],
    CameraView: (props: Record<string, any>) => {
      mockCameraProps = props;
      return ReactModule.createElement(View, { testID: 'camera-view' });
    },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('BarcodeScanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPermission = { granted: true };
    mockCameraProps = {};
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('admite los formatos comerciales y entrega una sola lectura válida', async () => {
    const onScan = jest.fn(async () => undefined);
    render(<BarcodeScanner onScan={onScan} onClose={jest.fn()} />);

    await act(async () => {
      // 700ms cubre el delay base (250ms) más el cooldown de remontaje (hasta 400ms)
      // que aplica si una CameraView anterior se desmontó justo antes en este archivo.
      jest.advanceTimersByTime(700);
    });
    await waitFor(() => expect(mockCameraProps.barcodeScannerSettings).toBeTruthy());
    expect(mockCameraProps.barcodeScannerSettings.barcodeTypes).toEqual(
      expect.arrayContaining(['ean13', 'code128', 'upc_a', 'code39', 'qr']),
    );

    act(() => mockCameraProps.onCameraReady());
    await waitFor(() => expect(mockCameraProps.onBarcodeScanned).toEqual(expect.any(Function)));
    const handler = mockCameraProps.onBarcodeScanned;
    await act(async () => {
      await handler({ data: ' 770123 ' });
    });

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('770123');
    expect(mockCameraProps.onBarcodeScanned).toBe(handler);
  });

  it('keeps the native barcode handler stable when onScan identity changes', async () => {
    const firstOnScan = jest.fn(async () => undefined);
    const secondOnScan = jest.fn(async () => undefined);
    const screen = render(<BarcodeScanner onScan={firstOnScan} onClose={jest.fn()} />);

    await act(async () => {
      // 700ms cubre el delay base (250ms) más el cooldown de remontaje (hasta 400ms)
      // que aplica si una CameraView anterior se desmontó justo antes en este archivo.
      jest.advanceTimersByTime(700);
    });
    act(() => mockCameraProps.onCameraReady());
    await waitFor(() => expect(mockCameraProps.onBarcodeScanned).toEqual(expect.any(Function)));
    const handler = mockCameraProps.onBarcodeScanned;

    screen.rerender(<BarcodeScanner onScan={secondOnScan} onClose={jest.fn()} />);
    expect(mockCameraProps.onBarcodeScanned).toBe(handler);

    await act(async () => {
      await handler({ data: '770999' });
    });
    expect(secondOnScan).toHaveBeenCalledWith('770999');
    expect(firstOnScan).not.toHaveBeenCalled();
  });

  it('ignores reads when inactive without detaching the native handler', async () => {
    const onScan = jest.fn(async () => undefined);
    const screen = render(<BarcodeScanner onScan={onScan} onClose={jest.fn()} active={false} />);

    await act(async () => {
      // 700ms cubre el delay base (250ms) más el cooldown de remontaje (hasta 400ms)
      // que aplica si una CameraView anterior se desmontó justo antes en este archivo.
      jest.advanceTimersByTime(700);
    });
    act(() => mockCameraProps.onCameraReady());
    await waitFor(() => expect(mockCameraProps.onBarcodeScanned).toEqual(expect.any(Function)));
    const handler = mockCameraProps.onBarcodeScanned;

    await act(async () => {
      await handler({ data: '770123' });
    });
    expect(onScan).not.toHaveBeenCalled();

    screen.rerender(<BarcodeScanner onScan={onScan} onClose={jest.fn()} active />);
    expect(mockCameraProps.onBarcodeScanned).toBe(handler);

    await act(async () => {
      await handler({ data: '770456' });
    });
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('770456');
  });

  describe('permiso de cámara', () => {
    it('si aún se puede pedir, ofrece «Solicitar permiso»', () => {
      mockPermission = { granted: false, canAskAgain: true };
      const screen = render(<BarcodeScanner onScan={jest.fn()} onClose={jest.fn()} />);

      // Una vez al abrir y otra al tocar el botón; no en cada render.
      expect(mockRequestPermission).toHaveBeenCalledTimes(1);
      fireEvent.press(screen.getByText('Solicitar permiso'));
      expect(mockRequestPermission).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('Abrir ajustes')).toBeNull();
    });

    it('negado para siempre: explica y abre Ajustes en vez de pedirlo en vano', () => {
      mockPermission = { granted: false, canAskAgain: false };
      const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
      const screen = render(<BarcodeScanner onScan={jest.fn()} onClose={jest.fn()} />);

      expect(screen.getByText(/Actívalo en Ajustes/)).toBeTruthy();
      fireEvent.press(screen.getByText('Abrir ajustes'));
      expect(openSettings).toHaveBeenCalledTimes(1);
      expect(mockRequestPermission).not.toHaveBeenCalled();
      openSettings.mockRestore();
    });
  });
});
