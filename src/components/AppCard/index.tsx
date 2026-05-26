import React from 'react';
import { View } from '@tarojs/components';
import styles from './index.module.scss';

interface AppCardProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

function AppCard(props: AppCardProps) {
  return (
    <View className={`${styles.card} ${props.className || ''}`.trim()}>
      <View className={`${styles.inner} ${props.contentClassName || ''}`.trim()}>{props.children}</View>
    </View>
  );
}

export default AppCard;
