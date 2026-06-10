import Taro from '@tarojs/taro';
import { UserProfile } from '@/types/user';
import { normalizePhoneBRToE164 } from '@/utils/validators';
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from '@/services/firebase';
import { ADMIN_EMAIL } from '@/services/adminService';
import { clearAppStorage, useAppStore } from '@/store/appStore';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where } from 'firebase/firestore';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updatePassword,
} from 'firebase/auth';

const usersKey = 'gm.users';
const attemptsKey = 'gm.loginAttempts';

interface LocalUserRecord {
  profile: UserProfile;
  passwordHash: string;
  passwordSalt?: string;
  passwordAlgo?: 'legacy' | 'pbkdf2';
  passwordIterations?: number;
}

function legacyHashPassword(password: string): string {
  let hash = 5381;
  for (let i = 0; i < password.length; i += 1) {
    hash = (hash * 33) ^ password.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function randomSaltHex(): string {
  try {
    const cryptoObj = (globalThis as any).crypto;
    if (cryptoObj?.getRandomValues) {
      const bytes = new Uint8Array(16);
      cryptoObj.getRandomValues(bytes);
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {}
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

async function pbkdf2Hash(password: string, saltHex: string, iterations: number): Promise<string> {
  const cryptoObj = (globalThis as any).crypto;
  if (!cryptoObj?.subtle) return legacyHashPassword(`${saltHex}:${password}`);

  const enc = new TextEncoder();
  const pairs = saltHex.match(/.{1,2}/g) || [];
  const saltBytes = new Uint8Array(pairs.map((h) => parseInt(h, 16)));
  const keyMaterial = await cryptoObj.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await cryptoObj.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
    keyMaterial,
    256,
  );
  const out = new Uint8Array(bits);
  return Array.from(out)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function computePasswordHash(params: { password: string; saltHex: string; iterations: number }): Promise<string> {
  try {
    return await pbkdf2Hash(params.password, params.saltHex, params.iterations);
  } catch (error) {
    console.error('[Auth] falha ao gerar hash seguro', error);
    return legacyHashPassword(`${params.saltHex}:${params.password}`);
  }
}

interface LoginAttemptState {
  attempts: number;
  firstAt: number;
  lockedUntil?: number;
}

function getAttemptState(key: string): LoginAttemptState {
  try {
    const map = (Taro.getStorageSync(attemptsKey) as Record<string, LoginAttemptState>) || {};
    return map[key] || { attempts: 0, firstAt: Date.now() };
  } catch {
    return { attempts: 0, firstAt: Date.now() };
  }
}

function setAttemptState(key: string, state: LoginAttemptState): void {
  try {
    const map = (Taro.getStorageSync(attemptsKey) as Record<string, LoginAttemptState>) || {};
    map[key] = state;
    Taro.setStorageSync(attemptsKey, map);
  } catch (error) {
    console.error('[Auth] falha ao salvar tentativas de login', error);
  }
}

function clearAttemptState(key: string): void {
  try {
    const map = (Taro.getStorageSync(attemptsKey) as Record<string, LoginAttemptState>) || {};
    delete map[key];
    Taro.setStorageSync(attemptsKey, map);
  } catch {}
}

function checkRateLimit(identifier: string): void {
  const key = (identifier || '').trim().toLowerCase();
  if (!key) return;
  const state = getAttemptState(key);
  const now = Date.now();
  if (state.lockedUntil && now < state.lockedUntil) {
    const seconds = Math.ceil((state.lockedUntil - now) / 1000);
    throw new Error(`Muitas tentativas. Tente novamente em ${seconds}s.`);
  }
  if (now - state.firstAt > 5 * 60 * 1000) {
    setAttemptState(key, { attempts: 0, firstAt: now });
  }
}

function registerFailedAttempt(identifier: string): void {
  const key = (identifier || '').trim().toLowerCase();
  if (!key) return;
  const prev = getAttemptState(key);
  const now = Date.now();
  const next: LoginAttemptState = { attempts: prev.attempts + 1, firstAt: prev.firstAt };
  if (now - prev.firstAt > 5 * 60 * 1000) {
    next.attempts = 1;
    next.firstAt = now;
  }
  if (next.attempts >= 5) {
    next.lockedUntil = now + 10 * 60 * 1000;
  }
  setAttemptState(key, next);
}

function readLocalUsers(): LocalUserRecord[] {
  try {
    const raw = Taro.getStorageSync(usersKey);
    return (raw as LocalUserRecord[]) || [];
  } catch (error) {
    console.error('[Auth] falha ao ler usuários locais', error);
    return [];
  }
}

function writeLocalUsers(users: LocalUserRecord[]): void {
  try {
    Taro.setStorageSync(usersKey, users);
  } catch (error) {
    console.error('[Auth] falha ao salvar usuários locais', error);
  }
}

function deleteLocalUserById(userId: string): void {
  if (!userId) return;
  const users = readLocalUsers();
  const next = users.filter((u) => u.profile.id !== userId);
  writeLocalUsers(next);
}

// Phone-as-auth flows removed: use email/password only.

export async function registerWithEmailPassword(input: {
  name: string;
  email: string;
  phoneRaw?: string;
  password: string;
}): Promise<UserProfile> {
  const name = (input.name || '').trim().replace(/\s+/g, ' ');
  const email = (input.email || '').trim().toLowerCase();
  const phoneE164 = input.phoneRaw ? normalizePhoneBRToE164(input.phoneRaw) : '';
  if (!name) throw new Error('Informe seu nome');
  if (!email || !email.includes('@')) throw new Error('E-mail inválido');
  if (input.phoneRaw && !phoneE164) throw new Error('Telefone inválido');

  if (!isFirebaseConfigured()) throw new Error('Firebase não configurado');
  const auth = getFirebaseAuth();
  const db = getFirebaseDb();
  if (!auth || !db) throw new Error('Firebase indisponível');

  try {
    const result = await createUserWithEmailAndPassword(auth, email, input.password);
    const now = Date.now();
    
    // LOGS DETALHADOS
    console.log('[AUTH DEBUG REGISTER]');
    console.log('  email:', email);
    console.log('  ADMIN_EMAIL:', ADMIN_EMAIL);
    console.log('  email === ADMIN_EMAIL.toLowerCase()', email === ADMIN_EMAIL.toLowerCase());
    
    const isAdmin = email === ADMIN_EMAIL.toLowerCase();
    const profile: UserProfile = {
      id: result.user.uid,
      fullName: name,
      phoneE164: phoneE164 || '',
      email,
      provider: 'password',
      createdAt: now,
      role: isAdmin ? 'admin' : 'client',
    };
    
    console.log('  isAdmin:', isAdmin);
    console.log('  profile.role:', profile.role);

    await setDoc(
      doc(db, 'users', profile.id),
      {
        ...profile,
        name,
        phone: phoneE164 || '',
        createdAt: now,
      } as any,
      { merge: true },
    );
    return profile;
  } catch (error: any) {
    console.error('[Auth][register] erro ao criar conta', error);
    throw new Error(error?.message || 'Erro ao criar conta');
  }
}

export async function loginWithIdentifier(identifier: string, password: string): Promise<UserProfile> {
  const trimmed = (identifier || '').trim().toLowerCase();
  if (!trimmed) throw new Error('Informe seu e-mail');
  checkRateLimit(trimmed);

  if (isFirebaseConfigured()) {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    if (!auth || !db) throw new Error('Firebase indisponível');

    if (!trimmed.includes('@')) throw new Error('Informe seu e-mail');
    const email = trimmed;
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(db, 'users', result.user.uid));
      const profile = snap.exists() ? (snap.data() as UserProfile) : null;
      if (!profile) throw new Error('Perfil não encontrado');
      if (profile.blocked) throw new Error('Sua conta está bloqueada. Fale com a administradora.');
      clearAttemptState(trimmed);
      return profile;
    } catch (error: any) {
      registerFailedAttempt(trimmed);
      console.error('[Auth][login] erro ao entrar', { identifier: trimmed, error });
      throw new Error(error?.message || 'Erro ao entrar');
    }
  }
  // Local (non-Firebase) fallback: only allow email-based login
  const users = readLocalUsers();
  const user = users.find((u) => (u.profile.email || '').toLowerCase() === trimmed);
  if (!user) throw new Error('Conta não encontrada');
  const algo = user.passwordAlgo || 'legacy';
  const saltHex = user.passwordSalt || '';
  const iterations = user.passwordIterations || 120000;
  const expected = algo === 'pbkdf2' && saltHex ? await computePasswordHash({ password, saltHex, iterations }) : legacyHashPassword(password);
  if (user.passwordHash !== expected) {
    registerFailedAttempt(trimmed);
    throw new Error('Senha inválida');
  }
  if (user.profile.blocked) throw new Error('Sua conta está bloqueada. Fale com a administradora.');
  clearAttemptState(trimmed);
  return user.profile;
}

export async function restoreSignedInProfile(): Promise<UserProfile | null> {
  if (!isFirebaseConfigured()) return null;
  const auth = getFirebaseAuth();
  const db = getFirebaseDb();
  if (!auth || !db) return null;
  if (!auth.currentUser) return null;

  try {
    const userId = auth.currentUser.uid;
    const snap = await getDoc(doc(db, 'users', userId));
    const email = auth.currentUser.email || '';
    
    // LOGS DETALHADOS
    console.log('[AUTH DEBUG RESTORE]');
    console.log('  userId:', userId);
    console.log('  email:', email);
    console.log('  ADMIN_EMAIL:', ADMIN_EMAIL);
    console.log('  email.toLowerCase() === ADMIN_EMAIL.toLowerCase()', email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
    
    const isAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    const correctRole = isAdmin ? 'admin' : 'client';
    
    console.log('  isAdmin:', isAdmin);
    console.log('  correctRole:', correctRole);
    
    let profile: UserProfile;
    
    if (snap.exists()) {
      const existingData = snap.data() as UserProfile;
      console.log('  existingData:', existingData);
      console.log('  existingData.role:', existingData.role);
      
      // SEMPRE ATUALIZA A ROLE SE DIFERENTE (CORRIGE DADOS ANTIGOS!)
      if (existingData.role !== correctRole) {
        console.log('[restoreSignedInProfile] Atualizando role do usuário para:', correctRole);
        await setDoc(doc(db, 'users', userId), { role: correctRole, updatedAt: Date.now() }, { merge: true });
        profile = { ...existingData, role: correctRole };
      } else {
        profile = existingData;
      }
    } else {
      // Cria novo usuário com role correta
      const now = Date.now();
      profile = {
        id: userId,
        fullName: auth.currentUser.displayName || 'Cliente',
        phoneE164: auth.currentUser.phoneNumber || '',
        email: auth.currentUser.email || undefined,
        provider: 'password',
        createdAt: now,
        role: correctRole,
      };
      await setDoc(
        doc(db, 'users', profile.id),
        {
          ...profile,
          name: profile.fullName,
          phone: profile.phoneE164 || '',
          createdAt: now,
        } as any,
        { merge: true },
      );
    }
    
    console.log('  final profile.role:', profile.role);
    return profile;
  } catch (error) {
    console.error('[Auth] falha ao restaurar sessão', error);
    return null;
  }
}

export async function signInWithGoogleH5(): Promise<UserProfile> {
  if (!isFirebaseConfigured()) throw new Error('Firebase não configurado');
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  if (!isBrowser) throw new Error('Google Login disponível apenas no H5');

  const auth = getFirebaseAuth();
  const db = getFirebaseDb();
  if (!auth || !db) throw new Error('Firebase indisponível');

  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);

  const userId = result.user.uid;
  const profileRef = doc(db, 'users', userId);
  const snap = await getDoc(profileRef);
  const email = result.user.email || '';
  
  // LOGS DETALHADOS
  console.log('[AUTH DEBUG GOOGLE SIGN IN]');
  console.log('  userId:', userId);
  console.log('  email:', email);
  console.log('  ADMIN_EMAIL:', ADMIN_EMAIL);
  console.log('  email.toLowerCase() === ADMIN_EMAIL.toLowerCase()', email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  
  const isAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const correctRole = isAdmin ? 'admin' : 'client';
  
  console.log('  isAdmin:', isAdmin);
  console.log('  correctRole:', correctRole);
  
  let profile: UserProfile;
  
  if (snap.exists()) {
    const existingData = snap.data() as UserProfile;
    console.log('  existingData:', existingData);
    console.log('  existingData.role:', existingData.role);
    
    if (existingData.role !== correctRole) {
      console.log('[signInWithGoogleH5] Atualizando role do usuário para:', correctRole);
      await setDoc(doc(db, 'users', userId), { role: correctRole, updatedAt: Date.now() }, { merge: true });
      profile = { ...existingData, role: correctRole };
    } else {
      profile = existingData;
    }
  } else {
    const displayName = result.user.displayName || '';
    profile = {
      id: userId,
      fullName: displayName || 'Cliente',
      phoneE164: '',
      email: result.user.email || undefined,
      provider: 'google',
      createdAt: Date.now(),
      role: correctRole,
    };
    await setDoc(profileRef, profile, { merge: true });
  }
  
  console.log('  final profile.role:', profile.role);
  return profile;
}

export async function updateUserPhone(userId: string, phoneRaw: string): Promise<UserProfile> {
  const phoneE164 = normalizePhoneBRToE164(phoneRaw);
  if (!phoneE164) throw new Error('Telefone inválido');

  if (isFirebaseConfigured()) {
    const db = getFirebaseDb();
    if (!db) throw new Error('Firebase indisponível');

    const ref = doc(db, 'users', userId);
    const snap = await getDoc(ref);
    const prev = snap.exists() ? (snap.data() as UserProfile) : null;
    if (!prev) throw new Error('Perfil não encontrado');

    const next: UserProfile = { ...prev, phoneE164 };
    await setDoc(ref, next, { merge: true });
    return next;
  }

  const users = readLocalUsers();
  const idx = users.findIndex((u) => u.profile.id === userId);
  if (idx < 0) throw new Error('Perfil não encontrado');
  const next = { ...users[idx].profile, phoneE164 };
  users[idx] = { ...users[idx], profile: next };
  writeLocalUsers(users);
  return next;
}

// Phone-based password reset removed. Use email reset via `sendPasswordResetEmailLink`.

export async function sendPasswordResetEmailLink(emailRaw: string): Promise<void> {
  const email = (emailRaw || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('E-mail inválido');
  if (!isFirebaseConfigured()) throw new Error('Firebase não configurado');
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase indisponível');
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error: any) {
    console.error('[Auth] falha ao enviar e-mail de recuperação', error);
    throw new Error(error?.message || 'Não foi possível enviar o e-mail de recuperação');
  }
}

export async function signOut(): Promise<void> {
  // Primeiro limpa tudo localmente!
  try {
    // Limpa o store do app
    useAppStore.getState().signOut();
    // Limpa completamente o storage do app
    clearAppStorage();
    console.log('[AUTH DEBUG] Limpou useAppStore e storage local');
  } catch (err) {
    console.error('[AUTH DEBUG] Erro ao limpar dados locais no logout:', err);
  }

  // Agora faz logout do Firebase
  if (isFirebaseConfigured()) {
    const auth = getFirebaseAuth();
    if (auth) {
      try {
        const userId = auth.currentUser?.uid;
        if (userId) {
          console.log('[AUTH DEBUG] Removendo token FCM para:', userId);
          const { removeCurrentUserToken } = await import('./pushService');
          await removeCurrentUserToken(userId);
        }
        await firebaseSignOut(auth);
        console.log('[AUTH DEBUG] Logout Firebase finalizado');
      } catch (error) {
        console.error('[Auth] falha ao sair no Firebase', error);
      }
    }
  }
}

export async function deleteMyAccount(profile: UserProfile): Promise<void> {
  if (!profile?.id) throw new Error('Sessão expirada');

  if (isFirebaseConfigured()) {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    if (!auth || !db) throw new Error('Firebase indisponível');
    if (!auth.currentUser) throw new Error('Sessão expirada');
    if (auth.currentUser.uid !== profile.id) throw new Error('Sessão inválida');

    const now = Date.now();
    await setDoc(
      doc(db, 'users', profile.id),
      {
        deletedAt: now,
        deletedByUser: true,
        updatedAt: now,
      } as any,
      { merge: true },
    );

    try {
      await deleteUser(auth.currentUser);
    } catch (error: any) {
      const code = String(error?.code || '');
      if (code === 'auth/requires-recent-login') {
        throw new Error('Por segurança, faça login novamente para excluir sua conta.');
      }
      throw error;
    }

    try {
      await firebaseSignOut(auth);
    } catch {}
    return;
  }

  deleteLocalUserById(profile.id);
}
