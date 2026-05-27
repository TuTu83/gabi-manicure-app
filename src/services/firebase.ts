import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

declare const __GM_FIREBASE_ENV__: any;
declare const __GM_FIREBASE_DEBUG__: any;

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
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
    if (typeof __GM_FIREBASE_ENV__ === 'undefined') return {};
    return (__GM_FIREBASE_ENV__ as any) || {};
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
let loggedInit = false;
let persistenceSet = false;

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  try {
    if (!loggedInit) {
      loggedInit = true;
      logFirebaseEnvStatus();
      if (isFirebaseDebugEnabled()) console.log('[FIREBASE] tentando inicializar app...');
    }
    if (app) return app;
    const apps = getApps();
    if (isFirebaseDebugEnabled()) console.log('[FIREBASE] getApps()', { count: apps.length });
    app = apps.length ? apps[0] : initializeApp(firebaseConfig);
    if (isFirebaseDebugEnabled()) console.log('[FIREBASE] app inicializado com sucesso');
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
