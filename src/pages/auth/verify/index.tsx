import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import classnames from 'classnames';
import { createOtpSession, verifyOtp } from '@/services/otpService';
import { registerWithPhonePassword } from '@/services/authService';
import { useAppStore } from '@/store/appStore';
import { validateOtp6 } from '@/utils/validators';
import styles from './index.module.scss';

function maskPhone(phoneE164: string): string {
  const digits = (phoneE164 || '').replace(/\D/g, '');
  if (digits.length < 6) return phoneE164;
  const start = digits.slice(0, 4);
  const end = digits.slice(-2);
  return `+${start}•••••${end}`;
}

function VerifyCodePage() {
  const router = useRouter();
  const mode = (router.params?.mode || 'register') as 'register' | 'reset';

  const registerDraft = useAppStore((s) => s.registerDraft);
  const resetDraft = useAppStore((s) => s.resetDraft);
  const otpChannel = useAppStore((s) => s.otpChannel);
  const otpSession = useAppStore((s) => s.otpSession);
  const setOtpSession = useAppStore((s) => s.setOtpSession);
  const resetAuthFlow = useAppStore((s) => s.resetAuthFlow);

  const phoneE164 = useMemo(() => {
    if (mode === 'register') return registerDraft?.phoneE164 || '';
    return resetDraft?.phoneE164 || '';
  }, [mode, registerDraft, resetDraft]);

  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!otpSession || !otpSession.createdAt) return;
    const now = Date.now();
    const elapsed = Math.floor((now - otpSession.createdAt) / 1000);
    const left = Math.max(0, 60 - elapsed);
    setSecondsLeft(left);
  }, [otpSession]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  useEffect(() => {
    if (!phoneE164) {
      Taro.redirectTo({ url: '/pages/auth/login/index' });
    }
  }, [phoneE164]);

  const code = digits.join('');

  const handleConfirm = async () => {
    setErrorText(null);
    setSuccessText(null);

    const otpErr = validateOtp6(code);
    if (otpErr) return setErrorText(otpErr);

    const result = verifyOtp(otpSession, code);
    if (!result.ok) return setErrorText(result.reason || 'Código inválido');

    if (mode === 'reset') {
      setSuccessText('Código validado');
      Taro.redirectTo({ url: '/pages/auth/reset/index' });
      return;
    }

    if (!registerDraft) return setErrorText('Sessão expirada');

    setLoading(true);
    try {
      await registerWithPhonePassword({
        fullName: registerDraft.fullName,
        socialName: registerDraft.socialName,
        phoneRaw: registerDraft.phoneRaw,
        password: registerDraft.password,
      });
      resetAuthFlow();
      Taro.showToast({ title: 'Conta criada com sucesso', icon: 'success' });
      Taro.redirectTo({ url: '/pages/auth/login/index' });
    } catch (error: any) {
      setErrorText(error?.message || 'Não foi possível criar a conta');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = () => {
    if (secondsLeft > 0) return;
    if (!phoneE164) return;
    const session = createOtpSession(phoneE164, otpChannel);
    setOtpSession(session);
    setDigits(['', '', '', '', '', '']);
    setErrorText(null);
    setSuccessText('Código reenviado');
    setSecondsLeft(60);
  };

  const handleDigitChange = (index: number, value: string) => {
    const onlyDigits = (value || '').replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = onlyDigits;
      return next;
    });
  };

  return (
    <View className={styles.container}>
      <View className={styles.card}>
        <Text className={styles.title}>Confirme seu código</Text>
        <Text className={styles.desc}>
          Enviamos um código de 6 dígitos para {maskPhone(phoneE164)} via {otpChannel === 'sms' ? 'SMS' : 'WhatsApp'}.
        </Text>

        <View className={styles.otpRow}>
          {digits.map((d, idx) => (
            <View className={styles.otpBox} key={`otp_${idx}`}>
              <Input
                className={styles.otpInput}
                value={d}
                type="number"
                maxlength={1}
                onInput={(e) => handleDigitChange(idx, e.detail.value)}
              />
            </View>
          ))}
        </View>

        {errorText ? <Text className={styles.errorText}>{errorText}</Text> : null}
        {successText ? <Text className={styles.successText}>{successText}</Text> : null}

        <Button className={styles.primaryBtn} loading={loading} onClick={handleConfirm}>
          <Text className={styles.primaryBtnText}>Validar código</Text>
        </Button>

        <View className={styles.resendRow}>
          <Button
            className={classnames(styles.resendBtn, secondsLeft > 0 && styles.resendBtnDisabled)}
            disabled={secondsLeft > 0}
            onClick={handleResend}
          >
            <Text className={styles.resendText}>Reenviar código</Text>
          </Button>
          <Text className={styles.timerText}>{secondsLeft > 0 ? `Aguarde ${secondsLeft}s` : 'Você pode reenviar agora'}</Text>
        </View>

        {otpSession?.code ? <Text className={styles.testCode}>Código de teste: {otpSession.code}</Text> : null}
      </View>
    </View>
  );
}

export default VerifyCodePage;
