import React from 'react';
import { Text, View } from '@tarojs/components';
import styles from './index.module.scss';

interface SectionHeaderProps {
  title: string;
  actionText?: string;
  onActionClick?: () => void;
}

function SectionHeader(props: SectionHeaderProps) {
  return (
    <View className={styles.row}>
      <Text className={styles.title}>{props.title}</Text>
      {props.actionText ? (
        <Text className={styles.action} onClick={props.onActionClick}>
          {props.actionText}
        </Text>
      ) : null}
    </View>
  );
}

export default SectionHeader;
