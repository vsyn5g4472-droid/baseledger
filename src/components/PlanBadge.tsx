import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

type Plan = 'free' | 'light' | 'standard' | 'pro';
type Variant = 'text' | 'icon' | 'badge';

interface PlanBadgeProps {
  plan: Plan | string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  variant?: Variant;
}

const PLAN_COLORS: Record<string, { bg: string; highlight: string }> = {
  pro:      { bg: '#F5A623', highlight: '#FFD700' },
  standard: { bg: '#B0B8C1', highlight: '#E2E8EE' },
  light:    { bg: '#C47B2A', highlight: '#E09A50' },
};

/** 野球ボール型チェックマークバッジ（SVG） */
function BaseballBadge({ plan, sizePx }: { plan: string; sizePx: number }) {
  const colors = PLAN_COLORS[plan];
  if (!colors) return null;
  const r = sizePx / 2;

  const s = sizePx / 18;
  const stitch1 = `M${3.5 * s},${9 * s} C${5 * s},${5.5 * s} ${8 * s},${5.5 * s} ${9 * s},${9 * s} C${10 * s},${12.5 * s} ${13 * s},${12.5 * s} ${14.5 * s},${9 * s}`;
  const stitch2 = `M${3.5 * s},${9 * s} C${5 * s},${12.5 * s} ${8 * s},${12.5 * s} ${9 * s},${9 * s} C${10 * s},${5.5 * s} ${13 * s},${5.5 * s} ${14.5 * s},${9 * s}`;
  const check   = `M${4.5 * s},${9.2 * s} L${7.5 * s},${12.2 * s} L${13.5 * s},${5.8 * s}`;

  return (
    <Svg width={sizePx} height={sizePx} viewBox={`0 0 ${sizePx} ${sizePx}`}>
      {/* 外縁ハイライト */}
      <Circle cx={r} cy={r} r={r - 0.5} fill={colors.highlight} />
      {/* 本体 */}
      <Circle cx={r} cy={r} r={r - 1.5} fill={colors.bg} />
      {/* 上部グレア */}
      <Circle cx={r} cy={r - r * 0.22} r={r * 0.55} fill={colors.highlight} opacity={0.35} />
      {/* 野球ステッチ */}
      <Path d={stitch1} stroke="rgba(255,255,255,0.55)" strokeWidth={sizePx * 0.078} fill="none" strokeLinecap="round" />
      <Path d={stitch2} stroke="rgba(255,255,255,0.55)" strokeWidth={sizePx * 0.078} fill="none" strokeLinecap="round" />
      {/* チェックマーク */}
      <Path d={check} stroke="white" strokeWidth={sizePx * 0.14} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function PlanBadge({ plan, size = 'md', variant = 'text' }: PlanBadgeProps) {
  const normalizedPlan = (plan ?? 'free') as Plan;

  // ── badge variant: 全有料プラン共通の野球ボールアイコン ──────────────────────
  if (variant === 'badge') {
    if (normalizedPlan === 'free') return null;
    const sizePx = size === 'sm' ? 15 : size === 'lg' ? 28 : 18;
    return (
      <View style={[s.wrapper, { marginLeft: size === 'sm' ? 3 : size === 'lg' ? 0 : 4 }]}>
        <BaseballBadge plan={normalizedPlan} sizePx={sizePx} />
      </View>
    );
  }

  // ── icon variant（後方互換） ───────────────────────────────────────────────
  if (variant === 'icon') {
    if (normalizedPlan === 'free' || normalizedPlan === 'light') return null;
    const isPro = normalizedPlan === 'pro';
    const glowColor = isPro ? '#FFD700' : '#C0C0C0';
    const fontSize = size === 'sm' ? 14 : 18;
    return (
      <View style={[s.iconBadge, {
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

  // ── text variant（プロフィール画面用、後方互換） ───────────────────────────
  if (normalizedPlan === 'free' || normalizedPlan === 'light') return null;
  const isPro = normalizedPlan === 'pro';
  return (
    <View style={[
      s.textBadge,
      isPro ? s.proBadge : s.standardBadge,
      size === 'sm' && s.textBadgeSm,
    ]}>
      <Text style={[
        s.textLabel,
        isPro ? s.proLabel : s.standardLabel,
        size === 'sm' && s.textLabelSm,
      ]}>
        {isPro ? 'PRO' : 'STD'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    alignSelf: 'center',
  },
  iconBadge: {
    marginLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textBadge: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  textBadgeSm: {
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  proBadge:    { backgroundColor: '#FFD700' },
  standardBadge: { backgroundColor: '#C0C0C0' },
  textLabel: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  textLabelSm: { fontSize: 10 },
  proLabel:    { color: '#7B5800' },
  standardLabel: { color: '#3A3A3A' },
});
