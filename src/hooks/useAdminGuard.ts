import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import { useAppStore } from '@/store/appStore';
import { getAdminEmails } from '@/services/adminService';

export function useAdminGuard() {
  const currentUser = useAppStore((s) => s.currentUser);
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setChecking(true);
      try {
        if (!currentUser) {
          if (!cancelled) {
            setAllowed(false);
            Taro.redirectTo({ url: '/pages/auth/login/index' });
          }
          return;
        }

        const email = (currentUser.email || '').trim().toLowerCase();
        if (currentUser.role === 'admin') {
          if (!cancelled) setAllowed(true);
          return;
        }
        if (!email) {
          if (!cancelled) {
            setAllowed(false);
            Taro.showToast({ title: 'Acesse com Google (Gmail) para entrar no admin', icon: 'none' });
            Taro.switchTab({ url: '/pages/profile/index' });
          }
          return;
        }

        const allow = await getAdminEmails();
        const ok = allow.includes(email);
        if (!cancelled) {
          setAllowed(ok);
          if (!ok) {
            Taro.showToast({ title: 'Acesso restrito ao administrador', icon: 'none' });
            Taro.switchTab({ url: '/pages/index/index' });
          }
        }
      } catch {
        if (!cancelled) {
          setAllowed(false);
          Taro.showToast({ title: 'Acesso restrito ao administrador', icon: 'none' });
          Taro.switchTab({ url: '/pages/index/index' });
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  return { checking, allowed, currentUser };
}
