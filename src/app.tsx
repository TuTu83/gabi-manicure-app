import React, { useEffect, useRef } from 'react';
import { View } from '@tarojs/components';
import Taro, { useDidShow, useDidHide } from '@tarojs/taro';
import classnames from 'classnames';
import { useAppStore } from '@/store/appStore';
import { isAdminUser, updateUserFcmToken } from '@/services/adminService';
import { requestNotificationPermission, showSystemNotification, subscribeAdminNotifications, subscribeNotificationsForUser } from '@/services/notificationService';
import { subscribeAppSettings } from '@/services/settingsService';
// Estilos globais
import './app.scss';

const ONESIGNAL_APP_ID = '82892143-d160-4756-8b63-327b8f69a41e';

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
  debugStore.logs.push(log);
  if (debugStore.logs.length > 100) debugStore.logs.shift();
  if (type.includes('ERROR') || type.includes('ERR')) {
    debugStore.lastError = log;
  }
};

function App(props: { children: React.ReactNode }) {
  const setSettings = useAppStore((s) => s.setSettings);
  const settings = useAppStore((s) => s.settings);
  const currentUser = useAppStore((s) => s.currentUser);
  const installPromptRef = useRef<any>(null);
  const isInstalledRef = useRef(false);
  const promptingRef = useRef(false);
  const installedOnceRef = useRef(false);

  useEffect(() => {
    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    if (!isBrowser) return;
    if (process.env.TARO_ENV !== 'h5') return;
    
    // ========================================
    // ETAPA 1: DEBUG DE AMBIENTE E SW
    // ========================================
    addDebugLog('APP DEBUG', 'Iniciando sistema de debug completo');
    addDebugLog('ENV DEBUG', `Ambiente: ${process.env.NODE_ENV}`);
    addDebugLog('ENV DEBUG', `Taro Env: ${process.env.TARO_ENV}`);
    addDebugLog('SW DEBUG', `navigator.serviceWorker disponível: ${'serviceWorker' in navigator}`);
    
    // Verifica Service Workers ativos
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        addDebugLog('SW DEBUG', `Service Workers ativos encontrados: ${regs.length}`);
        regs.forEach((reg, index) => {
          addDebugLog('SW DEBUG', `SW ${index}: ${reg.scope}`, {
            active: !!reg.active,
            waiting: !!reg.waiting,
            installing: !!reg.installing,
          });
        });
      }).catch(err => {
        addDebugLog('SW ERROR', `Erro ao buscar SW ativos: ${err.message}`, err);
      });
    }

    // Registra o Service Worker do OneSignal
    addDebugLog('SW DEBUG', 'Registrando OneSignal Service Worker...');
    navigator.serviceWorker.register('/OneSignalSDKWorker.js')
      .then((reg) => {
        addDebugLog('SW DEBUG', 'OneSignal Service Worker REGISTRADO com sucesso!', {
          scope: reg.scope,
          active: !!reg.active,
        });
      })
      .catch((err) => {
        addDebugLog('SW ERROR', 'Falha ao registrar SW do OneSignal', err);
      });
  }, []);

  useEffect(() => {
    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    if (!isBrowser) return;
    if (process.env.TARO_ENV !== 'h5') return;
    if (!currentUser) return;

    let cancelled = false;

    const initOneSignal = async () => {
      // ========================================
      // ETAPA 2: DEBUG DE PERMISSÃO
      // ========================================
      addDebugLog('ONESIGNAL DEBUG', 'Inicializando sistema OneSignal');
      addDebugLog('PERMISSÃO DEBUG', `Notification.permission: ${Notification?.permission}`);
      
      // Verifica Push Manager
      addDebugLog('PUSH DEBUG', `PushManager disponível: ${'PushManager' in window}`);
      
      if ('PushManager' in window && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.pushManager.getSubscription().then((sub) => {
            addDebugLog('PUSH DEBUG', `PushSubscription disponível: ${!!sub}`, sub ? {
              endpoint: !!sub.endpoint,
              keys: !!sub.toJSON().keys,
            } : null);
          });
        });
      }

      try {
        addDebugLog('ONESIGNAL DEBUG', 'Carregando script OneSignal...');
        const script = document.createElement('script');
        script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
        script.defer = true;
        script.async = true;
        document.head.appendChild(script);

        script.onload = async () => {
          if (cancelled) return;
          
          addDebugLog('ONESIGNAL DEBUG', 'Script carregado, inicializando...');
          const OneSignal = (window as any).OneSignal || [];
          
          OneSignal.push(function() {
            // ========================================
            // ETAPA 3: INICIALIZAÇÃO ONE SIGNAL
            // ========================================
            addDebugLog('ONESIGNAL DEBUG', `Chamando OneSignal.init com AppID: ${ONESIGNAL_APP_ID}`);
            
            OneSignal.init({
              appId: ONESIGNAL_APP_ID,
              serviceWorkerParam: {
                scope: '/'
              },
              serviceWorkerPath: 'OneSignalSDKWorker.js',
              notifyButton: {
                enable: false
              },
              allowLocalhostAsSecureOrigin: true,
            });

            // ========================================
            // ETAPA 4: LISTENERS ONE SIGNAL
            // ========================================
            OneSignal.on('subscriptionChange', async (isSubscribed: boolean) => {
              addDebugLog('ONESIGNAL DEBUG', `subscriptionChange: isSubscribed=${isSubscribed}`);
              
              if (isSubscribed && !cancelled) {
                try {
                  const playerId = await OneSignal.getUserId();
                  addDebugLog('ONESIGNAL DEBUG', `Player ID obtido: ${playerId}`);
                  
                  const subscriptionId = OneSignal.User.PushSubscription.id;
                  const token = OneSignal.User.PushSubscription.token;
                  const onesignalId = OneSignal.User.onesignalId;
                  
                  addDebugLog('ONESIGNAL DEBUG', 'Dados completos da inscrição', {
                    playerId,
                    subscriptionId,
                    token: !!token,
                    onesignalId,
                  });
                  
                  if (playerId) {
                    addDebugLog('FIRESTORE DEBUG', `Salvando playerId no Firestore para usuário ${currentUser.id}...`);
                    await updateUserFcmToken(currentUser.id, playerId);
                    addDebugLog('FIRESTORE DEBUG', 'Player ID SALVO com sucesso!');
                  }
                } catch (error) {
                  addDebugLog('FIRESTORE ERROR', 'Erro ao salvar player ID', error);
                }
              }
            });

            OneSignal.on('notificationDisplay', (event: any) => {
              addDebugLog('PUSH DEBUG', 'NOTIFICAÇÃO RECEBIDA EM FOREGROUND!', event);
              (window as any).__DEBUG_PUSH.lastReceived = event;
            });

            OneSignal.on('notificationOpened', (event: any) => {
              addDebugLog('PUSH DEBUG', 'NOTIFICAÇÃO CLICADA!', event);
              if (event?.url) {
                window.location.href = event.url;
              }
            });

            addDebugLog('ONESIGNAL DEBUG', 'Todos listeners configurados!');
          });
        };

        script.onerror = (error) => {
          addDebugLog('ONESIGNAL ERROR', 'Falha ao carregar script do OneSignal', error);
        };
      } catch (error) {
        addDebugLog('ONESIGNAL ERROR', 'Falha na inicialização geral', error);
      }
    };

    initOneSignal();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  // ========================================
  // ETAPA 5: DIAGNÓSTICO ANDROID/PWA
  // ========================================
  useEffect(() => {
    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    if (!isBrowser) return;

    const diagnose = () => {
      const ua = String(window.navigator.userAgent || '');
      const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (window.navigator as any).standalone === true;
      const isAndroid = /Android/i.test(ua);
      const isChrome = /Chrome|CriOS/i.test(ua);
      
      addDebugLog('PWA DIAGNÓSTICO', 'Diagnóstico completo:', {
        standalone,
        isAndroid,
        isChrome,
        notificationPermission: Notification?.permission,
        serviceWorkerSupported: 'serviceWorker' in navigator,
        pushManagerSupported: 'PushManager' in window,
        visibilityState: document.visibilityState,
        userAgent: ua.slice(0, 100),
      });
    };

    diagnose();
    document.addEventListener('visibilitychange', () => {
      addDebugLog('PWA DIAGNÓSTICO', `visibilitychange: ${document.visibilityState}`);
    });
  }, []);

  useEffect(() => {
    return subscribeAppSettings((next) => setSettings(next));
  }, [setSettings]);

  useEffect(() => {
    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    if (!isBrowser) return;
    if (process.env.TARO_ENV !== 'h5') return;
    if (!currentUser) return;

    let unsub: (() => void) | null = null;
    let initialized = false;
    const run = async () => {
      const isAdmin = await isAdminUser(currentUser || null);
      if (!isAdmin) return;
      const path = String(window.location.pathname || '');
      if (path.includes('/pages/admin/index')) return;
      if (settings.notificationsEnabled && window.Notification && window.Notification.permission === 'default') {
        await requestNotificationPermission();
      }

      const previousIds = new Set<string>();
      unsub = subscribeAdminNotifications((items) => {
        if (!settings.notificationsEnabled) return;
        const newItems = items.filter((n) => !previousIds.has(n.id));
        if (initialized && newItems.length) {
          const latest = newItems[0];
          addDebugLog('NOTIFICAÇÃO LOCAL', 'Exibindo notificação local (fallback)', latest);
          showSystemNotification(latest.title, latest.body, {
            notificationId: latest.id,
            url: '/pages/admin/index',
          });
        }
        previousIds.clear();
        items.forEach((n) => previousIds.add(n.id));
        initialized = true;
      });
    };

    run().catch(() => undefined);
    return () => {
      if (unsub) unsub();
    };
  }, [currentUser, settings.notificationsEnabled]);

  useEffect(() => {
    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    if (!isBrowser) return;
    if (process.env.TARO_ENV !== 'h5') return;
    if (!currentUser) return;

    let unsub: (() => void) | null = null;
    let initialized = false;
    const run = async () => {
      const isAdmin = await isAdminUser(currentUser || null);
      if (isAdmin) return;
      if (settings.notificationsEnabled && window.Notification && window.Notification.permission === 'default') {
        await requestNotificationPermission();
      }

      const previousIds = new Set<string>();
      unsub = subscribeNotificationsForUser(currentUser.id, (items) => {
        if (!settings.notificationsEnabled) return;
        const newItems = items.filter((n) => !previousIds.has(n.id));
        if (initialized && newItems.length) {
          const latest = newItems[0];
          addDebugLog('NOTIFICAÇÃO LOCAL', 'Exibindo notificação local (fallback)', latest);
          showSystemNotification(latest.title, latest.body, {
            notificationId: latest.id,
            url: '/pages/booking/index',
            appointmentId: latest.appointmentId,
          });
        }
        previousIds.clear();
        items.forEach((n) => previousIds.add(n.id));
        initialized = true;
      });
    };

    run().catch(() => undefined);
    return () => {
      if (unsub) unsub();
    };
  }, [currentUser, settings.notificationsEnabled]);

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
      addDebugLog('PWA DEBUG', 'Aplicativo instalado como PWA!');
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
