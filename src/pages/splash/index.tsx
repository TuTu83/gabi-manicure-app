import React, { useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useAppStore } from '@/store/appStore';
import { restoreSignedInProfile } from '@/services/authService';
import styles from './index.module.scss';

function SplashPage() {
  const appName = useAppStore((s) => s.appName);
  const currentUser = useAppStore((s) => s.currentUser);
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const nextUser = currentUser || (await restoreSignedInProfile());
      if (cancelled) return;
      if (!currentUser && nextUser) setCurrentUser(nextUser);
      setTimeout(() => {
        if (nextUser) {
          Taro.switchTab({ url: '/pages/index/index' });
        } else {
          Taro.redirectTo({ url: '/pages/auth/login/index' });
        }
      }, 700);
    };
    run();

    return () => {
      cancelled = true;
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
