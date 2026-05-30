import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, Button, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { initializePushNotifications, getCurrentFcmToken, checkPushPermissions } from '../../services/pushService';
import { getFirebaseMessaging, getFcmToken, onFcmMessage } from '../../services/firebase';
import { useAuth } from '../../store/authStore';

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
}

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  
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
  });
  const [browserDiagnostics, setBrowserDiagnostics] = useState<any>({});
  const [filterType, setFilterType] = useState<LogType | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  const refreshDebugData = async () => {
    const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';
    const isNative = Capacitor.isNativePlatform();
    
    let debugStore = {
      logs: [],
      lastSent: null,
      lastReceived: null,
      lastError: null,
      lastApiCall: null,
    };
    if (isBrowser) {
      debugStore = (window as any).__DEBUG_PUSH__ || debugStore;
    }
    setDebugData(debugStore);

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
      fcmToken: currentToken || debugStore.fcmToken,
      lastTokenUpdate: debugStore.lastTokenUpdate,
      checkPermissionsResult: checkResult,
      messagingAvailable: !!messaging,
      registrationStatus: currentToken || debugStore.fcmToken ? 'registered' : 'not_registered'
    }));

    setIsLoading(false);
  };

  const requestPushPermissions = async () => {
    try {
      const isNative = Capacitor.isNativePlatform();
      
      if (user?.uid) {
        await initializePushNotifications(user.uid);
      } else {
        await initializePushNotifications();
      }

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
          
          if (user?.uid) {
            await initializePushNotifications(user.uid);
          }
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
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>Firebase Messaging</Text>
            <Text style={{ 
              fontSize: '13px', 
              fontWeight: 'bold',
              color: pushDiagnostics.messagingAvailable ? '#10b981' : '#ef4444'
            }}>
              {pushDiagnostics.messagingAvailable ? 'DISPONÍVEL' : 'INDISPONÍVEL'}
            </Text>
          </View>

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
          <View style={{ flexDirection: 'row', gap: '10px' }}>
            <ActionButton onClick={clearLogs}>🗑️ Limpar Logs</ActionButton>
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
                    <Text style={{ fontSize: '12px', fontWeight: '700', color: getLogColor(log.type) }}>
                      [{log.type}]
                    </Text>
                    <Text style={{ fontSize: '10px', color: '#9ca3af' }}>
                      {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                    </Text>
                  </View>
                  <Text style={{ fontSize: '13px', color: '#374151', marginBottom: '8px' }}>
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
