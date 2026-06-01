import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Plan = 'free' | 'light' | 'standard' | 'pro';
type Variant = 'text' | 'icon';

interface PlanBadgeProps {
  plan: Plan;
  size?: 'sm' | 'md';
  variant?: Variant;
}

export default function PlanBadge({ plan, size = 'md', variant = 'text' }: PlanBadgeProps) {
  if (plan === 'free' || plan === 'light') return null;

  const isPro = plan === 'pro';

  // テキストバッジ（プロフィール画面用）
  if (variant === 'text') {
    return (
      <View style={[
        styles.textBadge,
        isPro ? styles.proBadge : styles.standardBadge,
        size === 'sm' && styles.textBadgeSm,
      ]}>
        <Text style={[
          styles.textLabel,
          isPro ? styles.proLabel : styles.standardLabel,
          size === 'sm' && styles.textLabelSm,
        ]}>
          {isPro ? 'PRO' : 'STD'}
        </Text>
      </View>
    );
  }

  // アイコンバッジ（投稿・チャット・コメント用）
  const glowColor = isPro ? '#FFD700' : '#C0C0C0';
  const fontSize = size === 'sm' ? 14 : 18;
  return (
    <View style={[styles.iconBadge, {
      shadowColor: glowColor,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.95,
      shadowRadius: 6,
      elevation: 8,
    }]}>
      <Text style={{ fontSize }}>⚾</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  textBadge: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textBadgeSm: {
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  proBadge: {
    backgroundColor: '#FFD700',
  },
  standardBadge: {
    backgroundColor: '#C0C0C0',
  },
  textLabel: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  textLabelSm: {
    fontSize: 10,
  },
  proLabel: {
    color: '#7B5800',
  },
  standardLabel: {
    color: '#3A3A3A',
  },
  iconBadge: {
    marginLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
