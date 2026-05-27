import Taro from '@tarojs/taro';
import type { UserProfile } from '@/types/user';
import { normalizePhoneBRToE164 } from '@/utils/validators';
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from '@/services/firebase';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';
import {
  GoogleAuthProvider,
  PhoneAuthProvider,
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  deleteUser,
  linkWithCredential,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  signOut as firebaseSignOut,
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

function phoneToAliasEmail(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  return `${digits}@phone.gm.app`;
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

export async function registerWithPhonePassword(input: {
  fullName: string;
  socialName?: string;
  email?: string;
  phoneRaw: string;
  password: string;
}): Promise<UserProfile> {
  const phoneE164 = normalizePhoneBRToE164(input.phoneRaw);
  if (!phoneE164) throw new Error('Telefone inválido');
  const emailProvided = (input.email || '').trim().toLowerCase();

  if (isFirebaseConfigured()) {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    if (!auth || !db) throw new Error('Firebase indisponível');

    const qPhone = query(collection(db, 'users'), where('phoneE164', '==', phoneE164), limit(1));
    const phoneSnap = await getDocs(qPhone);
    if (!phoneSnap.empty) throw new Error('Este telefone já possui cadastro');

    const accountEmail = emailProvided || phoneToAliasEmail(phoneE164);
    const result = await createUserWithEmailAndPassword(auth, accountEmail, input.password);

    const profile: UserProfile = {
      id: result.user.uid,
      fullName: input.fullName.trim(),
      socialName: input.socialName?.trim() || undefined,
      phoneE164,
      email: emailProvided || accountEmail,
      provider: 'password',
      createdAt: Date.now(),
    };

    await setDoc(doc(db, 'users', profile.id), profile, { merge: true });
    return profile;
  }

  const users = readLocalUsers();
  const existing = users.find((u) => u.profile.phoneE164 === phoneE164);
  if (existing) throw new Error('Este telefone já possui cadastro');
  if (emailProvided) {
    const emailExists = users.some((u) => (u.profile.email || '').toLowerCase() === emailProvided);
    if (emailExists) throw new Error('Este e-mail já está em uso');
  }

  const profile: UserProfile = {
    id: `local_${Date.now()}`,
    fullName: input.fullName.trim(),
    socialName: input.socialName?.trim() || undefined,
    phoneE164,
    email: emailProvided || undefined,
    provider: 'password',
    createdAt: Date.now(),
  };

  const passwordSalt = randomSaltHex();
  const passwordIterations = 120000;
  const passwordHash = await computePasswordHash({ password: input.password, saltHex: passwordSalt, iterations: passwordIterations });
  users.push({ profile, passwordHash, passwordSalt, passwordIterations, passwordAlgo: 'pbkdf2' });
  writeLocalUsers(users);
  return profile;
}

export async function loginWithIdentifier(identifier: string, password: string): Promise<UserProfile> {
  const trimmed = (identifier || '').trim().toLowerCase();
  if (!trimmed) throw new Error('Informe telefone ou Gmail');
  checkRateLimit(trimmed);

  if (isFirebaseConfigured()) {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    if (!auth || !db) throw new Error('Firebase indisponível');

    const email = (() => {
      if (trimmed.includes('@')) return trimmed;
      const phoneE164 = normalizePhoneBRToE164(trimmed);
      if (!phoneE164) return null;
      return phoneToAliasEmail(phoneE164);
    })();
    if (!email) throw new Error('Telefone inválido');

    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(db, 'users', result.user.uid));
      const profile = snap.exists() ? (snap.data() as UserProfile) : null;
      if (!profile) throw new Error('Perfil não encontrado');
      if (profile.blocked) throw new Error('Sua conta está bloqueada. Fale com a administradora.');
      clearAttemptState(trimmed);
      return profile;
    } catch (error) {
      registerFailedAttempt(trimmed);
      throw error;
    }
  }

  const phoneE164 = trimmed.includes('@') ? null : normalizePhoneBRToE164(trimmed);
  const users = readLocalUsers();
  const user = trimmed.includes('@')
    ? users.find((u) => u.profile.email?.toLowerCase() === trimmed)
    : users.find((u) => u.profile.phoneE164 === phoneE164);
  if (!user) throw new Error('Conta não encontrada');
  const algo = user.passwordAlgo || 'legacy';
  const saltHex = user.passwordSalt || '';
  const iterations = user.passwordIterations || 120000;
  const expected =
    algo === 'pbkdf2' && saltHex
      ? await computePasswordHash({ password, saltHex, iterations })
      : legacyHashPassword(password);
  if (user.passwordHash !== expected) {
    registerFailedAttempt(trimmed);
    throw new Error('Senha inválida');
  }
  if (user.profile.blocked) throw new Error('Sua conta está bloqueada. Fale com a administradora.');
  clearAttemptState(trimmed);
  return user.profile;
}

export async function signInWithGoogleH5(): Promise<UserProfile> {
  if (!isFirebaseConfigured()) throw new Error('Firebase não configurado');
  if (process.env.TARO_ENV !== 'h5') throw new Error('Google Login disponível apenas no H5');

  const auth = getFirebaseAuth();
  const db = getFirebaseDb();
  if (!auth || !db) throw new Error('Firebase indisponível');

  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);

  const profileRef = doc(db, 'users', result.user.uid);
  const snap = await getDoc(profileRef);
  if (snap.exists()) return snap.data() as UserProfile;

  const displayName = result.user.displayName || '';
  const profile: UserProfile = {
    id: result.user.uid,
    fullName: displayName || 'Cliente',
    phoneE164: '',
    email: result.user.email || undefined,
    provider: 'google',
    createdAt: Date.now(),
  };
  await setDoc(profileRef, profile, { merge: true });
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

export async function resetPasswordByPhone(phoneRaw: string, newPassword: string): Promise<void> {
  const phoneE164 = normalizePhoneBRToE164(phoneRaw);
  if (!phoneE164) throw new Error('Telefone inválido');

  if (isFirebaseConfigured()) {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('Firebase indisponível');
    if (!auth.currentUser) throw new Error('Faça login novamente para atualizar sua senha');
    await updatePassword(auth.currentUser, newPassword);
    return;
  }

  const users = readLocalUsers();
  const idx = users.findIndex((u) => u.profile.phoneE164 === phoneE164);
  if (idx < 0) throw new Error('Conta não encontrada');
  const passwordSalt = randomSaltHex();
  const passwordIterations = 120000;
  const passwordHash = await computePasswordHash({ password: newPassword, saltHex: passwordSalt, iterations: passwordIterations });
  users[idx] = { ...users[idx], passwordHash, passwordSalt, passwordIterations, passwordAlgo: 'pbkdf2' };
  writeLocalUsers(users);
}

export async function signOut(): Promise<void> {
  if (isFirebaseConfigured()) {
    const auth = getFirebaseAuth();
    if (auth) {
      try {
        await firebaseSignOut(auth);
      } catch (error) {
        console.error('[Auth] falha ao sair no Firebase', error);
      }
    }
  }
}

let recaptchaVerifier: RecaptchaVerifier | null = null;

function getOrCreateRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase indisponível');
  if (process.env.TARO_ENV !== 'h5') throw new Error('Envio de SMS disponível apenas no H5');
  if (!containerId) throw new Error('Recaptcha container inválido');

  try {
    recaptchaVerifier?.clear();
  } catch {}
  recaptchaVerifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
  return recaptchaVerifier;
}

function mapPhoneAuthError(error: any): string {
  const code = String(error?.code || '');
  if (code === 'auth/invalid-phone-number') return 'Telefone inválido';
  if (code === 'auth/unauthorized-domain') return 'Domínio não autorizado no Firebase (adicione o domínio da Vercel em Authorized domains).';
  if (code === 'auth/too-many-requests') return 'Muitas tentativas. Tente novamente mais tarde.';
  if (code === 'auth/quota-exceeded') return 'Limite de SMS excedido no Firebase. Tente novamente mais tarde.';
  if (code === 'auth/captcha-check-failed') return 'Falha no reCAPTCHA. Atualize a página e tente novamente.';
  if (code === 'auth/operation-not-allowed') return 'Login por telefone não está ativo no Firebase.';
  if (code === 'auth/invalid-verification-code') return 'Código inválido';
  if (code === 'auth/missing-verification-code') return 'Digite o código de 6 dígitos';
  return error?.message || 'Falha ao enviar/validar o código';
}

export async function sendPhoneVerificationCode(params: { phoneE164: string; recaptchaContainerId: string }): Promise<string> {
  if (!isFirebaseConfigured()) throw new Error('Firebase não configurado');
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase indisponível');
  const phone = (params.phoneE164 || '').trim();
  if (!phone.startsWith('+')) throw new Error('Telefone inválido');

  try {
    const verifier = getOrCreateRecaptchaVerifier(params.recaptchaContainerId);
    await verifier.render();
    const provider = new PhoneAuthProvider(auth);
    const verificationId = await provider.verifyPhoneNumber(phone, verifier);
    return verificationId;
  } catch (error: any) {
    console.error('[Auth] falha ao enviar SMS', error);
    throw new Error(mapPhoneAuthError(error));
  }
}

export async function signInWithPhoneCode(params: { verificationId: string; code: string }): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error('Firebase não configurado');
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase indisponível');

  try {
    const credential = PhoneAuthProvider.credential(params.verificationId, params.code);
    await signInWithCredential(auth, credential);
  } catch (error: any) {
    console.error('[Auth] falha ao validar código (login)', error);
    throw new Error(mapPhoneAuthError(error));
  }
}

export async function linkCurrentUserWithPhoneCode(params: { verificationId: string; code: string }): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error('Firebase não configurado');
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase indisponível');
  if (!auth.currentUser) throw new Error('Sessão expirada');

  try {
    const credential = PhoneAuthProvider.credential(params.verificationId, params.code);
    await linkWithCredential(auth.currentUser, credential);
  } catch (error: any) {
    console.error('[Auth] falha ao vincular telefone', error);
    throw new Error(mapPhoneAuthError(error));
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
