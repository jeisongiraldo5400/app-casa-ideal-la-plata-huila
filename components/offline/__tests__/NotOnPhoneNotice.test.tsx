import { render } from '@testing-library/react-native';
import React from 'react';
import { CLOSED_NEGOCIOS_NOT_ON_PHONE_MESSAGE, NotOnPhoneNotice } from '../NotOnPhoneNotice';

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));

describe('NotOnPhoneNotice (v3)', () => {
  it('sin señal explica que los negocios cerrados y anulados no se llevan', () => {
    const screen = render(<NotOnPhoneNotice fromCache />);
    expect(screen.getByTestId('not-on-phone-notice')).toHaveTextContent(CLOSED_NEGOCIOS_NOT_ON_PHONE_MESSAGE);
    expect(CLOSED_NEGOCIOS_NOT_ON_PHONE_MESSAGE).toMatch(/cerrados y los anulados no se llevan/);
  });

  it('con señal no dice nada', () => {
    const screen = render(<NotOnPhoneNotice fromCache={false} />);
    expect(screen.queryByTestId('not-on-phone-notice')).toBeNull();
  });
});
