import React from 'react';
import { Image, View, StyleSheet } from 'react-native';

type Plan = 'free' | 'light' | 'standard' | 'pro';

interface PlanBadgeProps {
  plan: Plan;
  size?: 'sm' | 'md';
}

export default function PlanBadge({ plan, size = 'md' }: PlanBadgeProps) {
  if (plan === 'free' || plan === 'light') return null;

  const px = size === 'sm' ? 20 : 26;

  const source = plan === 'pro'
    ? require('../../assets/badge_pro.png')
    : require('../../assets/badge_standard.png');

  return (
    <View style={[styles.container, {
      shadowColor: plan === 'pro' ? '#FFD700' : '#C0C0C0',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.9,
      shadowRadius: 6,
      elevation: 8,
    }]}>
      <Image
        source={source}
        style={{ width: px, height: px }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginLeft: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
