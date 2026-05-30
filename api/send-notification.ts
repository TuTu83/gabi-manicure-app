import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

console.log(`[${new Date().toISOString()}] [API send-notification] Starting...`);

// Initialize Firebase Admin SDK (only once)
let firebaseAdminInitialized = false;
let serviceAccountLoaded = false;
if (!admin.apps.length) {
  console.log(`[${new Date().toISOString()}] [API send-notification] Initializing Firebase Admin...`);
  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '';
  console.log(`[${new Date().toISOString()}] [API send-notification] FIREBASE_SERVICE_ACCOUNT_BASE64 exists:`, !!serviceAccountBase64);
  
  if (serviceAccountBase64) {
    try {
      const serviceAccount = JSON.parse(
        Buffer.from(serviceAccountBase64, 'base64').toString('utf-8')
      );
      serviceAccountLoaded = true;
      console.log(`[${new Date().toISOString()}] [API send-notification] Service account parsed successfully`);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
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
  console.log(`[${new Date().toISOString()}] [API send-notification] Firebase Admin already initialized ✅`);
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  console.log(`\n[${new Date().toISOString()}] [API send-notification] Received ${request.method} request`);
  
  // Only allow POST
  if (request.method !== 'POST') {
    console.log(`[${new Date().toISOString()}] [API send-notification] Method not allowed: ${request.method}`);
    return response.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const body = request.body;
    console.log(`[${new Date().toISOString()}] [API send-notification] Request body received:`, JSON.stringify(body, null, 2));
    
    // Validate request body
    const { title, body: messageBody, fcmTokens, data = {} } = body;
    
    if (!title || typeof title !== 'string') {
      console.error(`[${new Date().toISOString()}] [API send-notification] Invalid title`);
      return response.status(400).json({ error: "Title is required and must be a string" });
    }
    
    if (!messageBody || typeof messageBody !== 'string') {
      console.error(`[${new Date().toISOString()}] [API send-notification] Invalid body`);
      return response.status(400).json({ error: "Body is required and must be a string" });
    }
    
    if (!fcmTokens || !Array.isArray(fcmTokens) || fcmTokens.length === 0) {
      console.error(`[${new Date().toISOString()}] [API send-notification] Invalid fcmTokens`);
      return response.status(400).json({ error: "fcmTokens is required and must be a non-empty array of strings" });
    }
    
    // Validate all tokens are strings
    for (const token of fcmTokens) {
      if (typeof token !== 'string') {
        console.error(`[${new Date().toISOString()}] [API send-notification] Invalid token: ${token}`);
        return response.status(400).json({ error: "All fcmTokens must be strings" });
      }
    }

    console.log(`[${new Date().toISOString()}] [API send-notification] Valid request - Tokens: ${fcmTokens.length}`);

    if (!firebaseAdminInitialized) {
      console.error(`[${new Date().toISOString()}] [API send-notification] Firebase Admin not initialized`);
      return response.status(500).json({ 
        error: "Firebase Admin not initialized",
        firebaseAdminInitialized,
        serviceAccountLoaded
      });
    }

    // Prepare FCM messages
    const messages = fcmTokens.map((token: string) => ({
      token,
      notification: {
        title,
        body: messageBody,
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      webpush: {
        headers: {
          Urgency: 'high',
        },
        notification: {
          title,
          body: messageBody,
          icon: '/icon.svg',
          badge: '/icon.svg',
          vibrate: [100, 50, 100],
          requireInteraction: true,
          tag: 'gabi_manicure_notification',
          renotify: true,
          data: {
            ...data,
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
      },
      android: {
        priority: 'high' as const,
        ttl: 3600 * 1000,
        notification: {
          channelId: 'gabi_manicure_channel_high_importance',
          sound: 'default',
          defaultSound: true,
          defaultVibrateTimings: true,
          icon: '@mipmap/ic_launcher',
          tag: 'gabi_manicure_notification',
          color: '#e8558f',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            alert: {
              title,
              body: messageBody,
            },
            badge: 1,
          }
        }
      }
    }));

    console.log(`[${new Date().toISOString()}] [API send-notification] Sending ${messages.length} notifications...`);
    const fcmResponse = await admin.messaging().sendEach(messages);
    
    console.log(`[${new Date().toISOString()}] [API send-notification] Sent! Success: ${fcmResponse.successCount}, Failed: ${fcmResponse.failureCount}`);

    // Return standard success response as required
    return response.status(200).json({ 
      success: true, 
      sent: fcmResponse.successCount, 
      message: "Notifications processed",
      successCount: fcmResponse.successCount,
      failureCount: fcmResponse.failureCount,
      responses: fcmResponse.responses.map((r, i) => ({
        tokenPrefix: fcmTokens[i].substring(0, 10),
        success: r.success,
        messageId: r.messageId,
        error: r.error ? {
          code: r.error.code,
          message: r.error.message
        } : null
      })),
      firebaseAdminInitialized,
      serviceAccountLoaded,
      totalTokens: fcmTokens.length
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [API send-notification] Error:`, error);
    return response.status(500).json({ 
      error: "Internal server error",
      details: String(error),
      firebaseAdminInitialized,
      serviceAccountLoaded
    });
  }
}
