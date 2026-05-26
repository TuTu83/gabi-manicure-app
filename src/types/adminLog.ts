export type AdminLogAction =
  | 'login_admin'
  | 'approve_appointment'
  | 'cancel_appointment'
  | 'reschedule_appointment'
  | 'update_appointment_notes'
  | 'finalize_appointment'
  | 'create_payment'
  | 'export_report'
  | 'update_settings'
  | 'upsert_service'
  | 'upsert_promotion'
  | 'update_client';

export interface AdminLogRecord {
  id: string;
  action: AdminLogAction;
  entityType: 'appointment' | 'payment' | 'service' | 'promotion' | 'settings' | 'client' | 'admin';
  entityId?: string;
  createdAt: number;
  actorUserId: string;
  actorEmail?: string;
  summary: string;
  meta?: Record<string, any>;
}
