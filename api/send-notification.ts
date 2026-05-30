import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

console.log(`[${new Date().toISOString()}] [API send-notification] Starting...`);

// Initialize Firebase Admin SDK (only once)
let firebaseAdminInitialized = false;
let serviceAccountLoaded = false;
let db: FirebaseFirestore.Firestore | null = null;
if (!admin.apps.length) {
  console.log(`[${new Date().toISOString()}] [API send-notification] Initializing Firebase Admin...`);
  // We need the service account JSON from environment variable
  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '';
  console.log(`[${new Date().toISOString()}] [API send-notification] FIREBASE_SERVICE_ACCOUNT_BASE64 exists:`, !!serviceAccountBase64);
  
  if (serviceAccountBase64) {
    try {
      const serviceAccount = JSON.parse(
        Buffer.from(serviceAccountBase64, 'base64').toString('utf-8')
      );
      serviceAccountLoaded = true;
      console.log(`[${new Date().toISOString()}] [API send-notification] Service account parsed successfully`);
      
      const app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      db = admin.firestore(app);
      firebaseAdminInitialized = true;
      console.log(`[${new Date().toISOString()}] [API send-notification] Firebase Admin initialized ✅`);
    } catch (initError) {
      console.error(`[${new Date().toISOString()}] [API send-notification] Error initializing Firebase Admin:`, initError);
    }
  } else {
    console.error(`[${new Date().toISOString()}] [API send-notification] FIREBASE_SERVICE_ACCOUNT_BASE64 is not set!`);
  }
} else {
  firebaseAdminInitialized = true;
  serviceAccountLoaded = true;
  db = admin.firestore();
  console.log(`[${new Date().toISOString()}] [API send-notification] Firebase Admin already initialized ✅`);
}

// Função para pegar todos os tokens FCM dos usuários
async function getAllUserFcmTokens(): Promise<string[]> {
  if (!db) {
    console.warn(`[${new Date().toISOString()}] [API send-notification] Firestore DB not available`);
    return [];
  }
  try {
    const usersSnapshot = await db.collection('users').get();
    const tokens: string[] = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.fcmToken) {
        tokens.push(userData.fcmToken);
      }
    });
    console.log(`[${new Date().toISOString()}] [API send-notification] Found ${tokens.length} user FCM tokens`);
    return tokens;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [API send-notification] Error fetching user tokens:`, error);
    return [];
  }
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  console.log(`\n[${new Date().toISOString()}] [API send-notification] Received ${request.method} request`);
  
  // For testing, allow GET
  if (request.method === 'GET') {
    return response.status(200).json({
      success: true,
      message: 'send-notification API route is working!',
      firebaseAdminInitialized,
      serviceAccountLoaded,
      timestamp: new Date().toISOString()
    });
  }
  
  // Only allow POST for actual functionality
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = request.body;
    console.log(`[${new Date().toISOString()}] [API send-notification] Request body received:`, JSON.stringify(body, null, 2));
    
    const { title, body: messageBody, fcmTokens, sendToAll = false, data = {} } = body;

    // Decide quais tokens usar: os fornecidos ou todos os usuários
    let tokensToUse: string[] = [];
    if (sendToAll) {
      tokensToUse = await getAllUserFcmTokens();
    } else {
      tokensToUse = fcmTokens || [];
    }

    if (!tokensToUse || tokensToUse.length === 0) {
      console.error(`[${new Date().toISOString()}] [API send-notification] No FCM tokens provided ❌`);
      return response.status(400).json(
        { error: 'No FCM tokens provided' }
      );
    }

    console.log(`[${new Date().toISOString()}] [API send-notification] Tokens to send (${tokensToUse.length}):`, tokensToUse.map((t: string) => `${t.substring(0, 10)}...`));
    console.log(`[${new Date().toISOString()}] [API send-notification] Preparing to send notifications...`);

    const messages = tokensToUse.map((token: string) => ({
      token,
      notification: {
        title,
        body: messageBody
      },
      data: {
        ...data,
        click_action: "FLUTTER_NOTIFICATION_CLICK" // For compatibility
      },
      android: {
        priority: 'high' as const,
        ttl: 3600 * 1000, // 1 hour
        notification: {
          channelId: 'gabi_manicure_channel_high_importance',
          sound: 'default',
          icon: '@mipmap/ic_launcher',
          tag: 'gabi_manicure_notification',
          color: '#e8558f',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'
        }
      },
      apns: { // Just in case we ever have iOS
        payload: {
          aps: {
            sound: 'default',
            alert: {
              title,
              body: messageBody
            },
            badge: 1
          }
        }
      }
    }));

    console.log(`[${new Date().toISOString()}] [API send-notification] Messages prepared:`, JSON.stringify(messages.map(m => ({ ...m, token: m.token?.substring(0, 10) + '...' })), null, 2));

    if (!firebaseAdminInitialized) {
      console.error(`[${new Date().toISOString()}] [API send-notification] Firebase Admin not initialized, cannot send notifications ❌`);
      return response.status(500).json({ 
        error: 'Firebase Admin not initialized', 
        firebaseAdminInitialized, 
        serviceAccountLoaded 
      });
    }

    console.log(`[${new Date().toISOString()}] [API send-notification] Calling sendEach...`);
    // Send each message individually using sendEach
    const fcmResponse = await admin.messaging().sendEach(messages);
    
    console.log(`\n[${new Date().toISOString()}] [API send-notification] Send completed!`);
    console.log(`[${new Date().toISOString()}] [API send-notification] Success count:`, fcmResponse.successCount, '✅');
    console.log(`[${new Date().toISOString()}] [API send-notification] Failure count:`, fcmResponse.failureCount, '❌');
    console.log(`[${new Date().toISOString()}] [API send-notification] Individual results:`, 
      fcmResponse.responses.map((r, i) => ({
        tokenPrefix: tokensToUse[i].substring(0, 10),
        success: r.success,
        messageId: r.messageId,
        error: r.error ? {
          code: r.error.code,
          message: r.error.message
        } : null
      }))
    );

    return response.status(200).json({ 
      success: true, 
      successCount: fcmResponse.successCount, 
      failureCount: fcmResponse.failureCount,
      responses: fcmResponse.responses.map((r, i) => ({
        tokenPrefix: tokensToUse[i].substring(0, 10),
        success: r.success,
        messageId: r.messageId,
        error: r.error ? {
          code: r.error.code,
          message: r.error.message
        } : null
      })),
      firebaseAdminInitialized,
      serviceAccountLoaded,
      totalTokens: tokensToUse.length
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [API send-notification] Error sending notification:`, error);
    return response.status(500).json(
      { 
        error: 'Internal server error',
        details: String(error),
        stack: error instanceof Error ? error.stack : undefined,
        firebaseAdminInitialized,
        serviceAccountLoaded
      }
    );
  }
}
