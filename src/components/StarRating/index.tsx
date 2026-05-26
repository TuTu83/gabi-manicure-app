import React from 'react';
import { Button, Text, View } from '@tarojs/components';
import classnames from 'classnames';
import styles from './index.module.scss';

interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
}

function StarRating(props: StarRatingProps) {
  return (
    <View className={styles.row}>
      {Array.from({ length: 5 }).map((_, idx) => {
        const starValue = idx + 1;
        const active = starValue <= props.value;
        return (
          <Button className={styles.starBtn} key={`star_${starValue}`} onClick={() => props.onChange(starValue)}>
            <Text className={classnames(styles.starText, active && styles.starTextActive)}>{active ? '★' : '☆'}</Text>
          </Button>
        );
      })}
    </View>
  );
}

export default StarRating;
