import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, Button, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { initializePushNotifications, getCurrentFcmToken, checkPushPermissions } from '../../services/pushService';
import { getFirebaseMessaging, getFcmToken, onFcmMessage, firebaseConfig as exportedFirebaseConfig, getDiagnosticFirebaseConfig } from '../../services/firebase';

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

  const refreshDebugData = async () => {
    const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';
    const isNative = Capacitor.isNativePlatform();
    
    let debugStore: {
      logs: LogItem[];
      lastSent: any;
      lastReceived: any;
      lastError: any;
      lastApiCall: any;
      fcmToken?: string | null;
      lastTokenUpdate?: number | null;
    } = {
      logs: [],
      lastSent: null,
      lastReceived: null,
      lastError: null,
      lastApiCall: null,
      fcmToken: null,
      lastTokenUpdate: null,
    };
    if (isBrowser) {
      debugStore = (window as any).__DEBUG_PUSH__ || debugStore;
    }
    setDebugData(debugStore);

    // Get Firebase config diagnostic data
    setDiagnosticFirebaseConfig(getDiagnosticFirebaseConfig());
    
    // Mask the exported firebaseConfig
    const maskVal = (v: string) => {
      const val = String(v || '');
      if (!val) return '';
      const suffix = val.length <=4 ? val : val.slice(-4);
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
      isNative: isNative,
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
    
    setPushDiagnostics(prev => ({ 
      ...prev, 
      fcmToken: currentToken || debugStore.fcmToken || null,
      lastTokenUpdate: debugStore.lastTokenUpdate ?? null,
      checkPermissionsResult: checkResult,
      messagingAvailable: !!messaging,
      messagingObjectCreated: debugStore.messagingObjectCreated ?? false,
      serviceWorkerRegistered: debugStore.serviceWorkerRegistered ?? false,
      serviceWorkerScope: debugStore.serviceWorkerScope ?? null,
      serviceWorkerError: debugStore.serviceWorkerError ?? null,
      messagingError: debugStore.messagingError ?? null,
      serviceWorkerAPIAvailable: debugStore.serviceWorkerAPIAvailable ?? false,
      notificationAPIAvailable: debugStore.notificationAPIAvailable ?? false,
      notificationPermission: debugStore.notificationPermission ?? null,
      messagingIsSupported: debugStore.messagingIsSupported ?? false,
      existingSWRegistrations: debugStore.existingSWRegistrations ?? null,
      serviceWorkerActive: debugStore.serviceWorkerActive ?? false,
      serviceWorkerWaiting: debugStore.serviceWorkerWaiting ?? false,
      serviceWorkerInstalling: debugStore.serviceWorkerInstalling ?? false,
      getFcmTokenSuccess: debugStore.getFcmTokenSuccess ?? null,
      getFcmTokenError: debugStore.getFcmTokenError ?? null,
      firebaseDiagnostic: debugStore.firebaseDiagnostic ?? null,
      firebaseSdkStatus: debugStore.firebaseSdkStatus ?? null,
      registrationStatus: currentToken || debugStore.fcmToken ? 'registered' : 'not_registered'
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
      Taro.showToast({ title: 'Erro ao copiar', icon: 'none' });
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
        <Text style={{ fontSize: '13px', color: '#6b7280' }}>{label}</Text>
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
        // Fallback para navegadores antigos ou ambientes não-browser
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
          {/* Tokens encontrados */}
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
              ⚠️ Nenhum token encontrado na última chamada
            </Text>
          )}

          {/* Último payload */}
          {debugData.lastApiCall?.payload && (
            <JsonPreview data={debugData.lastApiCall.payload} label="📦 Último payload enviado" />
          )}

          {/* Última resposta da API */}
          {debugData.lastApiCall?.response && (
            <View style={{ gap: '8px' }}>
              <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827' }}>
                📨 Última chamada para /api/send-notification
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '12px' }}>
                <Badge
                  label="SuccessCount"
                  status={debugData.lastApiCall.response.successCount}
                  color={debugData.lastApiCall.response.successCount > 0 ? '#10b981' : '#6b7280'}
                />
                <Badge
                  label="FailureCount"
                  status={debugData.lastApiCall.response.failureCount}
                  color={debugData.lastApiCall.response.failureCount > 0 ? '#ef4444' : '#6b7280'}
                />
              </View>

              {debugData.lastApiCall.response.responses && (
                <View style={{ gap: '8px' }}>
                  <Text style={{ fontSize: '13px', fontWeight: 'bold', color: '#111827' }}>
                    Resultado por token:
                  </Text>
                  {debugData.lastApiCall.response.responses.map((r: any, index: number) => (
                    <View
                      key={index}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        backgroundColor: r.success ? '#ecfdf5' : '#fef2f2',
                        borderLeftWidth: '4px',
                        borderLeftColor: r.success ? '#10b981' : '#ef4444',
                        borderLeftStyle: 'solid'
                      }}
                    >
                      <Text
                        style={{ fontSize: '11px', color: '#1f2937', fontFamily: 'monospace' }}
                        selectable
                      >
                        {r.tokenPrefix}
                      </Text>
                      <Text
                        style={{ fontSize: '12px', color: r.success ? '#059669' : '#dc2626' }}
                      >
                        {r.success ? '✅ Aceito' : '❌ Rejeitado'}
                        {!r.success && r.error ? ` - ${r.error.code}: ${r.error.message}` : ''}
                      </Text>
                      {r.success && r.messageId && (
                        <Text style={{ fontSize: '10px', color: '#6b7280', fontFamily: 'monospace' }} selectable>
                          Message ID: {r.messageId}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Último erro */}
          {debugData.lastApiCall?.error && (
            <View style={{ gap: '8px', padding: '12px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
              <Text style={{ fontSize: '14px', fontWeight: 'bold', color: '#dc2626' }}>
                ❌ Último erro retornado pelo Firebase
              </Text>
              <Text style={{ fontSize: '12px', color: '#b91c1c' }} selectable>
                {debugData.lastApiCall.error}
              </Text>
            </View>
          )}

          {!debugData.lastApiCall && (
            <Text style={{ fontSize: '14px', color: '#6b7280' }}>
              ⏳ Aguardando primeira chamada de envio...
            </Text>
          )}
        </View>
      </Card>

      <Card title="Diagnóstico Capacitor" icon="⚡">
        <View style={{ gap: '12px' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>Capacitor.isNativePlatform()</Text>
            <Text style={{ 
              fontSize: '13px', 
              fontWeight: 'bold',
              color: capacitorDiagnostics.isNative ? '#10b981' : '#f59e0b'
            }}>
              {String(capacitorDiagnostics.isNative)}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>Capacitor.getPlatform()</Text>
            <Text style={{ fontSize: '13px', fontWeight: 'bold', color: '#374151', fontFamily: 'monospace' }}>
              "{capacitorDiagnostics.platform}"
            </Text>
          </View>

          {capacitorDiagnostics.windowCapacitor && <JsonPreview data={capacitorDiagnostics.windowCapacitor} label="window.Capacitor (simplificado)" />}
        </View>
      </Card>

      <Card title="Diagnóstico do Navegador" icon="🌐">
        <View style={{ gap: '12px' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>Modo Standalone (PWA)</Text>
            <Text style={{ 
              fontSize: '13px', 
              fontWeight: 'bold',
              color: browserDiagnostics.isStandalone ? '#3b82f6' : '#6b7280'
            }}>
              {browserDiagnostics.isStandalone ? 'SIM' : 'NÃO'}
            </Text>
          </View>
          
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '12px' }}>
            <Badge label="Notification API" status={browserDiagnostics.notification} />
            <Badge label="Service Worker" status={browserDiagnostics.serviceWorker} />
            <Badge label="Permissão Notificação" status={browserDiagnostics.notificationPermission} />
          </View>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>window.location.href</Text>
          </View>
          <Text style={{ 
            fontSize: '11px', 
            color: '#374151', 
            fontFamily: 'monospace', 
            wordBreak: 'break-all',
            backgroundColor: '#f3f4f6',
            padding: '12px',
            borderRadius: '8px'
          }} selectable>
            {browserDiagnostics.href}
          </Text>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>navigator.userAgent</Text>
          </View>
          <Text style={{ 
            fontSize: '11px', 
            color: '#374151', 
            fontFamily: 'monospace', 
            wordBreak: 'break-all',
            backgroundColor: '#f3f4f6',
            padding: '12px',
            borderRadius: '8px'
          }} selectable>
            {browserDiagnostics.userAgent}
          </Text>
        </View>
      </Card>

      <Card title="Configuração Firebase (Raw Env)" icon="🔧">
        <View style={{ gap: '8px' }}>
          {diagnosticFirebaseConfig ? (
            Object.entries(diagnosticFirebaseConfig).map(([key, value]) => (
              <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: '13px', color: '#6b7280' }}>{key}</Text>
                <Text style={{ fontSize: '12px', color: '#374151', fontFamily: 'monospace', textAlign: 'right' }} selectable>
                  {value != null ? String(value) : '<VAZIO>'}
                </Text>
              </View>
            ))
          ) : (
            <Text style={{ fontSize: '13px', color: '#ef4444', textAlign: 'center' }}>Carregando...</Text>
          )}
        </View>
      </Card>

      <Card title="Configuração Firebase (Exportada)" icon="🎯">
        <View style={{ gap: '8px' }}>
          {exportedFirebaseConfigMasked ? (
            Object.entries(exportedFirebaseConfigMasked).map(([key, value]) => (
              <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: '13px', color: '#6b7280' }}>{key}</Text>
                <Text style={{ fontSize: '12px', color: '#374151', fontFamily: 'monospace', textAlign: 'right' }} selectable>
                  {value != null ? String(value) : '<VAZIO>'}
                </Text>
              </View>
            ))
          ) : (
            <Text style={{ fontSize: '13px', color: '#ef4444', textAlign: 'center' }}>Carregando...</Text>
          )}
        </View>
      </Card>

      <Card title="Status Firebase SDK & Service Worker" icon="🔥">
        <View style={{ gap: '12px' }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '8px' }}>
            <Badge label="Messaging Support" status={pushDiagnostics.messagingIsSupported} />
            <Badge label="SW API" status={pushDiagnostics.serviceWorkerAPIAvailable} />
            <Badge label="Notification API" status={pushDiagnostics.notificationAPIAvailable} />
            <Badge label="Messaging Criado" status={pushDiagnostics.messagingObjectCreated} />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>Permissão Notificações</Text>
            <Text style={{ fontSize: '13px', fontWeight: 'bold', color: '#374151' }}>
              {pushDiagnostics.notificationPermission?.toUpperCase() || 'NÃO VERIFICADO'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>SW Registrado</Text>
            <Text style={{ 
              fontSize: '13px', fontWeight: 'bold', color: pushDiagnostics.serviceWorkerRegistered ? '#10b981' : '#ef4444' }}>
              {pushDiagnostics.serviceWorkerRegistered ? 'SIM' : 'NÃO'}
            </Text>
          </View>

          {pushDiagnostics.serviceWorkerScope && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: '13px', color: '#6b7280' }}>SW Scope</Text>
              <Text style={{ fontSize: '12px', color: '#374151', fontFamily: 'monospace', wordBreak: 'break-all' }} selectable>
                {pushDiagnostics.serviceWorkerScope}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'flexStart', gap: '8px' }}>
            <Badge label="SW Active" status={pushDiagnostics.serviceWorkerActive} />
            <Badge label="SW Waiting" status={pushDiagnostics.serviceWorkerWaiting} />
            <Badge label="SW Installing" status={pushDiagnostics.serviceWorkerInstalling} />
          </View>

          {pushDiagnostics.existingSWRegistrations?.length > 0 && (
            <JsonPreview data={pushDiagnostics.existingSWRegistrations} label="Service Workers Existentes" />
          )}

          {pushDiagnostics.getFcmTokenSuccess !== null && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: '13px', color: '#6b7280' }}>getFcmToken() Sucesso</Text>
              <Text style={{ 
                fontSize: '13px', fontWeight: 'bold', color: pushDiagnostics.getFcmTokenSuccess ? '#10b981' : '#ef4444' }}>
                {pushDiagnostics.getFcmTokenSuccess ? 'SIM' : 'NÃO'}
              </Text>
            </View>
          )}

          {pushDiagnostics.getFcmTokenError && (
            <JsonPreview data={pushDiagnostics.getFcmTokenError} label="Erro getFcmToken()" />
          )}

          {pushDiagnostics.messagingError && (
            <View style={{ gap: '8px', padding: '12px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
              <Text style={{ fontSize: '13px', fontWeight: '700', color: '#dc2626' }}>Erro Firebase Messaging</Text>
              <Text style={{ fontSize: '12px', color: '#991b1b' }} selectable>
                <Text style={{ fontWeight: 'bold' }}>Código:</Text> {pushDiagnostics.messagingError.code || 'N/A'}
              </Text>
              <Text style={{ fontSize: '12px', color: '#991b1b' }} selectable>
                <Text style={{ fontWeight: 'bold' }}>Mensagem:</Text> {pushDiagnostics.messagingError.message || 'N/A'}
              </Text>
              {pushDiagnostics.messagingError.stack && (
                <JsonPreview data={pushDiagnostics.messagingError.stack} label="Stack Trace" />
              )}
            </View>
          )}

          {pushDiagnostics.serviceWorkerError && (
            <JsonPreview data={pushDiagnostics.serviceWorkerError} label="Erro Service Worker" />
          )}

          {pushDiagnostics.firebaseSdkStatus && (
            <JsonPreview data={pushDiagnostics.firebaseSdkStatus} label="Status Firebase SDK" />
          )}

        </View>
      </Card>

      <Card title="Diagnóstico Push Notifications" icon="🔔">
        <View style={{ gap: '12px' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>Status Registro</Text>
            <Text style={{ 
              fontSize: '13px', 
              fontWeight: 'bold',
              color: pushDiagnostics.registrationStatus === 'registered' 
                ? '#10b981' 
                : pushDiagnostics.registrationStatus === 'error' 
                ? '#ef4444' 
                : '#f59e0b'
            }}>
              {pushDiagnostics.registrationStatus.toUpperCase()}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>Token FCM</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
              <Text style={{ fontSize: '13px', color: '#374151', fontFamily: 'monospace' }} selectable>
                {pushDiagnostics.fcmToken ? `${pushDiagnostics.fcmToken.substring(0, 12)}...` : 'Não registrado'}
              </Text>
              {pushDiagnostics.fcmToken && <Button onClick={copyFcmToken} style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#e0e7ff', color: '#4338ca', border: 'none', borderRadius: '6px' }}>📋</Button>}
            </View>
          </View>

          {pushDiagnostics.lastTokenUpdate && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: '13px', color: '#6b7280' }}>Última atualização token</Text>
              <Text style={{ fontSize: '13px', color: '#374151', fontWeight: '500' }}>
                {new Date(pushDiagnostics.lastTokenUpdate).toLocaleString('pt-BR')}
              </Text>
            </View>
          )}
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>Service Worker API</Text>
            <Text style={{ 
              fontSize: '13px', 
              fontWeight: 'bold',
              color: pushDiagnostics.serviceWorkerAPIAvailable ? '#10b981' : '#ef4444'
            }}>
              {pushDiagnostics.serviceWorkerAPIAvailable ? 'DISPONÍVEL' : 'NÃO DISPONÍVEL'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>Service Worker Registrado</Text>
            <Text style={{ 
              fontSize: '13px', 
              fontWeight: 'bold',
              color: pushDiagnostics.serviceWorkerRegistered ? '#10b981' : '#ef4444'
            }}>
              {pushDiagnostics.serviceWorkerRegistered ? 'SIM' : 'NÃO'}
            </Text>
          </View>

          {pushDiagnostics.serviceWorkerScope && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: '13px', color: '#6b7280' }}>Registration Scope</Text>
              <Text style={{ fontSize: '11px', color: '#374151', fontFamily: 'monospace' }} selectable>
                {pushDiagnostics.serviceWorkerScope}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>Messaging Object Created</Text>
            <Text style={{ 
              fontSize: '13px', 
              fontWeight: 'bold',
              color: pushDiagnostics.messagingObjectCreated ? '#10b981' : '#ef4444'
            }}>
              {pushDiagnostics.messagingObjectCreated ? 'SIM' : 'NÃO'}
            </Text>
          </View>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>Firebase Messaging</Text>
            <Text style={{ 
              fontSize: '13px', 
              fontWeight: 'bold',
              color: pushDiagnostics.messagingAvailable ? '#10b981' : '#ef4444'
            }}>
              {pushDiagnostics.messagingAvailable ? 'DISPONÍVEL' : 'INDISPONÍVEL'}
            </Text>
          </View>

          {pushDiagnostics.serviceWorkerError && (
            <View style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px' }}>
              <Text style={{ fontSize: '12px', color: '#991b1b', fontWeight: 'bold', marginBottom: '4px' }}>⚠️ Service Worker Error:</Text>
              <Text style={{ fontSize: '11px', color: '#991b1b', fontFamily: 'monospace', wordBreak: 'break-all' }} selectable>
                {pushDiagnostics.serviceWorkerError}
              </Text>
            </View>
          )}

          {pushDiagnostics.messagingError && (
            <View style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px' }}>
              <Text style={{ fontSize: '12px', color: '#991b1b', fontWeight: 'bold', marginBottom: '4px' }}>⚠️ Firebase Messaging Error:</Text>
              <JsonPreview data={pushDiagnostics.messagingError} label="Detalhes do Erro" />
            </View>
          )}

          {pushDiagnostics.checkPermissionsResult && <JsonPreview data={pushDiagnostics.checkPermissionsResult} label="PushNotifications.checkPermissions()" />}
          {pushDiagnostics.requestPermissionsResult && <JsonPreview data={pushDiagnostics.requestPermissionsResult} label="PushNotifications.requestPermissions()" />}
        </View>
      </Card>

      {debugData.lastApiCall && (
        <Card title="Status API send-notification" icon="🌐">
          <View style={{ gap: '12px' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: '13px', color: '#6b7280' }}>Timestamp</Text>
              <Text style={{ fontSize: '13px', color: '#374151', fontWeight: '500' }}>
                {new Date(debugData.lastApiCall.timestamp).toLocaleString('pt-BR')}
              </Text>
            </View>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: '13px', color: '#6b7280' }}>URL</Text>
              <Text style={{ fontSize: '13px', color: '#374151', fontFamily: 'monospace' }} selectable>
                {debugData.lastApiCall.url}
              </Text>
            </View>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: '13px', color: '#6b7280' }}>Status HTTP</Text>
              <Text style={{ 
                fontSize: '13px', 
                fontWeight: 'bold',
                color: (typeof debugData.lastApiCall.status === 'number' && debugData.lastApiCall.status < 300) 
                  ? '#10b981' 
                  : '#ef4444'
              }}>
                {debugData.lastApiCall.status}
              </Text>
            </View>
            
            <View style={{ gap: '8px' }}>
              <Text style={{ fontSize: '13px', color: '#6b7280' }}>Payload Enviado</Text>
              <Text style={{ 
                fontSize: '11px', 
                color: '#374151', 
                fontFamily: 'monospace', 
                wordBreak: 'break-all',
                backgroundColor: '#f3f4f6',
                padding: '12px',
                borderRadius: '8px'
              }} selectable>
                {JSON.stringify(debugData.lastApiCall.payload, null, 2)}
              </Text>
            </View>
            
            {debugData.lastApiCall.response && <JsonPreview data={debugData.lastApiCall.response} label="Resposta" />}
            {debugData.lastApiCall.error && <JsonPreview data={debugData.lastApiCall.error} label="Erro" />}
          </View>
        </Card>
      )}

      <Card title="Botões de Ação" icon="🧪">
        <View style={{ gap: '10px' }}>
          <View style={{ flexDirection: 'row', gap: '10px' }}>
            <ActionButton onClick={requestPushPermissions} variant="primary">🔑 Permissões Push</ActionButton>
            <ActionButton onClick={refreshDebugData}>🔄 Atualizar Diagnósticos</ActionButton>
          </View>
        </View>
      </Card>

      {debugData.lastReceived && (
        <Card title="Última Notificação Recebida" icon="📥">
          <View style={{ 
            backgroundColor: '#f0fdf4', 
            border: '1px solid #bbf7d0', 
            borderRadius: '10px', 
            padding: '14px' 
          }}>
            <Text style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>Payload:</Text>
            <Text style={{ fontSize: '11px', color: '#166534', fontFamily: 'monospace', wordBreak: 'break-all' }} selectable>
              {typeof debugData.lastReceived === 'object' ? JSON.stringify(debugData.lastReceived, null, 2) : String(debugData.lastReceived)}
            </Text>
          </View>
        </Card>
      )}

      {debugData.lastError && (
        <Card title="Último Erro" icon="❌">
          <View style={{ 
            backgroundColor: '#fef2f2', 
            border: '1px solid #fecaca', 
            borderRadius: '10px', 
            padding: '14px' 
          }}>
            <Text style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>Erro:</Text>
            <Text style={{ fontSize: '11px', color: '#991b1b', fontFamily: 'monospace', wordBreak: 'break-all' }} selectable>
              {typeof debugData.lastError === 'object' ? JSON.stringify(debugData.lastError, null, 2) : String(debugData.lastError)}
            </Text>
          </View>
        </Card>
      )}

      <Card title={`Logs (${filteredLogs.length})`} icon="📜">
        <View style={{ flexDirection: 'row', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {['ALL', 'SUCCESS', 'INFO', 'WARN', 'ERROR'].map((type) => (
            <Button
              key={type}
              onClick={() => setFilterType(type as LogType | 'ALL')}
              style={{
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: '600',
                border: 'none',
                backgroundColor: filterType === type ? (type === 'ALL' ? '#374151' : type === 'SUCCESS' ? '#10b981' : type === 'WARN' ? '#f59e0b' : '#ef4444') : '#f3f4f6',
                color: filterType === type ? '#fff' : '#6b7280'
              }}
            >
              {type}
            </Button>
          ))}
        </View>

        <View style={{ gap: '12px' }}>
          {filteredLogs.length === 0 ? (
            <Text style={{ fontSize: '13px', color: '#9ca3af', textAlign: 'center', padding: '20px' }}>
              Nenhum log encontrado
            </Text>
          ) : (
            filteredLogs.map((log, index) => {
              const getLogColor = (t: string) => {
                const type = t.toUpperCase();
                if (type.includes('ERROR')) return '#ef4444';
                if (type.includes('WARN') || type.includes('AVISO')) return '#f59e0b';
                if (type.includes('SUCCESS') || type.includes('SUCESSO')) return '#10b981';
                return '#3b82f6';
              };

              return (
                <View 
                    key={index} 
                    style={{ 
                      borderLeftWidth: '3px', 
                      borderLeftColor: getLogColor(log.type), 
                      borderLeftStyle: 'solid',
                      padding: '12px 16px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '0 10px 10px 0'
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <Text style={{ fontSize: '12px', fontWeight: '700', color: getLogColor(log.type) }} selectable>
                        [{log.type}]
                      </Text>
                      <Text style={{ fontSize: '10px', color: '#9ca3af' }} selectable>
                        {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                      </Text>
                    </View>
                    <Text style={{ fontSize: '13px', color: '#374151', marginBottom: '8px' }} selectable>
                      {log.message}
                    </Text>
                    {log.data && (
                      <Text style={{ fontSize: '11px', color: '#6b7280', fontFamily: 'monospace', wordBreak: 'break-all' }} selectable>
                        {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : String(log.data)}
                      </Text>
                    )}
                </View>
              );
            })
          )}
        </View>
      </Card>

      <View style={{ height: '40px' }} />
    </ScrollView>
  );
};

export default DashboardPage;
