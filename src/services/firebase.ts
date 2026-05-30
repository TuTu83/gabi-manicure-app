import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';

declare const __GM_FIREBASE_ENV__: any;
declare const __GM_FIREBASE_DEBUG__: any;

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
  vapidKey?: string;
}

export function removeUndefinedFields<T>(value: T): T {
  if (value === undefined) return undefined as any;
  if (value === null) return value;
  if (Array.isArray(value)) {
    return value.map((v) => removeUndefinedFields(v)) as any;
  }
  if (typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      if (v === undefined) continue;
      out[k] = removeUndefinedFields(v);
    }
    return out;
  }
  return value;
}

// Diagnostic export to see the full injected env
export function getDiagnosticFirebaseConfig(): Record<string, string> {
  const rawEnv = readInjectedEnv();
  const diagnosticConfig: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawEnv)) {
    diagnosticConfig[key] = maskValue(value);
  }
  return diagnosticConfig;
}

function isFirebaseDebugEnabled(): boolean {
  try {
    if (typeof __GM_FIREBASE_DEBUG__ !== 'undefined' && String(__GM_FIREBASE_DEBUG__ || '') === '1') return true;
  } catch {}
  try {
    const loc = (globalThis as any).location as Location | undefined;
    const search = String(loc?.search || '');
    const hash = String(loc?.hash || '');
    return search.includes('firebaseDebug=1') || hash.includes('firebaseDebug=1');
  } catch {
    return false;
  }
}

function readInjectedEnv(): Record<string, string> {
  try {
    // Prefer compile-time injected env
    try {
      if (typeof __GM_FIREBASE_ENV__ !== 'undefined') return (__GM_FIREBASE_ENV__ as any) || {};
    } catch {}

    // Fallback: allow a runtime global to be set (e.g. window.__GM_FIREBASE_ENV__)
    try {
      const runtime = (globalThis as any).__GM_FIREBASE_ENV__;
      if (runtime && typeof runtime === 'object') return runtime as Record<string, string>;
    } catch {}

    return {};
  } catch {
    return {};
  }
}

function readEnvValue(key: string): string {
  const env = readInjectedEnv();
  const raw = String(env[key] || '');
  return raw.trim();
}

export const firebaseConfig: FirebaseClientConfig = {
  apiKey: readEnvValue('apiKey'),
  authDomain: readEnvValue('authDomain'),
  projectId: readEnvValue('projectId'),
  appId: readEnvValue('appId'),
  storageBucket: readEnvValue('storageBucket'),
  messagingSenderId: readEnvValue('messagingSenderId'),
  measurementId: readEnvValue('measurementId'),
  vapidKey: readEnvValue('vapidKey'),
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}

function maskValue(value: string): string {
  const v = String(value || '').trim();
  if (!v) return '';
  const suffix = v.length <= 4 ? v : v.slice(-4);
  return `***${suffix} (len=${v.length})`;
}

function logFirebaseEnvStatus(): void {
  if (!isFirebaseDebugEnabled()) return;
  const apiKey = readEnvValue('apiKey');
  const authDomain = readEnvValue('authDomain');
  const projectId = readEnvValue('projectId');
  const storageBucket = readEnvValue('storageBucket');
  const messagingSenderId = readEnvValue('messagingSenderId');
  const appId = readEnvValue('appId');
  const measurementId = readEnvValue('measurementId');

  console.log('[FIREBASE ENV]', {
    apiKey: maskValue(apiKey),
    authDomain: authDomain ? authDomain : '',
    projectId: projectId ? projectId : '',
    storageBucket: storageBucket ? storageBucket : '',
    messagingSenderId: maskValue(messagingSenderId),
    appId: maskValue(appId),
    measurementId: maskValue(measurementId),
  });

  const required: Array<[string, string]> = [
    ['apiKey', apiKey],
    ['authDomain', authDomain],
    ['projectId', projectId],
    ['appId', appId],
  ];
  for (const [name, value] of required) {
    if (!String(value || '').trim()) console.error('[FIREBASE ERROR] variável faltando:', name);
  }
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let messaging: Messaging | null = null;
let loggedInit = false;
let persistenceSet = false;

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  try {
    if (!loggedInit) {
      loggedInit = true;
      logFirebaseEnvStatus();
      // Log FULL firebaseConfig (masked) BEFORE initializeApp()
      console.log('[FIREBASE] firebaseConfig completo (masked)', {
        apiKey: maskValue(firebaseConfig.apiKey),
        authDomain: firebaseConfig.authDomain,
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket,
        messagingSenderId: maskValue(firebaseConfig.messagingSenderId || ''),
        appId: maskValue(firebaseConfig.appId),
        measurementId: maskValue(firebaseConfig.measurementId || ''),
        vapidKey: maskValue(firebaseConfig.vapidKey || ''),
      });
      // Log raw __GM_FIREBASE_ENV__
      console.log('[FIREBASE] __GM_FIREBASE_ENV__ (masked)', getDiagnosticFirebaseConfig());
    }
    if (app) return app;
    const apps = getApps();
    if (isFirebaseDebugEnabled()) console.log('[FIREBASE] getApps()', { count: apps.length });
    console.log('[FIREBASE] calling initializeApp() with firebaseConfig:', {
      ...firebaseConfig,
      apiKey: maskValue(firebaseConfig.apiKey),
      appId: maskValue(firebaseConfig.appId),
      messagingSenderId: maskValue(firebaseConfig.messagingSenderId || ''),
      measurementId: maskValue(firebaseConfig.measurementId || ''),
      vapidKey: maskValue(firebaseConfig.vapidKey || ''),
    });
    app = apps.length ? apps[0] : initializeApp(firebaseConfig);
    console.log('[FIREBASE] app inicializado com sucesso, name:', app.name);
    return app;
  } catch (error) {
    console.error('[FIREBASE INIT ERROR]', error);
    return null;
  }
}

export function getFirebaseAuth(): Auth | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  try {
    if (auth) return auth;
    auth = getAuth(firebaseApp);
    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    if (!persistenceSet && isBrowser) {
      persistenceSet = true;
      setPersistence(auth, browserLocalPersistence).catch((error) => {
        console.error('[Firebase] falha ao configurar persistência', error);
      });
    }
    return auth;
  } catch (error) {
    console.error('[Firebase] falha ao inicializar Auth', error);
    return null;
  }
}

export function getFirebaseDb(): Firestore | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  try {
    if (db) return db;
    db = getFirestore(firebaseApp);
    return db;
  } catch (error) {
    console.error('[Firebase] falha ao inicializar Firestore', error);
    return null;
  }
}

export function getFirebaseStorage(): FirebaseStorage | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  try {
    if (storage) return storage;
    storage = getStorage(firebaseApp);
    return storage;
  } catch (error) {
    console.error('[Firebase] falha ao inicializar Storage', error);
    return null;
  }
}

export function getFirebaseMessaging(): Messaging | null {
  const firebaseApp = getFirebaseApp();
  console.log('[Firebase] getFirebaseMessaging - Passo 1: firebaseApp:', {
    exists: !!firebaseApp,
    name: firebaseApp?.name,
    options: (() => {
      const opts = firebaseApp?.options;
      if (!opts) return null;
      const maskVal = (v: any) => {
        const val = String(v || '');
        if (!val) return '';
        const suffix = val.length <= 4 ? val : val.slice(-4);
        return `***${suffix} (len=${val.length})`;
      };
      return {
        apiKey: maskVal(opts.apiKey),
        authDomain: maskVal(opts.authDomain),
        projectId: maskVal(opts.projectId),
        storageBucket: maskVal(opts.storageBucket),
        messagingSenderId: maskVal(opts.messagingSenderId),
        appId: maskVal(opts.appId),
        measurementId: maskVal(opts.measurementId),
      };
    })(),
  });

  console.log('[Firebase] getFirebaseMessaging - Passo 2: getApps():', getApps().map(app => ({ name: app.name, options: !!app.options })));

  if (!firebaseApp) {
    console.error('[Firebase] Messaging: firebaseApp não disponível');
    if (typeof window !== 'undefined') {
      (window as any).__DEBUG_PUSH__ = (window as any).__DEBUG_PUSH__ || {};
      (window as any).__DEBUG_PUSH__.messagingError = {
        name: 'AppMissingError',
        code: 'firebase-app-missing',
        message: 'Firebase App não está disponível',
        stack: '',
      };
    }
    return null;
  }
  try {
    if (messaging) {
      console.log('[Firebase] Messaging: retornando instância existente');
      return messaging;
    }
    console.log('[Firebase] Messaging: tentando criar nova instância...');
    const instance = getMessaging(firebaseApp);
    console.log('[Firebase] Messaging: instância criada com sucesso', { instance: !!instance });
    messaging = instance;
    if (typeof window !== 'undefined') {
      (window as any).__DEBUG_PUSH__ = (window as any).__DEBUG_PUSH__ || {};
      (window as any).__DEBUG_PUSH__.messagingError = null;
      (window as any).__DEBUG_PUSH__.firebaseSdkStatus = {
        firebaseApp: 'OK',
        getAppsCount: getApps().length,
        messagingInstanceCreated: true,
      };
    }
    return messaging;
  } catch (error: any) {
    console.error('[Firebase] falha ao inicializar Messaging:', {
      errorName: error?.name || 'unknown',
      errorCode: error?.code || 'no-code',
      errorMessage: error?.message || 'sem mensagem',
      errorStack: error?.stack || 'sem stack',
      fullError: JSON.stringify(error, null, 2),
    });
    // Salvar erro para exibição no debug
    if (typeof window !== 'undefined') {
      (window as any).__DEBUG_PUSH__ = (window as any).__DEBUG_PUSH__ || {};
      (window as any).__DEBUG_PUSH__.messagingError = {
        name: error?.name || 'unknown',
        code: error?.code || 'no-code',
        message: error?.message || 'sem mensagem',
        stack: error?.stack || 'sem stack',
      };
    }
    return null;
  }
}

export async function getFcmToken(
  serviceWorkerRegistration?: ServiceWorkerRegistration,
): Promise<string | null> {
  const messaging = getFirebaseMessaging();
  if (!messaging) return null;
  try {
    const vapidKey = readEnvValue('vapidKey');
    const options: any = {};
    if (vapidKey) options.vapidKey = vapidKey;
    if (serviceWorkerRegistration) options.serviceWorkerRegistration = serviceWorkerRegistration;
    const token = await getToken(messaging, options);
    console.log('[FIREBASE FCM] Token obtido', token ? 'sim' : 'não');
    return token;
  } catch (error) {
    console.error('[FIREBASE FCM] falha ao obter token', error);
    return null;
  }
}

export function onFcmMessage(callback: (payload: any) => void): () => void {
  const messaging = getFirebaseMessaging();
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
}
