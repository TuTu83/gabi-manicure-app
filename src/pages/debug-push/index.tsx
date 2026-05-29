import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, Button, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { PushNotifications } from '@capacitor/push-notifications';

type LogType = 'ERROR' | 'WARN' | 'INFO' | 'SUCCESS';

interface LogItem {
  type: string;
  message: string;
  data?: any;
  timestamp: number;
}

const DashboardPage: React.FC = () => {
  const [debugData, setDebugData] = useState<{
    logs: LogItem[];
    lastSent: any;
    lastReceived: any;
    lastError: any;
  }>({
    logs: [],
    lastSent: null,
    lastReceived: null,
    lastError: null,
  });
  const [diagnostics, setDiagnostics] = useState<any>({});
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<LogType | 'ALL'>('ALL');

  const refreshDebugData = () => {
    const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';
    let debugStore = {
      logs: [],
      lastSent: null,
      lastReceived: null,
      lastError: null,
    };

    if (isBrowser) {
      debugStore = (window as any).__DEBUG_PUSH || debugStore;
    }
    setDebugData(debugStore);

    const getDiagnostics = async () => {
      if (!isBrowser) return;
      const ua = String(window.navigator.userAgent || '');
      const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (window.navigator as any).standalone === true;
      const isAndroid = /Android/i.test(ua);
      const isNative = !!(window as any).Capacitor?.isNative;
      
      const diag = {
        timestamp: new Date().toLocaleString('pt-BR'),
        serviceWorkerSupported: 'serviceWorker' in navigator,
        visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'N/A',
        standalone,
        isAndroid,
        isNative,
      };
      
      setDiagnostics(diag);
      
      // Tentar obter o token salvo no store
      const token = (window as any).__DEBUG_PUSH?.fcmToken;
      if (token) {
        setFcmToken(token);
      }
    };
    
    getDiagnostics();
  };

  useEffect(() => {
    refreshDebugData();
    const interval = setInterval(refreshDebugData, 2500);
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

  const getBadgeColor = (status: string | boolean | undefined) => {
    if (typeof status === 'boolean') return status ? '#10b981' : '#ef4444';
    const s = (status || '').toLowerCase();
    if (s === 'granted' || s === 'ok' || s === 'sim' || s === 'true') return '#10b981';
    if (s === 'denied' || s === 'false') return '#ef4444';
    if (s === 'default' || s === 'não') return '#f59e0b';
    return '#6b7280';
  };

  const getBadgeText = (status: string | boolean | undefined, trueText = 'OK', falseText = 'FALHA') => {
    if (typeof status === 'boolean') return status ? trueText : falseText;
    if (!status) return 'N/A';
    const s = status.toLowerCase();
    if (s === 'granted') return 'Permitido';
    if (s === 'denied') return 'Negado';
    if (s === 'default') return 'Padrão';
    return status;
  };

  const getLogTypeColor = (type: string) => {
    const t = type.toUpperCase();
    if (t.includes('ERROR')) return '#ef4444';
    if (t.includes('WARN') || t.includes('AVISO')) return '#f59e0b';
    if (t.includes('SUCCESS') || t.includes('SUCESSO')) return '#10b981';
    return '#3b82f6';
  };

  const testLocalNotification = async () => {
    try {
      Taro.showToast({ title: 'Use FCM para testar', icon: 'none' });
    } catch (error) {
      Taro.showToast({ title: `Erro: ${(error as Error).message}`, icon: 'none' });
    }
  };

  const requestNotificationPermission = async () => {
    try {
      const isBrowser = typeof window !== 'undefined';
      if (isBrowser) {
        const isNative = !!(window as any).Capacitor?.isNative;
        if (isNative) {
          Taro.showToast({ title: 'Permissão já solicitada', icon: 'none' });
        } else {
          Taro.showToast({ title: 'Notificações web não suportadas', icon: 'none' });
        }
      } else {
        Taro.showToast({ title: 'Permissão já solicitada', icon: 'none' });
      }
    } catch (error) {
      Taro.showToast({ title: `Erro: ${(error as Error).message}`, icon: 'none' });
    }
  };

  const testCloudPush = async () => {
    try {
      Taro.showToast({ title: 'Use Firebase Console para enviar', icon: 'none' });
    } catch (error) {
      Taro.showToast({ title: `Erro: ${(error as Error).message}`, icon: 'none' });
    }
  };

  const reloadServiceWorker = async () => {
    try {
      Taro.showToast({ title: 'Service Workers não usados', icon: 'none' });
    } catch (error) {
      Taro.showToast({ title: `Erro: ${(error as Error).message}`, icon: 'none' });
    }
  };

  const resetOneSignal = async () => {
    try {
      Taro.showToast({ title: 'OneSignal não usado', icon: 'none' });
    } catch (error) {
      Taro.showToast({ title: `Erro: ${(error as Error).message}`, icon: 'none' });
    }
  };

  const copyFcmToken = async () => {
    if (!fcmToken) {
      Taro.showToast({ title: 'Token FCM não encontrado', icon: 'none' });
      return;
    }
    try {
      const isBrowser = typeof navigator !== 'undefined' && 'clipboard' in navigator;
      if (isBrowser) {
        await navigator.clipboard.writeText(fcmToken);
        Taro.showToast({ title: 'Token FCM copiado!', icon: 'success' });
      } else {
        Taro.showToast({ title: 'Não foi possível copiar o token', icon: 'none' });
      }
    } catch (error) {
      Taro.showToast({ title: 'Erro ao copiar', icon: 'none' });
    }
  };

  const testVibration = () => {
    const isBrowser = typeof navigator !== 'undefined';
    if (isBrowser && 'vibrate' in navigator) {
      (navigator as any).vibrate([200, 100, 200, 100, 200]);
      Taro.showToast({ title: 'Vibração ativada!', icon: 'success' });
    } else {
      Taro.showToast({ title: 'Vibração não suportada', icon: 'none' });
    }
  };

  const testSound = () => {
    try {
      const isBrowser = typeof window !== 'undefined' && 'Audio' in window;
      if (isBrowser) {
        const audio = new (window as any).Audio('data:audio/wav;base64,UklGRigBAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
        audio.play().catch((e) => {
          Taro.showToast({ title: 'Erro ao tocar som', icon: 'none' });
        });
        Taro.showToast({ title: 'Tentando reproduzir som...', icon: 'none' });
      } else {
        Taro.showToast({ title: 'Som não suportado', icon: 'none' });
      }
    } catch (error) {
      Taro.showToast({ title: 'Erro ao testar som', icon: 'none' });
    }
  };

  const clearLogs = () => {
    try {
      const isBrowser = typeof window !== 'undefined';
      if (isBrowser) {
        (window as any).__DEBUG_PUSH = { logs: [], lastSent: null, lastReceived: null, lastError: null };
      }
      refreshDebugData();
      Taro.showToast({ title: 'Logs limpos!', icon: 'success' });
    } catch (e) {
      Taro.showToast({ title: 'Erro ao limpar logs', icon: 'none' });
    }
  };

  const Badge = ({ label, status, color }: { label: string; status: string | boolean; color?: string }) => {
    const badgeColor = color || getBadgeColor(status);
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
          {getBadgeText(status)}
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

  return (
    <ScrollView style={{ flex: 1, padding: '16px', backgroundColor: '#f8fafc' }}>
      <View style={{ marginBottom: '24px' }}>
        <Text style={{ fontSize: '24px', fontWeight: '800', color: '#111827', marginBottom: '4px' }}>
          📊 Dashboard de Notificações
        </Text>
        <Text style={{ fontSize: '14px', color: '#6b7280' }}>
          Gabi Manicure - Capacitor FCM Push
        </Text>
      </View>

      <Card title="Status do Sistema" icon="🖥️">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '12px' }}>
          <Badge label="App Nativo" status={diagnostics.isNative} />
          <Badge label="Android" status={diagnostics.isAndroid} />
          <Badge label="PWA" status={diagnostics.standalone} />
        </View>
      </Card>

      <Card title="Dispositivo e Push Info" icon="📱">
        <View style={{ gap: '12px' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>Token FCM</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
              <Text style={{ fontSize: '13px', color: '#374151', fontFamily: 'monospace' }} selectable>
                {fcmToken ? `${fcmToken.substring(0, 12)}...` : 'Carregando...'}
              </Text>
              {fcmToken && <Button onClick={copyFcmToken} style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#e0e7ff', color: '#4338ca', border: 'none', borderRadius: '6px' }}>📋</Button>}
            </View>
          </View>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>Atualizado em</Text>
            <Text style={{ fontSize: '13px', color: '#374151', fontWeight: '500' }}>
              {diagnostics.timestamp}
            </Text>
          </View>
        </View>
      </Card>

      <Card title="Botões de Ação" icon="🧪">
        <View style={{ gap: '10px' }}>
          <View style={{ flexDirection: 'row', gap: '10px' }}>
            <ActionButton onClick={requestNotificationPermission}>🔑 Permissão</ActionButton>
            <ActionButton onClick={testLocalNotification}>🔔 Local</ActionButton>
          </View>
          <View style={{ flexDirection: 'row', gap: '10px' }}>
            <ActionButton onClick={testCloudPush} variant="primary">🌐 Cloud FCM</ActionButton>
            <ActionButton onClick={copyFcmToken}>📋 Copiar Token</ActionButton>
          </View>
          <View style={{ flexDirection: 'row', gap: '10px' }}>
            <ActionButton onClick={testVibration}>🧪 Vibração</ActionButton>
            <ActionButton onClick={testSound}>🔊 Som</ActionButton>
          </View>
          <View style={{ flexDirection: 'row', gap: '10px' }}>
            <ActionButton onClick={reloadServiceWorker}>🔄 SW</ActionButton>
            <ActionButton onClick={resetOneSignal}>🔁 Reset</ActionButton>
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
          <Button onClick={clearLogs} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', backgroundColor: '#fef2f2', color: '#ef4444', border: 'none' }}>
            Limpar
          </Button>
        </View>

        <View style={{ gap: '12px' }}>
          {filteredLogs.length === 0 ? (
            <Text style={{ fontSize: '13px', color: '#9ca3af', textAlign: 'center', padding: '20px' }}>
              Nenhum log encontrado
            </Text>
          ) : (
            filteredLogs.map((log, index) => (
              <View 
                key={index} 
                style={{ 
                  borderLeftWidth: '3px', 
                  borderLeftColor: getLogTypeColor(log.type), 
                  borderLeftStyle: 'solid',
                  padding: '12px 16px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '0 10px 10px 0'
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <Text style={{ fontSize: '12px', fontWeight: '700', color: getLogTypeColor(log.type) }}>
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
            ))
          )}
        </View>
      </Card>

      <View style={{ height: '40px' }} />
    </ScrollView>
  );
};

export default DashboardPage;
