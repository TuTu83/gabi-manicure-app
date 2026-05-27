import React, { useEffect, useRef } from 'react';
import { View } from '@tarojs/components';
import Taro, { useDidShow, useDidHide } from '@tarojs/taro';
import classnames from 'classnames';
import { useAppStore } from '@/store/appStore';
import { subscribeAppSettings } from '@/services/settingsService';
// Estilos globais
import './app.scss';

function App(props: { children: React.ReactNode }) {
  // Pode usar todos os React Hooks
  const setSettings = useAppStore((s) => s.setSettings);
  const settings = useAppStore((s) => s.settings);
  const installPromptRef = useRef<any>(null);
  const isInstalledRef = useRef(false);
  const promptingRef = useRef(false);

  useEffect(() => {
    return subscribeAppSettings((next) => setSettings(next));
  }, [setSettings]);

  useEffect(() => {
    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    if (!isBrowser) return;

    const standalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.navigator as any).standalone === true;
    isInstalledRef.current = Boolean(standalone);

    const onBeforeInstallPrompt = (e: any) => {
      try {
        e.preventDefault();
      } catch {}
      installPromptRef.current = e;
    };
    const onAppInstalled = () => {
      isInstalledRef.current = true;
      installPromptRef.current = null;
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt as any);
    window.addEventListener('appinstalled', onAppInstalled as any);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt as any);
      window.removeEventListener('appinstalled', onAppInstalled as any);
    };
  }, []);

  // Equivalente ao onShow
  useDidShow(() => {
    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    if (!isBrowser) return;
    if (isInstalledRef.current) return;
    if (promptingRef.current) return;

    const ua = String(window.navigator.userAgent || '');
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
    if (!isMobile) return;

    promptingRef.current = true;
    (async () => {
      try {
        const isIos = /iPhone|iPad|iPod/i.test(ua);
        const isIosSafari = isIos && /Safari/i.test(ua) && !/CriOS|FxiOS/i.test(ua);
        const canNativePrompt = Boolean(installPromptRef.current && typeof installPromptRef.current.prompt === 'function');

        const { confirm } = await Taro.showModal({
          title: 'Instalar aplicativo',
          content: isIosSafari
            ? 'Para instalar: toque em Compartilhar e depois em "Adicionar à Tela de Início".'
            : 'Deseja instalar o app no seu celular para acesso rápido?',
          confirmText: 'Instalar',
          cancelText: 'Agora não',
        });

        if (!confirm) return;

        if (canNativePrompt) {
          await installPromptRef.current.prompt();
          const choice = await installPromptRef.current.userChoice;
          if (choice?.outcome === 'accepted') {
            isInstalledRef.current = true;
          }
        }
      } catch (error) {
        console.error('[PWA] falha ao exibir/acionar instalação', error);
      } finally {
        promptingRef.current = false;
      }
    })();
  });

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
