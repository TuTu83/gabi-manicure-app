import React, { useEffect, useState } from 'react';
import { Button, Image, Input, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { loginWithIdentifier, signInWithGoogleH5 } from '@/services/authService';
import { useAppStore } from '@/store/appStore';
import { getFirstName } from '@/utils/validators';
import styles from './index.module.scss';

function LoginPage() {
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);
  const appName = useAppStore((s) => s.appName);
  const currentUser = useAppStore((s) => s.currentUser);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [heroFailed, setHeroFailed] = useState(false);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const heroImageUrl =
    'https://images.unsplash.com/photo-1616394584738-fc6e612e71b5?auto=format&fit=crop&w=1200&q=70';

  useEffect(() => {
    if (currentUser) Taro.switchTab({ url: '/pages/index/index' });
  }, [currentUser]);

  const handleLogin = async () => {
    setErrorText(null);
    setLoading(true);
    try {
      const profile = await loginWithIdentifier(identifier, password);
      setCurrentUser(profile);
      const firstName = getFirstName(profile.socialName || profile.fullName);
      Taro.showToast({ title: `Olá, ${firstName} 👋`, icon: 'none' });
      Taro.switchTab({ url: '/pages/index/index' });
    } catch (error: any) {
      setErrorText(error?.message || 'Não foi possível entrar');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setErrorText(null);
    setLoading(true);
    try {
      const profile = await signInWithGoogleH5();
      setCurrentUser(profile);
      const firstName = getFirstName(profile.socialName || profile.fullName);
      Taro.showToast({ title: `Olá, ${firstName} 👋`, icon: 'none' });
      Taro.switchTab({ url: '/pages/index/index' });
    } catch (error: any) {
      setErrorText(error?.message || 'Não foi possível entrar com Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className={styles.container}>
      <View className={styles.header}>
        <View className={`${styles.hero} ${!heroLoaded || heroFailed ? styles.heroHidden : ''}`}>
          {!heroFailed ? (
            <Image
              className={styles.heroImage}
              src={heroImageUrl}
              mode="aspectFill"
              onLoad={() => setHeroLoaded(true)}
              onError={() => setHeroFailed(true)}
            />
          ) : (
            <View className={styles.heroFallback} />
          )}
          <View className={styles.heroOverlay} />
        </View>

        <View className={styles.titleBlock}>
          <Text className={styles.titleLead}>Bem-vinda ao</Text>
          <Text className={styles.titleBrand}>{appName}</Text>
        </View>
        <Text className={styles.subtitle}>Entre com seu e-mail e senha para continuar.</Text>
      </View>

      <View className={styles.card}>
        <Text className={styles.fieldLabel}>E-mail</Text>
        <View className={styles.inputRow}>
          <Input
            className={styles.input}
            value={identifier}
            onInput={(e) => setIdentifier(e.detail.value)}
            placeholder="Ex.: nome@gmail.com"
            placeholderClass={styles.placeholder}
          />
        </View>

        <Text className={styles.fieldLabel}>Senha</Text>
        <View className={styles.inputRow}>
          <Input
            className={styles.input}
            value={password}
            onInput={(e) => setPassword(e.detail.value)}
            type={showPassword ? 'text' : 'password'}
            placeholder="Digite sua senha"
            placeholderClass={styles.placeholder}
          />
          <View className={styles.toggle} onClick={() => setShowPassword((v) => !v)}>
            <Text className={styles.toggleText}>{showPassword ? 'Ocultar' : 'Mostrar'}</Text>
          </View>
        </View>

        {errorText ? <Text className={styles.errorText}>{errorText}</Text> : null}

        <Button className={styles.primaryBtn} loading={loading} onClick={handleLogin}>
          <Text className={styles.primaryBtnText}>Entrar</Text>
        </Button>

        <Button className={styles.secondaryBtn} loading={loading} onClick={handleGoogle}>
          <Text className={styles.secondaryBtnText}>Entrar com Google</Text>
        </Button>

        <View className={styles.linksRow}>
          <Text className={styles.link} onClick={() => Taro.navigateTo({ url: '/pages/auth/forgot/index' })}>
            Esqueci minha senha
          </Text>
          <Text className={styles.link} onClick={() => Taro.navigateTo({ url: '/pages/auth/register/index' })}>
            Criar conta
          </Text>
        </View>
      </View>
    </View>
  );
}

export default LoginPage;
