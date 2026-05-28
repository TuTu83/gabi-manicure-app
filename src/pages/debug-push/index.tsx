import React, { useEffect, useState } from 'react';
import { View, Text, Button, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { sendOneSignalNotification } from '../../services/oneSignalService';

const DebugPushPage: React.FC = () => {
  const [debugData, setDebugData] = useState<any>({
    logs: [],
    lastSent: null,
    lastReceived: null,
    lastError: null,
  });
  const [diagnostics, setDiagnostics] = useState<any>({});
  const [playerId, setPlayerId] = useState<string | null>(null);

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
      
      const diag = {
        timestamp: new Date().toISOString(),
        notificationPermission: Notification?.permission,
        serviceWorkerSupported: 'serviceWorker' in navigator,
        pushManagerSupported: 'PushManager' in window,
        visibilityState: document.visibilityState,
        standalone,
        isAndroid,
        isChrome,
        oneSignalInitialized: !!((window as any).OneSignal),
      };
      
      setDiagnostics(diag);
      
      // Try to get player ID
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
    const interval = setInterval(refreshDebugData, 2000);
    return () => clearInterval(interval);
  }, []);

  const testLocalNotification = async () => {
    try {
      if (Notification?.permission !== 'granted') {
        const perm = await Notification.requestPermission();
        alert(`Permissão: ${perm}`);
      }
      
      if (Notification?.permission === 'granted') {
        const notification = new Notification('Teste Local', {
          body: 'Esta é uma notificação local de teste',
          icon: '/icon.svg',
        });
        notification.onclick = () => console.log('Notificação clicada');
        alert('Notificação local enviada!');
      }
    } catch (error) {
      alert(`Erro na notificação local: ${(error as Error).message}`);
    }
  };

  const requestNotificationPermission = async () => {
    try {
      if (!('Notification' in window)) {
        alert('Notificações não são suportadas neste navegador');
        return;
      }
      
      const permission = await Notification.requestPermission();
      alert(`Resultado da permissão: ${permission}`);
      refreshDebugData();
    } catch (error) {
      alert(`Erro ao solicitar permissão: ${(error as Error).message}`);
    }
  };

  const testCloudPush = async () => {
    if (!playerId) {
      alert('Player ID não encontrado! Certifique-se de que o OneSignal está inicializado.');
      return;
    }

    const success = await sendOneSignalNotification({
      title: 'Teste Push Cloud',
      body: 'Esta é uma notificação push cloud do OneSignal!',
      playerIds: [playerId],
      data: { teste: true, timestamp: Date.now() },
    });

    if (success) {
      alert('Push cloud enviado com sucesso! Verifique a notificação.');
    } else {
      alert('Falha ao enviar push cloud! Verifique o console para detalhes.');
    }
  };

  const reloadServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) {
      alert('ServiceWorker não suportado');
      return;
    }
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
      alert('Service Workers desregistrados! Recarregue a página.');
    } catch (error) {
      alert('Erro ao recarregar SW: ' + (error as Error).message);
    }
  };

  const resetOneSignal = async () => {
    const OneSignal = (window as any).OneSignal;
    if (!OneSignal) {
      alert('OneSignal não inicializado');
      return;
    }
    try {
      await OneSignal.setSubscription(false);
      await new Promise((r) => setTimeout(r, 1000));
      await OneSignal.setSubscription(true);
      alert('OneSignal resetado!');
      refreshDebugData();
    } catch (error) {
      alert('Erro no reset: ' + (error as Error).message);
    }
  };

  const showTokens = async () => {
    const OneSignal = (window as any).OneSignal;
    let info = {};
    if (OneSignal) {
      info = {
        playerId: await OneSignal.getUserId(),
        onesignalId: OneSignal.User?.onesignalId,
        subscriptionId: OneSignal.User?.PushSubscription?.id,
      };
    }
    alert('Tokens:\n' + JSON.stringify(info, null, 2));
  };

  const testVibration = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200]);
      alert('Vibração ativada!');
    } else {
      alert('Vibração não suportada');
    }
  };

  const testSound = () => {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRigBAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
      audio.play().catch((e) => {
        alert('Erro ao tocar som: ' + e.message);
      });
      alert('Tentando reproduzir som de teste...');
    } catch (error) {
      alert('Erro ao testar som: ' + (error as Error).message);
    }
  };

  const clearLogs = () => {
    (window as any).__DEBUG_PUSH = { logs: [], lastSent: null, lastReceived: null, lastError: null };
    refreshDebugData();
  };

  return (
    <ScrollView style={{ flex: 1, padding: '16px', backgroundColor: '#f5f5f5' }}>
      <View style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '12px', marginBottom: '16px', borderBottomWidth: '1px', borderBottomColor: '#e0e0e0' }}>
        <Text style={{ fontSize: '22px', fontWeight: 'bold', color: '#333', marginBottom: '4px' }}>🔧 Push Debug Panel</Text>
        <Text style={{ fontSize: '14px', color: '#666' }}>Diagnóstico completo de notificações</Text>
      </View>

      <View style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
        <Text style={{ fontSize: '16px', fontWeight: 'bold', color: '#333', marginBottom: '12px' }}>📊 Diagnóstico Rápido</Text>
        
        <View style={{ marginBottom: '8px', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Text style={{ fontSize: '14px', color: '#555', fontWeight: '500' }}>Notification Permission:</Text>
          <Text style={[
            { fontSize: '14px', color: '#333', maxWidth: '60%', textAlign: 'right' },
            diagnostics.notificationPermission === 'granted' ? { color: '#2ecc71', fontWeight: 'bold' } :
            diagnostics.notificationPermission === 'denied' ? { color: '#e74c3c', fontWeight: 'bold' } :
            { color: '#f39c12', fontWeight: 'bold' }
          ]}>
            {diagnostics.notificationPermission || 'N/A'}
          </Text>
        </View>
        
        <View style={{ marginBottom: '8px', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Text style={{ fontSize: '14px', color: '#555', fontWeight: '500' }}>Service Worker:</Text>
          <Text style={[
            { fontSize: '14px', color: '#333', maxWidth: '60%', textAlign: 'right' },
            diagnostics.serviceWorkerSupported ? { color: '#2ecc71', fontWeight: 'bold' } : { color: '#e74c3c', fontWeight: 'bold' }
          ]}>
            {diagnostics.serviceWorkerSupported ? '✅ OK' : '❌ Falha'}
          </Text>
        </View>
        
        <View style={{ marginBottom: '8px', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Text style={{ fontSize: '14px', color: '#555', fontWeight: '500' }}>Push Manager:</Text>
          <Text style={[
            { fontSize: '14px', color: '#333', maxWidth: '60%', textAlign: 'right' },
            diagnostics.pushManagerSupported ? { color: '#2ecc71', fontWeight: 'bold' } : { color: '#e74c3c', fontWeight: 'bold' }
          ]}>
            {diagnostics.pushManagerSupported ? '✅ OK' : '❌ Falha'}
          </Text>
        </View>
        
        <View style={{ marginBottom: '8px', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Text style={{ fontSize: '14px', color: '#555', fontWeight: '500' }}>Standalone PWA:</Text>
          <Text style={[
            { fontSize: '14px', color: '#333', maxWidth: '60%', textAlign: 'right' },
            diagnostics.standalone ? { color: '#2ecc71', fontWeight: 'bold' } : { color: '#f39c12', fontWeight: 'bold' }
          ]}>
            {diagnostics.standalone ? '✅ Sim' : '⚠️ Não'}
          </Text>
        </View>
        
        <View style={{ marginBottom: '8px', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Text style={{ fontSize: '14px', color: '#555', fontWeight: '500' }}>Player ID:</Text>
          <Text style={{ fontSize: '14px', color: '#333', maxWidth: '60%', textAlign: 'right' }} selectable>
            {playerId || 'Loading...'}
          </Text>
        </View>
      </View>

      <View style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
        <Text style={{ fontSize: '16px', fontWeight: 'bold', color: '#333', marginBottom: '12px' }}>🧪 Botões de Teste</Text>
        
        <View style={{ marginBottom: '8px', gap: '8px', flexDirection: 'row' }}>
          <Button onClick={requestNotificationPermission}>Solicitar Permissão</Button>
          <Button onClick={testLocalNotification}>Testar Local</Button>
        </View>
        
        <View style={{ marginBottom: '8px', gap: '8px', flexDirection: 'row' }}>
          <Button onClick={testCloudPush}>Testar Cloud</Button>
          <Button onClick={testVibration}>Testar Vibração</Button>
        </View>
        
        <View style={{ marginBottom: '8px', gap: '8px', flexDirection: 'row' }}>
          <Button onClick={testSound}>Testar Som</Button>
          <Button onClick={showTokens}>Mostrar Tokens</Button>
        </View>
        
        <View style={{ marginBottom: '8px', gap: '8px', flexDirection: 'row' }}>
          <Button onClick={reloadServiceWorker}>Recarregar SW</Button>
          <Button onClick={resetOneSignal}>Reset OneSignal</Button>
        </View>
        
        <View style={{ gap: '8px', flexDirection: 'row' }}>
          <Button onClick={refreshDebugData}>Atualizar</Button>
          <Button onClick={clearLogs} style={{ backgroundColor: '#e74c3c', color: '#fff', padding: '12px', borderRadius: '8px' }}>Limpar Logs</Button>
        </View>
      </View>

      {debugData.lastError && (
        <View style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
          <Text style={{ fontSize: '16px', fontWeight: 'bold', color: '#e74c3c', marginBottom: '12px' }}>❌ Último Erro</Text>
          <Text style={{ fontSize: '11px', color: '#666', fontFamily: 'monospace', wordBreak: 'break-all' }} selectable>
            {JSON.stringify(debugData.lastError, null, 2)}
          </Text>
        </View>
      )}

      {debugData.lastSent && (
        <View style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
          <Text style={{ fontSize: '16px', fontWeight: 'bold', color: '#2ecc71', marginBottom: '12px' }}>📤 Último Push Enviado</Text>
          <Text style={{ fontSize: '11px', color: '#666', fontFamily: 'monospace', wordBreak: 'break-all' }} selectable>
            {JSON.stringify(debugData.lastSent, null, 2)}
          </Text>
        </View>
      )}

      {debugData.lastReceived && (
        <View style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
          <Text style={{ fontSize: '16px', fontWeight: 'bold', color: '#2ecc71', marginBottom: '12px' }}>📥 Último Push Recebido</Text>
          <Text style={{ fontSize: '11px', color: '#666', fontFamily: 'monospace', wordBreak: 'break-all' }} selectable>
            {JSON.stringify(debugData.lastReceived, null, 2)}
          </Text>
        </View>
      )}

      <View style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '12px' }}>
        <Text style={{ fontSize: '16px', fontWeight: 'bold', color: '#333', marginBottom: '12px' }}>📜 Logs ({debugData.logs?.length || 0})</Text>
        {debugData.logs?.slice().reverse().map((log: any, index: number) => (
          <View key={index} style={{ borderLeftWidth: '3px', borderLeftColor: log.type.includes('ERROR') ? '#e74c3c' : log.type.includes('AVISO') ? '#f39c12' : log.type.includes('SUCESSO') ? '#2ecc71' : '#ddd', borderLeftStyle: 'solid', paddingLeft: '12px', marginBottom: '12px' }}>
            <Text style={{ fontSize: '12px', fontWeight: 'bold', color: '#888', marginBottom: '4px' }}>[{log.type}]</Text>
            <Text style={{ fontSize: '13px', color: '#444', marginBottom: '4px' }}>{log.message}</Text>
            {log.data && (
              <Text style={{ fontSize: '11px', color: '#666', fontFamily: 'monospace', wordBreak: 'break-all' }} selectable>
                {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : String(log.data)}
              </Text>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

export default DebugPushPage;
