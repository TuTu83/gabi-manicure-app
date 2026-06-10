// TESTE MÍNIMO DE FETCH PARA O APK
console.log('=== TESTE MÍNIMO DE FETCH INICIADO ===');

export const testFetchMinimum = async () => {
  console.log('=== INICIANDO TESTE ===');
  const url = 'https://gabi-manicure-app.vercel.app/api/ping';
  console.log('URL EXATA:', url);

  const method = 'GET';
  const headers = { 'Accept': 'application/json' };

  console.log('MÉTODO:', method);
  console.log('HEADERS:', headers);

  try {
    console.log('CHAMANDO FETCH...');
    const response = await fetch(url, {
      method,
      headers,
      mode: 'cors',
      credentials: 'omit'
    });
    console.log('FETCH CONCLUIDO!');
    console.log('RESPONSE.STATUS:', response.status);
    console.log('RESPONSE.OK:', response.ok);

    const text = await response.text();
    console.log('RESPONSE.TEXT():', text);

    return {
      success: true,
      status: response.status,
      body: text
    };
  } catch (error) {
    console.error('=== ERRO NO FETCH ===');
    console.error('ERRO MESSAGE:', error.message);
    console.error('ERRO NAME:', error.name);
    console.error('ERRO STACK:', error.stack);
    console.error('ERRO COMPLETO:', error);

    return {
      success: false,
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack
      }
    };
  }
};

console.log('=== ARQUIVO test-fetch.js CARREGADO ===');
