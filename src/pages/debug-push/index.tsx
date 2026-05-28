import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, Button, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { sendOneSignalNotification } from '../../services/oneSignalService';

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
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<LogType | 'ALL'>('ALL');

  const refreshDebugData = () => {
    const debugStore = (window as any).__DEBUG_PUSH || {
      logs: [],
      lastSent: null,
      lastReceived: null,
      lastError: null,
    };
    setDebugData(debugStore);

    const getDiagnostics = async () => {
      const ua = String(window.navigator.userAgent || '');
      const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (window.navigator as any).standalone === true;
      const isAndroid = /Android/i.test(ua);
      const isChrome = /Chrome|CriOS/i.test(ua);
      const isNative = !!(window as any).Capacitor?.isNative;
      
      const diag = {
        timestamp: new Date().toLocaleString('pt-BR'),
        notificationPermission: Notification?.permission,
        serviceWorkerSupported: 'serviceWorker' in navigator,
        pushManagerSupported: 'PushManager' in window,
        visibilityState: document.visibilityState,
        standalone,
        isAndroid,
        isChrome,
        isNative,
        oneSignalInitialized: !!((window as any).OneSignal),
      };
      
      setDiagnostics(diag);
      
      const OneSignal = (window as any).OneSignal;
      if (OneSignal && OneSignal.getUserId) {
        try {
          const id = await OneSignal.getUserId();
          setPlayerId(id);
        } catch (e) {
          console.error('Error getting player ID:', e);
        }
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

  const getBadgeColor = (status: string | undefined) => {
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
      if (Notification?.permission !== 'granted') {
        const perm = await Notification.requestPermission();
        Taro.showToast({ title: `Permissão: ${perm}`, icon: 'none' });
      }
      
      if (Notification?.permission === 'granted') {
        const notification = new Notification('Teste Local', {
          body: 'Esta é uma notificação local de teste',
          icon: '/icon.svg',
        });
        notification.onclick = () => console.log('Notificação clicada');
        Taro.showToast({ title: 'Notificação enviada!', icon: 'success' });
      }
    } catch (error) {
      Taro.showToast({ title: `Erro: ${(error as Error).message}`, icon: 'none' });
    }
  };

  const requestNotificationPermission = async () => {
    try {
      if (!('Notification' in window)) {
        Taro.showToast({ title: 'Notificações não suportadas', icon: 'none' });
        return;
      }
      
      const permission = await Notification.requestPermission();
      Taro.showToast({ title: `Permissão: ${permission}`, icon: 'none' });
      refreshDebugData();
    } catch (error) {
      Taro.showToast({ title: `Erro: ${(error as Error).message}`, icon: 'none' });
    }
  };

  const testCloudPush = async () => {
    if (!playerId) {
      Taro.showToast({ title: 'Player ID não encontrado!', icon: 'none' });
      return;
    }

    const success = await sendOneSignalNotification({
      title: 'Teste Push Cloud',
      body: 'Esta é uma notificação push cloud do OneSignal!',
      playerIds: [playerId],
      data: { teste: true, timestamp: Date.now() },
    });

    if (success) {
      Taro.showToast({ title: 'Push enviado com sucesso!', icon: 'success' });
    } else {
      Taro.showToast({ title: 'Falha ao enviar push!', icon: 'none' });
    }
  };

  const reloadServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) {
      Taro.showToast({ title: 'ServiceWorker não suportado', icon: 'none' });
      return;
    }
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
      Taro.showToast({ title: 'SW desregistrados!', icon: 'success' });
    } catch (error) {
      Taro.showToast({ title: 'Erro: ' + (error as Error).message, icon: 'none' });
    }
  };

  const resetOneSignal = async () => {
    const OneSignal = (window as any).OneSignal;
    if (!OneSignal) {
      Taro.showToast({ title: 'OneSignal não inicializado', icon: 'none' });
      return;
    }
    try {
      await OneSignal.setSubscription(false);
      await new Promise((r) => setTimeout(r, 1000));
      await OneSignal.setSubscription(true);
      Taro.showToast({ title: 'OneSignal resetado!', icon: 'success' });
      refreshDebugData();
    } catch (error) {
      Taro.showToast({ title: 'Erro: ' + (error as Error).message, icon: 'none' });
    }
  };

  const copyPlayerId = async () => {
    if (!playerId) {
      Taro.showToast({ title: 'Player ID não encontrado', icon: 'none' });
      return;
    }
    try {
      await navigator.clipboard.writeText(playerId);
      Taro.showToast({ title: 'Player ID copiado!', icon: 'success' });
    } catch (error) {
      Taro.showToast({ title: 'Erro ao copiar', icon: 'none' });
    }
  };

  const testVibration = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200]);
      Taro.showToast({ title: 'Vibração ativada!', icon: 'success' });
    } else {
      Taro.showToast({ title: 'Vibração não suportada', icon: 'none' });
    }
  };

  const testSound = () => {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRigBAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
      audio.play().catch((e) => {
        Taro.showToast({ title: 'Erro: ' + e.message, icon: 'none' });
      });
      Taro.showToast({ title: 'Tentando reproduzir som...', icon: 'none' });
    } catch (error) {
      Taro.showToast({ title: 'Erro: ' + (error as Error).message, icon: 'none' });
    }
  };

  const clearLogs = () => {
    (window as any).__DEBUG_PUSH = { logs: [], lastSent: null, lastReceived: null, lastError: null };
    refreshDebugData();
    Taro.showToast({ title: 'Logs limpos!', icon: 'success' });
  };

  const Badge = ({ label, status, color }: { label: string; status: string | boolean; color?: string }) => {
    const badgeColor = color || getBadgeColor(typeof status === 'string' ? status : status ? 'ok' : 'failed');
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
          Gabi Manicure • Painel de Controle
        </Text>
      </View>

      <Card title="Status do Sistema" icon="🖥️">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '12px' }}>
          <Badge label="Push Permitido" status={diagnostics.notificationPermission} />
          <Badge label="Service Worker" status={diagnostics.serviceWorkerSupported} />
          <Badge label="Push Manager" status={diagnostics.pushManagerSupported} />
          <Badge label="App Nativo" status={diagnostics.isNative} />
        </View>
      </Card>

      <Card title="Dispositivo e Push Info" icon="📱">
        <View style={{ gap: '12px' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>Player ID</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
              <Text style={{ fontSize: '13px', color: '#374151', fontFamily: 'monospace' }} selectable>
                {playerId ? `${playerId.substring(0, 12)}...` : 'Carregando...'}
              </Text>
              {playerId && <Button onClick={copyPlayerId} style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#e0e7ff', color: '#4338ca', border: 'none', borderRadius: '6px' }}>📋</Button>}
            </View>
          </View>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>Android</Text>
            <Text style={{ fontSize: '13px', color: '#374151', fontWeight: '500' }}>
              {diagnostics.isAndroid ? '✅ Sim' : '❌ Não'}
            </Text>
          </View>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>Chrome</Text>
            <Text style={{ fontSize: '13px', color: '#374151', fontWeight: '500' }}>
              {diagnostics.isChrome ? '✅ Sim' : '❌ Não'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>PWA</Text>
            <Text style={{ fontSize: '13px', color: '#374151', fontWeight: '500' }}>
              {diagnostics.standalone ? '✅ Standalone' : '⚠️ Navegador'}
            </Text>
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
            <ActionButton onClick={requestNotificationPermission}>🔑 Permitir</ActionButton>
            <ActionButton onClick={testLocalNotification}>🔔 Local</ActionButton>
          </View>
          <View style={{ flexDirection: 'row', gap: '10px' }}>
            <ActionButton onClick={testCloudPush} variant="primary">🌐 Cloud</ActionButton>
            <ActionButton onClick={copyPlayerId}>📋 Copiar ID</ActionButton>
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

      {debugData.lastSent && (
        <Card title="Última Notificação Enviada" icon="📤">
          <View style={{ 
            backgroundColor: '#eff6ff', 
            border: '1px solid #bfdbfe', 
            borderRadius: '10px', 
            padding: '14px' 
          }}>
            <Text style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>Payload:</Text>
            <Text style={{ fontSize: '11px', color: '#1e40af', fontFamily: 'monospace', wordBreak: 'break-all' }} selectable>
              {typeof debugData.lastSent === 'object' ? JSON.stringify(debugData.lastSent, null, 2) : String(debugData.lastSent)}
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
