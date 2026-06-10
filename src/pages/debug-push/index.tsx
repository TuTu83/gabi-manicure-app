import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, Button, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { initializePushNotifications, getCurrentFcmToken, checkPushPermissions } from '../../services/pushService';
import { getFirebaseMessaging, getFcmToken, onFcmMessage, firebaseConfig as exportedFirebaseConfig, getDiagnosticFirebaseConfig, getFirebaseAuth } from '../../services/firebase';
import { sendFcmNotification, testPing } from '../../services/appointmentService';
import { testFetchMinimum } from '../../test-fetch.js';
import { getAdminFcmTokens, getAllClientFcmTokens, ADMIN_EMAIL } from '../../services/adminService';
import { collection, getDocs, getDoc, doc, setDoc } from 'firebase/firestore';
import { getFirebaseDb } from '../../services/firebase';
import { useAppStore } from '../../store/appStore';

type LogType = 'ERROR' | 'WARN' | 'INFO' | 'SUCCESS';

interface LogItem {
  type: string;
  message: string;
  data?: any;
  timestamp: number;
}

interface CapacitorDiagnostics {
  isNative: boolean;
  platform: string;
  windowCapacitor: any;
  plugins: any;
}

interface PushDiagnostics {
  checkPermissionsResult: any;
  requestPermissionsResult: any;
  registrationStatus: 'unknown' | 'registered' | 'not_registered' | 'error';
  fcmToken: string | null;
  lastTokenUpdate: number | null;
  messagingAvailable: boolean;
  messagingObjectCreated: boolean;
  serviceWorkerRegistered: boolean;
  serviceWorkerScope: string | null;
  serviceWorkerError: string | null;
  messagingError: any;
  serviceWorkerAPIAvailable: boolean;
}

const DashboardPage: React.FC = () => {
  const [debugData, setDebugData] = useState<{
    logs: LogItem[];
    lastSent: any;
    lastReceived: any;
    lastError: any;
    lastApiCall: any;
  }>({
    logs: [],
    lastSent: null,
    lastReceived: null,
    lastError: null,
    lastApiCall: null,
  });
  const [capacitorDiagnostics, setCapacitorDiagnostics] = useState<CapacitorDiagnostics>({
    isNative: false,
    platform: '',
    windowCapacitor: null,
    plugins: null,
  });
  const [pushDiagnostics, setPushDiagnostics] = useState<PushDiagnostics>({
    checkPermissionsResult: null,
    requestPermissionsResult: null,
    registrationStatus: 'unknown',
    fcmToken: null,
    lastTokenUpdate: null,
    messagingAvailable: false,
    messagingObjectCreated: false,
    serviceWorkerRegistered: false,
    serviceWorkerScope: null,
    serviceWorkerError: null,
    messagingError: null,
    serviceWorkerAPIAvailable: false,
  });
  const [browserDiagnostics, setBrowserDiagnostics] = useState<any>({});
  const [filterType, setFilterType] = useState<LogType | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [diagnosticFirebaseConfig, setDiagnosticFirebaseConfig] = useState<any>(null);
  const [exportedFirebaseConfigMasked, setExportedFirebaseConfigMasked] = useState<any>(null);
  const [tokenDiagnostics, setTokenDiagnostics] = useState<any>(null);

  const runCompleteDiagnostic = async () => {
    await refreshDebugData();
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const controller = navigator.serviceWorker.controller;
      if (!(window as any).__DEBUG_PUSH__) {
        (window as any).__DEBUG_PUSH__ = { logs: [], lastSent: null, lastReceived: null, lastError: null, lastTokenUpdate: null };
      }
      (window as any).__DEBUG_PUSH__.currentSWRegistrations = registrations.map(reg => ({
        scope: reg.scope,
        active: !!reg.active,
        waiting: !!reg.waiting,
        installing: !!reg.installing,
      }));
      (window as any).__DEBUG_PUSH__.currentSWController = controller ? {
        scriptURL: controller.scriptURL,
        state: controller.state,
      } : null;
      await refreshDebugData();
    }
  };

  const refreshDebugData = async () => {
    const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';
    const isNative = Capacitor.isNativePlatform();
    
    const defaultDebugStore: {
      logs: LogItem[];
      lastSent: any;
      lastReceived: any;
      lastError: any;
      lastApiCall: any;
      fcmToken?: string | null;
      lastTokenUpdate?: number | null;
      lastSendFlow?: any;
    } = {
      logs: [],
      lastSent: null,
      lastReceived: null,
      lastError: null,
      lastApiCall: null,
      fcmToken: null,
      lastTokenUpdate: null,
      lastSendFlow: null,
    };
    
    let debugStore = defaultDebugStore;
    if (isBrowser) {
      const rawDebugStore = (window as any).__DEBUG_PUSH__ || {};
      debugStore = {
        logs: Array.isArray(rawDebugStore.logs) ? rawDebugStore.logs : [],
        lastSent: rawDebugStore.lastSent || null,
        lastReceived: rawDebugStore.lastReceived || null,
        lastError: rawDebugStore.lastError || null,
        lastApiCall: rawDebugStore.lastApiCall || null,
        fcmToken: rawDebugStore.fcmToken || rawDebugStore.getFcmToken || null,
        lastTokenUpdate: rawDebugStore.lastTokenUpdate || null,
        lastSendFlow: rawDebugStore.lastSendFlow || null,
      };
    }
    setDebugData(debugStore);

    setDiagnosticFirebaseConfig(getDiagnosticFirebaseConfig());
    
    const maskVal = (v: string) => {
      const val = String(v || '');
      if (!val) return '';
      const suffix = val.length <= 4 ? val : val.slice(-4);
      return `***${suffix} (len=${val.length})`;
    };
    setExportedFirebaseConfigMasked({
      apiKey: maskVal(exportedFirebaseConfig.apiKey),
      authDomain: maskVal(exportedFirebaseConfig.authDomain),
      projectId: maskVal(exportedFirebaseConfig.projectId),
      appId: maskVal(exportedFirebaseConfig.appId),
      storageBucket: maskVal((exportedFirebaseConfig as any).storageBucket || ''),
    });

    setCapacitorDiagnostics({
      isNative,
      platform: Capacitor.getPlatform(),
      windowCapacitor: isBrowser ? (window as any).Capacitor : null,
      plugins: isNative ? (Capacitor as any).Plugins : null,
    });

    if (isBrowser) {
      const ua = String(window.navigator.userAgent || '');
      const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (window.navigator as any).standalone === true;
      setBrowserDiagnostics({
        href: window.location.href,
        userAgent: ua,
        isStandalone: standalone,
        timestamp: new Date().toLocaleString('pt-BR'),
        serviceWorker: 'serviceWorker' in navigator,
        notification: 'Notification' in window,
        notificationPermission: 'Notification' in window ? Notification.permission : 'N/A',
      });
    }

    const messaging = getFirebaseMessaging();
    
    const currentToken = getCurrentFcmToken();
    const checkResult = await checkPushPermissions();
    
    const rawDebugStore = isBrowser ? (window as any).__DEBUG_PUSH__ || {} : {};
    setPushDiagnostics(prev => ({ 
      ...prev, 
      fcmToken: currentToken || rawDebugStore.fcmToken || rawDebugStore.getFcmToken || null,
      lastTokenUpdate: rawDebugStore.lastTokenUpdate ?? null,
      checkPermissionsResult: checkResult,
      messagingAvailable: !!messaging,
      messagingObjectCreated: rawDebugStore.messagingObjectCreated ?? false,
      serviceWorkerRegistered: rawDebugStore.serviceWorkerRegistered ?? false,
      serviceWorkerScope: rawDebugStore.serviceWorkerScope ?? null,
      serviceWorkerError: rawDebugStore.serviceWorkerError ?? null,
      messagingError: rawDebugStore.messagingError ?? null,
      serviceWorkerAPIAvailable: rawDebugStore.serviceWorkerAPIAvailable ?? false,
      notificationAPIAvailable: rawDebugStore.notificationAPIAvailable ?? false,
      notificationPermission: rawDebugStore.notificationPermission ?? null,
      messagingIsSupported: rawDebugStore.messagingIsSupported ?? false,
      existingSWRegistrations: rawDebugStore.existingSWRegistrations ?? null,
      currentSWRegistrations: rawDebugStore.currentSWRegistrations ?? null,
      currentSWController: rawDebugStore.currentSWController ?? null,
      serviceWorkerActive: rawDebugStore.serviceWorkerActive ?? false,
      serviceWorkerWaiting: rawDebugStore.serviceWorkerWaiting ?? false,
      serviceWorkerInstalling: rawDebugStore.serviceWorkerInstalling ?? false,
      getFcmTokenSuccess: rawDebugStore.getFcmTokenSuccess ?? null,
      getFcmTokenError: rawDebugStore.getFcmTokenError ?? null,
      getFcmTokenDuration: rawDebugStore.getFcmTokenDuration ?? null,
      getFcmTokenTimestamp: rawDebugStore.getFcmTokenTimestamp ?? null,
      getFcmTokenErrorFull: rawDebugStore.getFcmTokenErrorFull ?? null,
      firebaseDiagnostic: rawDebugStore.firebaseDiagnostic ?? null,
      firebaseSdkStatus: rawDebugStore.firebaseSdkStatus ?? null,
      registrationStatus: currentToken || rawDebugStore.fcmToken || rawDebugStore.getFcmToken ? 'registered' : 'not_registered',
      getAdminFcmTokens: rawDebugStore.getAdminFcmTokens ?? null
    }));

    setIsLoading(false);
  };

  const requestPushPermissions = async () => {
    try {
      const isNative = Capacitor.isNativePlatform();
      
      await initializePushNotifications();

      if (isNative) {
        const reqResult = await PushNotifications.requestPermissions();
        setPushDiagnostics(prev => ({ ...prev, requestPermissionsResult: reqResult }));
        await PushNotifications.register();
        Taro.showToast({ title: 'Registrando...', icon: 'none' });
      } else {
        if ('Notification' in window) {
          const permission = await Notification.requestPermission();
          setPushDiagnostics(prev => ({ 
            ...prev, 
            requestPermissionsResult: { receive: permission } 
          }));
          
          await initializePushNotifications();
        }
      }

      refreshDebugData();
    } catch (error) {
      console.error('Error requesting permissions:', error);
      Taro.showToast({ title: `Erro: ${(error as Error).message}`, icon: 'none' });
    }
  };

  const copyFcmToken = async () => {
    const token = pushDiagnostics.fcmToken || getCurrentFcmToken();
    if (!token) {
      Taro.showToast({ title: 'Token FCM não encontrado', icon: 'none' });
      return;
    }
    try {
      const isBrowser = typeof navigator !== 'undefined' && 'clipboard' in navigator;
      if (isBrowser) {
        await navigator.clipboard.writeText(token);
        Taro.showToast({ title: 'Token FCM copiado!', icon: 'success' });
      } else {
        Taro.showToast({ title: 'Não foi possível copiar o token', icon: 'none' });
      }
    } catch (error) {
      Taro.showToast({ title: 'Erro ao copiar token', icon: 'none' });
    }
  };

  const getEnvironmentLabel = () => {
    if (capacitorDiagnostics.isNative) {
      return 'APK NATIVO';
    }
    if (browserDiagnostics.isStandalone) {
      return 'PWA';
    }
    return 'NAVEGADOR WEB';
  };

  const getEnvironmentColor = () => {
    if (capacitorDiagnostics.isNative) return '#10b981';
    if (browserDiagnostics.isStandalone) return '#3b82f6';
    return '#f59e0b';
  };

  useEffect(() => {
    refreshDebugData();
    const interval = setInterval(refreshDebugData, 3000);
    return () => clearInterval(interval);
  }, []);

  const filteredLogs = useMemo(() => {
    let logs = [...debugData.logs].reverse();
    if (filterType !== 'ALL') {
      logs = logs.filter(log => {
        const logTypeUpper = log.type.toUpperCase();
        if (filterType === 'ERROR') return logTypeUpper.includes('ERROR');
        if (filterType === 'WARN') return logTypeUpper.includes('WARN') || logTypeUpper.includes('AVISO');
        if (filterType === 'SUCCESS') return logTypeUpper.includes('SUCCESS') || logTypeUpper.includes('SUCESSO');
        return true;
      });
    }
    return logs;
  }, [debugData.logs, filterType]);

  const Badge = ({ label, status, color }: { label: string; status: string | boolean; color?: string }) => {
    const badgeColor = color || (typeof status === 'boolean' ? (status ? '#10b981' : '#ef4444') : '#6b7280');
    return (
      <View style={{ 
        flexDirection: 'column', 
        alignItems: 'center', 
        padding: '12px', 
        backgroundColor: '#fff',
        borderRadius: '12px',
        flex: 1,
        minWidth: '80px'
      }}>
        <View style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          backgroundColor: badgeColor,
          marginBottom: '8px',
          boxShadow: badgeColor !== '#6b7280' ? `0 0 8px ${badgeColor}50` : 'none'
        }} />
        <Text style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>{label}</Text>
        <Text style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}>
          {typeof status === 'boolean' ? (status ? 'SIM' : 'NÃO') : status}
        </Text>
      </View>
    );
  };

  const Card = ({ title, children, icon }: { title: string; children: React.ReactNode; icon?: string }) => (
    <View style={{ 
      backgroundColor: '#fff', 
      padding: '20px', 
      borderRadius: '16px', 
      marginBottom: '20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: '16px' }}>
        {icon && <Text style={{ fontSize: '20px', marginRight: '8px' }}>{icon}</Text>}
        <Text style={{ fontSize: '16px', fontWeight: '700', color: '#111827' }}>{title}</Text>
      </View>
      {children}
    </View>
  );

  const ActionButton = ({ 
    children, 
    onClick, 
    variant = 'default' 
  }: { 
    children: React.ReactNode; 
    onClick: () => void; 
    variant?: 'default' | 'primary' | 'danger' 
  }) => {
    const colors = {
      default: { bg: '#f3f4f6', text: '#374151' },
      primary: { bg: '#4C84C1', text: '#fff' },
      danger: { bg: '#ef4444', text: '#fff' },
    };
    return (
      <Button
        onClick={onClick}
        style={{
          flex: 1,
          backgroundColor: colors[variant].bg,
          color: colors[variant].text,
          border: 'none',
          borderRadius: '10px',
          padding: '12px 16px',
          fontSize: '13px',
          fontWeight: '600',
          textAlign: 'center'
        }}
      >
        {children}
      </Button>
    );
  };

  const JsonPreview = ({ data, label }: { data: any; label: string }) => {
    return (
      <View style={{ gap: '8px' }}>
        <Text style={{ fontSize: '14px', color: '#6b7280' }}>{label}</Text>
        <Text style={{ 
          fontSize: '11px', 
          color: '#374151', 
          fontFamily: 'monospace', 
          wordBreak: 'break-all',
          backgroundColor: '#f3f4f6',
          padding: '12px',
          borderRadius: '8px'
        }} selectable>
          {typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data)}
        </Text>
      </View>
    );
  };

  const clearLogs = () => {
    try {
      const isBrowser = typeof window !== 'undefined';
      if (isBrowser) {
        (window as any).__DEBUG_PUSH__ = { logs: [], lastSent: null, lastReceived: null, lastError: null, lastApiCall: null };
      }
      refreshDebugData();
      Taro.showToast({ title: 'Logs limpos!', icon: 'success' });
    } catch (e) {
      Taro.showToast({ title: 'Erro ao limpar logs', icon: 'none' });
    }
  };

  const testPushAdmin = async () => {
    try {
      Taro.showToast({ title: 'Buscando tokens admin...', icon: 'none' });
      const adminTokens = await getAdminFcmTokens();
      
      if (adminTokens.length === 0) {
        Taro.showToast({ title: 'Nenhum token admin!', icon: 'none' });
        return;
      }

      Taro.showToast({ title: 'Enviando push teste admin...', icon: 'none' });
      const result = await sendFcmNotification({
        title: 'TESTE PUSH ADMIN',
        body: 'Se você recebeu isso, o FCM Android está funcionando!',
        fcmTokens: [adminTokens[0]],
        data: { type: 'teste_admin' }
      });
      console.log('Resultado teste push admin:', result);
      Taro.showToast({ title: 'Envio concluído!', icon: 'success' });
    } catch (error) {
      console.error('Erro teste push admin:', error);
      Taro.showToast({ title: 'Erro no teste!', icon: 'none' });
    }
  };

  const testPushClient = async () => {
    try {
      Taro.showToast({ title: 'Buscando tokens cliente...', icon: 'none' });
      const clientTokens = await getAllClientFcmTokens();
      
      if (clientTokens.length === 0) {
        Taro.showToast({ title: 'Nenhum token cliente!', icon: 'none' });
        return;
      }

      Taro.showToast({ title: 'Enviando push teste cliente...', icon: 'none' });
      const result = await sendFcmNotification({
        title: 'TESTE PUSH CLIENTE',
        body: 'Se você recebeu isso, o FCM Android está funcionando!',
        fcmTokens: [clientTokens[0]],
        data: { type: 'teste_cliente' }
      });
      console.log('Resultado teste push cliente:', result);
      Taro.showToast({ title: 'Envio concluído!', icon: 'success' });
    } catch (error) {
      console.error('Erro teste push cliente:', error);
      Taro.showToast({ title: 'Erro no teste!', icon: 'none' });
    }
  };

  const fetchAllTokensDiagnostic = async () => {
    try {
      Taro.showToast({ title: 'Coletando dados...', icon: 'none' });
      
      const db = getFirebaseDb();
      if (!db) throw new Error('DB não disponível');
      
      const snap = await getDocs(collection(db, 'users'));
      
      const allTokens: Array<{
        userId: string;
        email: string | null;
        role: string | null;
        tokens: string[];
        singularToken: string | null;
        fullDocument: any;
        isAdmin: boolean;
      }> = [];
      
      const duplicateTokensMap = new Map<string, string[]>();
      let adminUser: any = null;
      
      snap.forEach(doc => {
        const data = doc.data() as any;
        const email = (data.email || '').toLowerCase();
        const isAdmin = (data.role === 'admin') || (email === ADMIN_EMAIL.toLowerCase());
        
        if (isAdmin && !adminUser) {
          adminUser = {
            userId: doc.id,
            ...data
          };
        }
        
        const userTokens: string[] = [];
        if (Array.isArray(data.fcmTokens)) {
          data.fcmTokens.forEach((token: string) => {
            if (token && token.trim()) {
              userTokens.push(token.trim());
              if (!duplicateTokensMap.has(token.trim())) {
                duplicateTokensMap.set(token.trim(), []);
              }
              duplicateTokensMap.get(token.trim())!.push(doc.id);
            }
          });
        }
        if (data.fcmToken && data.fcmToken.trim()) {
          userTokens.push(data.fcmToken.trim());
          if (!duplicateTokensMap.has(data.fcmToken.trim())) {
            duplicateTokensMap.set(data.fcmToken.trim(), []);
          }
          duplicateTokensMap.get(data.fcmToken.trim())!.push(doc.id);
        }
        
        allTokens.push({
          userId: doc.id,
          email: data.email || null,
          role: data.role || null,
          tokens: Array.from(new Set(userTokens)),
          singularToken: data.fcmToken || null,
          fullDocument: data,
          isAdmin
        });
      });
      
      const duplicateTokens: Array<{token: string, users: string[]}> = [];
      duplicateTokensMap.forEach((users, token) => {
        if (users.length > 1) {
          duplicateTokens.push({ token, users });
        }
      });
      
      const adminTokens = allTokens.filter(u => u.isAdmin).flatMap(u => u.tokens);
      const clientTokens = allTokens.filter(u => !u.isAdmin).flatMap(u => u.tokens);
      
      const currentUserToken = getCurrentFcmToken();
      const tokenExistsInFirestore = currentUserToken && (
        adminTokens.includes(currentUserToken) ||
        clientTokens.includes(currentUserToken)
      );
      
      setTokenDiagnostics({
        totalUsers: snap.size,
        allTokens,
        duplicateTokens,
        adminTokens,
        clientTokens,
        currentUserToken,
        tokenExistsInFirestore,
        adminUser,
        collectedAt: Date.now()
      });
      
      console.log('=== RELATÓRIO DE TOKENS FCM ===');
      console.log('Total de usuários:', snap.size);
      console.log('Admin User Full Document:', adminUser);
      console.log('Tokens Admin:', adminTokens);
      console.log('Tokens Clientes:', clientTokens);
      console.log('Tokens Duplicados:', duplicateTokens);
      
      Taro.showToast({ title: 'Diagnóstico concluído!', icon: 'success' });
    } catch (error) {
      console.error('Erro no diagnóstico de tokens:', error);
      Taro.showToast({ title: `Erro: ${String(error)}`, icon: 'none' });
    }
  };

  const testCurrentAdminTokenPush = async () => {
    try {
      const currentToken = getCurrentFcmToken();
      if (!currentToken) {
        Taro.showToast({ title: 'Nenhum token FCM disponível', icon: 'none' });
        return;
      }

      Taro.showToast({ title: 'Enviando push para token atual...', icon: 'none' });
      
      console.log('=== TESTE PUSH PARA TOKEN ATUAL ADMIN ===');
      console.log('Token:', currentToken);
      
      const result = await sendFcmNotification({
        title: 'TESTE PUSH ADMIN TOKEN ATUAL',
        body: 'Notificação de teste para o token atual do admin!',
        fcmTokens: [currentToken],
        data: { type: 'admin_test_current_token' }
      });
      
      console.log('Resultado da Cloud Function:', result);
      Taro.showToast({ title: 'Push enviado!', icon: 'success' });
    } catch (error) {
      console.error('Erro no teste do token atual:', error);
      Taro.showToast({ title: `Erro: ${String(error)}`, icon: 'none' });
    }
  };

  const testCloudFunctionConnectivity = async () => {
    try {
      Taro.showToast({ title: 'Iniciando testes...', icon: 'none' });
      console.log('===========================================');
      console.log('1. TESTE DE CONECTIVIDADE BÁSICA');
      console.log('===========================================');
      
      console.log('1.1 Testando fetch para google.com...');
      try {
        const googleTest = await fetch('https://www.google.com', {
          mode: 'no-cors'
        });
        console.log('✅ Fetch para Google OK (modo no-cors)!');
      } catch (googleErr) {
        console.error('❌ Erro no teste Google:', googleErr);
      }

      Taro.showToast({ title: 'Testando API...', icon: 'none' });
      
      const apiUrl = 'https://gabi-manicure-app.vercel.app/api/send-notification';
      
      const payload = {
        test: true,
        title: 'TESTE DE CONECTIVIDADE',
        body: 'Não enviar notificação',
        fcmTokens: ['test-token'],
        data: { test: true }
      };

      console.log('===========================================');
      console.log('2. TESTE DA API DO GABI');
      console.log('===========================================');
      console.log('URL:', apiUrl);
      console.log('Payload:', payload);
      console.log('Capacitor.isNativePlatform:', typeof Capacitor !== 'undefined' ? Capacitor.isNativePlatform() : 'false');
      console.log('navigator.onLine:', navigator.onLine);

      console.log('--- Teste 1: fetch básico ---');
      let response;
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          mode: 'cors',
          credentials: 'omit',
        });
        console.log('✅ Fetch OK! Status:', response.status);
      } catch (fetchErr) {
        console.error('❌ Erro no fetch:', fetchErr);
        console.error('Erro nome:', (fetchErr as any).name);
        console.error('Erro mensagem:', (fetchErr as any).message);
        console.error('Erro stack:', (fetchErr as any).stack);
        throw new Error(`Fetch falhou: ${(fetchErr as any).message}`);
      }

      const rawText = await response.text();
      console.log('Resposta bruta:', rawText);

      let result: any;
      try {
        result = JSON.parse(rawText);
      } catch (parseErr) {
        result = { rawText };
      }

      const success = response.ok;

      if (typeof window !== 'undefined') {
        const debugWindow = window as any;
        if (!debugWindow.__DEBUG_PUSH__) {
          debugWindow.__DEBUG_PUSH__ = { logs: [], lastSent: null, lastReceived: null, lastError: null, lastApiCall: null };
        }
        debugWindow.__DEBUG_PUSH__.lastConnectivityTest = {
          url: apiUrl,
          payload,
          status: response.status,
          statusText: response.statusText,
          response: result,
          success: success,
          timestamp: new Date().toISOString()
        };
      }

      Taro.showToast({ 
        title: success 
          ? `OK (${response.status})` 
          : `ERRO (${response.status})`, 
        icon: success ? 'success' : 'none' 
      });
    } catch (error) {
      console.error('===========================================');
      console.error('3. ERRO GERAL NO TESTE DE CONECTIVIDADE');
      console.error('===========================================');
      console.error('Erro:', error);
      console.error('Mensagem:', (error as any)?.message);
      console.error('Stack:', (error as any)?.stack);

      Taro.showToast({ title: `Erro: ${(error as any)?.message}`, icon: 'none' });
    }
  };

  const runFullConnectivityDiagnostic = async () => {
    try {
      Taro.showToast({ title: 'Iniciando diagnóstico completo...', icon: 'none' });
      console.log('===========================================');
      console.log('DIAGNÓSTICO DE CONECTIVIDADE COMPLETO');
      console.log('===========================================');

      const testResults: any = {};

      // TESTE 1: Google
      console.log('\n===========================================');
      console.log('TESTE 1: https://www.google.com');
      console.log('===========================================');
      try {
        const url = 'https://www.google.com';
        const method = 'GET';
        const headers = { 'Accept': 'text/html,application/xhtml+xml' };
        console.log('URL:', url);
        console.log('MÉTODO:', method);
        console.log('HEADERS:', headers);

        const response = await fetch(url, { method, headers, mode: 'no-cors' });
        const status = response.status;
        console.log('STATUS:', status);
        
        const body = await response.text();
        console.log('BODY (primeiros 200 chars):', body.substring(0, 200));

        testResults.google = { url, method, headers, status, body: body.substring(0, 200), success: true };
      } catch (error) {
        console.error('ERROR MESSAGE:', (error as any)?.message);
        console.error('ERROR NAME:', (error as any)?.name);
        console.error('STACK:', (error as any)?.stack);
        testResults.google = { 
          url: 'https://www.google.com', 
          method: 'GET', 
          headers: { 'Accept': 'text/html,application/xhtml+xml' }, 
          success: false, 
          errorMessage: (error as any)?.message, 
          errorName: (error as any)?.name, 
          stack: (error as any)?.stack 
        };
      }

      // TESTE 2: Vercel homepage
      console.log('\n===========================================');
      console.log('TESTE 2: https://gabi-manicure-app.vercel.app');
      console.log('===========================================');
      try {
        const url = 'https://gabi-manicure-app.vercel.app';
        const method = 'GET';
        const headers = { 'Accept': 'text/html,application/xhtml+xml' };
        console.log('URL:', url);
        console.log('MÉTODO:', method);
        console.log('HEADERS:', headers);

        const response = await fetch(url, { method, headers, mode: 'cors', credentials: 'omit' });
        const status = response.status;
        console.log('STATUS:', status);
        
        const body = await response.text();
        console.log('BODY (primeiros 200 chars):', body.substring(0, 200));

        testResults.vercelHomepage = { url, method, headers, status, body: body.substring(0, 200), success: true };
      } catch (error) {
        console.error('ERROR MESSAGE:', (error as any)?.message);
        console.error('ERROR NAME:', (error as any)?.name);
        console.error('STACK:', (error as any)?.stack);
        testResults.vercelHomepage = { 
          url: 'https://gabi-manicure-app.vercel.app', 
          method: 'GET', 
          headers: { 'Accept': 'text/html,application/xhtml+xml' }, 
          success: false, 
          errorMessage: (error as any)?.message, 
          errorName: (error as any)?.name, 
          stack: (error as any)?.stack 
        };
      }

      // TESTE 3: API Ping
      console.log('\n===========================================');
      console.log('TESTE 3: https://gabi-manicure-app.vercel.app/api/ping');
      console.log('===========================================');
      try {
        const url = 'https://gabi-manicure-app.vercel.app/api/ping';
        const method = 'GET';
        const headers = { 'Accept': 'application/json' };
        console.log('URL:', url);
        console.log('MÉTODO:', method);
        console.log('HEADERS:', headers);

        const response = await fetch(url, { method, headers, mode: 'cors', credentials: 'omit' });
        const status = response.status;
        console.log('STATUS:', status);
        
        const body = await response.text();
        console.log('BODY:', body);

        testResults.vercelPing = { url, method, headers, status, body, success: true };
      } catch (error) {
        console.error('ERROR MESSAGE:', (error as any)?.message);
        console.error('ERROR NAME:', (error as any)?.name);
        console.error('STACK:', (error as any)?.stack);
        testResults.vercelPing = { 
          url: 'https://gabi-manicure-app.vercel.app/api/ping', 
          method: 'GET', 
          headers: { 'Accept': 'application/json' }, 
          success: false, 
          errorMessage: (error as any)?.message, 
          errorName: (error as any)?.name, 
          stack: (error as any)?.stack 
        };
      }

      console.log('\n===========================================');
      console.log('RESULTADOS FINAIS:');
      console.log('===========================================');
      console.log(testResults);

      // Salvar na página de debug
      if (typeof window !== 'undefined') {
        const debugWindow = window as any;
        if (!debugWindow.__DEBUG_PUSH__) {
          debugWindow.__DEBUG_PUSH__ = { logs: [], lastSent: null, lastReceived: null, lastError: null, lastApiCall: null };
        }
        debugWindow.__DEBUG_PUSH__.fullConnectivityDiagnostic = testResults;
      }

      // Determinar cenário
      let scenario = '';
      if (!testResults.google.success) {
        scenario = 'CENÁRIO A (Problema de rede/WebView Android)';
      } else if (!testResults.vercelHomepage.success || !testResults.vercelPing.success) {
        scenario = 'CENÁRIO B (Problema de DNS/SSL/configuração Android para o domínio)';
      } else {
        scenario = 'CENÁRIO C (Problema específico da API send-notification)';
      }

      Taro.showToast({ title: 'Diagnóstico concluído!', icon: 'success' });
      console.log('CENÁRIO IDENTIFICADO:', scenario);

      await refreshDebugData();

    } catch (error) {
      console.error('===========================================');
      console.error('ERRO NO DIAGNÓSTICO DE CONECTIVIDADE');
      console.error('===========================================');
      console.error('Erro:', error);
      console.error('Mensagem:', (error as any)?.message);
      console.error('Stack:', (error as any)?.stack);

      // Salvar erro na página de debug
      if (typeof window !== 'undefined') {
        const debugWindow = window as any;
        if (!debugWindow.__DEBUG_PUSH__) {
          debugWindow.__DEBUG_PUSH__ = { logs: [], lastSent: null, lastReceived: null, lastError: null, lastApiCall: null };
        }
        debugWindow.__DEBUG_PUSH__.fullConnectivityDiagnostic = {
          error: String(error),
          timestamp: new Date().toISOString()
        };
      }

      Taro.showToast({ title: `Erro: ${(error as any)?.message}`, icon: 'none' });
      await refreshDebugData();
    }
  };

  const testApiPing = async () => {
    try {
      Taro.showToast({ title: 'Testando /api/ping...', icon: 'none' });
      
      // Usar a função testPing de appointmentService
      const result = await testPing();
      
      // Salvar na página de debug
      if (typeof window !== 'undefined') {
        const debugWindow = window as any;
        if (!debugWindow.__DEBUG_PUSH__) {
          debugWindow.__DEBUG_PUSH__ = { logs: [], lastSent: null, lastReceived: null, lastError: null, lastApiCall: null };
        }
        debugWindow.__DEBUG_PUSH__.lastPingTest = {
          url: 'https://gabi-manicure-app.vercel.app/api/ping',
          status: result.status,
          statusText: String(result.status),
          response: result.body,
          success: result.status === 200,
          timestamp: new Date().toISOString()
        };
      }

      Taro.showToast({ 
        title: result.status === 200 
          ? `OK (${result.status})` 
          : `ERRO (${result.status})`, 
        icon: result.status === 200 ? 'success' : 'none' 
      });

      await refreshDebugData();

    } catch (error) {
      console.error('===========================================');
      console.error('ERRO NO TESTE /api/ping');
      console.error('===========================================');
      console.error('Erro:', error);
      console.error('Mensagem:', (error as any)?.message);
      console.error('Stack:', (error as any)?.stack);

      // Salvar erro na página de debug
      if (typeof window !== 'undefined') {
        const debugWindow = window as any;
        if (!debugWindow.__DEBUG_PUSH__) {
          debugWindow.__DEBUG_PUSH__ = { logs: [], lastSent: null, lastReceived: null, lastError: null, lastApiCall: null };
        }
        debugWindow.__DEBUG_PUSH__.lastPingTest = {
          url: 'https://gabi-manicure-app.vercel.app/api/ping',
          status: 'error',
          statusText: 'Erro',
          response: null,
          success: false,
          timestamp: new Date().toISOString(),
          error: String(error)
        };
      }

      Taro.showToast({ title: `Erro: ${(error as any)?.message}`, icon: 'none' });
      await refreshDebugData();
    }
  };

  const testSendNotificationDirect = async () => {
    try {
      Taro.showToast({ title: 'Testando send-notification...', icon: 'none' });
      console.log('===========================================');
      console.log('TESTE /api/send-notification DIRETO');
      console.log('===========================================');

      const currentToken = pushDiagnostics.fcmToken;

      if (!currentToken) {
        Taro.showToast({ title: 'Nenhum token FCM disponível!', icon: 'none' });
        return;
      }

      const apiUrl = 'https://gabi-manicure-app.vercel.app/api/send-notification';
      const payload = {
        title: 'TESTE DIRETO',
        body: 'Notificação direta para token atual',
        fcmTokens: [currentToken],
        data: { test: true }
      };

      console.log('URL:', apiUrl);
      console.log('Payload:', payload);

      let response;
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          mode: 'cors',
          credentials: 'omit',
        });
        console.log('✅ Fetch OK! Status:', response.status);
      } catch (fetchErr) {
        console.error('❌ Erro no fetch:', fetchErr);
        console.error('Erro nome:', (fetchErr as any).name);
        console.error('Erro mensagem:', (fetchErr as any).message);
        console.error('Erro stack:', (fetchErr as any).stack);
        throw new Error(`Fetch falhou: ${(fetchErr as any).message}`);
      }

      const rawText = await response.text();
      console.log('Resposta bruta:', rawText);

      let result: any;
      try {
        result = JSON.parse(rawText);
      } catch (parseErr) {
        result = { rawText };
      }

      const success = response.ok;

      if (typeof window !== 'undefined') {
        const debugWindow = window as any;
        if (!debugWindow.__DEBUG_PUSH__) {
          debugWindow.__DEBUG_PUSH__ = { logs: [], lastSent: null, lastReceived: null, lastError: null, lastApiCall: null };
        }
        debugWindow.__DEBUG_PUSH__.lastSendNotificationDirectTest = {
          url: apiUrl,
          payload,
          status: response.status,
          statusText: response.statusText,
          response: result,
          success: success,
          timestamp: new Date().toISOString()
        };
      }

      Taro.showToast({ 
        title: success 
          ? `OK (${response.status})` 
          : `ERRO (${response.status})`, 
        icon: success ? 'success' : 'none' 
      });

      await refreshDebugData();

    } catch (error) {
      console.error('===========================================');
      console.error('ERRO NO TESTE send-notification DIRETO');
      console.error('===========================================');
      console.error('Erro:', error);
      console.error('Mensagem:', (error as any)?.message);
      console.error('Stack:', (error as any)?.stack);

      Taro.showToast({ title: `Erro: ${(error as any)?.message}`, icon: 'none' });
    }
  };


  const collectAllDiagnostics = () => {
    const now = new Date();
    return {
      timestamp: now.toISOString(),
      timestampFormatted: now.toLocaleString('pt-BR'),
      navigator: typeof navigator !== 'undefined' ? {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
      } : null,
      location: typeof window !== 'undefined' ? {
        href: window.location.href,
        hostname: window.location.hostname,
      } : null,
      environmentLabel: getEnvironmentLabel(),
      debugPush: typeof window !== 'undefined' ? (window as any).__DEBUG_PUSH__ : null,
      capacitorDiagnostics,
      pushDiagnostics,
      browserDiagnostics,
      diagnosticFirebaseConfig,
      exportedFirebaseConfigMasked,
    };
  };

  const copyToClipboard = async (text: string) => {
    try {
      const isBrowser = typeof navigator !== 'undefined' && 'clipboard' in navigator;
      if (isBrowser) {
        await navigator.clipboard.writeText(text);
        Taro.showToast({ title: 'Copiado com sucesso!', icon: 'success' });
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          Taro.showToast({ title: 'Copiado com sucesso!', icon: 'success' });
        } catch (err) {
          Taro.showToast({ title: 'Falha ao copiar', icon: 'none' });
        }
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.error('Erro ao copiar para área de transferência:', err);
      Taro.showToast({ title: 'Falha ao copiar', icon: 'none' });
    }
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    try {
      const isBrowser = typeof document !== 'undefined';
      if (isBrowser) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Taro.showToast({ title: 'Arquivo baixado!', icon: 'success' });
      } else {
        Taro.showToast({ title: 'Não é possível baixar arquivos aqui', icon: 'none' });
      }
    } catch (err) {
      console.error('Erro ao baixar arquivo:', err);
      Taro.showToast({ title: 'Falha ao baixar', icon: 'none' });
    }
  };

  const generateTextReport = () => {
    const data = collectAllDiagnostics();
    let report = `
================================================================================
                    RELATÓRIO DE DIAGNÓSTICO - GABI MANICURE
================================================================================
Data e Hora: ${data.timestampFormatted}
Timestamp ISO: ${data.timestamp}
Ambiente: ${data.environmentLabel}
User Agent: ${data.navigator?.userAgent || 'N/A'}
URL: ${data.location?.href || 'N/A'}
================================================================================

[CAPACITOR DIAGNÓSTICO]
Capacitor.isNativePlatform(): ${data.capacitorDiagnostics.isNative}
Capacitor.getPlatform(): ${data.capacitorDiagnostics.platform}

[DIAGNÓSTICO NAVEGADOR]
Standalone: ${data.browserDiagnostics.isStandalone}
Notification API: ${data.browserDiagnostics.notification}
Service Worker API: ${data.browserDiagnostics.serviceWorker}
Permissão Notificações: ${data.pushDiagnostics.notificationPermission}

[FIREBASE SDK STATUS]
Messaging Criado: ${data.pushDiagnostics.messagingObjectCreated}
Messaging Disponível: ${data.pushDiagnostics.messagingAvailable}
Messaging Suportado: ${data.pushDiagnostics.messagingIsSupported}

[SERVICE WORKER]
SW API Disponível: ${data.pushDiagnostics.serviceWorkerAPIAvailable}
SW Registrado: ${data.pushDiagnostics.serviceWorkerRegistered}
SW Scope: ${data.pushDiagnostics.serviceWorkerScope}
SW Active: ${data.pushDiagnostics.serviceWorkerActive}
SW Waiting: ${data.pushDiagnostics.serviceWorkerWaiting}
SW Installing: ${data.pushDiagnostics.serviceWorkerInstalling}

[FCM TOKEN]
Token: ${data.pushDiagnostics.fcmToken ? data.pushDiagnostics.fcmToken.substring(0, 50) + '...' : 'NÃO REGISTRADO'}
Status Registro: ${data.pushDiagnostics.registrationStatus}

[ÚLTIMO FLUXO DE ENVIO]
${data.debugPush?.lastSendFlow ? `
Função chamada?: ${data.debugPush.lastSendFlow.functionCalled}
Tokens encontrados?: ${data.debugPush.lastSendFlow.tokensFound}
Tokens: ${data.debugPush.lastSendFlow.tokens ? data.debugPush.lastSendFlow.tokens.join(', ') : 'Nenhum'}
API chamada?: ${data.debugPush.lastSendFlow.apiCalled}
Status HTTP: ${data.debugPush.lastSendFlow.httpStatus || 'N/A'}
Timestamp: ${new Date(data.debugPush.lastSendFlow.timestamp).toLocaleString('pt-BR')}
${data.debugPush.lastSendFlow.payload ? `Payload: ${typeof data.debugPush.lastSendFlow.payload === 'object' ? JSON.stringify(data.debugPush.lastSendFlow.payload, null, 2) : data.debugPush.lastSendFlow.payload}` : ''}
${data.debugPush.lastSendFlow.apiResponse ? `Resposta API: ${typeof data.debugPush.lastSendFlow.apiResponse === 'object' ? JSON.stringify(data.debugPush.lastSendFlow.apiResponse, null, 2) : data.debugPush.lastSendFlow.apiResponse}` : ''}
${data.debugPush.lastSendFlow.error ? `Erro: ${data.debugPush.lastSendFlow.error}` : ''}
` : '\nNenhum fluxo de envio registrado.\n'}

================================================================================
                             LOGS COMPLETOS (ORDENADOS)
================================================================================
`;
    if (data.debugPush?.logs && data.debugPush.logs.length > 0) {
      const sortedLogs = [...data.debugPush.logs].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      sortedLogs.forEach(log => {
        const logTime = log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : 'N/A';
        report += `
[${log.type.toUpperCase()}] [${logTime}]
${log.message}
${log.data ? `Dados: ${typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : log.data}` : ''}
--------------------------------------------------------------------------------
`;
      });
    } else {
      report += '\nNenhum log disponível.\n';
    }

    report += `
================================================================================
                             ERROS ENCONTRADOS
================================================================================
`;
    if (data.pushDiagnostics.messagingError) {
      report += `
[FIREBASE MESSAGING ERROR]
Código: ${data.pushDiagnostics.messagingError.code}
Mensagem: ${data.pushDiagnostics.messagingError.message}
Stack Trace: ${data.pushDiagnostics.messagingError.stack}
`;
    }
    if (data.pushDiagnostics.serviceWorkerError) {
      report += `
[SERVICE WORKER ERROR]
${data.pushDiagnostics.serviceWorkerError}
`;
    }
    if (data.pushDiagnostics.getFcmTokenError) {
      report += `
[GET FCM TOKEN ERROR]
${data.pushDiagnostics.getFcmTokenError}
`;
    }
    report += `
================================================================================
                       FIM DO RELATÓRIO DE DIAGNÓSTICO
================================================================================
`;
    return report;
  };

  const copyEverything = async () => {
    const report = generateTextReport();
    await copyToClipboard(report);
  };

  const exportLogsAsTxt = () => {
    const report = generateTextReport();
    const now = new Date();
    const year = String(now.getFullYear()).padStart(4, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    const filename = `debug-push-${year}-${month}-${day}-${hour}-${minute}-${second}.txt`;
    downloadFile(report, filename, 'text/plain');
  };

  const exportAsJson = () => {
    const data = collectAllDiagnostics();
    const jsonStr = JSON.stringify(data, null, 2);
    const now = new Date();
    const year = String(now.getFullYear()).padStart(4, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    const filename = `debug-push-${year}-${month}-${day}-${hour}-${minute}-${second}.json`;
    downloadFile(jsonStr, filename, 'application/json');
  };

  const copyErrors = async () => {
    const data = collectAllDiagnostics();
    let errorText = '';
    if (data.pushDiagnostics.messagingError) {
      errorText += `[FIREBASE MESSAGING ERROR]\nCódigo: ${data.pushDiagnostics.messagingError.code}\nMensagem: ${data.pushDiagnostics.messagingError.message}\nStack: ${data.pushDiagnostics.messagingError.stack}\n\n`;
    }
    if (data.pushDiagnostics.serviceWorkerError) {
      errorText += `[SERVICE WORKER ERROR]\n${data.pushDiagnostics.serviceWorkerError}\n\n`;
    }
    if (data.pushDiagnostics.getFcmTokenError) {
      errorText += `[GET FCM TOKEN ERROR]\n${data.pushDiagnostics.getFcmTokenError}\n\n`;
    }
    if (data.debugPush?.logs?.length > 0) {
      const errorLogs = data.debugPush.logs.filter(log => 
        log.type.toUpperCase().includes('ERROR') || 
        log.type.toUpperCase().includes('ERRO')
      );
      if (errorLogs.length > 0) {
        errorText += `\n[LOGS DE ERRO]\n`;
        errorLogs.forEach(log => {
          const logTime = log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : 'N/A';
          errorText += `[${logTime}] ${log.message}${log.data ? `\nDados: ${JSON.stringify(log.data)}` : ''}\n---\n`;
        });
      }
    }
    if (errorText.trim() === '') {
      await copyToClipboard('Nenhum erro encontrado.');
    } else {
      await copyToClipboard(errorText);
    }
  };

  const copyFullDiagnosticReport = async () => {
    const report = generateTextReport();
    await copyToClipboard(report);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, padding: '20px', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: '16px', color: '#6b7280' }}>Carregando diagnósticos...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, padding: '16px', backgroundColor: '#f8fafc' }}>
      <View style={{ marginBottom: '24px' }}>
        <Text style={{ fontSize: '24px', fontWeight: '800', color: '#111827', marginBottom: '4px' }}>
          📊 Dashboard de Diagnóstico
        </Text>
        <Text style={{ fontSize: '14px', color: '#6b7280' }}>
          Gabi Manicure - Diagnóstico Completo
        </Text>
        <View style={{
          marginTop: '16px',
          padding: '16px',
          backgroundColor: `${getEnvironmentColor()}15`,
          border: `1px solid ${getEnvironmentColor()}`,
          borderRadius: '12px'
        }}>
          <Text style={{ fontSize: '14px', fontWeight: '700', color: getEnvironmentColor() }}>
            📱 {getEnvironmentLabel()}
          </Text>
        </View>
      </View>

      <Card title="Ações Rápidas" icon="⚙️">
        <View style={{ gap: '8px' }}>
          <View style={{ flexDirection: 'row', gap: '8px', flexWrap: 'wrap' }}>
          <ActionButton onClick={testPushAdmin} variant="primary">🔔 TESTE PUSH ADMIN</ActionButton>
          <ActionButton onClick={testPushClient} variant="primary">🔔 TESTE PUSH CLIENTE</ActionButton>
          <ActionButton onClick={testCurrentAdminTokenPush} variant="primary">🎯 TESTE PUSH TOKEN ATUAL ADMIN</ActionButton>
          <ActionButton onClick={testCloudFunctionConnectivity} variant="primary">🔌 TESTE CONECTIVIDADE CF</ActionButton>
          <ActionButton onClick={testApiPing} variant="primary">🟢 TESTE API PING</ActionButton>
          <ActionButton onClick={runFullConnectivityDiagnostic} variant="primary">🌐 DIAGNÓSTICO CONECTIVIDADE COMPLETO</ActionButton>
          <ActionButton onClick={testSendNotificationDirect} variant="primary">📤 TESTE SEND NOTIFICATION</ActionButton>
          <ActionButton onClick={fetchAllTokensDiagnostic} variant="primary">📊 DIAGNÓSTICO DE TOKENS</ActionButton>
        </View>
          <View style={{ flexDirection: 'row', gap: '8px', flexWrap: 'wrap' }}>
            <ActionButton onClick={copyEverything}>📋 COPIAR TUDO</ActionButton>
            <ActionButton onClick={copyFullDiagnosticReport}>📝 COPIAR DIAGNÓSTICO COMPLETO</ActionButton>
          </View>
          <View style={{ flexDirection: 'row', gap: '8px', flexWrap: 'wrap' }}>
            <ActionButton onClick={copyErrors}>⚠️ COPIAR ERROS</ActionButton>
            <ActionButton onClick={exportLogsAsTxt}>📄 EXPORTAR TXT</ActionButton>
            <ActionButton onClick={exportAsJson}>📦 EXPORTAR JSON</ActionButton>
            <ActionButton onClick={clearLogs}>🗑️ LIMPAR LOGS</ActionButton>
          </View>
        </View>
      </Card>

      <Card title="Último Fluxo de Envio" icon="🔄">
        <View style={{ gap: '12px' }}>
          {debugData.lastSendFlow ? (
            <View style={{ gap: '8px' }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '12px' }}>
                <Badge label="Função chamada?" status={debugData.lastSendFlow.functionCalled} />
                <Badge label="Tokens encontrados?" status={debugData.lastSendFlow.tokensFound} />
                <Badge label="API chamada?" status={debugData.lastSendFlow.apiCalled} />
                {debugData.lastSendFlow.httpStatus && (
                  <Badge 
                    label="Status HTTP" 
                    status={debugData.lastSendFlow.httpStatus} 
                    color={String(debugData.lastSendFlow.httpStatus).startsWith('2') ? '#10b981' : '#ef4444'}
                  />
                )}
              </View>

              {debugData.lastSendFlow.tokens && debugData.lastSendFlow.tokens.length > 0 && (
                <View style={{ gap: '8px' }}>
                  <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827' }}>
                    📱 Tokens:
                  </Text>
                  <View style={{ flexDirection: 'column', gap: '4px' }}>
                    {debugData.lastSendFlow.tokens.map((token: string, index: number) => (
                      <Text
                        key={index}
                        style={{
                          fontSize: '11px',
                          color: '#374151',
                          fontFamily: 'monospace',
                          wordBreak: 'break-all',
                          backgroundColor: '#f3f4f6',
                          padding: '8px',
                          borderRadius: '8px',
                        }}
                        selectable
                      >
                        {token}
                      </Text>
                    ))}
                  </View>
                </View>
              )}

              {debugData.lastSendFlow.payload && (
                <JsonPreview data={debugData.lastSendFlow.payload} label="📦 Payload enviado" />
              )}

              {debugData.lastSendFlow.apiResponse && (
                <JsonPreview data={debugData.lastSendFlow.apiResponse} label="📨 Resposta da API" />
              )}

              {debugData.lastSendFlow.error && (
                <View style={{ gap: '8px', padding: '12px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                  <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#dc2626' }}>
                    ❌ Erro no fluxo:
                  </Text>
                  <Text style={{ fontSize: '12px', color: '#b91c1c' }} selectable>
                    {debugData.lastSendFlow.error}
                  </Text>
                </View>
              )}

              <Text style={{ fontSize: '11px', color: '#9ca3af' }}>
                🕒 {new Date(debugData.lastSendFlow.timestamp).toLocaleString('pt-BR')}
              </Text>
            </View>
          ) : (
            <Text style={{ fontSize: '14px', color: '#6b7280' }}>
              ⏳ Aguardando primeiro fluxo de envio...
            </Text>
          )}
        </View>
      </Card>

      <Card title="Diagnóstico de Envio" icon="📤">
        <View style={{ gap: '12px' }}>
          {debugData.lastApiCall?.payload?.fcmTokens && debugData.lastApiCall.payload.fcmTokens.length > 0 ? (
            <View style={{ gap: '8px' }}>
              <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827' }}>
                📱 Tokens encontrados para usuário:
              </Text>
              <View style={{ flexDirection: 'column', gap: '4px' }}>
                {debugData.lastApiCall.payload.fcmTokens.map((token: string, index: number) => (
                  <Text
                    key={index}
                    style={{
                      fontSize: '11px',
                      color: '#374151',
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                      backgroundColor: '#f3f4f6',
                      padding: '8px',
                      borderRadius: '8px'
                    }}
                    selectable
                  >
                    {token}
                  </Text>
                ))}
              </View>
            </View>
          ) : (
            <Text style={{ fontSize: '14px', color: '#6b7280' }}>
              Nenhum token encontrado no último fluxo.
            </Text>
          )}
        </View>
      </Card>

      <Card title="Último Teste /api/ping" icon="🟢">
        <View style={{ gap: '12px' }}>
          {(() => {
            const debugWindow = typeof window !== 'undefined' ? (window as any).__DEBUG_PUSH__ : null;
            const lastPingTest = debugWindow?.lastPingTest;
            if (lastPingTest) {
              return (
                <View style={{ gap: '8px' }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '12px' }}>
                    <Badge label="Status HTTP" status={lastPingTest.status} color={String(lastPingTest.status).startsWith('2') ? '#10b981' : '#ef4444'} />
                  </View>
                  <Text style={{ fontSize: '11px', color: '#6b7280' }}>
                    🕒 {new Date(lastPingTest.timestamp).toLocaleString('pt-BR')}
                  </Text>
                  <JsonPreview data={lastPingTest.response} label="📨 Resposta da API" />
                </View>
              );
            } else {
              return (
                <Text style={{ fontSize: '14px', color: '#6b7280' }}>
                  ⏳ Aguardando primeiro teste de ping...
                </Text>
              );
            }
          })()}
        </View>
      </Card>

      <Card title="Último Teste /api/send-notification Direto" icon="📤">
        <View style={{ gap: '12px' }}>
          {(() => {
            const debugWindow = typeof window !== 'undefined' ? (window as any).__DEBUG_PUSH__ : null;
            const lastTest = debugWindow?.lastSendNotificationDirectTest;
            if (lastTest) {
              return (
                <View style={{ gap: '8px' }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '12px' }}>
                    <Badge label="Status HTTP" status={lastTest.status} color={String(lastTest.status).startsWith('2') ? '#10b981' : '#ef4444'} />
                  </View>
                  <Text style={{ fontSize: '11px', color: '#6b7280' }}>
                    🕒 {new Date(lastTest.timestamp).toLocaleString('pt-BR')}
                  </Text>
                  <JsonPreview data={lastTest.payload} label="📦 Payload enviado" />
                  <JsonPreview data={lastTest.response} label="📨 Resposta da API" />
                </View>
              );
            } else {
              return (
                <Text style={{ fontSize: '14px', color: '#6b7280' }}>
                  ⏳ Aguardando primeiro teste direto...
                </Text>
              );
            }
          })()}
        </View>
      </Card>

      <Card title="DIAGNÓSTICO DE CONECTIVIDADE COMPLETO" icon="🌐">
        <View style={{ gap: '12px' }}>
          {(() => {
            const debugWindow = typeof window !== 'undefined' ? (window as any).__DEBUG_PUSH__ : null;
            const lastTest = debugWindow?.fullConnectivityDiagnostic;
            if (lastTest) {
              // Determinar cenário
              let scenario = '';
              if (lastTest.google?.success === false) {
                scenario = 'CENÁRIO A (Problema de rede/WebView Android)';
              } else if (lastTest.vercelHomepage?.success === false || lastTest.vercelPing?.success === false) {
                scenario = 'CENÁRIO B (Problema de DNS/SSL/configuração Android para o domínio)';
              } else if (lastTest.google?.success && lastTest.vercelHomepage?.success && lastTest.vercelPing?.success) {
                scenario = 'CENÁRIO C (Problema específico da API send-notification)';
              }

              return (
                <View style={{ gap: '12px' }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '12px', padding: '12px', backgroundColor: scenario.includes('CENÁRIO A') ? '#fee2e2' : scenario.includes('CENÁRIO B') ? '#fff7ed' : '#dcfce7', borderRadius: '8px', border: scenario.includes('CENÁRIO A') ? '1px solid #ef4444' : scenario.includes('CENÁRIO B') ? '1px solid #f97316' : '1px solid #10b981' }}>
                    <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827' }}>
                      {scenario}
                    </Text>
                  </View>

                  <View style={{ gap: '12px' }}>
                    <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827' }}>
                      1️⃣ TESTE Google: {lastTest.google?.success ? '✅ OK' : '❌ FALHOU'}
                    </Text>
                    <JsonPreview data={lastTest.google} label="Resultado Teste Google" />
                  </View>

                  <View style={{ gap: '12px' }}>
                    <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827' }}>
                      2️⃣ TESTE Vercel Homepage: {lastTest.vercelHomepage?.success ? '✅ OK' : '❌ FALHOU'}
                    </Text>
                    <JsonPreview data={lastTest.vercelHomepage} label="Resultado Teste Vercel Homepage" />
                  </View>

                  <View style={{ gap: '12px' }}>
                    <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827' }}>
                      3️⃣ TESTE API Ping: {lastTest.vercelPing?.success ? '✅ OK' : '❌ FALHOU'}
                    </Text>
                    <JsonPreview data={lastTest.vercelPing} label="Resultado Teste API Ping" />
                  </View>
                </View>
              );
            } else {
              return (
                <Text style={{ fontSize: '14px', color: '#6b7280' }}>
                  ⏳ Aguardando primeiro diagnóstico de conectividade completo...
                </Text>
              );
            }
          })()}
        </View>
      </Card>

      <Card title="Diagnóstico Capacitor" icon="📱">
        <View style={{ gap: '12px' }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '12px' }}>
            <Badge label="Plataforma Nativa?" status={capacitorDiagnostics.isNative} />
            <Badge label="Plataforma" status={capacitorDiagnostics.platform} color="#4C84C1" />
          </View>
          <JsonPreview data={capacitorDiagnostics.windowCapacitor} label="window.Capacitor" />
        </View>
      </Card>

      <Card title="Diagnóstico Push" icon="🔔">
        <View style={{ gap: '12px' }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '12px' }}>
            <Badge label="Messaging Criado?" status={pushDiagnostics.messagingObjectCreated} />
            <Badge label="Messaging Disponível?" status={pushDiagnostics.messagingAvailable} />
            <Badge label="Messaging Suportado?" status={pushDiagnostics.messagingIsSupported} />
          </View>
          <View style={{ gap: '12px' }}>
            <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827' }}>
              🔑 Token FCM:
            </Text>
            {pushDiagnostics.fcmToken ? (
              <Text
                style={{
                  fontSize: '11px',
                  color: '#374151',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  backgroundColor: '#f3f4f6',
                  padding: '8px',
                  borderRadius: '8px',
                }}
                selectable
              >
                {pushDiagnostics.fcmToken}
              </Text>
            ) : (
              <Text style={{ fontSize: '14px', color: '#ef4444' }}>
                Nenhum token registrado!
              </Text>
            )}
            <ActionButton onClick={copyFcmToken} variant="primary">
              📋 Copiar Token
            </ActionButton>
          </View>
          <JsonPreview data={pushDiagnostics} label="Diagnóstico Completo Push" />
        </View>
      </Card>

      {tokenDiagnostics && (
        <Card title="Diagnóstico de Tokens" icon="📊">
          <View style={{ gap: '12px' }}>
            <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827' }}>
              Total de usuários: {tokenDiagnostics.totalUsers}
            </Text>
            <JsonPreview data={tokenDiagnostics} label="Diagnóstico de Tokens Completo" />
          </View>
        </Card>
      )}

      <Card title="Diagnóstico Firebase" icon="🔥">
        <View style={{ gap: '12px' }}>
          <JsonPreview data={diagnosticFirebaseConfig} label="Configuração Firebase (masked)" />
          <JsonPreview data={exportedFirebaseConfigMasked} label="Configuração Exportada (masked)" />
        </View>
      </Card>

      <Card title="Logs" icon="📜">
        <View style={{ gap: '12px' }}>
          <View style={{ flexDirection: 'row', gap: '8px', flexWrap: 'wrap' }}>
            <ActionButton onClick={() => setFilterType('ALL')}>TODOS</ActionButton>
            <ActionButton onClick={() => setFilterType('INFO')}>INFO</ActionButton>
            <ActionButton onClick={() => setFilterType('WARN')}>AVISO</ActionButton>
            <ActionButton onClick={() => setFilterType('ERROR')}>ERRO</ActionButton>
            <ActionButton onClick={() => setFilterType('SUCCESS')}>SUCESSO</ActionButton>
          </View>
          {filteredLogs.length > 0 ? (
            <View style={{ gap: '8px' }}>
              {filteredLogs.map((log, index) => (
                <View key={index} style={{
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: log.type.toUpperCase().includes('ERROR') ? '#fef2f2' : 
                                    log.type.toUpperCase().includes('WARN') ? '#fffbeb' : 
                                    log.type.toUpperCase().includes('SUCCESS') ? '#f0fdf4' : 
                                    '#f8fafc',
                  borderLeft: `4px solid ${
                    log.type.toUpperCase().includes('ERROR') ? '#dc2626' : 
                    log.type.toUpperCase().includes('WARN') ? '#d97706' : 
                    log.type.toUpperCase().includes('SUCCESS') ? '#16a34a' : 
                    '#3b82f6'
                  }`
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <Text style={{ fontSize: '12px', fontWeight: 'bold', color: '#111827' }}>
                      {log.type}
                    </Text>
                    <Text style={{ fontSize: '11px', color: '#9ca3af' }}>
                      {log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : ''}
                    </Text>
                  </View>
                  <Text style={{ fontSize: '13px', color: '#374151' }}>
                    {log.message}
                  </Text>
                  {log.data && (
                    <JsonPreview data={log.data} label="Dados" />
                  )}
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: '14px', color: '#6b7280' }}>
              Nenhum log disponível.
            </Text>
          )}
        </View>
      </Card>
    </ScrollView>
  );
};

export default DashboardPage;