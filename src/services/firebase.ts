import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
}

function readEnvValue(key: string): string {
  try {
    if (typeof process === 'undefined') return '';
    if (key === 'TARO_APP_FIREBASE_API_KEY') return (process.env.TARO_APP_FIREBASE_API_KEY || '').trim();
    if (key === 'TARO_APP_FIREBASE_AUTH_DOMAIN') return (process.env.TARO_APP_FIREBASE_AUTH_DOMAIN || '').trim();
    if (key === 'TARO_APP_FIREBASE_PROJECT_ID') return (process.env.TARO_APP_FIREBASE_PROJECT_ID || '').trim();
    if (key === 'TARO_APP_FIREBASE_APP_ID') return (process.env.TARO_APP_FIREBASE_APP_ID || '').trim();
    if (key === 'TARO_APP_FIREBASE_STORAGE_BUCKET') return (process.env.TARO_APP_FIREBASE_STORAGE_BUCKET || '').trim();
    return '';
  } catch {
    return '';
  }
}

export const firebaseConfig: FirebaseClientConfig = {
  apiKey: readEnvValue('TARO_APP_FIREBASE_API_KEY'),
  authDomain: readEnvValue('TARO_APP_FIREBASE_AUTH_DOMAIN'),
  projectId: readEnvValue('TARO_APP_FIREBASE_PROJECT_ID'),
  appId: readEnvValue('TARO_APP_FIREBASE_APP_ID'),
  storageBucket: readEnvValue('TARO_APP_FIREBASE_STORAGE_BUCKET'),
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  try {
    if (app) return app;
    const apps = getApps();
    app = apps.length ? apps[0] : initializeApp(firebaseConfig);
    return app;
  } catch (error) {
    console.error('[Firebase] falha ao inicializar', error);
    return null;
  }
}

export function getFirebaseAuth(): Auth | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  try {
    if (auth) return auth;
    auth = getAuth(firebaseApp);
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
