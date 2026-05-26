import React, { useMemo } from 'react';
import { Text, View } from '@tarojs/components';
import styles from './index.module.scss';

export interface BarChartItem {
  label: string;
  value: number;
}

interface MiniBarChartProps {
  items: BarChartItem[];
}

function MiniBarChart(props: MiniBarChartProps) {
  const maxValue = useMemo(() => Math.max(1, ...props.items.map((i) => i.value)), [props.items]);
  return (
    <View className={styles.container}>
      {props.items.map((item) => {
        const heightPct = Math.max(6, Math.round((item.value / maxValue) * 100));
        return (
          <View className={styles.barItem} key={item.label}>
            <View className={styles.barTrack}>
              <View className={styles.barFill} style={{ height: `${heightPct}%` }} />
            </View>
            <Text className={styles.value}>{item.value}</Text>
            <Text className={styles.label}>{item.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default MiniBarChart;
