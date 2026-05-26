# Gabi Manicure

Aplicativo de agendamentos e administração para manicure, construído com **Taro + React + TypeScript**, com arquitetura voltada para **Firebase (Auth + Firestore + Storage)**, atualização em tempo real e painel admin protegido.

## Requisitos

- Node.js: **>= 18 e < 24**
- npm: **>= 9**

> Observação: em Windows, builds com Node 24 podem falhar por incompatibilidade de binário nativo do ecossistema do Taro.

## Instalação

```bash
npm install
```

## Variáveis de ambiente (Firebase)

Este projeto lê a configuração do Firebase via variáveis de ambiente:

- `TARO_APP_FIREBASE_API_KEY`
- `TARO_APP_FIREBASE_AUTH_DOMAIN`
- `TARO_APP_FIREBASE_PROJECT_ID`
- `TARO_APP_FIREBASE_APP_ID`
- `TARO_APP_FIREBASE_STORAGE_BUCKET`

### Como configurar

1. Copie o arquivo de exemplo:

```bash
copy .env.example .env
```

2. Preencha os valores com as credenciais do seu projeto Firebase (Console do Firebase → Project settings → Your apps → Web app).

> Dica: a configuração do Firebase do cliente (apiKey, authDomain, etc.) não é um “segredo” como uma chave privada, mas manter em `.env` ajuda a separar ambientes e evita commits acidentais.

## Rodar localmente (H5)

```bash
npm run dev
```

Abra:

- http://localhost:10086/

## Scripts principais

- `npm run dev` (H5 em watch)
- `npm run build` (build H5)
- `npm run build:weapp` (build WeChat Mini Program)
- `npm run build:rn` (build React Native via Taro)
- `npm run typecheck` (checagem TypeScript)

## Firebase (setup recomendado)

### Auth

Ative os provedores necessários no Firebase Authentication (ex.: Email/Senha e Google, conforme o app utiliza).

### Firestore

Coleções utilizadas (principal):

- `users`
- `appointments`
- `services`
- `promotions`
- `notifications`
- `payments`
- `adminLogs`
- `waitlist`
- `appSettings` (documento `public`)
- `admin` (documento `config`)

Configuração do painel admin:

- Crie o documento `admin/config` com o campo `emails` (array de e-mails autorizados).

Exemplo:

```json
{
  "emails": ["admin@seudominio.com"]
}
```

### Storage

Pastas/prefixos esperados:

- `services/`
- `promotions/`
- `branding/`

## Regras de segurança (Firestore/Storage)

Arquivos incluídos no repositório:

- `firestore.rules`
- `storage.rules`

Depois de configurar o Firebase, publique as regras usando o Firebase CLI (ou pelo Console):

1. Instale o Firebase CLI (global) se necessário
2. Faça login e selecione o projeto
3. Publique regras

## Build para publicação

### H5

```bash
npm run build:h5
```

### WeChat Mini Program

```bash
npm run build:weapp
```

Abra o projeto no WeChat DevTools apontando para a pasta `dist/`.

### Android / iPhone (React Native via Taro)

```bash
npm run build:rn
```

Para gerar APK/IPA é necessário completar a etapa RN (ambiente Android Studio / Xcode) conforme o fluxo do Taro RN.

## Observações importantes

- `node_modules/` e `dist/` não devem ser commitados.
- O projeto possui fallback local quando Firebase não está configurado, para não quebrar telas em desenvolvimento.

