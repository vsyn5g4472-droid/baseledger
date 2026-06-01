import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, RadialGradient, Defs, Stop, Path } from 'react-native-svg';

type Plan = 'free' | 'light' | 'standard' | 'pro';

interface PlanBadgeProps {
  plan: Plan;
  size?: 'sm' | 'md';
}

function BaseballBadge({ color1, color2, glowColor, size }: {
  color1: string;
  color2: string;
  glowColor: string;
  size: number;
}) {
  return (
    <View style={[styles.badgeWrap, {
      shadowColor: glowColor,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.95,
      shadowRadius: 8,
      elevation: 10,
      width: size,
      height: size,
    }]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="ballGrad" cx="35%" cy="30%" r="65%">
            <Stop offset="0%" stopColor={color1} />
            <Stop offset="60%" stopColor={color2} />
            <Stop offset="100%" stopColor={color2} stopOpacity="0.8" />
          </RadialGradient>
        </Defs>
        {/* ボール本体 */}
        <Circle cx="50" cy="50" r="46" fill="url(#ballGrad)" />
        {/* 光沢ハイライト */}
        <Circle cx="35" cy="32" r="12" fill="white" opacity="0.35" />
        {/* 縫い目 左 */}
        <Path
          d="M28 30 Q20 50 28 70"
          stroke="white"
          strokeWidth="3"
          fill="none"
          opacity="0.7"
        />
        {/* 縫い目 右 */}
        <Path
          d="M72 30 Q80 50 72 70"
          stroke="white"
          strokeWidth="3"
          fill="none"
          opacity="0.7"
        />
      </Svg>
    </View>
  );
}

export default function PlanBadge({ plan, size = 'md' }: PlanBadgeProps) {
  if (plan === 'free' || plan === 'light') return null;

  const px = size === 'sm' ? 18 : 24;

  if (plan === 'pro') {
    return (
      <View style={styles.container}>
        <BaseballBadge
          color1="#FFF176"
          color2="#FFB300"
          glowColor="#FFD700"
          size={px}
        />
      </View>
    );
  }

  if (plan === 'standard') {
    return (
      <View style={styles.container}>
        <BaseballBadge
          color1="#F5F5F5"
          color2="#9E9E9E"
          glowColor="#C0C0C0"
          size={px}
        />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    marginLeft: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
