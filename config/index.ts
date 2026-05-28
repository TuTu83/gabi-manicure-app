import type { UserConfigExport } from '@tarojs/cli';
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';
import webpack from 'webpack';
import devConfig from './dev';
import prodConfig from './prod';
import vitePluginImp from 'vite-plugin-imp';
// Referência: https://taro-docs.jd.com/docs/next/config#defineconfig

const defineConfig = <T,>(config: T): T => config;
export default defineConfig<'webpack5'>(async (merge, { command, mode }) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'taro_template',
    date: '2025-12-10',
    designWidth: 375,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2,
    },
    sourceRoot: 'src',
    outputRoot: process.env.TARO_OUTPUT_DIR || 'dist',
    plugins: ['@tarojs/plugin-html'],
    defineConstants: {},
    copy: {
      patterns: [
        { from: 'src/pwa/manifest.webmanifest', to: 'dist/manifest.webmanifest' },
        { from: 'src/pwa/sw.js', to: 'dist/sw.js' },
        { from: 'src/pwa/icon.svg', to: 'dist/icon.svg' },
        { from: 'src/pwa/OneSignalSDKWorker.js', to: 'dist/OneSignalSDKWorker.js' },
        { from: 'src/pwa/OneSignalSDK-v16-ServiceWorker.zip', to: 'dist/OneSignalSDK-v16-ServiceWorker.zip' },
      ],
      options: {},
    },
    framework: 'react',
    compiler: {
      type: 'webpack5',
      prebundle: {
        enable: false,
      },
    },
    cache: {
      enable: false,
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {
            selectorBlackList: ['nut-'],
          },
        },
        cssModules: {
          enable: true,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin);
        chain.plugin('define-firebase-env').use(webpack.DefinePlugin, [
          {
            __GM_FIREBASE_ENV__: JSON.stringify({
              apiKey: process.env.TARO_APP_FIREBASE_API_KEY || '',
              authDomain: process.env.TARO_APP_FIREBASE_AUTH_DOMAIN || '',
              projectId: process.env.TARO_APP_FIREBASE_PROJECT_ID || '',
              storageBucket: process.env.TARO_APP_FIREBASE_STORAGE_BUCKET || '',
              messagingSenderId: process.env.TARO_APP_FIREBASE_MESSAGING_SENDER_ID || '',
              appId: process.env.TARO_APP_FIREBASE_APP_ID || '',
              measurementId: process.env.TARO_APP_FIREBASE_MEASUREMENT_ID || '',
              vapidKey: process.env.TARO_APP_FIREBASE_VAPID_KEY || '',
            }),
            __GM_FIREBASE_DEBUG__: JSON.stringify(process.env.TARO_APP_FIREBASE_DEBUG || ''),
          },
        ]);
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      output: {
        filename: 'js/[name].[hash:8].js',
        chunkFilename: 'js/[name].[chunkhash:8].js',
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css',
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: true,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
        pxtransform: {
          enable: true,
          config: {
            selectorBlackList: ['body'],
            baseFontSize: 37.5,
            unitPrecision: 5,
          },
        },
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin);
        chain.plugin('define-firebase-env').use(webpack.DefinePlugin, [
          {
            __GM_FIREBASE_ENV__: JSON.stringify({
              apiKey: process.env.TARO_APP_FIREBASE_API_KEY || '',
              authDomain: process.env.TARO_APP_FIREBASE_AUTH_DOMAIN || '',
              projectId: process.env.TARO_APP_FIREBASE_PROJECT_ID || '',
              storageBucket: process.env.TARO_APP_FIREBASE_STORAGE_BUCKET || '',
              messagingSenderId: process.env.TARO_APP_FIREBASE_MESSAGING_SENDER_ID || '',
              appId: process.env.TARO_APP_FIREBASE_APP_ID || '',
              measurementId: process.env.TARO_APP_FIREBASE_MEASUREMENT_ID || '',
              vapidKey: process.env.TARO_APP_FIREBASE_VAPID_KEY || '',
            }),
            __GM_FIREBASE_DEBUG__: JSON.stringify(process.env.TARO_APP_FIREBASE_DEBUG || ''),
          },
        ]);
      },
    },
    rn: {
      appName: 'taroDemo',
      postcss: {
        cssModules: {
          enable: true,
        },
      },
    },
  };
  if (process.env.NODE_ENV === 'development') {
    // Build de desenvolvimento
    return merge({}, baseConfig, devConfig);
  }
  // Build de produção
  return merge({}, baseConfig, prodConfig);
});
