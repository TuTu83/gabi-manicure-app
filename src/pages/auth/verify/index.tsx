import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import classnames from 'classnames';
import { linkCurrentUserWithPhoneCode, registerWithPhonePassword, sendPhoneVerificationCode, signInWithPhoneCode, signOut } from '@/services/authService';
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
  const setRegisterDraft = useAppStore((s) => s.setRegisterDraft);
  const setResetDraft = useAppStore((s) => s.setResetDraft);
  const resetAuthFlow = useAppStore((s) => s.resetAuthFlow);

  const phoneE164 = useMemo(() => {
    if (mode === 'register') return registerDraft?.phoneE164 || '';
    return resetDraft?.phoneE164 || '';
  }, [mode, registerDraft, resetDraft]);

  const verificationId = useMemo(() => {
    if (mode === 'register') return registerDraft?.verificationId || '';
    return resetDraft?.verificationId || '';
  }, [mode, registerDraft, resetDraft]);

  const [otpValue, setOtpValue] = useState('');
  const [otpFocus, setOtpFocus] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  useEffect(() => {
    if (!phoneE164 || !verificationId) {
      Taro.redirectTo({ url: '/pages/auth/login/index' });
    }
  }, [phoneE164, verificationId]);

  const digits = useMemo(() => Array.from({ length: 6 }, (_, idx) => otpValue[idx] || ''), [otpValue]);
  const code = otpValue;

  const handleConfirm = async () => {
    setErrorText(null);
    setSuccessText(null);

    const otpErr = validateOtp6(code);
    if (otpErr) return setErrorText(otpErr);

    if (mode === 'reset') {
      setLoading(true);
      try {
        await signInWithPhoneCode({ verificationId, code });
        setSuccessText('Código validado');
        Taro.redirectTo({ url: '/pages/auth/reset/index' });
      } catch (error: any) {
        setErrorText(error?.message || 'Não foi possível validar o código');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!registerDraft) return setErrorText('Sessão expirada');

    setLoading(true);
    try {
      await registerWithPhonePassword({
        fullName: registerDraft.fullName,
        socialName: registerDraft.socialName,
        email: registerDraft.email,
        phoneRaw: registerDraft.phoneRaw,
        password: registerDraft.password,
      });
      await linkCurrentUserWithPhoneCode({ verificationId, code });
      resetAuthFlow();
      await signOut();
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
    setErrorText(null);
    setSuccessText(null);
    setOtpValue('');
    (async () => {
      try {
        const nextVerificationId = await sendPhoneVerificationCode({ phoneE164, recaptchaContainerId: 'recaptcha-verify' });
        if (mode === 'register' && registerDraft) setRegisterDraft({ ...registerDraft, verificationId: nextVerificationId });
        if (mode === 'reset' && resetDraft) setResetDraft({ ...resetDraft, verificationId: nextVerificationId });
        setSuccessText('Código reenviado');
        setSecondsLeft(60);
      } catch (error: any) {
        setErrorText(error?.message || 'Não foi possível reenviar o código');
      }
    })();
  };

  const handleOtpChange = (value: string) => {
    const onlyDigits = (value || '').replace(/\D/g, '').slice(0, 6);
    setOtpValue(onlyDigits);
  };

  return (
    <View className={styles.container}>
      <View className={styles.card}>
        <Text className={styles.title}>Confirme seu código</Text>
        <Text className={styles.desc}>
          Enviamos um código de 6 dígitos para {maskPhone(phoneE164)} via SMS.
        </Text>

        <View
          className={styles.otpRow}
          onClick={() => {
            setOtpFocus(true);
          }}
        >
          {digits.map((d, idx) => (
            <View className={styles.otpBox} key={`otp_${idx}`}>
              <Text className={styles.otpDigit}>{d}</Text>
            </View>
          ))}
          <Input
            className={styles.otpHiddenInput}
            value={otpValue}
            type="number"
            maxlength={6}
            focus={otpFocus}
            onFocus={() => setOtpFocus(true)}
            onBlur={() => setOtpFocus(false)}
            onInput={(e) => handleOtpChange(e.detail.value)}
          />
        </View>

        <View id="recaptcha-verify" />

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
      </View>
    </View>
  );
}

export default VerifyCodePage;
