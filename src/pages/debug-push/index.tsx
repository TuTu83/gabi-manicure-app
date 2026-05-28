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

  const refreshDebugData = () => {
    const debugStore = (window as any).__DEBUG_PUSH || {
      logs: [],
      lastSent: null,
      lastReceived: null,
      lastError: null,
    };
    setDebugData(debugStore);

    const getDiagnostics = () => {
      const ua = String(window.navigator.userAgent || '');
      const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (window.navigator as any).standalone === true;
      const isAndroid = /Android/i.test(ua);
      const isChrome = /Chrome|CriOS/i.test(ua);
      
      return {
        timestamp: new Date().toISOString(),
        notificationPermission: Notification?.permission,
        serviceWorkerSupported: 'serviceWorker' in navigator,
        pushManagerSupported: 'PushManager' in window,
        visibilityState: document.visibilityState,
        standalone,
        isAndroid,
        isChrome,
        oneSignalInitialized: !!((window as any).OneSignal),
        playerId: 'Loading...',
      };
    };
    setDiagnostics(getDiagnostics());

    const OneSignal = (window as any).OneSignal;
    if (OneSignal && OneSignal.getUserId) {
      OneSignal.getUserId().then((id: string) => {
        setDiagnostics((prev: any) => ({ ...prev, playerId: id || 'Not set' }));
      }).catch(() => {
        setDiagnostics((prev: any) => ({ ...prev, playerId: 'Error getting ID' }));
      });
    }
  };

  useEffect(() => {
    refreshDebugData();
    const interval = setInterval(refreshDebugData, 1000);
    return () => clearInterval(interval);
  }, []);

  const testLocalNotification = async () => {
    try {
      if (Notification?.permission !== 'granted') {
        await Notification.requestPermission();
      }
      const notification = new Notification('Teste Local', {
        body: 'Esta é uma notificação local de teste',
        icon: '/icon.svg',
      });
      notification.onclick = () => console.log('Notificação clicada');
    } catch (error) {
      console.error('Erro na notificação local:', error);
    }
  };

  const testCloudPush = async () => {
    const OneSignal = (window as any).OneSignal;
    let playerId = null;
    if (OneSignal && OneSignal.getUserId) {
      playerId = await OneSignal.getUserId();
    }
    
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
    } else {
      alert('Vibração não suportada');
    }
  };

  const testSound = () => {
    const audio = new Audio('data:audio/wav;base64,UklGRigBAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    audio.play().catch((e) => console.error('Erro no som:', e));
    alert('Tentando reproduzir som de teste...');
  };

  const clearLogs = () => {
    (window as any).__DEBUG_PUSH = { logs: [], lastSent: null, lastReceived: null, lastError: null };
    refreshDebugData();
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🔧 Push Debug Panel</Text>
        <Text style={styles.subtitle}>Diagnóstico completo de notificações</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📊 Diagnóstico Rápido</Text>
        <View style={styles.diagnosticItem}>
          <Text style={styles.label}>Notification Permission:</Text>
          <Text style={[styles.value, diagnostics.notificationPermission === 'granted' ? styles.success : styles.error]}>
            {diagnostics.notificationPermission || 'N/A'}
          </Text>
        </View>
        <View style={styles.diagnosticItem}>
          <Text style={styles.label}>Service Worker:</Text>
          <Text style={[styles.value, diagnostics.serviceWorkerSupported ? styles.success : styles.error]}>
            {diagnostics.serviceWorkerSupported ? '✅ OK' : '❌ Falha'}
          </Text>
        </View>
        <View style={styles.diagnosticItem}>
          <Text style={styles.label}>Push Manager:</Text>
          <Text style={[styles.value, diagnostics.pushManagerSupported ? styles.success : styles.error]}>
            {diagnostics.pushManagerSupported ? '✅ OK' : '❌ Falha'}
          </Text>
        </View>
        <View style={styles.diagnosticItem}>
          <Text style={styles.label}>Standalone PWA:</Text>
          <Text style={[styles.value, diagnostics.standalone ? styles.success : styles.warning]}>
            {diagnostics.standalone ? '✅ Sim' : '⚠️ Não'}
          </Text>
        </View>
        <View style={styles.diagnosticItem}>
          <Text style={styles.label}>Player ID:</Text>
          <Text style={styles.value} selectable>
            {diagnostics.playerId}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🧪 Botões de Teste</Text>
        <View style={styles.buttonRow}>
          <Button onClick={testLocalNotification}>
            Testar Local
          </Button>
          <Button onClick={testCloudPush}>
            Testar Cloud
          </Button>
        </View>
        <View style={styles.buttonRow}>
          <Button onClick={testVibration}>
            Testar Vibração
          </Button>
          <Button onClick={testSound}>
            Testar Som
          </Button>
        </View>
        <View style={styles.buttonRow}>
          <Button onClick={showTokens}>
            Mostrar Tokens
          </Button>
          <Button onClick={reloadServiceWorker}>
            Recarregar SW
          </Button>
        </View>
        <View style={styles.buttonRow}>
          <Button onClick={resetOneSignal}>
            Reset OneSignal
          </Button>
          <Button onClick={refreshDebugData}>
            Atualizar
          </Button>
        </View>
        <Button onClick={clearLogs} style={styles.fullButton}>
          Limpar Logs
        </Button>
      </View>

      {debugData.lastError && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.errorTitle]}>❌ Último Erro</Text>
          <Text style={styles.logText} selectable>
            {JSON.stringify(debugData.lastError, null, 2)}
          </Text>
        </View>
      )}

      {debugData.lastSent && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.successTitle]}>📤 Último Push Enviado</Text>
          <Text style={styles.logText} selectable>
            {JSON.stringify(debugData.lastSent, null, 2)}
          </Text>
        </View>
      )}

      {debugData.lastReceived && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.successTitle]}>📥 Último Push Recebido</Text>
          <Text style={styles.logText} selectable>
            {JSON.stringify(debugData.lastReceived, null, 2)}
          </Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📜 Logs ({debugData.logs?.length || 0})</Text>
        {debugData.logs?.slice().reverse().map((log: any, index: number) => (
          <View key={index} style={styles.logItem}>
            <Text style={[styles.logType,
              log.type.includes('ERROR') ? styles.errorType :
              log.type.includes('AVISO') ? styles.warningType :
              log.type.includes('SUCESSO') ? styles.successType : null]}>
              [{log.type}]
            </Text>
            <Text style={styles.logMessage}>{log.message}</Text>
            {log.data && (
              <Text style={styles.logData} selectable>
                {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : String(log.data)}
              </Text>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

const styles: any = {
  container: {
    flex: 1,
    padding: '16px',
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '12px',
    marginBottom: '16px',
    borderBottomWidth: '1px',
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: '22px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#666',
  },
  section: {
    backgroundColor: '#fff',
    padding: '16px',
    borderRadius: '12px',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '12px',
  },
  successTitle: {
    color: '#2ecc71',
  },
  errorTitle: {
    color: '#e74c3c',
  },
  diagnosticItem: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '8px',
    flexWrap: 'wrap',
  },
  label: {
    fontSize: '14px',
    color: '#555',
    fontWeight: '500',
  },
  value: {
    fontSize: '14px',
    color: '#333',
    maxWidth: '60%',
    textAlign: 'right',
  },
  success: {
    color: '#2ecc71',
    fontWeight: 'bold',
  },
  warning: {
    color: '#f39c12',
    fontWeight: 'bold',
  },
  error: {
    color: '#e74c3c',
    fontWeight: 'bold',
  },
  buttonRow: {
    display: 'flex',
    flexDirection: 'row',
    gap: '8px',
    marginBottom: '8px',
  },
  button: {
    flex: 1,
    backgroundColor: '#3498db',
    color: '#fff',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '13px',
  },
  fullButton: {
    backgroundColor: '#e74c3c',
    color: '#fff',
    padding: '12px',
    borderRadius: '8px',
    width: '100%',
  },
  logItem: {
    borderLeftWidth: '3px',
    borderLeftColor: '#ddd',
    borderLeftStyle: 'solid',
    paddingLeft: '12px',
    marginBottom: '12px',
  },
  logType: {
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#888',
    marginBottom: '4px',
  },
  errorType: {
    color: '#e74c3c',
  },
  warningType: {
    color: '#f39c12',
  },
  successType: {
    color: '#2ecc71',
  },
  logMessage: {
    fontSize: '13px',
    color: '#444',
    marginBottom: '4px',
  },
  logData: {
    fontSize: '11px',
    color: '#666',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
  },
  logText: {
    fontSize: '11px',
    color: '#666',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
  },
};

export default DebugPushPage;
