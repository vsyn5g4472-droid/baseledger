import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Text, TextInput, ActivityIndicator } from 'react-native-paper';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius, CardShadow } from '../../../src/constants/theme';
import { useGameStore } from '../../../src/stores/gameStore';
import { useVelocitySettings } from '../../../src/hooks/useVelocitySettings';
import { useUserPlan } from '../../../src/hooks/usePlanGate';
import { checkGameUsage, incrementGameUsage, type UsageCheckResult } from '../../../src/services/planService';
import { DRAFT_GAME_KEY } from '../../../src/db';

export default function ScoreStartScreen() {
  const quickStartGame = useGameStore((s) => s.quickStartGame);
  const loadGame = useGameStore((s) => s.loadGame);
  const game = useGameStore((s) => s.game);
  const userPlan = useUserPlan();
  const [awayName, setAwayName] = useState('');
  const [homeName, setHomeName] = useState('');
  const [fenceWing, setFenceWing]     = useState('');
  const [fenceCenter, setFenceCenter] = useState('');
  const [loading, setLoading] = useState(false);
  const [gameUsage, setGameUsage] = useState<UsageCheckResult | null>(null);

  useEffect(() => {
    checkGameUsage(userPlan).then(setGameUsage);
  }, [userPlan]);

  // ── 下書き存在チェック（画面フォーカス時に毎回再確認） ────────────────
  const [hasDraft, setHasDraft] = useState(false);
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(DRAFT_GAME_KEY).then((json) => {
        setHasDraft(!!json);
      });
    }, []),
  );

  const { settings: velocitySettings, loaded: velocityLoaded, update: updateVelocity } = useVelocitySettings();
  const velocityEnabled = velocitySettings.enabled;
  const pitchDistanceMode = velocitySettings.pitchDistanceM === 16.00 ? 'youth' : 'standard';

  const handleQuickStart = async () => {
    if (gameUsage && !gameUsage.allowed) {
      Alert.alert(
        '試合数の上限',
        `今月の試合記録数（${gameUsage.limit}試合）に達しました。プランをアップグレードすると、より多くの試合を記録できます。`,
      );
      return;
    }
    setLoading(true);
    try {
      await AsyncStorage.removeItem(DRAFT_GAME_KEY); // 新規試合開始時に古い下書きポインタをクリア
      const parsedWing   = parseInt(fenceWing,   10);
      const parsedCenter = parseInt(fenceCenter, 10);
      await quickStartGame({
        awayName:        awayName.trim() || undefined,
        homeName:        homeName.trim() || undefined,
        velocityEnabled: velocitySettings.enabled,
        pitchDistanceM:  velocitySettings.pitchDistanceM,
        fenceLeft:       isNaN(parsedWing)   ? undefined : parsedWing,
        fenceCenter:     isNaN(parsedCenter) ? undefined : parsedCenter,
        fenceRight:      isNaN(parsedWing)   ? undefined : parsedWing,
      });
      router.replace('/(tabs)/score/main');
    } finally {
      setLoading(false);
    }
  };

  const handleResumeDraft = async () => {
    const json = await AsyncStorage.getItem(DRAFT_GAME_KEY);
    if (!json) return;
    try {
      const { gameId } = JSON.parse(json);
      if (!game || game.id !== gameId) {
        await loadGame(gameId);
      }
      await AsyncStorage.removeItem(DRAFT_GAME_KEY);
      setHasDraft(false);
      router.push('/(tabs)/score/main');
    } catch {}
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <MaterialCommunityIcons name="baseball" size={40} color={Colors.primary} />
          <Text style={styles.headerTitle}>クイックスタート</Text>
          <Text style={styles.headerSubtitle}>
            選手登録は後からでOK{'\n'}今すぐ試合を記録しよう
          </Text>
        </View>

        {/* Team Name Inputs (optional) */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>チーム名（省略可）</Text>
          <View style={styles.teamRow}>
            <View style={[styles.teamBadge, { backgroundColor: Colors.primary }]}>
              <Text style={styles.teamBadgeText}>先攻</Text>
            </View>
            <TextInput
              style={styles.nameInput}
              value={awayName}
              onChangeText={setAwayName}
              placeholder="チームA"
              placeholderTextColor={Colors.textSecondary}
              mode="outlined"
              outlineColor={Colors.border}
              activeOutlineColor={Colors.primary}
              dense
            />
          </View>
          <View style={styles.teamRow}>
            <View style={[styles.teamBadge, { backgroundColor: Colors.secondary }]}>
              <Text style={styles.teamBadgeText}>後攻</Text>
            </View>
            <TextInput
              style={styles.nameInput}
              value={homeName}
              onChangeText={setHomeName}
              placeholder="チームB"
              placeholderTextColor={Colors.textSecondary}
              mode="outlined"
              outlineColor={Colors.border}
              activeOutlineColor={Colors.primary}
              dense
            />
          </View>
          <Text style={styles.hint}>
            選手名は「1番」「2番」…で仮登録されます。試合中・終了後に実名へ変更できます。
          </Text>
        </View>

        {/* 球場情報カード */}
        <View style={styles.card}>
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabel}>球場情報</Text>
            <Text style={styles.sectionLabelOptional}>（省略可）</Text>
          </View>
          <View style={styles.fenceRow}>
            <View style={styles.fenceCol}>
              <Text style={styles.fenceLabel}>両翼（m）</Text>
              <TextInput
                style={styles.fenceInput}
                value={fenceWing}
                onChangeText={setFenceWing}
                placeholder="91"
                placeholderTextColor={Colors.textSecondary}
                keyboardType="numeric"
                mode="outlined"
                outlineColor={Colors.border}
                activeOutlineColor={Colors.primary}
                dense
              />
            </View>
            <View style={styles.fenceDivider} />
            <View style={styles.fenceCol}>
              <Text style={styles.fenceLabel}>センター（m）</Text>
              <TextInput
                style={styles.fenceInput}
                value={fenceCenter}
                onChangeText={setFenceCenter}
                placeholder="120"
                placeholderTextColor={Colors.textSecondary}
                keyboardType="numeric"
                mode="outlined"
                outlineColor={Colors.border}
                activeOutlineColor={Colors.primary}
                dense
              />
            </View>
          </View>
          <Text style={styles.hint}>
            未入力の場合はデフォルト値（両翼 91m / センター 120m）を適用します
          </Text>
        </View>

        {/* 計測設定カード */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>計測設定</Text>

          {/* 球速計測トグル */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>球速計測モード</Text>
              <Text style={styles.settingDesc}>長押し計測で球速を各投球に記録</Text>
            </View>
            <TouchableOpacity
              style={[styles.toggle, velocityEnabled && styles.toggleActive]}
              onPress={() => updateVelocity({ enabled: !velocityEnabled })}
              activeOpacity={0.8}
            >
              <View style={[styles.toggleKnob, velocityEnabled && styles.toggleKnobOn]} />
            </TouchableOpacity>
          </View>

          {/* 投球距離 (球速計測ONのみ表示) */}
          {velocityEnabled && (
            <>
              <Text style={styles.distanceLabel}>投球距離</Text>
              <View style={styles.distanceRow}>
                <TouchableOpacity
                  style={[styles.distanceBtn, pitchDistanceMode === 'standard' && styles.distanceBtnActive]}
                  onPress={() => updateVelocity({ pitchDistanceM: 18.44 })}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.distanceBtnTitle, pitchDistanceMode === 'standard' && { color: Colors.white }]}>
                    一般・中学
                  </Text>
                  <Text style={[styles.distanceBtnSub, pitchDistanceMode === 'standard' && { color: 'rgba(255,255,255,0.85)' }]}>
                    18.44 m
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.distanceBtn, pitchDistanceMode === 'youth' && styles.distanceBtnActive]}
                  onPress={() => updateVelocity({ pitchDistanceM: 16.00 })}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.distanceBtnTitle, pitchDistanceMode === 'youth' && { color: Colors.white }]}>
                    学童
                  </Text>
                  <Text style={[styles.distanceBtnSub, pitchDistanceMode === 'youth' && { color: 'rgba(255,255,255,0.85)' }]}>
                    16.00 m
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 球速計測ON時のガイド */}
              <View style={styles.velocityGuide}>
                <MaterialCommunityIcons name="timer-outline" size={16} color={Colors.primary} />
                <Text style={styles.velocityGuideText}>
                  記録画面の長押しエリアで計測 → 離した瞬間に球速を自動記録
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Quick Start Button */}
        <TouchableOpacity
          style={[styles.quickStartBtn, loading && styles.quickStartBtnDisabled]}
          onPress={handleQuickStart}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} size="small" />
          ) : (
            <>
              <MaterialCommunityIcons name="lightning-bolt" size={22} color={Colors.white} />
              <Text style={styles.quickStartBtnText}>今すぐ記録開始</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Draft Resume Button */}
        {hasDraft && (
          <TouchableOpacity
            style={styles.draftResumeBtn}
            onPress={handleResumeDraft}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="pencil-outline" size={18} color={Colors.primary} />
            <Text style={styles.draftResumeBtnText}>下書きの試合を再開する</Text>
          </TouchableOpacity>
        )}

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>または</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Normal Setup Link */}
        <TouchableOpacity
          style={styles.normalStartBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="cog-outline" size={18} color={Colors.textSecondary} />
          <Text style={styles.normalStartText}>チームと選手を詳しく設定してから始める</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: Colors.background },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    alignItems: 'stretch',
  },

  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  headerTitle: {
    fontSize: Typography.h2,
    fontWeight: '800',
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  headerSubtitle: {
    fontSize: Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    lineHeight: 22,
  },

  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    ...CardShadow,
  },
  sectionLabel: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  teamBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    minWidth: 40,
    alignItems: 'center',
  },
  teamBadgeText: {
    fontSize: Typography.tiny,
    fontWeight: '700',
    color: Colors.white,
  },
  nameInput: {
    flex: 1,
    backgroundColor: Colors.white,
    fontSize: Typography.body,
    height: 44,
  },
  hint: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    lineHeight: 17,
  },

  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: Spacing.sm,
  },
  sectionLabelOptional: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
  },
  fenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  fenceCol: { flex: 1 },
  fenceLabel: {
    fontSize: Typography.caption,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  fenceInput: {
    backgroundColor: Colors.white,
    textAlign: 'center',
  },
  fenceDivider: {
    width: 12,
    height: 1,
    backgroundColor: Colors.border,
    marginTop: Spacing.lg,
  },

  // 計測設定
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  settingInfo: { flex: 1, marginRight: Spacing.md },
  settingLabel: { fontSize: Typography.body, fontWeight: '600', color: Colors.text },
  settingDesc: { fontSize: Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: { backgroundColor: Colors.primary },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleKnobOn: { transform: [{ translateX: 22 }] },
  distanceLabel: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  distanceRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  distanceBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  distanceBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  distanceBtnTitle: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  distanceBtnSub: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  velocityGuide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.xs,
  },
  velocityGuideText: {
    flex: 1,
    fontSize: Typography.caption,
    color: Colors.primary,
    lineHeight: 18,
  },

  quickStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md + 2,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.lg,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  quickStartBtnDisabled: {
    opacity: 0.6,
  },
  quickStartBtnText: {
    fontSize: Typography.h4,
    fontWeight: '800',
    color: Colors.white,
  },

  draftResumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.sm + 2,
    marginBottom: Spacing.lg,
  },
  draftResumeBtnText: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.primary,
  },

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
  },

  normalStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  normalStartText: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
  },
});
