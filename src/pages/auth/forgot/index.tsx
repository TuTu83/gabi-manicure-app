import React, { useState } from 'react';
import { Button, Input, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { sendPasswordResetEmailLink } from '@/services/authService';
import styles from './index.module.scss';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    setErrorText(null);
    setLoading(true);
    try {
      await sendPasswordResetEmailLink(email);
      Taro.showToast({ title: 'E-mail enviado', icon: 'success' });
      Taro.redirectTo({ url: '/pages/auth/login/index' });
    } catch (error: any) {
      setErrorText(error?.message || 'Não foi possível enviar o e-mail');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className={styles.container}>
      <View className={styles.header}>
        <Text className={styles.title}>Recuperar senha</Text>
        <Text className={styles.subtitle}>Envie um e-mail para redefinir sua senha.</Text>
      </View>

      <View className={styles.card}>
        <Text className={styles.fieldLabel}>E-mail</Text>
        <View className={styles.inputRow}>
          <Input
            className={styles.input}
            value={email}
            onInput={(e) => setEmail(e.detail.value)}
            placeholder="Ex.: nome@gmail.com"
          />
        </View>

        {errorText ? <Text className={styles.errorText}>{errorText}</Text> : null}

        <Button className={styles.primaryBtn} loading={loading} onClick={handleSend}>
          <Text className={styles.primaryBtnText}>Enviar e-mail</Text>
        </Button>
      </View>
    </View>
  );
}

export default ForgotPasswordPage;
