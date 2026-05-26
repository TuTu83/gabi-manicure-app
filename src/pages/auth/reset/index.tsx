import React, { useMemo, useState } from 'react';
import { Button, Input, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { resetPasswordByPhone } from '@/services/authService';
import { useAppStore } from '@/store/appStore';
import { validatePasswordConfirm, validatePasswordSecurity } from '@/utils/validators';
import styles from './index.module.scss';

function ResetPasswordPage() {
  const resetDraft = useAppStore((s) => s.resetDraft);
  const resetAuthFlow = useAppStore((s) => s.resetAuthFlow);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const phoneRaw = resetDraft?.phoneRaw || '';

  const passwordHint = useMemo(() => {
    const err = validatePasswordSecurity(password);
    return err ? err : 'Senha segura';
  }, [password]);

  const handleSave = async () => {
    setErrorText(null);
    if (!phoneRaw) return setErrorText('Sessão expirada');

    const passErr = validatePasswordSecurity(password);
    if (passErr) return setErrorText(passErr);
    const confirmErr = validatePasswordConfirm(password, confirmPassword);
    if (confirmErr) return setErrorText(confirmErr);

    setLoading(true);
    try {
      await resetPasswordByPhone(phoneRaw, password);
      resetAuthFlow();
      Taro.showToast({ title: 'Senha atualizada', icon: 'success' });
      Taro.redirectTo({ url: '/pages/auth/login/index' });
    } catch (error: any) {
      setErrorText(error?.message || 'Não foi possível atualizar a senha');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className={styles.container}>
      <View className={styles.card}>
        <Text className={styles.title}>Criar nova senha</Text>
        <Text className={styles.desc}>Defina uma senha segura e confirme abaixo.</Text>

        <Text className={styles.fieldLabel}>Nova senha</Text>
        <View className={styles.inputRow}>
          <Input
            className={styles.input}
            value={password}
            onInput={(e) => setPassword(e.detail.value)}
            type={showPassword ? 'text' : 'password'}
            placeholder="Digite sua nova senha"
          />
          <View className={styles.toggle} onClick={() => setShowPassword((v) => !v)}>
            <Text className={styles.toggleText}>{showPassword ? 'Ocultar' : 'Mostrar'}</Text>
          </View>
        </View>
        <Text className={styles.desc}>{passwordHint}</Text>

        <Text className={styles.fieldLabel} style={{ marginTop: '24rpx' }}>
          Confirmar nova senha
        </Text>
        <View className={styles.inputRow}>
          <Input
            className={styles.input}
            value={confirmPassword}
            onInput={(e) => setConfirmPassword(e.detail.value)}
            type={showConfirm ? 'text' : 'password'}
            placeholder="Repita sua nova senha"
          />
          <View className={styles.toggle} onClick={() => setShowConfirm((v) => !v)}>
            <Text className={styles.toggleText}>{showConfirm ? 'Ocultar' : 'Mostrar'}</Text>
          </View>
        </View>

        {errorText ? <Text className={styles.errorText}>{errorText}</Text> : null}

        <Button className={styles.primaryBtn} loading={loading} onClick={handleSave}>
          <Text className={styles.primaryBtnText}>Salvar nova senha</Text>
        </Button>
      </View>
    </View>
  );
}

export default ResetPasswordPage;
