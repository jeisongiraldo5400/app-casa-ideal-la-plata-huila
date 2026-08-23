import { act, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { BarcodeScanner } from '@/components/scanning';

let mockCameraProps: Record<string, any> = {};
const mockRequestPermission = jest.fn(async () => undefined);

jest.mock('expo-camera', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useCameraPermissions: () => [{ granted: true }, mockRequestPermission],
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
    mockCameraProps = {};
  });

  it('admite los formatos comerciales y entrega una sola lectura válida', async () => {
    const onScan = jest.fn(async () => undefined);
    render(<BarcodeScanner onScan={onScan} onClose={jest.fn()} />);

    await waitFor(() => expect(mockCameraProps.barcodeScannerSettings).toBeTruthy());
    expect(mockCameraProps.barcodeScannerSettings.barcodeTypes).toEqual(
      expect.arrayContaining(['ean13', 'code128', 'upc_a', 'code39', 'qr']),
    );

    act(() => mockCameraProps.onCameraReady());
    await waitFor(() => expect(mockCameraProps.onBarcodeScanned).toEqual(expect.any(Function)));
    await act(async () => {
      await mockCameraProps.onBarcodeScanned({ data: ' 770123 ' });
    });

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('770123');
  });
});
