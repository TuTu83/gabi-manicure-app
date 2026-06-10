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
import { createNotification } from '@/services/notificationService';
import dayjs from 'dayjs';

const NEGOTIATIONS_KEY = 'appointmentNegotiations';

export async function createNegotiation({
  appointmentId,
  clientId,
  adminId,
  newStartAt,
  newEndAt,
  suggestedSlots,
  message,
}: {
  appointmentId: string;
  clientId: string;
  adminId: string;
  newStartAt?: number;
  newEndAt?: number;
  suggestedSlots?: Array<{ startAt: number; endAt: number }>;
  message?: string;
}): Promise<AppointmentNegotiation> {
  const now = Date.now();
  
  // If suggestedSlots is provided, use the first one as newStartAt/newEndAt for backward compatibility
  let finalNewStartAt = newStartAt;
  let finalNewEndAt = newEndAt;
  if (suggestedSlots && suggestedSlots.length > 0) {
    finalNewStartAt = suggestedSlots[0].startAt;
    finalNewEndAt = suggestedSlots[0].endAt;
  }
  
  // Ensure we have valid start and end times
  if (finalNewStartAt === undefined || finalNewEndAt === undefined) {
    throw new Error('Either newStartAt/newEndAt or suggestedSlots must be provided');
  }
  
  const negotiationData: Omit<AppointmentNegotiation, 'id'> = {
    appointmentId,
    clientId,
    adminId,
    status: 'pending',
    newStartAt: finalNewStartAt,
    newEndAt: finalNewEndAt,
    suggestedSlots,
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
    const firstSlot = suggestedSlots?.[0] || { startAt: finalNewStartAt, endAt: finalNewEndAt };
    const dateStr = dayjs(firstSlot.startAt).format('DD/MM/YYYY');
    const timeStr = dayjs(firstSlot.startAt).format('HH:mm');
    
    // Create in-app notification for client
    await createNotification({
      target: 'cliente',
      targetUserId: clientId,
      type: 'proposta_alteracao_horario',
      title: 'Proposta de Alteração de Horário',
      body: `Nova proposta de horário para ${dateStr} às ${timeStr}`,
      appointmentId,
      negotiationId: docRef.id,
    });

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
    suggestedSlots?: Array<{ startAt: number; endAt: number }>;
    selectedSlot?: { startAt: number; endAt: number };
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
  if (options?.suggestedSlots) updateData.suggestedSlots = options.suggestedSlots;
  if (options?.selectedSlot) updateData.selectedSlot = options.selectedSlot;

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
  // Determine which slot to use: selectedSlot first, then newStartAt/newEndAt
  const slotToUse = negotiation.selectedSlot || { startAt: negotiation.newStartAt, endAt: negotiation.newEndAt };
  
  if (!isFirebaseConfigured()) {
    await updateNegotiationStatus(negotiation.id, 'completed', {
      newStartAt: slotToUse.startAt,
      newEndAt: slotToUse.endAt,
      selectedSlot: slotToUse,
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
      selectedSlot: slotToUse,
    });

    // 2. Update original appointment
    tx.update(doc(dbRef, 'appointments', appointment.id), {
      startAt: slotToUse.startAt,
      endAt: slotToUse.endAt,
      updatedAt: Date.now(),
    });
  });

  // Send push notification to client
  try {
    const clientTokens = await getUserFcmTokens(negotiation.clientId);
    const dateStr = dayjs(slotToUse.startAt).format('DD/MM/YYYY');
    const timeStr = dayjs(slotToUse.startAt).format('HH:mm');
    
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
    selectedSlot?: { startAt: number; endAt: number };
  }
): Promise<void> {
  const now = Date.now();

  if (response === 'accept') {
    // Determine which slot to use
    const slotToUse = options?.selectedSlot || negotiation.selectedSlot || { startAt: negotiation.newStartAt, endAt: negotiation.newEndAt };
    
    // First update negotiation to accepted with selected slot
    await updateNegotiationStatus(negotiation.id, 'accepted', {
      selectedSlot: slotToUse,
      newStartAt: slotToUse.startAt,
      newEndAt: slotToUse.endAt,
    });
    
    // Create in-app notification for admin
    const dateStr = dayjs(slotToUse.startAt).format('DD/MM/YYYY');
    const timeStr = dayjs(slotToUse.startAt).format('HH:mm');
    await createNotification({
      target: 'admin',
      type: 'resposta_proposta_aceita',
      title: 'Proposta Aceita!',
      body: `Cliente aceitou a proposta de horário para ${dateStr} às ${timeStr}`,
      appointmentId: negotiation.appointmentId,
      negotiationId: negotiation.id,
    });
    
    // Send push notification to admin
    try {
      const adminTokens = await getAdminFcmTokens();
      
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

    // Create in-app notification for admin
    const dateStr = dayjs(options.newStartAt).format('DD/MM/YYYY');
    const timeStr = dayjs(options.newStartAt).format('HH:mm');
    await createNotification({
      target: 'admin',
      type: 'contraproposta_horario',
      title: 'Contraproposta de Horário',
      body: `Cliente sugeriu ${dateStr} às ${timeStr}`,
      appointmentId: negotiation.appointmentId,
      negotiationId: negotiation.id,
    });
    
    // Send push notification to admin
    try {
      const adminTokens = await getAdminFcmTokens();
      
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
    
    // Create in-app notification for admin
    await createNotification({
      target: 'admin',
      type: 'resposta_proposta_recusada',
      title: 'Proposta Recusada',
      body: 'Cliente recusou sua proposta de alteração de horário',
      appointmentId: negotiation.appointmentId,
      negotiationId: negotiation.id,
    });

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
