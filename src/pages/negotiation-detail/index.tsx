import { useEffect, useState } from 'react';
import { Button, Input, Picker, ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { getAuthStore } from '@/store/appStore';
import { getNegotiationById, respondToNegotiation } from '@/services/negotiationService';
import { formatDateLabel, formatTime } from '@/services/appointmentService';
import type { AppointmentNegotiation } from '@/types/booking';
import styles from './index.module.scss';

function toISODate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export default function NegotiationDetailPage() {
  const authStore = getAuthStore();
  const [loading, setLoading] = useState(true);
  const [negotiation, setNegotiation] = useState<AppointmentNegotiation | null>(null);
  const [showCounterOffer, setShowCounterOffer] = useState(false);
  const [counterDateMs, setCounterDateMs] = useState(Date.now());
  const [counterStartTime, setCounterStartTime] = useState<number | null>(null);
  const [counterMessage, setCounterMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = Taro.getCurrentInstance().router?.params || {};
    const negotiationId = params.negotiationId || params.id;
    
    if (negotiationId) {
      loadNegotiation(negotiationId);
    }
  }, []);

  const loadNegotiation = async (negotiationId: string) => {
    try {
      const data = await getNegotiationById(negotiationId);
      setNegotiation(data);
      if (data) {
        setCounterDateMs(data.newStartAt);
      }
    } catch (error) {
      console.error('Failed to load negotiation:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return styles.statusPending;
      case 'accepted': return styles.statusAccepted;
      case 'rejected': return styles.statusRejected;
      case 'counter_offer': return styles.statusCounterOffer;
      case 'completed': return styles.statusCompleted;
      default: return '';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendente';
      case 'accepted': return 'Aceita';
      case 'rejected': return 'Recusada';
      case 'counter_offer': return 'Contraproposta';
      case 'completed': return 'Concluída';
      default: return status;
    }
  };

  const handleAccept = async () => {
    if (!negotiation || busy) return;
    
    setBusy(true);
    try {
      await respondToNegotiation(negotiation, 'accept');
      Taro.showToast({ title: 'Proposta aceita!', icon: 'success' });
      await loadNegotiation(negotiation.id);
    } catch (error) {
      console.error('Failed to accept:', error);
      Taro.showToast({ title: 'Erro ao aceitar', icon: 'none' });
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!negotiation || busy) return;
    
    if (!showCounterOffer) {
      setShowCounterOffer(true);
    } else {
      setBusy(true);
      try {
        await respondToNegotiation(negotiation, 'reject');
        Taro.showToast({ title: 'Proposta recusada', icon: 'success' });
        await loadNegotiation(negotiation.id);
      } catch (error) {
        console.error('Failed to reject:', error);
        Taro.showToast({ title: 'Erro ao recusar', icon: 'none' });
      } finally {
        setBusy(false);
      }
    }
  };

  const handleSendCounterOffer = async () => {
    if (!negotiation || !counterStartTime || busy) return;
    
    setBusy(true);
    try {
      const durationMs = negotiation.newEndAt - negotiation.newStartAt;
      const newEndAt = counterStartTime + durationMs;
      
      await respondToNegotiation(negotiation, 'counter', {
        newStartAt: counterStartTime,
        newEndAt,
        message: counterMessage.trim() || undefined
      });
      Taro.showToast({ title: 'Contraproposta enviada!', icon: 'success' });
      setShowCounterOffer(false);
      await loadNegotiation(negotiation.id);
    } catch (error) {
      console.error('Failed to send counter offer:', error);
      Taro.showToast({ title: 'Erro ao enviar contraproposta', icon: 'none' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View className={styles.container}>
        <View className={styles.header}>
          <Text className={styles.title}>Carregando...</Text>
        </View>
      </View>
    );
  }

  if (!negotiation) {
    return (
      <View className={styles.container}>
        <View className={styles.header}>
          <Text className={styles.title}>Proposta não encontrada</Text>
        </View>
      </View>
    );
  }

  return (
    <View className={styles.container}>
      <View className={styles.header}>
        <Text className={styles.title}>Proposta de Alteração</Text>
        <Text className={styles.desc}>
          O salão propôs um novo horário para o seu atendimento.
        </Text>
      </View>

      <View className={styles.infoCard}>
        <View className={styles.infoRow}>
          <Text className={styles.infoLabel}>Status</Text>
          <View className={`${styles.statusBadge} ${getStatusBadge(negotiation.status)}`}>
            <Text>{getStatusLabel(negotiation.status)}</Text>
          </View>
        </View>

        <View className={styles.infoRow}>
          <Text className={styles.infoLabel}>Data</Text>
          <Text className={styles.infoValue}>
            {formatDateLabel(negotiation.newStartAt)}
          </Text>
        </View>

        <View className={styles.infoRow}>
          <Text className={styles.infoLabel}>Horário</Text>
          <Text className={styles.infoValue}>
            {formatTime(negotiation.newStartAt)}
          </Text>
        </View>

        {negotiation.message && (
          <View className={styles.messageBox}>
            <Text className={styles.messageText}>
              {negotiation.message}
            </Text>
          </View>
        )}
      </View>

      {negotiation.status === 'pending' && (
        <View className={styles.actions}>
          <Button
            className={styles.btnPrimary}
            disabled={busy}
            onClick={handleAccept}
          >
            <Text className={styles.btnPrimaryText}>Aceitar Proposta</Text>
          </Button>

          <Button
            className={styles.btnSecondary}
            disabled={busy}
            onClick={handleReject}
          >
            <Text className={styles.btnSecondaryText}>
              {showCounterOffer ? 'Confirmar Recusa' : 'Recusar / Propor Outro Horário'}
            </Text>
          </Button>

          {showCounterOffer && (
            <View className={styles.counterOfferSection}>
              <Text className={styles.counterTitle}>Propor Outro Horário</Text>

              <Text className={styles.infoLabel}>Data</Text>
              <View className={styles.inputRow}>
                <Picker
                  mode="date"
                  value={toISODate(counterDateMs)}
                  onChange={(e) => {
                    setCounterDateMs(new Date(`${e.detail.value}T00:00:00`).getTime());
                  }}
                >
                  <Text>{formatDateLabel(counterDateMs)}</Text>
                </Picker>
              </View>

              <Text className={styles.infoLabel}>Horário</Text>
              <View className={styles.timeSlots}>
                {[
                  { time: '09:00', ms: 9 * 60 * 60 * 1000 },
                  { time: '10:00', ms: 10 * 60 * 60 * 1000 },
                  { time: '11:00', ms: 11 * 60 * 60 * 1000 },
                  { time: '12:00', ms: 12 * 60 * 60 * 1000 },
                  { time: '14:00', ms: 14 * 60 * 60 * 1000 },
                  { time: '15:00', ms: 15 * 60 * 60 * 1000 },
                  { time: '16:00', ms: 16 * 60 * 60 * 1000 },
                  { time: '17:00', ms: 17 * 60 * 60 * 1000 },
                  { time: '18:00', ms: 18 * 60 * 60 * 1000 },
                  { time: '19:00', ms: 19 * 60 * 60 * 1000 }
                ].map((slot) => {
                  const dateStr = new Date(counterDateMs).toISOString().split('T')[0];
                  const slotStartMs = new Date(`${dateStr}T${slot.time}:00`).getTime();
                  const active = counterStartTime === slotStartMs;
                  
                  return (
                    <Button
                      key={slot.time}
                      className={`${styles.timeSlotBtn} ${active ? styles.timeSlotBtnActive : ''}`}
                      onClick={() => setCounterStartTime(slotStartMs)}
                    >
                      <Text className={`${styles.timeSlotText} ${active ? styles.timeSlotTextActive : ''}`}>
                        {slot.time}
                      </Text>
                    </Button>
                  );
                })}
              </View>

              <Text className={styles.infoLabel}>Mensagem (opcional)</Text>
              <View className={styles.inputRow}>
                <Input
                  className={styles.input}
                  value={counterMessage}
                  onInput={(e) => setCounterMessage(e.detail.value)}
                  placeholder="Adicione uma mensagem"
                />
              </View>

              <Button
                className={styles.btnPrimary}
                disabled={busy || !counterStartTime}
                onClick={handleSendCounterOffer}
              >
                <Text className={styles.btnPrimaryText}>Enviar Contraproposta</Text>
              </Button>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
