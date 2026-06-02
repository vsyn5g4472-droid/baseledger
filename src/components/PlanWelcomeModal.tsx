import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Animated,
} from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { UserPlan } from '../services/planService';
import { BorderRadius } from '../constants/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── スライド定義 ─────────────────────────────────────────────────────────────

interface Slide {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  features: { icon: string; text: string }[];
  bg: string;
  accent: string;
}

const SLIDES_BY_PLAN: Record<UserPlan, Slide[]> = {
  [UserPlan.FREE]: [],
  [UserPlan.LIGHT]: [
    {
      id: 'welcome',
      emoji: '⚡',
      title: 'ライトプラン\n開始！',
      subtitle: '野球記録・分析の世界へようこそ',
      features: [],
      bg: '#1A3A5C',
      accent: '#5B9BD5',
    },
    {
      id: 'analysis',
      emoji: '📊',
      title: '分析機能\n解放！',
      subtitle: 'データで試合を深く読む',
      features: [
        { icon: 'chart-scatter-plot', text: 'スプレーチャート' },
        { icon: 'fire', text: 'ゾーンヒートマップ' },
        { icon: 'trophy-outline', text: 'リーダーボード' },
        { icon: 'robot-outline', text: 'AI分析レポート（3回/月）' },
      ],
      bg: '#0D2137',
      accent: '#5B9BD5',
    },
    {
      id: 'extra',
      emoji: '🚫',
      title: '広告\n非表示！',
      subtitle: '快適な記録体験をどうぞ',
      features: [
        { icon: 'message-outline', text: 'グループチャット送信' },
        { icon: 'advertisements-off', text: '広告なしで記録に集中' },
        { icon: 'baseball', text: '10試合/月まで記録' },
      ],
      bg: '#1A2C40',
      accent: '#5B9BD5',
    },
    {
      id: 'start',
      emoji: '🚀',
      title: 'さあ、\n始めよう！',
      subtitle: 'あなたの野球記録をデータで残そう',
      features: [],
      bg: '#0B1E30',
      accent: '#5B9BD5',
    },
  ],
  [UserPlan.STANDARD]: [
    {
      id: 'welcome',
      emoji: '🔥',
      title: 'スタンダード\nプラン開始！',
      subtitle: '本格的な野球分析がここから始まる',
      features: [],
      bg: '#0D2137',
      accent: '#1A6BB5',
    },
    {
      id: 'stats',
      emoji: '📈',
      title: '高度統計\n解放！',
      subtitle: 'プロも使うデータ分析',
      features: [
        { icon: 'calculator-variant-outline', text: 'セイバーメトリクス' },
        { icon: 'export-variant', text: '成績エクスポート（CSV）' },
        { icon: 'robot-outline', text: 'AI分析レポート（15回/月）' },
        { icon: 'infinity', text: '試合記録 無制限' },
      ],
      bg: '#071525',
      accent: '#1A6BB5',
    },
    {
      id: 'team',
      emoji: '🏟️',
      title: 'チーム機能\n解放！',
      subtitle: 'チームでデータを共有しよう',
      features: [
        { icon: 'account-group-outline', text: 'チーム作成（1チーム）' },
        { icon: 'cloud-outline', text: 'クラウドバックアップ' },
        { icon: 'message-outline', text: 'グループチャット送信' },
        { icon: 'advertisements-off', text: '広告非表示' },
      ],
      bg: '#0D1F30',
      accent: '#1A6BB5',
    },
    {
      id: 'start',
      emoji: '🎯',
      title: 'さあ、\n本気で行こう！',
      subtitle: 'スタンダードプランで勝利を掴め',
      features: [],
      bg: '#071525',
      accent: '#1A6BB5',
    },
  ],
  [UserPlan.PRO]: [
    {
      id: 'welcome',
      emoji: '👑',
      title: 'PRO\nプラン開始！',
      subtitle: '全機能解放。最高峰の野球データ体験へ',
      features: [],
      bg: '#1C1200',
      accent: '#D4AF37',
    },
    {
      id: 'ai',
      emoji: '🤖',
      title: 'AI機能\n完全解放！',
      subtitle: '人工知能があなたの野球を分析する',
      features: [
        { icon: 'robot', text: 'AI分析レポート 無制限' },
        { icon: 'account-search-outline', text: 'AIスカウトレポート' },
        { icon: 'crystal-ball', text: 'AI試合予測' },
        { icon: 'magnify', text: '球歴検索' },
      ],
      bg: '#110D00',
      accent: '#D4AF37',
    },
    {
      id: 'team',
      emoji: '🏆',
      title: '全チーム機能\n解放！',
      subtitle: '複数チームを管理・分析',
      features: [
        { icon: 'account-group', text: '複数チーム管理 無制限' },
        { icon: 'cloud-sync-outline', text: 'クラウドバックアップ' },
        { icon: 'export-variant', text: '成績エクスポート' },
        { icon: 'infinity', text: '全機能 無制限' },
      ],
      bg: '#1A1000',
      accent: '#D4AF37',
    },
    {
      id: 'start',
      emoji: '⚾',
      title: '最強の\n野球人へ！',
      subtitle: 'PROプランで野球の頂点を目指せ',
      features: [],
      bg: '#0D0900',
      accent: '#D4AF37',
    },
  ],
};

// ─── コンフェッティ粒子 ───────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];

interface Particle {
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  rotate: Animated.Value;
  color: string;
  size: number;
}

function useConfetti(active: boolean): Particle[] {
  const startXValues = useRef(Array.from({ length: 30 }, () => Math.random() * SCREEN_W));
  const particles = useRef<Particle[]>(
    Array.from({ length: 30 }, (_, i) => ({
      x: new Animated.Value(startXValues.current[i]),
      y: new Animated.Value(-20),
      opacity: new Animated.Value(1),
      rotate: new Animated.Value(0),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 8,
    })),
  ).current;

  useEffect(() => {
    if (!active) return;
    const anims = particles.map((p, i) => {
      const startX = startXValues.current[i];
      p.x.setValue(startX);
      p.y.setValue(-20);
      p.opacity.setValue(1);
      p.rotate.setValue(0);
      const delay = Math.random() * 600;
      const endX = startX + (Math.random() - 0.5) * 150;
      return Animated.parallel([
        Animated.timing(p.y, { toValue: SCREEN_H * 0.6, duration: 2000 + Math.random() * 1000, delay, useNativeDriver: true }),
        Animated.timing(p.x, { toValue: endX, duration: 2200, delay, useNativeDriver: true }),
        Animated.timing(p.opacity, { toValue: 0, duration: 2200, delay: delay + 800, useNativeDriver: true }),
        Animated.timing(p.rotate, { toValue: 360 * (Math.random() > 0.5 ? 1 : -1), duration: 2000, delay, useNativeDriver: true }),
      ]);
    });
    Animated.stagger(40, anims).start();
  }, [active, particles]);

  return particles;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PlanWelcomeModalProps {
  visible: boolean;
  plan: UserPlan;
  onClose: () => void;
}

// ─── メインコンポーネント ─────────────────────────────────────────────────────

export default function PlanWelcomeModal({ visible, plan, onClose }: PlanWelcomeModalProps) {
  const slides = SLIDES_BY_PLAN[plan] ?? [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const particles = useConfetti(visible);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(0);
      scaleAnim.setValue(0.7);
      fadeAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, damping: 14, stiffness: 120, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, fadeAnim, scaleAnim]);

  const handleScroll = useCallback((e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setCurrentIndex(idx);
  }, []);

  if (slides.length === 0) return null;

  const currentSlide = slides[currentIndex];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* 暗い背景 */}
      <View style={styles.backdrop} />

      {/* コンフェッティ */}
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            styles.particle,
            {
              backgroundColor: p.color,
              width: p.size,
              height: p.size,
              borderRadius: p.size / 4,
              transform: [
                { translateX: p.x },
                { translateY: p.y },
                { rotate: p.rotate.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }) },
              ],
              opacity: p.opacity,
            },
          ]}
        />
      ))}

      {/* モーダル本体 */}
      <Animated.View
        style={[
          styles.modal,
          { backgroundColor: currentSlide.bg },
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        {/* 閉じるボタン */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <MaterialCommunityIcons name="close" size={22} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>

        {/* スワイプエリア */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          scrollEventThrottle={16}
          style={styles.scrollView}
        >
          {slides.map((slide) => (
            <View key={slide.id} style={[styles.slide, { width: SCREEN_W * 0.88 }]}>
              {/* メイン絵文字（弾む） */}
              <Animated.Text style={[styles.slideEmoji, { transform: [{ scale: scaleAnim }] }]}>
                {slide.emoji}
              </Animated.Text>

              {/* タイトル */}
              <Text style={[styles.slideTitle, { color: slide.accent }]}>{slide.title}</Text>

              {/* サブタイトル */}
              <Text style={styles.slideSub}>{slide.subtitle}</Text>

              {/* 機能リスト */}
              {slide.features.length > 0 && (
                <View style={styles.featureList}>
                  {slide.features.map((f) => (
                    <View key={f.text} style={[styles.featureRow, { borderColor: slide.accent + '44' }]}>
                      <MaterialCommunityIcons
                        name={f.icon as any}
                        size={22}
                        color={slide.accent}
                      />
                      <Text style={styles.featureText}>{f.text}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {/* ドットインジケーター */}
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => {
                scrollRef.current?.scrollTo({ x: i * SCREEN_W * 0.88, animated: true });
                setCurrentIndex(i);
              }}
            >
              <Animated.View
                style={[
                  styles.dot,
                  { backgroundColor: currentSlide.accent },
                  i === currentIndex ? styles.dotActive : styles.dotInactive,
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* 次へ / 完了ボタン */}
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: currentSlide.accent }]}
          onPress={() => {
            if (currentIndex < slides.length - 1) {
              scrollRef.current?.scrollTo({ x: (currentIndex + 1) * SCREEN_W * 0.88, animated: true });
              setCurrentIndex(currentIndex + 1);
            } else {
              onClose();
            }
          }}
          activeOpacity={0.85}
        >
          <Text style={[styles.nextBtnText, { color: currentSlide.bg }]}>
            {currentIndex < slides.length - 1 ? '次へ　→' : '🎉  さあ始めよう！'}
          </Text>
        </TouchableOpacity>

        {/* スワイプヒント */}
        {currentIndex === 0 && (
          <Text style={styles.swipeHint}>← スワイプして詳細を見る →</Text>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  particle: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  modal: {
    position: 'absolute',
    top: SCREEN_H * 0.08,
    left: SCREEN_W * 0.06,
    width: SCREEN_W * 0.88,
    maxHeight: SCREEN_H * 0.82,
    borderRadius: 28,
    paddingTop: 48,
    paddingBottom: 28,
    alignItems: 'center',
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 16,
    zIndex: 10,
  },
  scrollView: {
    width: SCREEN_W * 0.88,
    flexGrow: 0,
  },
  slide: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  slideEmoji: {
    fontSize: 72,
    marginBottom: 16,
  },
  slideTitle: {
    fontSize: 32,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 38,
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  slideSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  featureList: {
    width: '100%',
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  featureText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
    flex: 1,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    marginBottom: 14,
    alignItems: 'center',
  },
  dot: {
    borderRadius: 99,
  },
  dotActive: {
    width: 20,
    height: 6,
  },
  dotInactive: {
    width: 6,
    height: 6,
    opacity: 0.35,
  },
  nextBtn: {
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 99,
    marginBottom: 6,
  },
  nextBtnText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  swipeHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 4,
  },
});
