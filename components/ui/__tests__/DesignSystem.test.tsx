import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { ActionBar } from '../ActionBar';
import { Button } from '../Button';
import { HeroActionCard } from '../HeroActionCard';
import { ListCard } from '../ListCard';
import { Metric } from '../Metric';
import { ModalSheet } from '../ModalSheet';
import { Pagination } from '../Pagination';
import { ScreenState } from '../ScreenState';
import { SearchField } from '../SearchField';
import { SectionHeader } from '../SectionHeader';
import { SegmentedControl } from '../SegmentedControl';
import { StatusChip } from '../StatusChip';
import { Radius, Spacing, Typography, getThemeTokens } from '@/constants/theme';
import { cuotaStatusTone, negocioStatusTone } from '@/lib/negocioLabels';

jest.mock('@expo/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockTheme = { isDark: false };
jest.mock('@/components/theme', () => ({
  useTheme: () => mockTheme,
}));

describe('Casa Ideal design system', () => {
  afterEach(() => {
    mockTheme.isDark = false;
  });

  it('keeps the brand palette while exposing shared layout tokens', () => {
    const light = getThemeTokens(false);
    const dark = getThemeTokens(true);

    expect(light.colors.primary.main).toBe('#1e3a8a');
    expect(light.colors.background.default).toBe('#f7f5f1');
    expect(dark.colors.background.default).toBe('#111827');
    expect(Spacing.xl).toBe(20);
    expect(Radius.card).toBe(18);
  });

  it('exposes on-primary, tertiary text and label typography tokens for both themes', () => {
    for (const isDark of [false, true]) {
      const { colors } = getThemeTokens(isDark);
      expect(colors.onPrimary.text).toBe('#ffffff');
      expect(colors.onPrimary.textMuted).toMatch(/^#/);
      expect(colors.text.tertiary).toMatch(/^#/);
      expect(colors.overlay).toMatch(/^rgba/);
    }
    expect(Typography.label.textTransform).toBe('uppercase');
    expect(Typography.caption.fontSize).toBe(13);
    expect(Radius.icon).toBe(14);
  });

  it('changes the selected segment and exposes its accessible state', () => {
    const onChange = jest.fn();
    const screen = render(
      <SegmentedControl
        value="pending"
        onChange={onChange}
        items={[
          { value: 'pending', label: 'Pendientes' },
          { value: 'history', label: 'Historial' },
        ]}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Pendientes' }).props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByRole('tab', { name: 'Historial' }));
    expect(onChange).toHaveBeenCalledWith('history');
  });

  it('clears a search with the dedicated accessible action', () => {
    const onChangeText = jest.fn();
    const screen = render(<SearchField value="orden 100" onChangeText={onChangeText} />);

    fireEvent.press(screen.getByLabelText('Limpiar búsqueda'));
    expect(onChangeText).toHaveBeenCalledWith('');
  });

  it('renders semantic status labels and maps negocio statuses to tones', () => {
    const screen = render(<StatusChip label="Entregada" tone="success" icon="check-circle" />);
    expect(screen.getByText('Entregada')).toBeTruthy();
    expect(screen.getByLabelText('Estado: Entregada')).toBeTruthy();

    expect(negocioStatusTone('activo')).toBe('success');
    expect(negocioStatusTone('anulado')).toBe('error');
    expect(negocioStatusTone('borrador')).toBe('neutral');
    expect(negocioStatusTone('desconocido')).toBe('neutral');
    expect(cuotaStatusTone('mora')).toBe('error');
    expect(cuotaStatusTone('parcial')).toBe('warning');
  });

  it('renders the hero action with a combined accessibility label in light and dark', () => {
    for (const isDark of [false, true]) {
      mockTheme.isDark = isDark;
      const onPress = jest.fn();
      const screen = render(<HeroActionCard title="Crear nuevo negocio" subtitle="Crédito y orden" icon="handshake" onPress={onPress} />);
      fireEvent.press(screen.getByRole('button', { name: 'Crear nuevo negocio. Crédito y orden' }));
      expect(onPress).toHaveBeenCalled();
      screen.unmount();
    }
  });

  it('renders section headers as accessible headers with a hint or an action', () => {
    const withHint = render(<SectionHeader title="Cuotas" hint="12 cuotas" />);
    expect(withHint.getByRole('header', { name: 'Cuotas' })).toBeTruthy();
    expect(withHint.getByText('12 cuotas')).toBeTruthy();

    const withAction = render(<SectionHeader title="Pagos" hint="ignorado" action={<Text>Acción</Text>} />);
    expect(withAction.getByText('Acción')).toBeTruthy();
    expect(withAction.queryByText('ignorado')).toBeNull();
  });

  it('renders metrics and list cards, pressable only when onPress is provided', () => {
    const onPress = jest.fn();
    const screen = render(
      <>
        <ListCard onPress={onPress} accessibilityLabel="Negocio 1">
          <Metric label="Saldo" value="$1.000" tone="error" />
        </ListCard>
        <ListCard>
          <Text>estática</Text>
        </ListCard>
      </>,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Negocio 1' }));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByText('Saldo')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('paginates with 44px buttons and hides itself for a single page', () => {
    const onChange = jest.fn();
    const single = render(<Pagination page={0} pageSize={5} total={3} onChange={onChange} />);
    expect(single.toJSON()).toBeNull();

    const multi = render(<Pagination page={0} pageSize={5} total={12} onChange={onChange} itemLabel="cuotas" />);
    expect(multi.getByText('1–5 de 12 cuotas')).toBeTruthy();
    expect(multi.getByRole('button', { name: 'Página anterior' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(multi.getByRole('button', { name: 'Página siguiente' }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('supports small buttons with icons and busy state', () => {
    const screen = render(
      <ActionBar>
        <Button title="PDF" icon="picture-as-pdf" variant="outline" size="sm" onPress={jest.fn()} />
        <Button title="Guardar" onPress={jest.fn()} loading />
      </ActionBar>,
    );
    expect(screen.getByRole('button', { name: 'PDF' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar' }).props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  it('renders screen states inline or as a card, with error tone and extra content', () => {
    const onAction = jest.fn();
    const screen = render(
      <ScreenState tone="error" title="Falló" description="Sin red" actionLabel="Reintentar" onAction={onAction} variant="inline">
        <Text>extra</Text>
      </ScreenState>,
    );
    expect(screen.getByText('extra')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onAction).toHaveBeenCalled();
  });

  it('blocks dismissing a modal sheet while not dismissable', () => {
    const onClose = jest.fn();
    const screen = render(
      <ModalSheet visible title="Registrar pago" onClose={onClose} dismissable={false}>
        <Text>cuerpo</Text>
      </ModalSheet>,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).not.toHaveBeenCalled();

    screen.rerender(
      <ModalSheet visible title="Registrar pago" onClose={onClose}>
        <Text>cuerpo</Text>
      </ModalSheet>,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
