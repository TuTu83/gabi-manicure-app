
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

console.log('🔍 DIAGNÓSTICO - GABI MANICURE');
console.log('================================');

const ADMIN_EMAIL = 'suporte.gabimanicure@gmail.com';

(async () => {
  try {
    // Tenta carregar service account de várias maneiras
    let serviceAccount = null;

    // 1. Verifica variável de ambiente FIREBASE_SERVICE_ACCOUNT_BASE64
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      const serviceAccountJson = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8');
      serviceAccount = JSON.parse(serviceAccountJson);
      console.log('✅ Carregado service account via FIREBASE_SERVICE_ACCOUNT_BASE64');
    } 
    // 2. Verifica se existe arquivo serviceAccountKey.json na raiz
    else if (fs.existsSync(path.join(__dirname, 'serviceAccountKey.json'))) {
      serviceAccount = require('./serviceAccountKey.json');
      console.log('✅ Carregado service account via serviceAccountKey.json');
    }
    // 3. Verifica se existe .env.local ou .env
    else {
      const envFiles = ['.env.local', '.env'];
      for (const envFile of envFiles) {
        const envPath = path.join(__dirname, envFile);
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, 'utf8');
          const envVars = {};
          envContent.split('\n').forEach(line => {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length) {
              envVars[key.trim()] = valueParts.join('=').trim();
            }
          });
          if (envVars.FIREBASE_SERVICE_ACCOUNT_BASE64) {
            const serviceAccountJson = Buffer.from(envVars.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8');
            serviceAccount = JSON.parse(serviceAccountJson);
            console.log(`✅ Carregado service account via ${envFile}`);
            break;
          }
        }
      }
    }

    if (!serviceAccount) {
      console.error('❌ ERRO: Não foi possível encontrar o service account do Firebase');
      console.error('   Procure por FIREBASE_SERVICE_ACCOUNT_BASE64 nas variáveis de ambiente ou');
      console.error('   coloque serviceAccountKey.json na raiz do projeto.');
      process.exit(1);
    }

    // Inicializa o Firebase Admin
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    const db = admin.firestore();
    console.log('✅ Firebase Admin inicializado com sucesso');
    console.log('');

    // --- ETAPA 1 ---
    console.log('📊 ETAPA 1 - TOTAL DE USUÁRIOS NA COLEÇÃO "users":');
    const usersSnapshot = await db.collection('users').get();
    console.log(`   Total: ${usersSnapshot.size}`);
    console.log('');

    // --- ETAPA 2 ---
    console.log('👑 ETAPA 2 - USUÁRIOS ADMIN:');
    const adminUsers = [];
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
          isAdminByRole,
          isAdminByEmail
        });
      }
    });
    console.log(`   Total: ${adminUsers.length}`);
    adminUsers.forEach(adminUser => {
      console.log('   ---');
      console.log(`   ID: ${adminUser.id}`);
      console.log(`   Email: ${adminUser.email}`);
      console.log(`   Role: ${adminUser.role || '(não definida)'}`);
      console.log(`   Admin por role: ${adminUser.isAdminByRole ? 'SIM' : 'NÃO'}`);
      console.log(`   Admin por email: ${adminUser.isAdminByEmail ? 'SIM' : 'NÃO'}`);
    });
    console.log('');

    // --- ETAPA 3 ---
    console.log('🔑 ETAPA 3 - TOKENS DOS ADMINS:');
    const allAdminTokens = [];
    for (const adminUser of adminUsers) {
      const userDoc = await db.collection('users').doc(adminUser.id).get();
      const userData = userDoc.data() || {};
      const fcmToken = userData.fcmToken || null;
      const fcmTokens = Array.isArray(userData.fcmTokens) ? userData.fcmTokens : [];

      const uniqueTokens = new Set();
      if (fcmToken) uniqueTokens.add(fcmToken);
      fcmTokens.forEach(t => uniqueTokens.add(t));
      const tokenList = Array.from(uniqueTokens);
      tokenList.forEach(t => allAdminTokens.push(t));

      console.log('   ---');
      console.log(`   Admin: ${adminUser.email}`);
      console.log(`   fcmToken: ${fcmToken ? 'SIM' : 'NÃO'}`);
      console.log(`   fcmTokens (array): ${fcmTokens.length} token(s)`);
      console.log(`   Total tokens únicos: ${tokenList.length}`);
      if (tokenList.length > 0) {
        console.log(`   Tokens (mascarados):`);
        tokenList.forEach((t, i) => {
          const masked = t.length > 16 ? `${t.substring(0, 8)}...${t.substring(t.length - 4)}` : t;
          console.log(`     ${i + 1}. ${masked}`);
        });
      }
    }
    console.log('');

    // --- ETAPA 4 ---
    console.log('🔍 ETAPA 4 - EXECUTANDO getAdminFcmTokens() (MANUAL):');
    const tokensSet = new Set();
    const getAdminTokensSnap = await db.collection('users').get();
    getAdminTokensSnap.forEach(doc => {
      const data = doc.data();
      const email = (data.email || '').trim().toLowerCase();
      const role = data.role || null;
      const isAdmin = role === 'admin' || email === ADMIN_EMAIL;
      if (isAdmin) {
        if (data.fcmTokens && Array.isArray(data.fcmTokens)) {
          data.fcmTokens.forEach(token => tokensSet.add(token));
        }
        if (data.fcmToken) tokensSet.add(data.fcmToken);
      }
    });
    const getAdminTokensResult = Array.from(tokensSet);
    console.log(`   Tokens encontrados: ${getAdminTokensResult.length}`);
    if (getAdminTokensResult.length > 0) {
      getAdminTokensResult.forEach((token, i) => {
        const masked = token.length > 16 ? `${token.substring(0, 8)}...${token.substring(token.length - 4)}` : token;
        console.log(`   Token ${i + 1}: ${masked}`);
      });
    }
    console.log('');

    // --- ETAPA 5 & 6 ---
    console.log('📤 ETAPA 5 & 6 - ENVIO DE NOTIFICAÇÃO TESTE:');
    let fcmResult = null;
    if (getAdminTokensResult.length > 0) {
      const payload = {
        title: '🧪 Teste de Diagnóstico Gabi Manicure',
        body: 'Se você está lendo isso, o sistema está funcionando!',
        data: { type: 'diagnostic_test', timestamp: Date.now().toString() }
      };

      console.log('   Payload enviado:');
      console.log(`     Título: ${payload.title}`);
      console.log(`     Corpo: ${payload.body}`);
      console.log(`     Total tokens: ${getAdminTokensResult.length}`);

      const messages = getAdminTokensResult.map(token => ({
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

      console.log('   Enviando para Firebase Admin SDK...');
      fcmResult = await admin.messaging().sendEach(messages);

      console.log('');
      console.log('📊 RESPOSTA DO FIREBASE ADMIN SDK:');
      console.log(`   SuccessCount: ${fcmResult.successCount}`);
      console.log(`   FailureCount: ${fcmResult.failureCount}`);
      console.log('');
      console.log('📝 DETALHES POR TOKEN:');
      fcmResult.responses.forEach((response, index) => {
        const token = getAdminTokensResult[index];
        const maskedToken = token.length > 16 ? `${token.substring(0, 8)}...${token.substring(token.length - 4)}` : token;
        
        console.log(`   Token ${index + 1}: ${maskedToken}`);
        console.log(`   Sucesso: ${response.success ? 'SIM' : 'NÃO'}`);
        if (response.success) {
          console.log(`   Message ID: ${response.messageId}`);
        } else {
          console.log(`   Código de erro: ${response.error?.code}`);
          console.log(`   Mensagem de erro: ${response.error?.message}`);
        }
        console.log('');
      });
    } else {
      console.log('   Nenhum token para enviar, pulando etapa...');
    }
    console.log('');

    // --- ETAPA 7 ---
    console.log('🏁 ETAPA 7 - IDENTIFICAR PROBLEMA:');
    let problema = 'Nenhum problema identificado';
    let etapa = 'Nenhum';
    let status = '';

    if (adminUsers.length === 0) {
      problema = 'Nenhum usuário admin encontrado na coleção users';
      etapa = 'Firestore';
      status = '❌';
    } else if (getAdminTokensResult.length === 0) {
      problema = 'Admin(s) encontrado(s), mas nenhum token FCM cadastrado';
      etapa = 'Tokens';
      status = '❌';
    } else if (fcmResult && fcmResult.failureCount === fcmResult.responses.length) {
      problema = 'Todos os tokens falharam no envio para o Firebase';
      etapa = 'Firebase Admin SDK';
      status = '❌';
    } else if (fcmResult && fcmResult.successCount > 0 && fcmResult.failureCount === 0) {
      problema = 'Sistema funcionando 100%! Notificações enviadas com sucesso!';
      etapa = 'Nenhum';
      status = '✅';
    } else if (fcmResult && fcmResult.successCount > 0 && fcmResult.failureCount > 0) {
      problema = 'Alguns tokens enviados com sucesso, outros falharam';
      etapa = 'Tokens';
      status = '⚠️';
    }

    console.log(`   ${status} ${problema}`);
    console.log('');
    console.log('✅ DIAGNÓSTICO CONCLUÍDO');
    console.log('');

  } catch (e) {
    console.error('❌ ERRO NA EXECUÇÃO DO DIAGNÓSTICO:', e);
    process.exit(1);
  }
})();
