import { NextRequest, NextResponse } from 'next/server';

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || '';
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, body: messageBody, playerIds, data = {} } = body;

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      return NextResponse.json(
        { error: 'OneSignal credentials missing' },
        { status: 500 }
      );
    }

    if (!playerIds || playerIds.length === 0) {
      return NextResponse.json(
        { error: 'No player IDs provided' },
        { status: 400 }
      );
    }

    const notificationData = {
      app_id: ONESIGNAL_APP_ID,
      include_player_ids: playerIds,
      headings: { en: title },
      contents: { en: messageBody },
      data: data,
      android_channel_id: 'gabi_manicure_notifications',
      priority: 10,
      android_background_data: true,
      chrome_web_icon: '/icon.svg',
      firefox_icon: '/icon.svg',
    };

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(notificationData),
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to send notification', details: result },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Error sending notification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
