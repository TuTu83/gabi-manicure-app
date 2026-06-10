import { getFirebaseDb, isFirebaseConfigured } from '@/services/firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  runTransaction 
} from 'firebase/firestore';
import type { AppointmentNegotiation, NegotiationStatus, Appointment } from '@/types/booking';
import { safeGetStorage, safeSetStorage } from '@/services/storage';
import { getUserFcmTokens, sendFcmNotification } from '@/services/appointmentService';
import { getAdminFcmTokens } from '@/services/adminService';
import dayjs from 'dayjs';

const NEGOTIATIONS_KEY = 'appointmentNegotiations';

export async function createNegotiation({
  appointmentId,
  clientId,
  adminId,
  newStartAt,
  newEndAt,
  message,
}: {
  appointmentId: string;
  clientId: string;
  adminId: string;
  newStartAt: number;
  newEndAt: number;
  message?: string;
}): Promise<AppointmentNegotiation> {
  const now = Date.now();
  
  const negotiationData: Omit<AppointmentNegotiation, 'id'> = {
    appointmentId,
    clientId,
    adminId,
    status: 'pending',
    newStartAt,
    newEndAt,
    message,
    createdAt: now,
    updatedAt: now,
  };

  if (!isFirebaseConfigured()) {
    const id = `negotiation_${now}`;
    const allNegotiations = safeGetStorage<AppointmentNegotiation[]>(NEGOTIATIONS_KEY) || [];
    const newNegotiation = { id, ...negotiationData };
    safeSetStorage(NEGOTIATIONS_KEY, [newNegotiation, ...allNegotiations]);
    
    console.log('[negotiationService] Negotiation saved locally:', newNegotiation);
    return newNegotiation;
  }

  const dbRef = getFirebaseDb();
  if (!dbRef) throw new Error('Firebase indisponível');

  const docRef = await addDoc(collection(dbRef, 'appointmentNegotiations'), negotiationData);
  const newNegotiation = { id: docRef.id, ...negotiationData };

  console.log('[negotiationService] Negotiation created:', newNegotiation);

  // Send push notification to client
  try {
    const clientTokens = await getUserFcmTokens(clientId);
    const dateStr = dayjs(newStartAt).format('DD/MM/YYYY');
    const timeStr = dayjs(newStartAt).format('HH:mm');
    
    await sendFcmNotification({
      title: 'Proposta de Alteração de Horário',
      body: `Nova proposta de horário para ${dateStr} às ${timeStr}`,
      fcmTokens: clientTokens,
      data: {
        type: 'proposta_alteracao_horario',
        appointmentId,
        negotiationId: docRef.id,
        url: `/pages/negotiation-detail?negotiationId=${docRef.id}`,
      },
    });
  } catch (error) {
    console.error('[negotiationService] Error sending push notification:', error);
  }

  return newNegotiation;
}

export async function getNegotiationById(negotiationId: string): Promise<AppointmentNegotiation | null> {
  if (!isFirebaseConfigured()) {
    const allNegotiations = safeGetStorage<AppointmentNegotiation[]>(NEGOTIATIONS_KEY) || [];
    return allNegotiations.find(n => n.id === negotiationId) || null;
  }

  const dbRef = getFirebaseDb();
  if (!dbRef) return null;

  const docSnap = await getDoc(doc(dbRef, 'appointmentNegotiations', negotiationId));
  if (!docSnap.exists()) return null;

  return { id: docSnap.id, ...docSnap.data() } as AppointmentNegotiation;
}

export async function getNegotiationsByAppointmentId(appointmentId: string): Promise<AppointmentNegotiation[]> {
  if (!isFirebaseConfigured()) {
    const allNegotiations = safeGetStorage<AppointmentNegotiation[]>(NEGOTIATIONS_KEY) || [];
    return allNegotiations.filter(n => n.appointmentId === appointmentId);
  }

  const dbRef = getFirebaseDb();
  if (!dbRef) return [];

  const q = query(
    collection(dbRef, 'appointmentNegotiations'),
    where('appointmentId', '==', appointmentId),
    orderBy('createdAt', 'desc')
  );
  const querySnap = await getDocs(q);
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as AppointmentNegotiation);
}

export async function updateNegotiationStatus(
  negotiationId: string,
  status: NegotiationStatus,
  options?: {
    newStartAt?: number;
    newEndAt?: number;
    message?: string;
  }
): Promise<void> {
  const now = Date.now();
  const updateData: Partial<AppointmentNegotiation> = {
    status,
    updatedAt: now,
  };

  if (options?.newStartAt) updateData.newStartAt = options.newStartAt;
  if (options?.newEndAt) updateData.newEndAt = options.newEndAt;
  if (options?.message) updateData.message = options.message;

  if (!isFirebaseConfigured()) {
    const allNegotiations = safeGetStorage<AppointmentNegotiation[]>(NEGOTIATIONS_KEY) || [];
    const idx = allNegotiations.findIndex(n => n.id === negotiationId);
    if (idx >= 0) {
      allNegotiations[idx] = { ...allNegotiations[idx], ...updateData };
      safeSetStorage(NEGOTIATIONS_KEY, allNegotiations);
    }
    return;
  }

  const dbRef = getFirebaseDb();
  if (!dbRef) throw new Error('Firebase indisponível');

  await updateDoc(doc(dbRef, 'appointmentNegotiations', negotiationId), updateData);
}

export async function acceptNegotiation(
  negotiation: AppointmentNegotiation,
  appointment: Appointment
): Promise<void> {
  if (!isFirebaseConfigured()) {
    await updateNegotiationStatus(negotiation.id, 'completed', {
      newStartAt: negotiation.newStartAt,
      newEndAt: negotiation.newEndAt,
    });
    return;
  }

  const dbRef = getFirebaseDb();
  if (!dbRef) throw new Error('Firebase indisponível');

  await runTransaction(dbRef, async (tx) => {
    // 1. Update negotiation
    tx.update(doc(dbRef, 'appointmentNegotiations', negotiation.id), {
      status: 'completed',
      updatedAt: Date.now(),
    });

    // 2. Update original appointment
    tx.update(doc(dbRef, 'appointments', appointment.id), {
      startAt: negotiation.newStartAt,
      endAt: negotiation.newEndAt,
      updatedAt: Date.now(),
    });
  });

  // Send push notification to client
  try {
    const clientTokens = await getUserFcmTokens(negotiation.clientId);
    const dateStr = dayjs(negotiation.newStartAt).format('DD/MM/YYYY');
    const timeStr = dayjs(negotiation.newStartAt).format('HH:mm');
    
    await sendFcmNotification({
      title: 'Alteração de Horário Confirmada!',
      body: `Seu novo horário é ${dateStr} às ${timeStr}`,
      fcmTokens: clientTokens,
      data: {
        type: 'alteracao_agendamento',
        appointmentId: negotiation.appointmentId,
        url: '/pages/index',
      },
    });
  } catch (error) {
    console.error('[negotiationService] Error sending push notification:', error);
  }
}

export async function respondToNegotiation(
  negotiation: AppointmentNegotiation,
  response: 'accept' | 'reject' | 'counter',
  options?: {
    newStartAt?: number;
    newEndAt?: number;
    message?: string;
  }
): Promise<void> {
  const now = Date.now();

  if (response === 'accept') {
    // First update negotiation to accepted
    await updateNegotiationStatus(negotiation.id, 'accepted');
    
    // Send push notification to admin
    try {
      const adminTokens = await getAdminFcmTokens();
      const dateStr = dayjs(negotiation.newStartAt).format('DD/MM/YYYY');
      const timeStr = dayjs(negotiation.newStartAt).format('HH:mm');
      
      await sendFcmNotification({
        title: 'Proposta Aceita!',
        body: `Cliente aceitou a proposta de horário para ${dateStr} às ${timeStr}`,
        fcmTokens: adminTokens,
        data: {
          type: 'resposta_proposta_aceita',
          appointmentId: negotiation.appointmentId,
          negotiationId: negotiation.id,
        },
      });
    } catch (error) {
      console.error('[negotiationService] Error sending push notification:', error);
    }
  } else if (response === 'counter' && options?.newStartAt && options?.newEndAt) {
    await updateNegotiationStatus(negotiation.id, 'counter_offer', {
      newStartAt: options.newStartAt,
      newEndAt: options.newEndAt,
      message: options.message,
    });

    // Send push notification to admin
    try {
      const adminTokens = await getAdminFcmTokens();
      const dateStr = dayjs(options.newStartAt).format('DD/MM/YYYY');
      const timeStr = dayjs(options.newStartAt).format('HH:mm');
      
      await sendFcmNotification({
        title: 'Contraproposta de Horário',
        body: `Cliente sugeriu ${dateStr} às ${timeStr}`,
        fcmTokens: adminTokens,
        data: {
          type: 'contraproposta_horario',
          appointmentId: negotiation.appointmentId,
          negotiationId: negotiation.id,
        },
      });
    } catch (error) {
      console.error('[negotiationService] Error sending push notification:', error);
    }
  } else {
    // Reject
    await updateNegotiationStatus(negotiation.id, 'rejected');

    // Send push notification to admin
    try {
      const adminTokens = await getAdminFcmTokens();
      
      await sendFcmNotification({
        title: 'Proposta Recusada',
        body: 'Cliente recusou sua proposta de alteração de horário',
        fcmTokens: adminTokens,
        data: {
          type: 'resposta_proposta_recusada',
          appointmentId: negotiation.appointmentId,
          negotiationId: negotiation.id,
        },
      });
    } catch (error) {
      console.error('[negotiationService] Error sending push notification:', error);
    }
  }
}
