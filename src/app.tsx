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

// Armazena estado de debug em memória (sem usar window diretamente)
let inMemoryDebugStore = {
  lastSent: null,
  lastReceived: null,
  lastError: null,
  logs: [],
  globalErrors: [],
  fcmToken: null,
};

// Initialize __DEBUG_PUSH on window only if window exists
if (typeof window !== 'undefined') {
  (window as any).__DEBUG_PUSH = inMemoryDebugStore;
}

const addDebugLog = (type: string, message: string, data?: any) => {
  try {
    // 1. Log no console (seguro)
    console.log(`\n=== [${type}] ===`);
    console.log(message, data || '');
    console.log('==================\n');

    // 2. Preparar log para armazenamento
    let safeData: any = null;
    try {
      safeData = data ? JSON.parse(JSON.stringify(data)) : null;
    } catch (e) {
      safeData = String(data || 'dado não serializável');
    }

    const log = { type, message, timestamp: Date.now(), data: safeData };

    // 3. Armazenar no inMemoryDebugStore and window (if available)
    try {
      inMemoryDebugStore.logs = [...(inMemoryDebugStore.logs || []), log];
      if (inMemoryDebugStore.logs.length > 100) inMemoryDebugStore.logs.shift();
      if (type.includes('ERROR') || type.includes('ERR')) {
        inMemoryDebugStore.lastError = log;
      }
      if (typeof window !== 'undefined') {
        (window as any).__DEBUG_PUSH = inMemoryDebugStore;
      }
    } catch (e) {
      console.log('Erro ao armazenar log:', e);
    }
  } catch (e) {
    // Se tudo falhar, só loga o erro no console
    console.log('ERRO CRÍTICO no addDebugLog:', e);
  }
};

// ========================================
// CAPTURAR ERROS GLOBAIS JS (SUPER SEGURO)
// ========================================
const setupGlobalErrorHandlers = () => {
  try {
    if (typeof window === 'undefined') {
      return;
    }

    addDebugLog('GLOBAL DEBUG', 'Configurando handlers de erro globais');
    
    window.onerror = (message, source, lineno, colno, error) => {
      try {
        // Ignorar erros com isTrusted: false (eventos comuns não perigosos)
        const msgStr = String(message || '');
        if (msgStr.includes('isTrusted: false')) {
          return false;
        }

        let errorInfo = 'sem detalhes';
        try {
          errorInfo = JSON.stringify({
            message: message,
            source: source,
            lineno: lineno,
            colno: colno,
            errorStack: error && error.stack ? error.stack : (error && error.message ? error.message : String(error)),
          });
        } catch (e) {
          errorInfo = 'erro ao serializar';
        }
        
        addDebugLog('GLOBAL ERROR', 'window.onerror capturado', errorInfo);
        
        try {
          inMemoryDebugStore.globalErrors = inMemoryDebugStore.globalErrors || [];
          inMemoryDebugStore.globalErrors.push({
            type: 'window.onerror',
            message: String(message || ''),
            source: String(source || ''),
            lineno: lineno,
            colno: colno,
            errorInfo: errorInfo,
          });
          if (typeof window !== 'undefined') {
            (window as any).__DEBUG_PUSH = inMemoryDebugStore;
          }
        } catch (e) {}
      } catch (e) {}
      return false;
    };

    window.onunhandledrejection = (event) => {
      try {
        let reasonInfo = 'sem reason';
        try {
          const reason = event.reason;
          reasonInfo = JSON.stringify({
            reasonStack: reason && reason.stack ? reason.stack : (reason && reason.message ? reason.message : String(reason || '')),
          });
        } catch (e) {
          reasonInfo = 'erro ao serializar reason';
        }
        
        addDebugLog('GLOBAL ERROR', 'window.onunhandledrejection capturado', reasonInfo);
        
        try {
          inMemoryDebugStore.globalErrors = inMemoryDebugStore.globalErrors || [];
          inMemoryDebugStore.globalErrors.push({
            type: 'unhandledrejection',
            reasonInfo: reasonInfo,
          });
          if (typeof window !== 'undefined') {
            (window as any).__DEBUG_PUSH = inMemoryDebugStore;
          }
        } catch (e) {}
      } catch (e) {}
    };
    
    addDebugLog('GLOBAL DEBUG', 'Handlers de erro configurados');
  } catch (e) {
    // Não fazer nada, o app não pode quebrar por causa de handlers de erro
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
  // 0. Configurar handlers de erro globais
  // ========================================
  useEffect(() => {
    setupGlobalErrorHandlers();
  }, []);

  // ========================================
  // 1. Inicializar FCM Capacitor (LOGS DETALHADOS)
  // ========================================
  useEffect(() => {
    let tokenListener: any = null;
    let errorListener: any = null;
    let notificationListener: any = null;
    let actionListener: any = null;
    let isSetup = false;
    let isRegistered = false;

    const setupFCM = async () => {
      addDebugLog('FCM', '=== setupFCM INICIANDO ===');
      
      if (isSetup) {
        addDebugLog('FCM', 'setupFCM já executado, saindo');
        return;
      }
      isSetup = true;
      
      try {
        const isNative = Capacitor.isNativePlatform();
        addDebugLog('FCM', 'isNativePlatform:', isNative);
        
        if (!isNative) {
          addDebugLog('FCM', 'Não é nativo, saindo');
          return;
        }

        // 1. Adicionar listeners PRIMEIRO
        addDebugLog('FCM', 'Adicionando listeners...');
        
        tokenListener = PushNotifications.addListener('registration', async (tokenResponse: any) => {
          addDebugLog('FCM LISTENER', '=== registration TRIGGERED ===');
          try {
            addDebugLog('FCM LISTENER', 'tokenResponse:', tokenResponse);
            
            if (!tokenResponse) {
              addDebugLog('FCM LISTENER', 'tokenResponse é null/undefined');
              return;
            }
            
            const token = tokenResponse.value;
            addDebugLog('FCM LISTENER', 'token extraído:', token ? token.substring(0, 20) + '...' : 'null');
            
            if (!token) {
              addDebugLog('FCM LISTENER', 'token é null/undefined');
              return;
            }
            
            fcmTokenRef.current = token;
            
            try {
              inMemoryDebugStore.fcmToken = token;
              if (typeof window !== 'undefined') {
                (window as any).__DEBUG_PUSH = inMemoryDebugStore;
              }
            } catch (e) {
              addDebugLog('FCM LISTENER', 'Erro ao salvar token no debug store:', e);
            }
            
            // Salvar token no Firestore se usuário já estiver logado
            if (currentUser?.id) {
              addDebugLog('FCM LISTENER', 'Usuário logado, salvando token no Firestore...');
              try {
                await saveTokenToFirestore(token, currentUser.id);
                addDebugLog('FCM LISTENER', 'Token salvo no Firestore com sucesso!');
              } catch (e) {
                addDebugLog('FCM LISTENER', 'Erro ao salvar token no Firestore:', e);
              }
            } else {
              addDebugLog('FCM LISTENER', 'Usuário não logado, token armazenado para depois');
            }
            
            addDebugLog('FCM LISTENER', '=== registration CONCLUÍDO ===');
          } catch (listenerErr) {
            addDebugLog('FCM LISTENER ERRO', 'Erro CRÍTICO no listener registration:', listenerErr);
          }
        });

        errorListener = PushNotifications.addListener('registrationError', (error: any) => {
          addDebugLog('FCM LISTENER', 'registrationError:', error);
        });

        notificationListener = PushNotifications.addListener('pushNotificationReceived', (notif: any) => {
          addDebugLog('FCM LISTENER', '=== pushNotificationReceived (APP ABERTO) ===');
          addDebugLog('FCM LISTENER', 'Notificação recebida:', notif);
        });

        actionListener = PushNotifications.addListener('pushNotificationActionPerformed', (action: any) => {
          addDebugLog('FCM LISTENER', '=== pushNotificationActionPerformed (NOTIFICAÇÃO CLICADA) ===');
          addDebugLog('FCM LISTENER', 'Ação recebida:', action);
        });

        addDebugLog('FCM', 'Listeners adicionados com sucesso');

        // 2. Solicitar permissão
        addDebugLog('FCM', 'Chamando PushNotifications.requestPermissions()...');
        let permStatus: any = null;
        
        try {
          permStatus = await PushNotifications.requestPermissions();
          addDebugLog('FCM', 'requestPermissions() retornou:', permStatus);
        } catch (permErr) {
          addDebugLog('FCM ERRO', 'Erro no requestPermissions():', permErr);
          return;
        }

        if (!permStatus || permStatus.receive !== 'granted') {
          addDebugLog('FCM', 'Permissão negada ou inválida, saindo');
          return;
        }

        addDebugLog('FCM', 'Permissão concedida! Aguardando 1 segundo...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 3. Criar canal de notificação explícitamente
        addDebugLog('FCM', 'Criando canal de notificação Android...');
        try {
          await PushNotifications.createChannel({
            id: 'gabi_manicure_channel_high_importance',
            name: 'Notificações Gabi Manicure',
            description: 'Notificações importantes do app Gabi Manicure',
            importance: 5, // IMPORTANCE_HIGH para heads-up notification
            sound: 'default',
            vibration: true,
            visibility: 1, // VISIBILITY_PUBLIC
            lights: true
          });
          addDebugLog('FCM', 'Canal de notificação criado com sucesso!');
        } catch (channelErr) {
          addDebugLog('FCM ERRO', 'Erro ao criar canal:', channelErr);
        }

        // 4. Registrar apenas uma vez
        if (!isRegistered) {
          addDebugLog('FCM', 'Chamando PushNotifications.register()...');
          try {
            await PushNotifications.register();
            isRegistered = true;
            addDebugLog('FCM', 'register() concluído com sucesso!');
          } catch (registerErr) {
            addDebugLog('FCM ERRO', 'Erro no register():', registerErr);
          }
        } else {
          addDebugLog('FCM', 'register() já foi chamado anteriormente');
        }

        addDebugLog('FCM', '=== setupFCM CONCLUÍDO ===');
      } catch (topLevelErr) {
        addDebugLog('FCM ERRO', 'Erro TOP LEVEL no setupFCM:', topLevelErr);
      }
    };

    setupFCM();

    // Cleanup listeners ao desmontar
    return () => {
      addDebugLog('FCM', 'Cleanup listeners');
      try {
        if (tokenListener) tokenListener.remove();
        if (errorListener) errorListener.remove();
        if (notificationListener) notificationListener.remove();
        if (actionListener) actionListener.remove();
      } catch (e) {
        addDebugLog('FCM ERRO', 'Erro no cleanup:', e);
      }
    };
  }, [currentUser?.id]);

  // ========================================
  // 2. Quando o usuário logar, salva o token armazenado (se houver)
  // ========================================
  useEffect(() => {
    if (!currentUser?.id || !fcmTokenRef.current) {
      return;
    }

    try {
      saveTokenToFirestore(fcmTokenRef.current, currentUser.id);
    } catch {}
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
