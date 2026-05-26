import React from 'react';
import { Text, View } from '@tarojs/components';
import styles from './index.module.scss';

interface LoadingOverlayProps {
  visible: boolean;
  title?: string;
  description?: string;
}

function LoadingOverlay(props: LoadingOverlayProps) {
  if (!props.visible) return null;
  return (
    <View className={styles.mask}>
      <View className={styles.card}>
        <Text className={styles.title}>{props.title || 'Carregando…'}</Text>
        <Text className={styles.desc}>{props.description || 'Aguarde só um instante.'}</Text>
      </View>
    </View>
  );
}

export default LoadingOverlay;
