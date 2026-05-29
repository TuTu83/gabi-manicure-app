import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

console.log('[API send-notification] Starting...');

// Initialize Firebase Admin SDK (only once)
if (!admin.apps.length) {
  console.log('[API send-notification] Initializing Firebase Admin...');
  // We need the service account JSON from environment variable
  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '';
  console.log('[API send-notification] Service account base64:', serviceAccountBase64 ? 'found' : 'NOT FOUND!');
  
  if (serviceAccountBase64) {
    try {
      const serviceAccount = JSON.parse(
        Buffer.from(serviceAccountBase64, 'base64').toString('utf-8')
      );
      console.log('[API send-notification] Service account parsed successfully');
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('[API send-notification] Firebase Admin initialized');
    } catch (initError) {
      console.error('[API send-notification] Error initializing Firebase Admin:', initError);
    }
  } else {
    console.error('[API send-notification] FIREBASE_SERVICE_ACCOUNT_BASE64 is not set!');
  }
}

export async function POST(request: NextRequest) {
  console.log('[API send-notification] Received POST request');
  try {
    const body = await request.json();
    console.log('[API send-notification] Request body:', body);
    const { title, body: messageBody, fcmTokens, data = {} } = body;

    if (!fcmTokens || fcmTokens.length === 0) {
      console.error('[API send-notification] No FCM tokens provided');
      return NextResponse.json(
        { error: 'No FCM tokens provided' },
        { status: 400 }
      );
    }

    console.log('[API send-notification] Preparing to send', fcmTokens.length, 'messages');

    const messages = fcmTokens.map(token => ({
      token,
      notification: {
        title,
        body: messageBody
      },
      data,
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'gabi_manicure_channel_high_importance',
          sound: 'default'
        }
      }
    }));

    console.log('[API send-notification] Sending messages:', messages);

    const results = await Promise.all(
      messages.map(msg => 
        admin.messaging().send(msg).then((result) => {
          console.log('[API send-notification] Message sent successfully:', result);
          return result;
        }).catch(error => {
          console.error('[API send-notification] Error sending individual message:', error);
          return { error: String(error) };
        })
      )
    );

    console.log('[API send-notification] All messages sent, results:', results);
    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('[API send-notification] Error sending notification:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
