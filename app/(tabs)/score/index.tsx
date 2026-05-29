import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, TextInput, Button, Menu } from 'react-native-paper';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';
import { useGameStore } from '../../../src/stores/gameStore';
import { useVelocitySettings } from '../../../src/hooks/useVelocitySettings';
import { useUserPlan } from '../../../src/hooks/usePlanGate';
import { checkGameUsage, type UsageCheckResult } from '../../../src/services/planService';
import type { GameCategory } from '../../../src/types/game';
import { DRAFT_GAME_KEY } from '../../../src/db';
import { useAuth } from '../../../src/contexts/AuthContext';
import { getUserTeams } from '../../../src/services/teamService';
import type { Team } from '../../../src/models/types';
import TeamQuickSelect from '../../../src/components/score/TeamQuickSelect';

const CATEGORIES: GameCategory[] = ['practice', 'official', 'tournament', 'other'];

export default function ScoreIndexScreen() {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const userPlan = useUserPlan();
  const [gameUsage, setGameUsage] = useState<UsageCheckResult | null>(null);
  const loadGame = useGameStore((s) => s.loadGame);
  const game = useGameStore((s) => s.game);

  useEffect(() => {
    checkGameUsage(userPlan).then(setGameUsage);
  }, [userPlan]);

  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [awayTeamId, setAwayTeamId] = useState('');
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamMenuVisible, setAwayTeamMenuVisible] = useState(false);
  const [homeTeamMenuVisible, setHomeTeamMenuVisible] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    getUserTeams(currentUser.uid).then(setMyTeams);
  }, [currentUser]);

  // ── 下書き存在チェック（画面フォーカス時に毎回再確認） ────────────────
  const [hasDraft, setHasDraft] = useState(false);
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(DRAFT_GAME_KEY).then((json) => {
        setHasDraft(!!json);
      });
    }, []),
  );

  // 試合メタデータ
  const [category, setCategory] = useState<GameCategory>('practice');
  const [tournamentName, setTournamentName] = useState('');

  // チーム
  const [awayName, setAwayName] = useState('');
  const [homeName, setHomeName] = useState('');

  // 球場
  const [ballparkName, setBallparkName] = useState('');
  const [fenceLeft, setFenceLeft] = useState('');
  const [fenceCenter, setFenceCenter] = useState('');
  const [fenceRight, setFenceRight] = useState('');

  // 計測設定 (AsyncStorage 永続化)
  const { settings: velocitySettings, update: updateVelocity } = useVelocitySettings();
  const velocityEnabled = velocitySettings.enabled;
  const pitchDistanceMode = velocitySettings.pitchDistanceM === 16.00 ? 'youth' : 'standard';

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

  const navigateToSetup = async (isScout: boolean) => {
    if (gameUsage && !gameUsage.allowed) {
      Alert.alert(
        '試合数の上限',
        `今月の試合記録数（${gameUsage.limit}試合）に達しました。プランをアップグレードすると、より多くの試合を記録できます。`,
      );
      return;
    }
    if (!awayName.trim() || !homeName.trim()) {
      Alert.alert(t.setup.validation.teamNameRequired);
      return;
    }
    const setupParams = {
      awayName: awayName.trim(),
      homeName: homeName.trim(),
      ballparkName: ballparkName.trim(),
      fenceLeft,
      fenceCenter,
      fenceRight,
      category,
      tournamentName: tournamentName.trim(),
      velocityEnabled: velocitySettings.enabled ? 'true' : 'false',
      pitchDistanceM: String(velocitySettings.pitchDistanceM),
      awayTeamId: awayTeamId.trim(),
      homeTeamId: homeTeamId.trim(),
      ...(isScout ? { isScout: 'true' } : {}),
    };
    const draftJson = await AsyncStorage.getItem(DRAFT_GAME_KEY);
    if (draftJson) {
      Alert.alert(
        '下書きが保存されています',
        '新しい試合を開始すると、保存中の下書きは削除されます。',
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: '下書きを再開する', onPress: handleResumeDraft },
          {
            text: isScout ? '偵察モードを開始する' : '新しい試合を開始する',
            style: 'destructive',
            onPress: async () => {
              await AsyncStorage.removeItem(DRAFT_GAME_KEY);
              setHasDraft(false);
              router.push({ pathname: '/(tabs)/score/setup', params: setupParams } as any);
            },
          },
        ],
      );
      return;
    }
    router.push({ pathname: '/(tabs)/score/setup', params: setupParams } as any);
  };

  const handleNext = () => navigateToSetup(false);
  const handleScout = () => navigateToSetup(true);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* ヘッダー */}
      <View style={styles.header}>
        <MaterialCommunityIcons name="baseball" size={40} color={Colors.primary} />
        <Text style={styles.title}>{t.app.title}</Text>
        <Text style={styles.subtitle}>{t.app.subtitle}</Text>
      </View>

      {/* ===== クイックスタート ===== */}
      <TouchableOpacity
        style={styles.quickStartCard}
        onPress={() => router.push('/(tabs)/score/start' as any)}
        activeOpacity={0.88}
      >
        <View style={styles.quickStartLeft}>
          <View style={styles.quickStartIconWrap}>
            <MaterialCommunityIcons name="lightning-bolt" size={26} color={Colors.white} />
          </View>
          <View style={styles.quickStartTextWrap}>
            <Text style={styles.quickStartTitle}>クイックスタート</Text>
            <Text style={styles.quickStartSub}>選手登録は後からでOK</Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.white} />
      </TouchableOpacity>

      {/* 区切り */}
      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orText}>通常モード</Text>
        <View style={styles.orLine} />
      </View>

      {/* ===== 試合情報 (メタデータ) ===== */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.metadata.title}</Text>

        {/* 試合区分 */}
        <Text style={styles.fieldLabel}>{t.metadata.category}</Text>
        <View style={styles.categoryRow}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryBtn, category === cat && styles.categoryBtnActive]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.categoryText, category === cat && styles.categoryTextActive]}>
                {t.metadata.categories[cat]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 大会名・メモ */}
        <TextInput
          mode="outlined"
          label={t.metadata.tournamentName}
          placeholder={t.metadata.tournamentPlaceholder}
          value={tournamentName}
          onChangeText={setTournamentName}
          style={styles.input}
          dense
        />
      </View>

      {/* ===== チーム名入力 ===== */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.setup.title}</Text>

        {/* 先攻チーム */}
        <View style={[styles.teamBadge, { backgroundColor: Colors.primary }]}>
          <Text style={styles.teamBadgeText}>{t.setup.awayTeam}</Text>
        </View>
        <TeamQuickSelect side="away" onSelect={setAwayName} />
        <TextInput
          mode="outlined"
          placeholder={t.setup.teamName}
          value={awayName}
          onChangeText={setAwayName}
          style={styles.input}
          dense
        />
        {myTeams.length > 0 && (
          <Menu
            visible={awayTeamMenuVisible}
            onDismiss={() => setAwayTeamMenuVisible(false)}
            anchor={
              <TouchableOpacity
                style={styles.teamIdSelector}
                onPress={() => setAwayTeamMenuVisible(true)}
              >
                <MaterialCommunityIcons name="account-group-outline" size={13} color={Colors.primary} />
                <Text style={styles.teamIdSelectorText}>
                  {awayTeamId
                    ? (myTeams.find((t) => t.id === awayTeamId)?.name ?? '自チームを紐付け')
                    : '自チームを紐付け'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={13} color={Colors.primary} />
              </TouchableOpacity>
            }
          >
            <Menu.Item title="紐付けなし" onPress={() => { setAwayTeamId(''); setAwayTeamMenuVisible(false); }} />
            {myTeams.map((team) => (
              <Menu.Item
                key={team.id}
                title={team.name}
                onPress={() => { setAwayTeamId(team.id); setAwayTeamMenuVisible(false); }}
              />
            ))}
          </Menu>
        )}

        {/* VS 区切り */}
        <View style={styles.vsRow}>
          <View style={styles.vsDivider} />
          <Text style={styles.vs}>VS</Text>
          <View style={styles.vsDivider} />
        </View>

        {/* 後攻チーム */}
        <View style={[styles.teamBadge, { backgroundColor: Colors.secondary }]}>
          <Text style={styles.teamBadgeText}>{t.setup.homeTeam}</Text>
        </View>
        <TeamQuickSelect side="home" onSelect={setHomeName} />
        <TextInput
          mode="outlined"
          placeholder={t.setup.teamName}
          value={homeName}
          onChangeText={setHomeName}
          style={styles.input}
          dense
        />
        {myTeams.length > 0 && (
          <Menu
            visible={homeTeamMenuVisible}
            onDismiss={() => setHomeTeamMenuVisible(false)}
            anchor={
              <TouchableOpacity
                style={styles.teamIdSelector}
                onPress={() => setHomeTeamMenuVisible(true)}
              >
                <MaterialCommunityIcons name="account-group-outline" size={13} color={Colors.primary} />
                <Text style={styles.teamIdSelectorText}>
                  {homeTeamId
                    ? (myTeams.find((t) => t.id === homeTeamId)?.name ?? '自チームを紐付け')
                    : '自チームを紐付け'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={13} color={Colors.primary} />
              </TouchableOpacity>
            }
          >
            <Menu.Item title="紐付けなし" onPress={() => { setHomeTeamId(''); setHomeTeamMenuVisible(false); }} />
            {myTeams.map((team) => (
              <Menu.Item
                key={team.id}
                title={team.name}
                onPress={() => { setHomeTeamId(team.id); setHomeTeamMenuVisible(false); }}
              />
            ))}
          </Menu>
        )}
      </View>

      {/* ===== 球場情報 ===== */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {t.setup.ballpark}
          <Text style={styles.optional}> ({t.setup.optional})</Text>
        </Text>

        <TextInput
          mode="outlined"
          placeholder={t.setup.ballparkName}
          value={ballparkName}
          onChangeText={setBallparkName}
          style={styles.input}
          left={<TextInput.Icon icon="map-marker" />}
          dense
        />

        <Text style={styles.fieldLabel}>{t.setup.fenceDistance}</Text>
        <View style={styles.fenceRow}>
          {([
            { key: 'fenceLeft', label: t.setup.leftField, value: fenceLeft, set: setFenceLeft },
            { key: 'fenceCenter', label: t.setup.centerField, value: fenceCenter, set: setFenceCenter },
            { key: 'fenceRight', label: t.setup.rightField, value: fenceRight, set: setFenceRight },
          ] as const).map(({ key, label, value, set }) => (
            <View key={key} style={styles.fenceCol}>
              <Text style={styles.fenceLabel}>{label}</Text>
              <TextInput
                mode="outlined"
                value={value}
                onChangeText={set}
                keyboardType="numeric"
                style={styles.fenceInput}
                dense
              />
            </View>
          ))}
        </View>
      </View>

      {/* ===== 計測設定 ===== */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>計測設定</Text>

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

        {/* 投球距離 (球速計測ONの時のみ表示) */}
        {velocityEnabled && (
          <>
            <Text style={styles.fieldLabel}>投球距離</Text>
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
          </>
        )}
      </View>

      {/* スタメン登録ボタン */}
      <Button
        mode="contained"
        onPress={handleNext}
        style={styles.nextButton}
        buttonColor={Colors.primary}
        labelStyle={styles.nextLabel}
        icon="account-group"
      >
        {t.setup.lineupSetup}
      </Button>

      {/* ===== 偵察モード ===== */}
      <TouchableOpacity
        style={styles.scoutCard}
        onPress={handleScout}
        activeOpacity={0.88}
      >
        <View style={styles.quickStartLeft}>
          <View style={styles.quickStartIconWrap}>
            <MaterialCommunityIcons name="binoculars" size={26} color={Colors.white} />
          </View>
          <View style={styles.quickStartTextWrap}>
            <Text style={styles.quickStartTitle}>偵察モード</Text>
            <Text style={styles.quickStartSub}>相手チームを偵察・記録します。データは偵察記録として保存されます。</Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.white} />
      </TouchableOpacity>

      {/* ===== スポット打席 ===== */}
      <TouchableOpacity
        style={styles.spotCard}
        onPress={() => router.push('/(tabs)/score/spot' as any)}
        activeOpacity={0.88}
      >
        <View style={styles.quickStartLeft}>
          <View style={styles.quickStartIconWrap}>
            <MaterialCommunityIcons name="baseball-bat" size={26} color={Colors.white} />
          </View>
          <View style={styles.quickStartTextWrap}>
            <Text style={styles.quickStartTitle}>スポット打席</Text>
            <Text style={styles.quickStartSub}>1打席分を素早く記録。練習・試合問わず使えます。</Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.white} />
      </TouchableOpacity>

      {/* 下書き再開ボタン */}
      {hasDraft && (
        <>
          <TouchableOpacity
            style={styles.draftResumeBtn}
            onPress={handleResumeDraft}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="pencil-outline" size={18} color={Colors.primary} />
            <Text style={styles.draftResumeBtnText}>下書きの試合を再開する</Text>
          </TouchableOpacity>
          <Text style={styles.draftResumeNote}>※ 下書きは1試合まで保存できます</Text>
        </>
      )}

      {/* 履歴リンク */}
      <Button
        mode="text"
        onPress={() => router.push('/(tabs)/score/history' as any)}
        style={styles.historyLink}
        icon="history"
      >
        {t.common.history}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 120 },

  header: { alignItems: 'center', paddingVertical: Spacing.lg },
  title: { fontSize: Typography.h1, fontWeight: '900', color: Colors.primary, marginTop: Spacing.sm },
  subtitle: { fontSize: Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },

  section: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: { fontSize: Typography.h4, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  optional: { fontSize: Typography.caption, fontWeight: '400', color: Colors.textSecondary },

  // 試合区分
  categoryRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    flexWrap: 'wrap',
  },
  categoryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  categoryBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  categoryText: { fontSize: Typography.bodySmall, fontWeight: '600', color: Colors.textSecondary },
  categoryTextActive: { color: Colors.white },

  // チーム
  vsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.md,
  },
  vsDivider: { flex: 1, height: 1, backgroundColor: Colors.border },
  vs: { fontSize: Typography.body, fontWeight: '900', color: Colors.textSecondary },
  teamBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
  },
  teamBadgeText: { color: Colors.white, fontSize: Typography.tiny, fontWeight: '700' },
  input: { backgroundColor: Colors.card },
  teamIdSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: Spacing.xs,
    alignSelf: 'flex-start',
  },
  teamIdSelectorText: {
    fontSize: Typography.caption,
    fontWeight: '600',
    color: Colors.primary,
  },

  // フェンス
  fieldLabel: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  fenceRow: { flexDirection: 'row', gap: Spacing.sm },
  fenceCol: { flex: 1, alignItems: 'center' },
  fenceLabel: { fontSize: Typography.tiny, color: Colors.textSecondary, marginBottom: 2 },
  fenceInput: { backgroundColor: Colors.card, width: '100%', textAlign: 'center' },

  nextButton: { borderRadius: BorderRadius.lg, paddingVertical: 6, marginTop: Spacing.sm },
  nextLabel: { fontSize: Typography.body, fontWeight: '700' },
  historyLink: { marginTop: Spacing.md },

  draftResumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.sm + 2,
    marginTop: Spacing.sm,
  },
  draftResumeBtnText: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.primary,
  },
  draftResumeNote: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
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
  distanceRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
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

  spotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E65100',
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    shadowColor: '#E65100',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },

  scoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2E7D32',
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    shadowColor: '#2E7D32',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },

  // クイックスタート
  quickStartCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  quickStartLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  quickStartIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickStartTextWrap: { gap: 2 },
  quickStartTitle: { fontSize: Typography.h4, fontWeight: '800', color: Colors.white },
  quickStartSub: { fontSize: Typography.caption, color: 'rgba(255,255,255,0.85)' },

  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  orLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  orText: { fontSize: Typography.caption, color: Colors.textSecondary },
});
