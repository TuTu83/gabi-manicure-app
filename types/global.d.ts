/// <reference types="@tarojs/taro" />

declare module '*.png';
declare module '*.gif';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.svg';
declare module '*.css';
declare module '*.less';
declare module '*.scss';
declare module '*.sass';
declare module '*.styl';

declare namespace NodeJS {
  interface ProcessEnv {
    /** Variável de ambiente do Node, impacta o build final */
    NODE_ENV: 'development' | 'production',
    /** Plataforma atual do build */
    TARO_ENV: 'weapp' | 'swan' | 'alipay' | 'h5' | 'rn' | 'tt' | 'quickapp' | 'qq' | 'jd'
    /**
     * AppId do mini app para o build atual
     * @description Se cada ambiente tiver um app diferente, configure `TARO_APP_ID` no arquivo env para alternar sem editar manualmente o dist/project.config.json
     * @see https://taro-docs.jd.com/docs/next/env-mode-config#%E7%89%B9%E6%AE%8A%E7%8E%AF%E5%A2%83%E5%8F%98%E9%87%8F-taro_app_id
     */
    TARO_APP_ID: string
  }
}

declare global {
  interface Window {
    __DEBUG_PUSH__?: {
      logs: any[];
      lastSent: any;
      lastReceived: any;
      lastError: any;
      lastApiCall?: {
        url: string;
        payload: any;
        timestamp: number;
        status: number | 'pending' | 'error';
        response?: any;
        error?: string;
      };
    };
  }
}
