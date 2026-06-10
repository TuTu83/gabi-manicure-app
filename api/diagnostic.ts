
import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

console.log('[DIAGNOSTIC] Initializing...');

// Initialize Firebase Admin (singleton)
if (!admin.apps.length) {
  try {
    const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (serviceAccountBase64) {
      const serviceAccount = JSON.parse(Buffer.from(serviceAccountBase64, 'base64').toString('utf-8'));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log('[DIAGNOSTIC] Firebase Admin initialized');
    } else {
      console.error('[DIAGNOSTIC] FIREBASE_SERVICE_ACCOUNT_BASE64 missing');
    }
  } catch (e) {
    console.error('[DIAGNOSTIC] Firebase Admin init error:', e);
  }
}
const db = admin.firestore();
const ADMIN_EMAIL = 'suporte.gabimanicure@gmail.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[DIAGNOSTIC] Request received');
  
  // CORS Headers
  const allowedOrigins = [
    'https://localhost',
    'capacitor://localhost',
    'http://localhost:3000',
    'http://localhost:5173',
    'https://gabi-manicure-app.vercel.app'
  ];
  const origin = req.headers.origin || '';
  if (allowedOrigins.includes(origin) || origin.startsWith('http://localhost') || origin.startsWith('https://localhost')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    console.log(`[${new Date().toISOString()}] [diagnostic] Handling OPTIONS preflight`);
    return res.status(200).end();
  }

  const report: any = {};

  try {
    // === ETAPA 1: Todos os usuários ===
    const usersSnapshot = await db.collection('users').get();
    report.ETAPA1 = {
      totalUsuarios: usersSnapshot.size,
    };

    // === ETAPA 2: Filtrar admins ===
    const adminUsers: any[] = [];
    usersSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const email = (data.email || '').trim().toLowerCase();
      const role = data.role || null;
      const isAdminByRole = role === 'admin';
      const isAdminByEmail = email === ADMIN_EMAIL;
      const isAdmin = isAdminByRole || isAdminByEmail;

      if (isAdmin) {
        adminUsers.push({
          id: doc.id,
          email: data.email,
          role: role,
          isAdminByRole: isAdminByRole,
          isAdminByEmail: isAdminByEmail,
        });
      }
    });
    report.ETAPA2 = {
      totalAdmins: adminUsers.length,
      admins: adminUsers,
    };

    // === ETAPA 3: Tokens dos admins ===
    const adminTokensReport: any[] = [];
    const allAdminTokens: string[] = [];
    for (const adminUser of adminUsers) {
      const userDoc = await db.collection('users').doc(adminUser.id).get();
      const userData = userDoc.data() || {};
      const fcmToken = userData.fcmToken || null;
      const fcmTokens = Array.isArray(userData.fcmTokens) ? userData.fcmTokens : [];

      const uniqueTokens = new Set<string>();
      if (fcmToken) uniqueTokens.add(fcmToken);
      fcmTokens.forEach((t) => uniqueTokens.add(t));

      const tokenList = Array.from(uniqueTokens);
      tokenList.forEach((t) => allAdminTokens.push(t));

      adminTokensReport.push({
        id: adminUser.id,
        email: adminUser.email,
        fcmToken: !!fcmToken,
        fcmTokensCount: fcmTokens.length,
        totalTokens: tokenList.length,
        tokens: tokenList.map((t) => {
          const len = t.length;
          return len > 16 ? t.substring(0, 8) + '...' + t.substring(len - 4) : t;
        }),
      });
    }
    report.ETAPA3 = adminTokensReport;

    // === ETAPA 4: Executar getAdminFcmTokens() (manual) ===
    const tokensSet = new Set<string>();
    const getAdminTokensSnapshot = await db.collection('users').get();
    getAdminTokensSnapshot.forEach((doc) => {
      const data = doc.data();
      const email = (data.email || '').trim().toLowerCase();
      const role = data.role || null;
      const isAdmin = role === 'admin' || email === ADMIN_EMAIL;
      if (isAdmin) {
        if (data.fcmTokens && Array.isArray(data.fcmTokens)) {
          data.fcmTokens.forEach((token) => tokensSet.add(token));
        }
        if (data.fcmToken) tokensSet.add(data.fcmToken);
      }
    });
    const getAdminTokensResult = Array.from(tokensSet);
    report.ETAPA4 = {
      tokensCount: getAdminTokensResult.length,
      tokens: getAdminTokensResult.map((t) => {
        const len = t.length;
        return len > 16 ? t.substring(0, 8) + '...' + t.substring(len - 4) : t;
      }),
    };

    // === ETAPA 5 & 6: Enviar notificação manualmente ===
    if (getAdminTokensResult.length > 0) {
      const payload = {
        title: '🧪 Teste de Diagnóstico',
        body: 'Notificação de teste do sistema Gabi Manicure',
        fcmTokens: getAdminTokensResult,
        data: {
          type: 'diagnostic_test',
          timestamp: Date.now().toString(),
        },
      };
      report.ETAPA5 = { payload: { ...payload, fcmTokens: payload.fcmTokens.map((t) => {
        const len = t.length;
        return len > 16 ? t.substring(0, 8) + '...' + t.substring(len - 4) : t;
      }) } };

      const messages = payload.fcmTokens.map((token) => ({
        token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data,
        webpush: {
          notification: {
            title: payload.title,
            body: payload.body,
            icon: '/icon.svg',
            vibrate: [100, 50, 100],
            requireInteraction: true,
          },
        },
      }));

      const fcmResult = await admin.messaging().sendEach(messages);

      report.ETAPA6 = {
        successCount: fcmResult.successCount,
        failureCount: fcmResult.failureCount,
        responses: fcmResult.responses.map((r, i) => ({
          token: payload.fcmTokens[i],
          success: r.success,
          messageId: r.messageId,
          error: r.error ? { code: r.error.code, message: r.error.message } : null,
        })),
      };
    } else {
      report.ETAPA5 = { mensagem: 'Nenhum token para enviar' };
      report.ETAPA6 = { mensagem: 'Nenhum token para enviar' };
    }

    // === ETAPA 7: Identificar problema ===
    let problema = 'Nenhum problema identificado';
    let etapaProblema = '';
    if (adminUsers.length === 0) {
      problema = 'Nenhum usuário admin encontrado na coleção users';
      etapaProblema = 'Firestore';
    } else if (getAdminTokensResult.length === 0) {
      problema = 'Nenhum token FCM encontrado para os admins';
      etapaProblema = 'Tokens';
    } else if (report.ETAPA6?.failureCount === report.ETAPA6?.responses?.length) {
      problema = 'Todos os tokens falharam no envio para o Firebase Admin SDK';
      etapaProblema = 'Firebase Admin SDK';
    } else if (report.ETAPA6?.failureCount > 0) {
      problema = 'Alguns tokens falharam';
      etapaProblema = 'Tokens';
    } else if (report.ETAPA6?.successCount > 0) {
      problema = 'Nenhum problema! Notificações enviadas com sucesso';
      etapaProblema = '';
    }
    report.ETAPA7 = {
      problema: problema,
      etapa: etapaProblema,
    };

    res.status(200).json(report);
  } catch (e) {
    console.error('[DIAGNOSTIC] Error:', e);
    res.status(500).json({ error: String(e) });
  }
}
