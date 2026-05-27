import React, { useEffect, useMemo, useState } from 'react';
import { Button, Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import { deleteMyAccount, signOut as signOutService } from '@/services/authService';
import { computeLoyalty, formatDateLabel, formatTime, subscribeUserAppointments } from '@/services/appointmentService';
import { markNotificationRead, subscribeNotificationsForUser } from '@/services/notificationService';
import { openAdminWhatsApp } from '@/services/whatsappService';
import { isAdminUser } from '@/services/adminService';
import { useAppStore } from '@/store/appStore';
import type { Appointment, InAppNotification } from '@/types/booking';
import styles from './index.module.scss';

function ProfilePage() {
  const currentUser = useAppStore((s) => s.currentUser);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const appName = useAppStore((s) => s.appName);
  const settings = useAppStore((s) => s.settings);
  const signOut = useAppStore((s) => s.signOut);
  const allowDarkMode = useAppStore((s) => s.settings.allowDarkMode);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!currentUser) {
      Taro.redirectTo({ url: '/pages/auth/login/index' });
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.id) return;
    return subscribeUserAppointments(currentUser.id, setAppointments);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    return subscribeNotificationsForUser(currentUser.id, setNotifications);
  }, [currentUser?.id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const ok = await isAdminUser(currentUser || null);
      if (!cancelled) setIsAdmin(ok);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const loyalty = useMemo(() => computeLoyalty(appointments), [appointments]);
  const unreadCount = useMemo(() => notifications.filter((n) => !n.readAt).length, [notifications]);

  const handleLogout = async () => {
    try {
      await signOutService();
    } finally {
      signOut();
      Taro.redirectTo({ url: '/pages/auth/login/index' });
    }
  };

  const handleDeleteAccount = async () => {
    if (!currentUser || isDeleting) return;
    const { confirm } = await Taro.showModal({
      title: 'Excluir conta',
      content: 'Essa ação é permanente e remove seu acesso ao app. Tem certeza que deseja excluir sua conta?',
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      confirmColor: '#d32f2f',
    });
    if (!confirm) return;

    setIsDeleting(true);
    try {
      await deleteMyAccount(currentUser);
      signOut();
      Taro.redirectTo({ url: '/pages/auth/login/index' });
    } catch (error: any) {
      Taro.showToast({ title: String(error?.message || 'Não foi possível excluir a conta'), icon: 'none' });
      setIsDeleting(false);
    }
  };

  return (
    <View className={styles.container}>
      <View className={styles.card}>
        <View className={styles.brandRow}>
          {settings.logoUrl ? <Image className={styles.brandLogo} src={settings.logoUrl} mode="aspectFit" /> : <View className={styles.brandLogoFallback} />}
          <Text className={styles.brandName}>{appName}</Text>
        </View>
        <Text className={styles.title}>Perfil</Text>

        <View className={styles.row}>
          <Text className={styles.label}>Nome</Text>
          <Text className={styles.value}>{currentUser?.socialName || currentUser?.fullName || '-'}</Text>
        </View>
        <View className={styles.row}>
          <Text className={styles.label}>Gmail</Text>
          <Text className={styles.value}>{currentUser?.email || '-'}</Text>
        </View>
        <View className={classnames(styles.row, styles.rowLast)}>
          <Text className={styles.label}>Tema</Text>
          <Text className={styles.value}>{theme === 'dark' ? 'Escuro' : 'Claro'}</Text>
        </View>

        <View className={styles.actionRow}>
          <Button className={classnames(styles.actionBtn, styles.actionBtnPrimary)} onClick={() => Taro.switchTab({ url: '/pages/booking/index' })}>
            <Text className={styles.actionTextWhite}>Agendamentos</Text>
          </Button>
          <Button className={styles.actionBtn} onClick={() => openAdminWhatsApp()}>
            <Text className={styles.actionText}>WhatsApp</Text>
          </Button>
        </View>

        <View className={styles.actionRow}>
          <Button className={styles.actionBtn} onClick={() => setNotificationsOpen(true)}>
            <View style={{ display: 'flex', alignItems: 'center', gap: '12rpx' }}>
              <Text className={styles.actionText}>Notificações</Text>
              {unreadCount > 0 ? (
                <View className={styles.badgePill}>
                  <Text className={styles.badgePillText}>{unreadCount}</Text>
                </View>
              ) : null}
            </View>
          </Button>
          {allowDarkMode ? (
            <Button className={styles.actionBtn} onClick={toggleTheme}>
              <Text className={styles.actionText}>{theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</Text>
            </Button>
          ) : null}
        </View>

        <View className={styles.actionRow}>
          <View className={styles.actionBtn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text className={styles.actionText}>
              Fidelidade: {loyalty.points}/{loyalty.nextRewardAt}
            </Text>
          </View>
        </View>

        {isAdmin ? (
          <View className={styles.actionRow}>
            <Button className={classnames(styles.actionBtn, styles.actionBtnPrimary)} onClick={() => Taro.navigateTo({ url: '/pages/admin/index' })}>
              <Text className={styles.actionTextWhite}>Administração</Text>
            </Button>
          </View>
        ) : null}

        <Button className={classnames(styles.btn, styles.btnPrimary)} onClick={handleLogout}>
          <Text className={styles.btnTextWhite}>Sair</Text>
        </Button>

        <Button
          className={classnames(styles.btn, styles.btnDanger)}
          disabled={!currentUser || isDeleting}
          onClick={handleDeleteAccount}
        >
          <Text className={styles.btnTextDanger}>{isDeleting ? 'Excluindo...' : 'Excluir conta'}</Text>
        </Button>
      </View>

      {notificationsOpen ? (
        <View className={styles.modalMask} onClick={() => setNotificationsOpen(false)}>
          <View className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.modalTitle}>Notificações</Text>
            {notifications.length ? (
              notifications.slice(0, 10).map((n) => (
                <View
                  key={n.id}
                  className={styles.modalItem}
                  onClick={async () => {
                    try {
                      await markNotificationRead(n.id);
                    } finally {
                      if (n.appointmentId) {
                        Taro.switchTab({ url: '/pages/booking/index' });
                      }
                    }
                  }}
                >
                  <View className={styles.modalItemTitleRow}>
                    <Text className={styles.modalItemTitle}>{n.title}</Text>
                    {!n.readAt ? (
                      <View className={styles.badgePill}>
                        <Text className={styles.badgePillText}>nova</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className={styles.modalItemBody}>{n.body}</Text>
                  <Text className={styles.modalItemMeta}>
                    {formatDateLabel(n.createdAt)} às {formatTime(n.createdAt)}
                  </Text>
                </View>
              ))
            ) : (
              <View className={styles.modalItem}>
                <Text className={styles.modalItemBody}>Sem notificações por enquanto.</Text>
              </View>
            )}

            <Button className={styles.btn} onClick={() => setNotificationsOpen(false)}>
              <Text className={styles.btnText}>Fechar</Text>
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default ProfilePage;
