import React, { useEffect } from 'react';
import { View } from '@tarojs/components';
import { useDidShow, useDidHide } from '@tarojs/taro';
import classnames from 'classnames';
import { useAppStore } from '@/store/appStore';
import { subscribeAppSettings } from '@/services/settingsService';
// Estilos globais
import './app.scss';

function App(props: { children: React.ReactNode }) {
  // Pode usar todos os React Hooks
  const setSettings = useAppStore((s) => s.setSettings);
  const settings = useAppStore((s) => s.settings);

  useEffect(() => {
    return subscribeAppSettings((next) => setSettings(next));
  }, [setSettings]);

  // Equivalente ao onShow
  useDidShow(() => {});

  // Equivalente ao onHide
  useDidHide(() => {});

  const theme = useAppStore((s) => s.theme);
  const style = {
    '--color-primary': settings.theme.primary || undefined,
    '--color-primary-light': settings.theme.primaryLight || undefined,
    '--color-primary-dark': settings.theme.primaryDark || undefined,
    '--color-accent': settings.theme.accent || undefined,
  } as any;

  return (
    <View className={classnames('appRoot', theme === 'dark' ? 'themeDark' : 'themeLight')} style={style}>
      {props.children}
    </View>
  );
}

export default App;
