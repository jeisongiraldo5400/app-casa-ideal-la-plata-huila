import { Header, getHeaderTitle } from '@react-navigation/elements';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Header JS para pantallas del Stack raíz (fuera de las tabs).
 *
 * Usa el mismo `Header` de React Navigation que renderiza el navegador de tabs,
 * de modo que `headerLeft` (BackButton), el título y los márgenes se ven igual
 * que en el resto de la app. El header nativo de iOS/Android aplica insets
 * propios al botón de la izquierda y pega el título a él.
 */
export function StackHeader({ options, route, back }: NativeStackHeaderProps) {
  const insets = useSafeAreaInsets();
  const { headerLeft, headerRight } = options;

  return (
    <Header
      title={getHeaderTitle(options, route.name)}
      headerTitle={typeof options.headerTitle === 'string' ? options.headerTitle : undefined}
      headerTitleAlign={options.headerTitleAlign}
      headerTitleStyle={options.headerTitleStyle}
      headerStyle={options.headerStyle}
      headerTintColor={options.headerTintColor}
      headerShadowVisible={options.headerShadowVisible}
      headerTransparent={options.headerTransparent}
      headerStatusBarHeight={insets.top}
      headerLeft={
        headerLeft
          ? (props) => headerLeft({ tintColor: props.tintColor, canGoBack: !!back, label: back?.title, href: back?.href })
          : undefined
      }
      headerRight={headerRight ? (props) => headerRight({ tintColor: props.tintColor, canGoBack: !!back }) : undefined}
    />
  );
}
