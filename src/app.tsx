import React, { useEffect, useRef } from 'react';
import { View } from '@tarojs/components';
import Taro, { useDidShow, useDidHide } from '@tarojs/taro';
import classnames from 'classnames';
import { useAppStore } from '@/store/appStore';
import { isAdminUser, updateUserFcmToken } from '@/services/adminService';
import { subscribeAppSettings } from '@/services/settingsService';
// Estilos globais
import './app.scss';

// Importar Capacitor
import { Capacitor } from '@capacitor/core';
// Importar Capacitor Push Notifications
import { PushNotifications } from '@capacitor/push-notifications';

// Armazena estado de debug em memória
(window as any).__DEBUG_PUSH = {
  lastSent: null,
  lastReceived: null,
  lastError: null,
  logs: [],
};

const addDebugLog = (type: string, message: string, data?: any) => {
  const log = { type, message, timestamp: Date.now(), data };
  const debugStore = (window as any).__DEBUG_PUSH;
  console.log(`\n=== [${type}] ===`);
  console.log(message, data || '');
  console.log('==================\n');
  debugStore.logs = [...(debugStore.logs || []), log];
  if (debugStore.logs.length > 100) debugStore.logs.shift();
  if (type.includes('ERROR') || type.includes('ERR')) {
    debugStore.lastError = log;
  }
  (window as any).__DEBUG_PUSH = debugStore;
};

function App(props: { children: React.ReactNode }) {
  const setSettings = useAppStore((s) => s.setSettings);
  const settings = useAppStore((s) => s.settings);
  const currentUser = useAppStore((s) => s.currentUser);
  const installPromptRef = useRef<any>(null);
  const isInstalledRef = useRef(false);
  const promptingRef = useRef(false);
  const installedOnceRef = useRef(false);
  const fcmTokenRef = useRef<string | null>(null);

  // ========================================
  // Função para salvar token no Firestore
  // ========================================
  const saveTokenToFirestore = async (token: string, userId: string) => {
    try {
      addDebugLog('FIRESTORE DEBUG', `Salvando token FCM para usuário ${userId}...`, { token: token.substring(0, 20) + '...' });
      await updateUserFcmToken(userId, token);
      addDebugLog('FIRESTORE DEBUG', 'Token FCM SALVO com sucesso!');
    } catch (err) {
      addDebugLog('FIRESTORE ERROR', 'Erro ao salvar token FCM', err);
    }
  };

  // ========================================
  // 1. Inicializar FCM Capacitor (sem depender de currentUser)
  // ========================================
  useEffect(() => {
    let tokenListener: any = null;
    let errorListener: any = null;
    let notificationListener: any = null;
    let actionListener: any = null;

    const setupFCM = async () => {
      try {
        const isNative = Capacitor.isNativePlatform();
        addDebugLog('FCM DEBUG', `Ambiente nativo: ${isNative}`);
        
        if (!isNative) {
          addDebugLog('FCM INFO', 'App rodando em Web, FCM Nativo não disponível');
          return;
        }

        // 1. Adicionar listeners primeiro para não perder eventos
        addDebugLog('FCM DEBUG', 'Adicionando listeners...');
        
        // Listener para token de registro
        tokenListener = await PushNotifications.addListener('registration', async (tokenResponse) => {
          try {
            const token = tokenResponse.value;
            addDebugLog('FCM DEBUG', 'Token FCM recebido!', { token: token.substring(0, 20) + '...' });
            fcmTokenRef.current = token;
            
            // Salvar token no store para o dashboard
            (window as any).__DEBUG_PUSH.fcmToken = token;
            
            // Se o usuário já estiver logado, salva imediatamente
            if (currentUser?.id) {
              addDebugLog('FCM DEBUG', 'Usuário já está logado, salvando token...');
              await saveTokenToFirestore(token, currentUser.id);
            } else {
              addDebugLog('FCM DEBUG', 'Usuário não está logado, armazenando token para depois...');
            }
          } catch (err) {
            addDebugLog('FCM ERROR', 'Erro ao processar token FCM', err);
          }
        });

        // Listener para erro de registro
        errorListener = await PushNotifications.addListener('registrationError', (error) => {
          addDebugLog('FCM ERROR', 'Erro no registro FCM', error);
        });

        // Listener para notificações recebidas em foreground
        notificationListener = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
          addDebugLog('FCM DEBUG', 'NOTIFICAÇÃO RECEBIDA (FOREGROUND)!', notification);
          (window as any).__DEBUG_PUSH.lastReceived = notification;
        });

        // Listener para notificações clicadas/abertas
        actionListener = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          addDebugLog('FCM DEBUG', 'NOTIFICAÇÃO CLICADA/ABERTA!', action);
          (window as any).__DEBUG_PUSH.lastReceived = action;
        });

        // 2. Solicitar permissão
        addDebugLog('FCM DEBUG', 'Solicitando permissão de notificações...');
        const permStatus = await PushNotifications.requestPermissions();
        
        if (permStatus.receive !== 'granted') {
          addDebugLog('FCM ERROR', 'Permissão de notificações negada!');
          return;
        }
        
        addDebugLog('FCM DEBUG', 'Permissão de notificações CONCEDIDA!');

        // 3. Registrar push notifications
        addDebugLog('FCM DEBUG', 'Registrando FCM...');
        await PushNotifications.register();
        addDebugLog('FCM DEBUG', 'Registro FCM concluído!');
        
        addDebugLog('FCM DEBUG', 'Sistema FCM inicializado com sucesso!');
      } catch (err) {
        addDebugLog('FCM ERROR', 'Erro ao configurar FCM', err);
      }
    };

    setupFCM();

    // Cleanup listeners ao desmontar
    return () => {
      try {
        if (tokenListener) tokenListener.remove();
        if (errorListener) errorListener.remove();
        if (notificationListener) notificationListener.remove();
        if (actionListener) actionListener.remove();
      } catch (err) {
        addDebugLog('FCM ERROR', 'Erro ao limpar listeners', err);
      }
    };
  }, []);

  // ========================================
  // 2. Quando o usuário logar, salva o token armazenado (se houver)
  // ========================================
  useEffect(() => {
    if (!currentUser?.id) {
      addDebugLog('FCM DEBUG', 'Nenhum usuário logado');
      return;
    }

    addDebugLog('FCM DEBUG', 'Usuário logado!', { userId: currentUser.id, email: currentUser.email });

    // Se temos um token armazenado, salva agora
    if (fcmTokenRef.current) {
      addDebugLog('FCM DEBUG', 'Token FCM armazenado encontrado, salvando...');
      saveTokenToFirestore(fcmTokenRef.current, currentUser.id);
    }
  }, [currentUser?.id]);

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
    try {
      installedOnceRef.current = Boolean(window.localStorage.getItem('gm.pwa.installedOnce'));
    } catch {}
    if (installedOnceRef.current && !isInstalledRef.current) {
      try {
        window.localStorage.removeItem('gm.pwa.promptDontAskUntil');
      } catch {}
    }

    const onBeforeInstallPrompt = (e: any) => {
      const ua = String(window.navigator.userAgent || '');
      const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
      if (!isMobile) return;
      if (isInstalledRef.current) return;
      try {
        const dontAskUntil = Number(window.localStorage.getItem('gm.pwa.promptDontAskUntil') || 0);
        if (dontAskUntil && Date.now() < dontAskUntil) return;
      } catch {}
      try {
        e.preventDefault();
      } catch {}
      installPromptRef.current = e;
    };
    const onAppInstalled = () => {
      isInstalledRef.current = true;
      installPromptRef.current = null;
      installedOnceRef.current = true;
      try {
        window.localStorage.setItem('gm.pwa.installedOnce', '1');
        window.localStorage.removeItem('gm.pwa.promptDontAskUntil');
      } catch {}
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt as any);
    window.addEventListener('appinstalled', onAppInstalled as any);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt as any);
      window.removeEventListener('appinstalled', onAppInstalled as any);
    };
  }, []);

  useEffect(() => {
    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    if (!isBrowser) return;
    if (process.env.TARO_ENV !== 'h5') return;

    let cancelled = false;
    const run = async () => {
      const ok = await isAdminUser(currentUser || null);
      if (cancelled) return;

      const applyVisibility = (): boolean => {
        const root =
          (document.querySelector('.taro-tabbar__tabbar') as HTMLElement | null) ||
          (document.querySelector('.taro-tabbar__container') as HTMLElement | null) ||
          (document.querySelector('.taro-tabbar') as HTMLElement | null);
        if (!root) return false;

        const items = Array.from(
          root.querySelectorAll('a, .taro-tabbar__item, .taro-tabbar__tabbar-item, .weui-tabbar__item'),
        ) as HTMLElement[];
        if (!items.length) return false;

        items.forEach((el) => {
          const text = String(el.textContent || '').trim().toLowerCase();
          const href = String((el as any).href || '');
          const isAdminItem = text === 'admin' || href.includes('/pages/admin/index') || href.includes('pages/admin/index');
          if (isAdminItem) el.style.display = ok ? '' : 'none';
        });
        return true;
      };

      if (applyVisibility()) return;
      for (let i = 0; i < 15; i += 1) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, 200));
        if (applyVisibility()) return;
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.email, currentUser?.id]);

  // Equivalente ao onShow
  useDidShow(() => {
    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    if (!isBrowser) return;
    if (isInstalledRef.current) return;
    if (promptingRef.current) return;

    const ua = String(window.navigator.userAgent || '');
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
    if (!isMobile) return;

    try {
      const dontAskUntil = Number(window.localStorage.getItem('gm.pwa.promptDontAskUntil') || 0);
      if (dontAskUntil && Date.now() < dontAskUntil) return;
    } catch {}

    promptingRef.current = true;
    (async () => {
      try {
        const isIos = /iPhone|iPad|iPod/i.test(ua);
        const isIosSafari = isIos && /Safari/i.test(ua) && !/CriOS|FxiOS/i.test(ua);
        const canNativePrompt = Boolean(installPromptRef.current && typeof installPromptRef.current.prompt === 'function');
        if (!canNativePrompt && !isIosSafari) return;

        const { confirm } = await Taro.showModal({
          title: 'Instalar aplicativo',
          content: isIosSafari
            ? 'Para instalar: toque em Compartilhar e depois em "Adicionar à Tela de Início".'
            : 'Deseja instalar o app no seu celular para acesso rápido?',
          confirmText: 'Instalar',
          cancelText: 'Agora não',
        });

        if (!confirm) {
          try {
            const oneWeek = 7 * 24 * 60 * 60 * 1000;
            window.localStorage.setItem('gm.pwa.promptDontAskUntil', String(Date.now() + oneWeek));
          } catch {}
          return;
        }

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
