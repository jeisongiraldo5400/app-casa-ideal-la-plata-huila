import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { DownloadDataButton } from '../DownloadDataButton';
import { requestManualDownload } from '@/lib/offline/sync/downloadData';

jest.mock('@/lib/offline/sync/downloadData', () => {
  const actual = jest.requireActual('@/lib/offline/sync/downloadData');
  return {
    ...actual,
    requestManualDownload: jest.fn(),
  };
});

const mockedDownload = requestManualDownload as jest.MockedFunction<typeof requestManualDownload>;

describe('DownloadDataButton', () => {
  beforeEach(() => {
    mockedDownload.mockReset();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('no intenta descargar y avisa si no hay red', async () => {
    mockedDownload.mockResolvedValue({ ok: false, reason: 'offline' });
    const { getByTestId } = render(<DownloadDataButton />);

    fireEvent.press(getByTestId('download-data-button'));

    await waitFor(() => {
      expect(mockedDownload).toHaveBeenCalledTimes(1);
      expect(Alert.alert).toHaveBeenCalledWith(
        'Sin conexión',
        'Conéctese a internet para descargar negocios y cartera.'
      );
    });
  });
});
