
import admin from 'firebase-admin';

console.log('🔥 [Teste Real] Iniciando auditoria completa...');

// 1. Initialize Firebase Admin
console.log('1. Inicializando Firebase Admin...');
let firebaseApp: admin.app.App;
try {
  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (serviceAccountBase64) {
    const serviceAccount = JSON.parse(
      Buffer.from(serviceAccountBase64, 'base64').toString('utf-8')
    );
    if (admin.apps.length === 0) {
      firebaseApp = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
      firebaseApp = admin.app();
    }
    console.log('✅ Firebase Admin inicializado com sucesso!\n');
  } else {
    console.error('❌ FIREBASE_SERVICE_ACCOUNT_BASE64 não está definido!');
    process.exit(1);
  }
} catch (initErr) {
  console.error('❌ Falha ao inicializar Firebase Admin:', initErr);
  process.exit(1);
}

// 2. Get Firestore instance
const db = admin.firestore();
const ADMIN_EMAIL = 'suporte.gabimanicure@gmail.com';

// 3. Query users collection
console.log('2. Consultando coleção users...');
const usersSnapshot = await db.collection('users').get();
console.log(`✅ ${usersSnapshot.size} usuários encontrados na coleção users!\n`);

// 4. Analyze each user
console.log('3. Analisando usuários...');
const allUsers = [];
const adminUsers = [];

usersSnapshot.docs.forEach(doc => {
  const data = doc.data();
  const userId = doc.id;
  const email = (data.email || '').trim().toLowerCase();
  const role = data.role || null;
  const fcmToken = data.fcmToken || null;
  const fcmTokens = data.fcmTokens || [];

  const isAdminByRole = role === 'admin';
  const isAdminByEmail = email === ADMIN_EMAIL;
  const isAdmin = isAdminByRole || isAdminByEmail;

  const userInfo = {
    id: userId,
    email: data.email || '',
    role,
    isAdmin,
    fcmTokenCount: (fcmTokens && Array.isArray(fcmTokens) ? fcmTokens.length : 0) + (fcmToken ? 1 : 0),
    fcmTokens: [...(Array.isArray(fcmTokens) ? fcmTokens : []), ...(fcmToken ? [fcmToken] : [])].filter((token, index, arr) => arr.indexOf(token) === index)
  };

  allUsers.push(userInfo);

  if (isAdmin) {
    adminUsers.push(userInfo);
  }

  console.log(`
  👤 Usuário ID: ${userId}
  - Email: ${userInfo.email || 'N/A'}
  - Role: ${role || 'N/A'}
  - É Admin? ${isAdmin ? '✅ SIM' : '❌ NÃO'}
    - Por role: ${isAdminByRole ? 'Sim' : 'Não'}
    - Por email: ${isAdminByEmail ? 'Sim' : 'Não'}
  - Tokens FCM (total): ${userInfo.fcmTokens.length}
  - Tokens (mascarados): ${userInfo.fcmTokens.map(token => `${token.substring(0, 8)}...${token.substring(token.length - 4)}`)}
  `);
});

console.log('📊 Relatório de usuários:');
console.log(`Total de usuários: ${allUsers.length}`);
console.log(`Total de admins: ${adminUsers.length}`);
adminUsers.forEach((admin, index) => {
  console.log(`
  Admin ${index + 1}:
  - ID: ${admin.id}
  - Email: ${admin.email}
  - Tokens FCM: ${admin.fcmTokens.length}`);
});

if (adminUsers.length === 0) {
  console.warn('⚠️ Nenhum admin encontrado!');
  process.exit(0);
}

const adminTokensSet = new Set<string>();
adminUsers.forEach(admin => admin.fcmTokens.forEach(token => adminTokensSet.add(token)));
const adminTokens = Array.from(adminTokensSet);

console.log('\n🔑 Tokens de admin para envio:');
adminTokens.forEach((token, index) => console.log(`${index + 1}. ${token.substring(0, 8)}...${token.substring(token.length - 4)}`));


// 5. Test API by calling send-notification logic directly
console.log('\n4. Testando envio de notificações...');
console.log('Payload para teste:');
const testPayload = {
  title: 'Teste Real do Sistema',
  body: 'Se você está recebendo isso, o sistema está funcionando!',
  fcmTokens: adminTokens,
  data: { click_action: 'FLUTTER_NOTIFICATION_CLICK' }
};
console.log(JSON.stringify(testPayload, null, 2));

console.log('\n5. Enviando notificações via Firebase Admin SDK...');
const messages = adminTokens.map(token => ({
  token,
  notification: { title: testPayload.title, body: testPayload.body },
  data: { click_action: 'FLUTTER_NOTIFICATION_CLICK' },
  webpush: {
    notification: {
      title: testPayload.title,
      body: testPayload.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      vibrate: [100, 50, 100],
      requireInteraction: true,
      tag: 'gabi_manicure_notification',
      renotify: true
    }
  },
  android: {
    priority: 'high',
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
        alert: { title: testPayload.title, body: testPayload.body },
        badge: 1
      }
    }
  }
}));

const fcmResult = await admin.messaging().sendEach(messages);

console.log('\n📋 Resultado completo do Firebase Admin SDK:');
console.log('successCount:', fcmResult.successCount);
console.log('failureCount:', fcmResult.failureCount);

console.log('\n📝 Detalhes por token:');
const invalidTokens: { userId: string; token: string }[] = [];
fcmResult.responses.forEach((response, index) => {
  const token = adminTokens[index];
  const maskedToken = `${token.substring(0, 8)}...${token.substring(token.length - 4)}`;
  console.log(`\nToken: ${maskedToken}`);
  console.log('Success:', response.success);
  
  if (response.success) {
    console.log('Message ID:', response.messageId);
  } else {
    console.log('Error code:', response.error?.code);
    console.log('Error message:', response.error?.message);
    
    if (
      response.error?.code === 'messaging/registration-token-not-registered' ||
      response.error?.code === 'messaging/invalid-registration-token'
    ) {
      const userWithToken = adminUsers.find(u => u.fcmTokens.includes(token));
      if (userWithToken) {
        invalidTokens.push({ userId: userWithToken.id, token });
      }
    }
  }
});

if (invalidTokens.length > 0) {
  console.log('\n🗑️ Removendo tokens inválidos do Firestore...');
  for (const { userId, token } of invalidTokens) {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (userDoc.exists) {
      const userData = userDoc.data() || {};
      const updatedFcmTokens = (userData.fcmTokens || []).filter((t: string) => t !== token);
      const updatedFcmToken = userData.fcmToken === token ? null : userData.fcmToken;
      
      console.log(`Removendo token do usuário ${userId}: ${token.substring(0, 8)}...`);
      
      await userRef.update({
        fcmTokens: updatedFcmTokens,
        fcmToken: updatedFcmToken,
        updatedAt: Date.now()
      });
    }
  }
  console.log('✅ Tokens inválidos removidos!');
}

console.log('\n✅ Teste concluído!');
console.log('Resumo final:');
console.log('- Admin receitou notificação? (verificar seu dispositivo)');
console.log(`- Total de tokens enviados: ${adminTokens.length}`);
console.log(`- Tokens com sucesso: ${fcmResult.successCount}`);
console.log(`- Tokens com falha: ${fcmResult.failureCount}`);
console.log('- Erros exatos:');
fcmResult.responses.forEach((resp, i) => {
  if (!resp.success) {
    console.log(`  Token ${i+1}: ${resp.error?.code} - ${resp.error?.message}`);
  }
});
