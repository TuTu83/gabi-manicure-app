import React, { useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useAppStore, clearAppStorage } from '@/store/appStore';
import { restoreSignedInProfile } from '@/services/authService';
import { getFirebaseAuth } from '@/services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import styles from './index.module.scss';

function SplashPage() {
  const appName = useAppStore((s) => s.appName);
  const currentUser = useAppStore((s) => s.currentUser);
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);

  useEffect(() => {
    let cancelled = false;
    const auth = getFirebaseAuth();
    if (!auth) {
      setTimeout(() => {
        Taro.redirectTo({ url: '/pages/auth/login/index' });
      }, 700);
      return;
    }

    console.log('[AUTH DEBUG] Aguardando inicialização do Firebase Auth...');

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (cancelled) return;

      const firebaseUid = firebaseUser?.uid || null;
      const localUid = currentUser?.id || null;
      let motivo = '';

      console.log('[AUTH DEBUG] Firebase Auth inicializado!');
      console.log('[AUTH DEBUG] Firebase UID atual:', firebaseUid);
      console.log('[AUTH DEBUG] UID salvo localmente:', localUid);

      if (!firebaseUid) {
        // NÃO TEM USUÁRIO NO FIREBASE: LIMPA TUDO!
        console.log('[AUTH DEBUG] Nenhum usuário no Firebase Auth - LIMPANDO DADOS LOCAIS!');
        try {
          useAppStore.getState().signOut();
          clearAppStorage();
        } catch (e) {
          console.error('[AUTH DEBUG] Erro ao limpar dados locais:', e);
        }
        motivo = 'Nenhum usuário Firebase autenticado';

        setTimeout(() => {
          Taro.redirectTo({ url: '/pages/auth/login/index' });
        }, 700);
        return;
      }

      // Firebase tem usuário autenticado: restaura perfil do Firestore
      console.log('[AUTH DEBUG] Usuário Firebase encontrado - Restaurando perfil...');
      const nextUser = await restoreSignedInProfile();
      console.log('[AUTH DEBUG] Perfil restaurado:', nextUser ? nextUser.id : 'null');
      motivo = nextUser ? 'Usuário Firebase válido, perfil restaurado' : 'Firebase Auth válido mas perfil não encontrado';

      if (nextUser && (!currentUser || currentUser.id !== nextUser.id)) {
        console.log('[AUTH DEBUG] Atualizando usuário no app store...');
        setCurrentUser(nextUser);
      }

      console.log('[AUTH DEBUG] Motivo da navegação:', motivo);

      setTimeout(() => {
        if (nextUser) {
          Taro.switchTab({ url: '/pages/index/index' });
        } else {
          Taro.redirectTo({ url: '/pages/auth/login/index' });
        }
      }, 700);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [currentUser, setCurrentUser]);

  return (
    <View className={styles.container}>
      <View className={styles.brandCard}>
        <Text className={styles.brandName}>{appName}</Text>
        <Text className={styles.tagline}>Beleza nas mãos, com experiência premium.</Text>
        <View className={styles.loadingRow}>
          <View className={styles.loadingDot} />
          <View className={styles.loadingDot} />
          <View className={styles.loadingDot} />
        </View>
        <Text className={styles.hint}>Carregando…</Text>
      </View>
    </View>
  );
}

export default SplashPage;
