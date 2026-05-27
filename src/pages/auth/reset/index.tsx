import React, { useMemo, useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
// Phone-based reset removed; users should use email reset link.
import { useAppStore } from '@/store/appStore';
import { validatePasswordSecurity } from '@/utils/validators';
import styles from './index.module.scss';

function ResetPasswordPage() {
  const resetDraft = useAppStore((s) => s.resetDraft);
  const resetAuthFlow = useAppStore((s) => s.resetAuthFlow);

  const [loading, setLoading] = useState(false);

  const handleBackToForgot = () => {
    Taro.redirectTo({ url: '/pages/auth/forgot/index' });
  };

  return (
    <View className={styles.container}>
      <View className={styles.card}>
        <Text className={styles.title}>Criar nova senha</Text>
        <Text className={styles.desc}>Use o link enviado por e-mail para redefinir sua senha.</Text>

        <Text className={styles.fieldLabel}>Verifique seu e-mail</Text>
        <View className={styles.inputRow}>
          <Text className={styles.desc}>Enviamos um link de recuperação para o seu e-mail. Siga as instruções.</Text>
        </View>

        <Button className={styles.primaryBtn} loading={loading} onClick={handleBackToForgot}>
          <Text className={styles.primaryBtnText}>Voltar</Text>
        </Button>
      </View>
    </View>
  );
}

export default ResetPasswordPage;
