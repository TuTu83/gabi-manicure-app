import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

console.log(`[${new Date().toISOString()}] [send-notification] Serverless function initialized`);

// Initialize Firebase Admin (singleton)
let firebaseReady = false;
if (!admin.apps.length) {
  try {
    const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (serviceAccountBase64) {
      const serviceAccount = JSON.parse(
        Buffer.from(serviceAccountBase64, 'base64').toString('utf-8')
      );
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      firebaseReady = true;
      console.log(`[${new Date().toISOString()}] [send-notification] Firebase Admin initialized successfully`);
    } else {
      console.error(`[${new Date().toISOString()}] [send-notification] FIREBASE_SERVICE_ACCOUNT_BASE64 is missing`);
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] [send-notification] Firebase Admin init error:`, e);
  }
} else {
  firebaseReady = true;
  console.log(`[${new Date().toISOString()}] [send-notification] Firebase Admin already initialized`);
}

console.log('[API] VERSION: 2026-06-03-01');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[API] REQUEST RECEBIDA');
  console.log('[API] METHOD:', req.method);
  console.log('[API] BODY:', req.body);
  console.log(`[${new Date().toISOString()}] [send-notification] Request received - Method: ${req.method} - Path: ${req.url}`);

  // Check for test endpoint
  if (req.url?.includes('/send-notification-test')) {
    console.log(`[${new Date().toISOString()}] [send-notification-test] Handling test request`);
    return handleTestRequest(req, res);
  }

  // 1. Only allow POST
  if (req.method !== 'POST') {
    console.log(`[${new Date().toISOString()}] [send-notification] Method not allowed: ${req.method}`);
    return res.status(405).json({
      error: "Method not allowed. Use POST"
    });
  }

  try {
    // 2. Validate request body
    const { title, body, fcmTokens, data = {} } = req.body || {};

    console.log("[API] Quantidade de tokens:", fcmTokens?.length);
    console.log("[API] Payload completo:", JSON.stringify({ title, body, data, fcmTokens }));

    if (!title || typeof title !== 'string') {
      console.log(`[${new Date().toISOString()}] [send-notification] Invalid title`);
      return res.status(400).json({
        error: "Title is required and must be a string"
      });
    }

    if (!body || typeof body !== 'string') {
      console.log(`[${new Date().toISOString()}] [send-notification] Invalid body`);
      return res.status(400).json({
        error: "Body is required and must be a string"
      });
    }

    if (!fcmTokens || !Array.isArray(fcmTokens) || fcmTokens.length === 0) {
      console.log(`[${new Date().toISOString()}] [send-notification] Invalid fcmTokens`);
      return res.status(400).json({
        error: "fcmTokens is required and must be a non-empty array of strings"
      });
    }

    // Step 2: Validate tokens and remove duplicates
    console.log("[API] Tokens recebidos:", fcmTokens.length);
    const uniqueTokensSet = new Set<string>();
    const uniqueTokens: string[] = [];
    for (const token of fcmTokens) {
      if (typeof token === 'string' && token.trim().length > 0) {
        if (!uniqueTokensSet.has(token)) {
          uniqueTokensSet.add(token);
          uniqueTokens.push(token);
        }
      }
    }
    console.log("[API] Tokens únicos:", uniqueTokens.length);

    // 3. Check if Firebase is ready
    if (!firebaseReady) {
      console.error(`[${new Date().toISOString()}] [send-notification] Firebase is not ready`);
      return res.status(500).json({
        error: "Internal server error - Firebase not initialized"
      });
    }

    // 4. Prepare and send notifications
    const messages = uniqueTokens.map((token: string) => ({
      token,
      notification: { title, body },
      data: { click_action: 'FLUTTER_NOTIFICATION_CLICK' },
      webpush: {
        notification: {
          title,
          body,
          icon: '/icon.svg',
          badge: '/icon.svg',
          vibrate: [100, 50, 100],
          requireInteraction: true,
          tag: 'gabi_manicure_notification',
          renotify: true
        }
      },
      android: {
        priority: 'high' as const,
        ttl: 3600 * 1000,
        notification: {
          channelId: 'gabi_manicure_channel_high_importance',
          sound: 'default',
          tag: 'gabi_manicure_notification',
          color: '#e8558f',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            alert: { title, body },
            badge: 1
          }
        }
      }
    }));

    console.log(`[FCM API] Sending ${messages.length} notifications...`);
    console.log('[FCM API] Usando método sendEach() do Firebase Admin SDK');
    console.log('[FCM API] Payload completo enviado ao Firebase:', JSON.stringify(messages, null, 2));
    
    let fcmResult;
    try {
      console.log("[API] Chamando Firebase sendEach()");
      fcmResult = await admin.messaging().sendEach(messages);
      console.log("[API] Resposta recebida do Firebase");
      console.log('[FCM RESULT]', JSON.stringify(fcmResult, null, 2));
    } catch (firebaseError) {
      console.error("[API] ERRO FIREBASE");
      console.error(firebaseError);
      if (firebaseError instanceof Error) {
        console.error(firebaseError.message);
        console.error(firebaseError.stack);
      }
      return res.status(500).json({
        success: false,
        error: "Firebase error",
        firebaseError: firebaseError instanceof Error ? {
          message: firebaseError.message,
          stack: firebaseError.stack
        } : String(firebaseError)
      });
    }
    
    console.log('[FCM API] successCount:', fcmResult.successCount);
    console.log('[FCM API] failureCount:', fcmResult.failureCount);
    
    // Tabela final de diagnóstico e limpeza de tokens inválidos
    console.log('\n========== TABELA DE DIAGNÓSTICO ==========');
    console.log('TOKEN | SUCCESS | MESSAGE_ID | ERROR_CODE | ERROR_MESSAGE');
    console.log('-------------------------------------------');
    
    const invalidTokens: string[] = [];
    const successTokensList: Array<{ token: string; messageId: string | null }> = [];
    const failureTokensList: Array<{ token: string; errorCode: string | null; errorMessage: string | null }> = [];
    const errorsList: any[] = [];
    const firestoreDb = getFirestore();
    
    for (let index = 0; index < fcmResult.responses.length; index++) {
      const response = fcmResult.responses[index];
      const token = uniqueTokens[index];
      const success = response.success;
      const messageId = response.messageId || null;
      const errorCode = response.error?.code || null;
      const errorMessage = response.error?.message || null;
      
      console.log(
        `${token.substring(0, 15)}... | ${success} | ${messageId ? messageId.substring(0, 15) + '...' : 'N/A'} | ${errorCode || 'N/A'} | ${errorMessage ? errorMessage.substring(0, 30) + '...' : 'N/A'}`
      );
      
      if (success) {
        successTokensList.push({ token: token.substring(0, 10) + '...', messageId: response.messageId });
      } else {
        failureTokensList.push({ 
          token: token.substring(0, 10) + '...', 
          errorCode: response.error?.code || null, 
          errorMessage: response.error?.message || null 
        });
        errorsList.push({
          token: token.substring(0, 10) + '...',
          error: response.error
        });
      }
      
      if (!success && response.error) {
        console.error('[FCM API] Falha no token:', token.substring(0, 15) + '...');
        console.error('[FCM API] Error code:', errorCode);
        console.error('[FCM API] Error message:', errorMessage);
        
        // Check if error is related to invalid/expired token
        if (
          errorCode === 'messaging/registration-token-not-registered' ||
          errorCode === 'messaging/invalid-registration-token'
        ) {
          invalidTokens.push(token);
        }
      }
    }
    
    console.log('==========================================\n');
    
    // Clean invalid tokens from Firestore
    if (invalidTokens.length > 0) {
      console.log('[FCM API] Iniciando limpeza de tokens inválidos:', invalidTokens.map(t => t.substring(0, 15) + '...'));
      
      try {
        const usersSnapshot = await firestoreDb.collection('users').get();
        
        for (const doc of usersSnapshot.docs) {
          const userData = doc.data();
          let needsUpdate = false;
          const updateData: any = {};
          
          // Check and clean fcmToken field
          if (userData.fcmToken && invalidTokens.includes(userData.fcmToken)) {
            updateData.fcmToken = admin.firestore.FieldValue.delete();
            needsUpdate = true;
            console.log('[FCM API] Removendo fcmToken do usuário:', doc.id, userData.email);
          }
          
          // Check and clean fcmTokens array
          if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
            const tokensToRemove = userData.fcmTokens.filter((t: string) => invalidTokens.includes(t));
            if (tokensToRemove.length > 0) {
              updateData.fcmTokens = admin.firestore.FieldValue.arrayRemove(...tokensToRemove);
              needsUpdate = true;
              console.log('[FCM API] Removendo tokens do array fcmTokens do usuário:', doc.id, userData.email, tokensToRemove.map(t => t.substring(0, 15) + '...'));
            }
          }
          
          // Update the document only if needed
          if (needsUpdate) {
            await firestoreDb.collection('users').doc(doc.id).update(updateData);
            console.log('[FCM API] Documento atualizado com sucesso:', doc.id);
          }
        }
      } catch (cleanupError) {
        console.error('[FCM API] Erro durante limpeza de tokens inválidos:', cleanupError);
      }
    }

    // Return detailed response
    return res.status(200).json({
      success: true,
      totalTokens: fcmTokens.length,
      uniqueTokens: uniqueTokens.length,
      sent: fcmResult.successCount,
      failed: fcmResult.failureCount,
      errors: errorsList,
      successTokens: successTokensList,
      failureTokens: failureTokensList,
      invalidTokensRemoved: invalidTokens.map(t => t.substring(0, 10) + '...'),
      tokensReceivedCount: fcmTokens.length,
      payloadReceived: { title, body, data },
      fullResult: fcmResult
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] [send-notification] Unhandled error:`, error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}

// Test endpoint handler
async function handleTestRequest(req: VercelRequest, res: VercelResponse) {
  console.log("[API] [Test] Iniciando teste com 1 token");

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: "Method not allowed. Use POST"
    });
  }

  try {
    const { title, body, fcmTokens, data = {} } = req.body || {};
    
    console.log("[API] [Test] Payload completo recebido:", JSON.stringify({ title, body, data, fcmTokens }));

    if (!fcmTokens || !Array.isArray(fcmTokens) || fcmTokens.length === 0) {
      return res.status(400).json({ error: "fcmTokens is required" });
    }

    const testToken = fcmTokens[0];
    console.log("[API] [Test] Enviando para token:", testToken.substring(0, 20) + '...');

    // Check if Firebase is ready
    if (!firebaseReady) {
      return res.status(500).json({ error: "Firebase not ready" });
    }

    const message = {
      token: testToken,
      notification: { title, body },
      data: { click_action: 'FLUTTER_NOTIFICATION_CLICK' },
      webpush: {
        notification: {
          title,
          body,
          icon: '/icon.svg',
          badge: '/icon.svg',
          vibrate: [100, 50, 100],
          requireInteraction: true,
          tag: 'gabi_manicure_notification',
          renotify: true
        }
      },
      android: {
        priority: 'high' as const,
        ttl: 3600 * 1000,
        notification: {
          channelId: 'gabi_manicure_channel_high_importance',
          sound: 'default',
          tag: 'gabi_manicure_notification',
          color: '#e8558f',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            alert: { title, body },
            badge: 1
          }
        }
      }
    };

    console.log("[API] [Test] Payload enviado ao Firebase:", JSON.stringify(message, null, 2));

    let result;
    try {
      result = await admin.messaging().sendEach([message]);
      console.log("[API] [Test] Resultado do Firebase:", JSON.stringify(result, null, 2));
      console.log("[API] [Test] Sucesso:", result.successCount > 0);
    } catch (firebaseError) {
      console.error("[API] [Test] ERRO FIREBASE");
      console.error(firebaseError);
      if (firebaseError instanceof Error) {
        console.error(firebaseError.message);
        console.error(firebaseError.stack);
      }
      return res.status(500).json({
        error: "Firebase error",
        details: firebaseError instanceof Error ? {
          message: firebaseError.message,
          stack: firebaseError.stack
        } : String(firebaseError)
      });
    }

    return res.status(200).json({
      success: result.successCount > 0,
      testToken: testToken.substring(0, 20) + '...',
      result: result
    });

  } catch (error) {
    console.error("[API] [Test] Erro geral:", error);
    return res.status(500).json({
      error: "Internal error",
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}
