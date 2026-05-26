import React from 'react';
import { Text, View } from '@tarojs/components';
import classnames from 'classnames';
import styles from './index.module.scss';

interface AdminAccordionProps {
  title: string;
  subtitle?: string;
  open: boolean;
  badgeText?: string;
  onToggle: () => void;
  children: React.ReactNode;
}

function AdminAccordion(props: AdminAccordionProps) {
  return (
    <View className={styles.container}>
      <View className={styles.header} onClick={props.onToggle}>
        <View className={styles.titleBlock}>
          <View className={styles.titleRow}>
            <Text className={styles.title}>{props.title}</Text>
            {props.badgeText ? (
              <View className={styles.badge}>
                <Text className={styles.badgeText}>{props.badgeText}</Text>
              </View>
            ) : null}
          </View>
          {props.subtitle ? <Text className={styles.subtitle}>{props.subtitle}</Text> : null}
        </View>
        <View className={styles.chevron}>
          <Text className={styles.chevronText}>{props.open ? 'Fechar' : 'Abrir'}</Text>
        </View>
      </View>
      <View className={classnames(styles.contentWrap, props.open && styles.contentWrapOpen)}>
        <View className={styles.contentInner}>{props.children}</View>
      </View>
    </View>
  );
}

export default AdminAccordion;
