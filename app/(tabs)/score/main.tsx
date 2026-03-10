import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Dimensions,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';

// Android で LayoutAnimation を有効化
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Text, Button, Modal, Portal, TextInput } from 'react-native-paper';
import { router } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Rect, Line, Text as SvgText, Circle, Path, Ellipse } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { useGameStore } from '../../../src/stores/gameStore';
import { useI18n } from '../../../src/i18n';
import { useAuth } from '../../../src/contexts/AuthContext';
import { gameService } from '../../../src/services/gameService';
import {
  PITCH_TYPES,
  type PitchType,
  type StrikeZone,
  type PitchResult,
  type AtBatResult,
  type BattedBall,
  type RunnerAdvancement,
  type PickoffBase,
  type PickoffResult,
} from '../../../src/types/game';
import FieldView from '../../../src/components/score/FieldView';
import RunnerAdvancementView from '../../../src/components/score/RunnerAdvancementView';
import PlayLogList from '../../../src/components/score/PlayLogList';
import PlayLogEditModal from '../../../src/components/score/PlayLogEditModal';
import PlayerSubstitutionModal from '../../../src/components/score/PlayerSubstitutionModal';
import type { AtBatLog } from '../../../src/types/game';

// ── 投球コース記録キャンバス定数 (横4:縦7 ストライクゾーン) ──────────
const SZ_W       = 112;
const SZ_H       = Math.round(SZ_W * 7 / 4);   // = 196px
const BALL_PAD_H = 52;
const BALL_PAD_V = 44;
const CANVAS_W   = SZ_W + 2 * BALL_PAD_H;      // = 216px
const CANVAS_H   = SZ_H + 2 * BALL_PAD_V;      // = 284px
const BATTER_W   = 68;
const CURSOR_OFFSET = 50;
const CURSOR_R   = 10;

const SZ_LEFT    = BALL_PAD_H;                  // = 52
const SZ_TOP     = BALL_PAD_V;                  // = 44
const SZ_RIGHT   = BALL_PAD_H + SZ_W;           // = 164
const SZ_BOT     = BALL_PAD_V + SZ_H;           // = 240

const DRAFT_KEY = 'BASELEDGER_DRAFT_SESSION';

/** タップ座標 (canvas px) → StrikeZone */
function coordToZone(px: number, py: number): StrikeZone {
  const inX = px >= SZ_LEFT && px <= SZ_RIGHT;
  const inY = py >= SZ_TOP  && py <= SZ_BOT;
  if (inX && inY) {
    const col = Math.min(Math.floor((px - SZ_LEFT) / (SZ_W / 3)), 2) + 1;
    const row = Math.min(Math.floor((py - SZ_TOP)  / (SZ_H / 3)), 2) + 1;
    return String((row - 1) * 3 + col) as StrikeZone;
  }
  if (py < SZ_TOP)  return 'BH';
  if (py > SZ_BOT)  return 'BL';
  if (px < SZ_LEFT) return 'BI';
  return 'BO';
}

export default function LiveScoreScreen() {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const game = useGameStore((s) => s.game);
  const recordPitch = useGameStore((s) => s.recordPitch);
  const resolveAtBat = useGameStore((s) => s.resolveAtBat);
  const undoLastPitch = useGameStore((s) => s.undoLastPitch);
  const confirmAdvancement = useGameStore((s) => s.confirmAdvancement);
  const cancelAdvancement = useGameStore((s) => s.cancelAdvancement);
  const persist = useGameStore((s) => s.persist);
  const setPhase = useGameStore((s) => s.setPhase);
  const pendingAdvancement = useGameStore((s) => s.game?.pendingAdvancement ?? null);
  const customPitchTypes = useGameStore((s) => s.game?.customPitchTypes ?? []);
  const addCustomPitchType = useGameStore((s) => s.addCustomPitchType);
  const editAtBatLog = useGameStore((s) => s.editAtBatLog);
  const substitutePlayer = useGameStore((s) => s.substitutePlayer);
  const addBenchAndSubstitute = useGameStore((s) => s.addBenchAndSubstitute);
  const recordPickoff = useGameStore((s) => s.recordPickoff);
  const recordStolenBase = useGameStore((s) => s.recordStolenBase);

  // ── バッターの打席（左右反転用） ────────────────────────────────────
  // game が null の場合もフックの呼び出し順を守るため早期に計算
  const batterBats = game
    ? (game.inning.half === 'top' ? game.awayTeam : game.homeTeam)
        .roster.starters[
          game.currentBatterIndex[game.inning.half === 'top' ? 'away' : 'home']
        ]?.bats
    : undefined;

  const [isLeftBatter, setIsLeftBatter] = useState(batterBats === 'L');

  const [selectedPitch, setSelectedPitch] = useState<PitchType | string>('fastball');
  const [showAddPitch, setShowAddPitch] = useState(false);
  const [newPitchName, setNewPitchName] = useState('');
  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [pendingZone, setPendingZone] = useState<StrikeZone | null>(null);
  const [tapCoord, setTapCoord] = useState<{ px: number; py: number } | null>(null);
  const [pendingCoords, setPendingCoords] = useState<{ x: number; y: number } | null>(null);
  const [showFieldView, setShowFieldView] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingLog, setEditingLog] = useState<AtBatLog | null>(null);
  const [subModalVisible, setSubModalVisible] = useState(false);
  const [subSide, setSubSide] = useState<'away' | 'home'>('home');
  const [showPickoffBase, setShowPickoffBase] = useState(false);
  const [pickoffTargetBase, setPickoffTargetBase] = useState<PickoffBase | null>(null);
  const [showStealBase, setShowStealBase] = useState(false);
  // スワイプ盗塁: どの塁からか
  const [swipeStealBase, setSwipeStealBase] = useState<'first' | 'second' | 'third' | null>(null);

  // ── 投球結果モーダル 層B: 走者イベントチップ ──────────────────────────
  type RunnerEventType = 'stolen' | 'caught';
  interface RunnerEventChoice { base: 'first' | 'second' | 'third'; type: RunnerEventType }
  const [selectedRunnerEvents, setSelectedRunnerEvents] = useState<RunnerEventChoice[]>([]);

  const toggleRunnerEvent = useCallback((base: 'first' | 'second' | 'third', type: RunnerEventType) => {
    setSelectedRunnerEvents(prev => {
      const filtered = prev.filter(e => e.base !== base);
      const wasSelected = prev.some(e => e.base === base && e.type === type);
      if (wasSelected) return filtered;
      return [...filtered, { base, type }];
    });
  }, []);

  // ── スクロールロック ────────────────────────────────────────────────
  const [scrollLocked, setScrollLocked] = useState(false);

  // ── 球速計測 ─────────────────────────────────────────────────────
  const pitchDistanceM = game?.pitchDistanceM ?? 18.44;
  const velocityEnabled = game?.velocityEnabled ?? false;
  const [isHoldingVelocity, setIsHoldingVelocity] = useState(false);
  const [measuredVelocity, setMeasuredVelocity] = useState<number | null>(null);
  const velocityStartRef = useRef<number | null>(null);

  // ── 球速入力モード ────────────────────────────────────────────
  type VelocityMode = 'hold' | 'drag' | 'auto';
  const [velocityMode, setVelocityMode] = useState<VelocityMode>('hold');
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [dragVelocity, setDragVelocity] = useState(120);

  const loadGame = useGameStore((s) => s.loadGame);
  const navigation = useNavigation();

  // バッターが変わったら左右を自動更新（LayoutAnimation付き）
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsLeftBatter(batterBats === 'L');
  }, [batterBats]);

  const toggleBatterSide = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsLeftBatter((v) => !v);
  }, []);

  // ── 下書き保存・戻るガード ────────────────────────────────────────
  // game / persist の最新値を ref で保持し beforeRemove クロージャ内で参照
  const gameRef = useRef(game);
  useEffect(() => { gameRef.current = game; });
  const persistRef = useRef(persist);
  useEffect(() => { persistRef.current = persist; }, [persist]);

  const [draftSaved, setDraftSaved] = useState(false);
  const draftToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // マウント時: 下書き復元チェック (game が null の時のみ)
  useEffect(() => {
    if (game) return;
    AsyncStorage.getItem(DRAFT_KEY).then((json) => {
      if (!json) return;
      try {
        const { gameId } = JSON.parse(json);
        Alert.alert(
          '前回の未完了セッション',
          '前回の未完了セッションがあります。再開しますか？',
          [
            {
              text: '破棄する',
              style: 'destructive',
              onPress: () => AsyncStorage.removeItem(DRAFT_KEY),
            },
            {
              text: '再開する',
              onPress: async () => {
                await loadGame(gameId);
                await AsyncStorage.removeItem(DRAFT_KEY);
              },
            },
          ],
          { cancelable: false },
        );
      } catch {}
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 戻るガード: 進行中の記録セッション中は確認ダイアログを表示
  useEffect(() => {
    const unsubscribe = (navigation as any).addListener('beforeRemove', (e: any) => {
      const g = gameRef.current;
      if (!g || g.phase !== 'live') return; // 進行中でなければ通過

      e.preventDefault();

      Alert.alert(
        '記録を中断しますか？',
        '入力中のデータは破棄されます。一時保存して終了することも可能です。',
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '破棄して戻る',
            style: 'destructive',
            onPress: () => {
              AsyncStorage.removeItem(DRAFT_KEY);
              (navigation as any).dispatch(e.data.action);
            },
          },
          {
            text: '下書きに保存して戻る',
            onPress: async () => {
              const currentGame = gameRef.current;
              if (currentGame) {
                await persistRef.current();
                await AsyncStorage.setItem(
                  DRAFT_KEY,
                  JSON.stringify({ gameId: currentGame.id }),
                );
              }
              setDraftSaved(true);
              if (draftToastTimerRef.current) clearTimeout(draftToastTimerRef.current);
              draftToastTimerRef.current = setTimeout(() => {
                setDraftSaved(false);
                (navigation as any).dispatch(e.data.action);
              }, 1400);
            },
          },
        ],
      );
    });

    return () => {
      unsubscribe();
      if (draftToastTimerRef.current) clearTimeout(draftToastTimerRef.current);
    };
  }, [navigation]); // navigation は安定参照

  // ── Reanimated カーソル (タッチ中のみ表示・JS再レンダなしで追従) ───
  const [isTouching, setIsTouching] = useState(false);
  const cursorX = useSharedValue(0);
  const cursorY = useSharedValue(0);
  const cursorStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cursorX.value - CURSOR_R },
      { translateY: cursorY.value - CURSOR_OFFSET - CURSOR_R },
    ],
  }));

  // ── 平均球速（自動モード用） ──────────────────────────────────
  const averageVelocity = useMemo(() => {
    if (!game) return 120;
    const defSideLocal = game.inning.half === 'top' ? 'home' : 'away';
    const pitcherIdLocal = game.currentPitcherId[defSideLocal];
    const vels = game.pitchLogs
      .filter((p) => p.pitcherId === pitcherIdLocal && p.velocity != null)
      .map((p) => p.velocity as number);
    if (vels.length === 0) return 120;
    return Math.round(vels.reduce((s, v) => s + v, 0) / vels.length);
  }, [game]);

  // ゲームなし
  if (!game) {
    return (
      <View style={styles.center}>
        <Text style={styles.msg}>{t.live.noGame}</Text>
        <Button mode="contained" onPress={() => router.replace('/(tabs)/score/' as any)}>
          {t.live.backToSetup}
        </Button>
      </View>
    );
  }

  const isTop = game.inning.half === 'top';
  const offSide = isTop ? 'away' : 'home';
  const defSide = isTop ? 'home' : 'away';
  const offTeam = isTop ? game.awayTeam : game.homeTeam;
  const defTeam = isTop ? game.homeTeam : game.awayTeam;
  const batterIdx = game.currentBatterIndex[offSide];
  const batter = offTeam.roster.starters[batterIdx];
  const pitcherId = game.currentPitcherId[defSide];
  const pitcher = defTeam.roster.starters.find((p) => p.id === pitcherId) ?? defTeam.roster.starters[0];

  const inningLabel = `${game.inning.number}${t.common.inning}${isTop ? t.common.top : t.common.bottom}`;
  const lastPitch = game.pitchLogs.length > 0 ? game.pitchLogs[game.pitchLogs.length - 1] : null;

  const handleCanvasTap = useCallback((px: number, py: number) => {
    const zone = coordToZone(px, py);
    setTapCoord({ px, py });
    setPendingCoords({ x: px / CANVAS_W, y: py / CANVAS_H });
    setPendingZone(zone);
    setResultModalVisible(true);
  }, []);

  const handleResultSelect = useCallback((result: PitchResult) => {
    if (!pendingZone) return;
    setResultModalVisible(false);
    const normX = pendingCoords?.x;
    const normY = pendingCoords?.y;

    // 層B: 走者イベントを取り出してリセット
    const eventsToApply = [...selectedRunnerEvents];
    setSelectedRunnerEvents([]);

    const applyRunnerEvents = () => {
      for (const ev of eventsToApply) {
        if (ev.type === 'stolen') recordStolenBase(ev.base);
        else recordPickoff(ev.base, 'out');
      }
    };

    // モード別の球速決定
    let velocity: number | undefined;
    if (velocityMode === 'auto') {
      velocity = averageVelocity;
    } else {
      // hold / drag どちらも measuredVelocity を使う
      velocity = measuredVelocity ?? undefined;
      setMeasuredVelocity(null);
    }

    if (result === 'in_play') {
      recordPitch(selectedPitch, pendingZone, 'in_play', velocity, normX, normY);
      applyRunnerEvents();
      setPendingZone(null);
      setPendingCoords(null);
      setTapCoord(null);
      setShowFieldView(true);
      return;
    }

    recordPitch(selectedPitch, pendingZone, result, velocity, normX, normY);
    applyRunnerEvents();
    setPendingZone(null);
    setPendingCoords(null);
    setTapCoord(null);
    persist();
  }, [pendingZone, pendingCoords, selectedPitch, recordPitch, recordStolenBase, recordPickoff, persist, selectedRunnerEvents, velocityMode, measuredVelocity, averageVelocity]);

  const handleFieldConfirm = useCallback((result: AtBatResult, battedBall: BattedBall) => {
    const g = useGameStore.getState().game;
    const hasRunners = g && (g.runners.first || g.runners.second || g.runners.third);
    if (!hasRunners) {
      setShowFieldView(false);
    }
    resolveAtBat(result, battedBall);
    persist();
  }, [resolveAtBat, persist]);

  const handleAdvancementConfirm = useCallback((finalAdvancements: RunnerAdvancement[]) => {
    confirmAdvancement(finalAdvancements);
    setShowFieldView(false);
    persist();
  }, [confirmAdvancement, persist]);

  const handleAdvancementCancel = useCallback(() => {
    cancelAdvancement();
    persist();
  }, [cancelAdvancement, persist]);

  const handleFieldCancel = useCallback(() => {
    setShowFieldView(false);
    undoLastPitch();
    persist();
  }, [undoLastPitch, persist]);

  const handleUndo = useCallback(() => {
    undoLastPitch();
    persist();
  }, [undoLastPitch, persist]);

  const handleEndGame = useCallback(() => {
    Alert.alert(t.live.endGame, t.live.endGameConfirm, [
      { text: t.live.cancel, style: 'cancel' },
      {
        text: t.live.end,
        style: 'destructive',
        onPress: async () => {
          try {
            setPhase('finished');
            await persist();
            // Firebase保存 (ログイン中の場合)
            const latestGame = useGameStore.getState().game;
            if (currentUser && latestGame) {
              await gameService.saveGame(latestGame, currentUser.uid);
            }
            // 保存完了 → 試合一覧（アナリティクス）へ遷移
            router.replace('/(tabs)/analytics' as any);
          } catch (error) {
            console.error('[handleEndGame] 保存失敗:', error);
            Alert.alert(t.live.saveFailed ?? '保存に失敗しました');
          }
        },
      },
    ]);
  }, [setPhase, persist, currentUser, t.live]);

  const handleEditLog = useCallback((logId: string) => {
    const log = game?.atBatLogs.find((l) => l.id === logId) ?? null;
    setEditingLog(log);
    setEditModalVisible(true);
  }, [game?.atBatLogs]);

  const handleSaveEdit = useCallback((logId: string, newResult: AtBatResult, newRbi: number) => {
    editAtBatLog(logId, newResult, newRbi);
    persist();
  }, [editAtBatLog, persist]);

  const handlePickoffPress = useCallback(() => {
    if (!game) return;
    const hasRunners = game.runners.first || game.runners.second || game.runners.third;
    if (!hasRunners) return;
    setShowPickoffBase(true);
  }, [game]);

  const handlePickoffBaseSelect = useCallback((base: PickoffBase) => {
    setShowPickoffBase(false);
    setPickoffTargetBase(base);
  }, []);

  const handlePickoffResult = useCallback((result: PickoffResult) => {
    if (!pickoffTargetBase) return;
    recordPickoff(pickoffTargetBase, result);
    setPickoffTargetBase(null);
    persist();
  }, [pickoffTargetBase, recordPickoff, persist]);

  const handleStealPress = useCallback(() => {
    if (!game) return;
    const hasRunners = game.runners.first || game.runners.second || game.runners.third;
    if (!hasRunners) return;
    setShowStealBase(true);
  }, [game]);

  // ── スワイプ盗塁: ダイヤモンド上でランナーをスワイプ ──────────────
  const handleRunnerSwipe = useCallback((fromBase: 'first' | 'second' | 'third') => {
    setSwipeStealBase(fromBase);
  }, []);

  const handleSwipeStealSuccess = useCallback(() => {
    if (!swipeStealBase) return;
    recordStolenBase(swipeStealBase);
    setSwipeStealBase(null);
    persist();
  }, [swipeStealBase, recordStolenBase, persist]);

  const handleSwipeStealFail = useCallback(() => {
    if (!swipeStealBase) return;
    // 盗塁失敗 = 牽制アウトとして記録（ランナーを除去）
    recordPickoff(swipeStealBase, 'out');
    setSwipeStealBase(null);
    persist();
  }, [swipeStealBase, recordPickoff, persist]);

  const handleStealBaseSelect = useCallback((fromBase: 'first' | 'second' | 'third') => {
    setShowStealBase(false);
    recordStolenBase(fromBase);
    persist();
  }, [recordStolenBase, persist]);

  if (showFieldView) {
    return (
      <View style={styles.container}>
        <View style={styles.scoreBar}>
          <View style={styles.teamScore}>
            <Text style={[styles.teamName, isTop && styles.teamNameActive]}>{game.awayTeam.name}</Text>
            <Text style={styles.score}>{game.scoreboard.awayTotal}</Text>
          </View>
          <View style={styles.inningBadge}>
            <Text style={styles.inningText}>{inningLabel}</Text>
          </View>
          <View style={styles.teamScore}>
            <Text style={[styles.teamName, !isTop && styles.teamNameActive]}>{game.homeTeam.name}</Text>
            <Text style={styles.score}>{game.scoreboard.homeTotal}</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <View pointerEvents={pendingAdvancement ? 'none' : 'auto'} style={{ flex: 1 }}>
            <FieldView
              ballpark={game.ballpark}
              onConfirm={handleFieldConfirm}
              onCancel={handleFieldCancel}
            />
          </View>
          {pendingAdvancement && (
            <View style={[StyleSheet.absoluteFill, styles.advancementOverlay]}>
              <RunnerAdvancementView
                advancements={pendingAdvancement.advancements}
                result={pendingAdvancement.result}
                onConfirm={handleAdvancementConfirm}
                onCancel={handleAdvancementCancel}
              />
            </View>
          )}
        </View>
      </View>
    );
  }

  if (pendingAdvancement) {
    return (
      <View style={styles.container}>
        <View style={styles.scoreBar}>
          <View style={styles.teamScore}>
            <Text style={[styles.teamName, isTop && styles.teamNameActive]}>{game.awayTeam.name}</Text>
            <Text style={styles.score}>{game.scoreboard.awayTotal}</Text>
          </View>
          <View style={styles.inningBadge}>
            <Text style={styles.inningText}>{inningLabel}</Text>
          </View>
          <View style={styles.teamScore}>
            <Text style={[styles.teamName, !isTop && styles.teamNameActive]}>{game.homeTeam.name}</Text>
            <Text style={styles.score}>{game.scoreboard.homeTotal}</Text>
          </View>
        </View>
        <RunnerAdvancementView
          advancements={pendingAdvancement.advancements}
          result={pendingAdvancement.result}
          onConfirm={handleAdvancementConfirm}
          onCancel={handleAdvancementCancel}
        />
      </View>
    );
  }

  const allPitchTypes: (PitchType | string)[] = [...PITCH_TYPES, ...customPitchTypes];

  return (
    <View style={styles.container}>
      {/* ===== 未設定選手バナー ===== */}
      {game.hasUnmappedPlayers && (
        <TouchableOpacity
          style={styles.unmappedBanner}
          onPress={() => router.push('/(tabs)/score/mapping' as any)}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="account-alert-outline" size={16} color={Colors.white} />
          <Text style={styles.unmappedBannerText}>未設定の選手がいます　→　名簿を設定</Text>
        </TouchableOpacity>
      )}

      {/* ===== スコアバー ===== */}
      <View style={styles.scoreBar}>
        <View style={styles.teamScore}>
          <Text style={[styles.teamName, isTop && styles.teamNameActive]}>{game.awayTeam.name}</Text>
          <Text style={styles.score}>{game.scoreboard.awayTotal}</Text>
        </View>
        <View style={styles.inningBadge}>
          <Text style={styles.inningText}>{inningLabel}</Text>
        </View>
        <View style={styles.teamScore}>
          <Text style={[styles.teamName, !isTop && styles.teamNameActive]}>{game.homeTeam.name}</Text>
          <Text style={styles.score}>{game.scoreboard.homeTotal}</Text>
        </View>
      </View>

      {/* scrollEnabled で投球コース操作中にスクロールを完全封鎖 */}
      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.mainContent}
        scrollEnabled={!scrollLocked}
      >
        {/* ===== カウント + ランナー ===== */}
        <View style={styles.statusRow}>
          <View style={styles.countSection}>
            <CountDots label="B" count={game.count.balls} max={3} color="#4CAF50" />
            <CountDots label="S" count={game.count.strikes} max={2} color="#FFC107" />
            <CountDots label="O" count={game.count.outs} max={2} color="#F44336" />
          </View>
          <View style={styles.diamondWrap}>
            <SwipeableDiamond
              runners={game.runners}
              onRunnerSwipe={handleRunnerSwipe}
              setScrollLocked={setScrollLocked}
            />
          </View>
        </View>

        {/* ===== 打者・投手情報 ===== */}
        <View style={styles.matchupRow}>
          <View style={styles.matchupPlayer}>
            <Text style={styles.matchupRole}>{t.live.pitcher}</Text>
            <Text style={styles.matchupName}>{pitcher.number != null ? `#${pitcher.number} ` : ''}{pitcher.name}</Text>
            <Text style={styles.matchupStat}>{game.totalPitchCount[defSide]}{t.live.pitchCount}</Text>
          </View>
          <MaterialCommunityIcons name="arrow-right" size={20} color={Colors.textSecondary} />
          <View style={[styles.matchupPlayer, { alignItems: 'flex-end' }]}>
            <Text style={styles.matchupRole}>{t.live.batter}</Text>
            <Text style={styles.matchupName}>{batter.number != null ? `#${batter.number} ` : ''}{batter.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.matchupStat}>
                {batterIdx + 1}{t.live.order}
              </Text>
              <TouchableOpacity
                style={[styles.handBadge, isLeftBatter && styles.handBadgeLeft]}
                onPress={toggleBatterSide}
                activeOpacity={0.7}
              >
                <Text style={[styles.handBadgeText, isLeftBatter && { color: Colors.secondary }]}>
                  {isLeftBatter ? '左打ち' : '右打ち'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ===== 球速入力ストリップ ===== */}
        {velocityEnabled && (
          <View style={styles.velocityStrip}>
            {/* ── モード①: 長押し計測 ── */}
            {velocityMode === 'hold' && (
              <TouchableOpacity
                style={[
                  styles.velocityHoldBtn,
                  isHoldingVelocity && styles.velocityHoldBtnActive,
                  measuredVelocity !== null && styles.velocityHoldBtnDone,
                ]}
                onPressIn={() => {
                  velocityStartRef.current = Date.now();
                  setIsHoldingVelocity(true);
                  setScrollLocked(true);
                }}
                onPressOut={() => {
                  if (velocityStartRef.current) {
                    const elapsed = (Date.now() - velocityStartRef.current) / 1000;
                    if (elapsed > 0.05) {
                      const kmh = Math.round((pitchDistanceM / elapsed) * 3.6);
                      setMeasuredVelocity(Math.min(kmh, 220));
                    }
                  }
                  setIsHoldingVelocity(false);
                  setScrollLocked(false);
                  velocityStartRef.current = null;
                }}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons
                  name={isHoldingVelocity ? 'timer-outline' : measuredVelocity !== null ? 'speedometer' : 'hand-back-left-outline'}
                  size={18}
                  color={Colors.white}
                />
                <Text style={styles.velocityHoldBtnText}>
                  {isHoldingVelocity
                    ? '⏱ 計測中...'
                    : measuredVelocity !== null
                      ? `${measuredVelocity} km/h`
                      : '長押し = 球速計測'}
                </Text>
              </TouchableOpacity>
            )}
            {measuredVelocity !== null && velocityMode === 'hold' && (
              <TouchableOpacity
                style={styles.velocityResetBtn}
                onPress={() => setMeasuredVelocity(null)}
              >
                <MaterialCommunityIcons name="refresh" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
            )}

            {/* ── モード②: ドラッグ式メーター ── */}
            {velocityMode === 'drag' && (
              <VelocityDragMeter
                value={dragVelocity}
                onChange={(v) => { setDragVelocity(v); setMeasuredVelocity(v); }}
                onReset={() => { setMeasuredVelocity(null); setDragVelocity(120); }}
                setScrollLocked={setScrollLocked}
              />
            )}

            {/* ── モード③: 平均球速バッジ ── */}
            {velocityMode === 'auto' && (
              <View style={styles.autoVelocityBadge}>
                <MaterialCommunityIcons name="robot-outline" size={16} color={Colors.white} />
                <Text style={styles.autoVelocityText}>
                  自動: {averageVelocity} km/h
                </Text>
                <Text style={styles.autoVelocitySubText}>
                  {game.pitchLogs.filter(p => p.pitcherId === pitcherId && p.velocity != null).length > 0
                    ? '（今日の平均）'
                    : '（デフォルト）'}
                </Text>
              </View>
            )}

            {/* ── ⚙ 設定ボタン ── */}
            <TouchableOpacity
              style={styles.velocitySettingsBtn}
              onPress={() => setSettingsModalVisible(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="cog-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* ===== 球速設定ギア (velocityEnabled=false 時も常にアクセス可能) ===== */}
        {!velocityEnabled && (
          <TouchableOpacity
            style={styles.velocityOffGear}
            onPress={() => setSettingsModalVisible(true)}
          >
            <MaterialCommunityIcons name="cog-outline" size={15} color={Colors.textSecondary} />
            <Text style={styles.velocityOffGearText}>球速設定</Text>
          </TouchableOpacity>
        )}

        {/* ===== メインゾーンエリア: [球種縦列] + [バッター+キャンバス] ===== */}
        <View style={[styles.zoneSection, { flexDirection: isLeftBatter ? 'row-reverse' : 'row' }]}>

          {/* ---- 球種選択: 縦ボタン列 (左側サイドメニュー) ---- */}
          <View style={styles.pitchColumn}>
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {allPitchTypes.map((pt) => {
                const isCustom = !PITCH_TYPES.includes(pt as PitchType);
                const isActive = selectedPitch === pt;
                return (
                  <TouchableOpacity
                    key={pt}
                    style={[
                      styles.pitchColBtn,
                      isActive && styles.pitchColBtnActive,
                      isCustom && !isActive && styles.pitchColBtnCustom,
                    ]}
                    onPress={() => setSelectedPitch(pt)}
                  >
                    <Text
                      style={[styles.pitchColLabel, isActive && styles.pitchColLabelActive]}
                      numberOfLines={1}
                    >
                      {(t.pitchTypes as Record<string, string>)[pt] ?? pt}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* カスタム球種追加 */}
              {showAddPitch ? (
                <TextInput
                  mode="outlined"
                  placeholder="球種名"
                  value={newPitchName}
                  onChangeText={setNewPitchName}
                  style={styles.pitchColInput}
                  dense
                  autoFocus
                  onSubmitEditing={() => {
                    if (newPitchName.trim()) {
                      addCustomPitchType(newPitchName.trim());
                      setSelectedPitch(newPitchName.trim());
                      setNewPitchName('');
                      setShowAddPitch(false);
                      persist();
                    }
                  }}
                />
              ) : (
                <TouchableOpacity style={styles.pitchColAddBtn} onPress={() => setShowAddPitch(true)}>
                  <MaterialCommunityIcons name="plus" size={14} color="#FFD700" />
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>

          {/* ---- バッター + キャンバス ---- */}
          <View style={styles.zoneBatterArea}>
            {isLeftBatter && (
              <TouchableOpacity onPress={toggleBatterSide} activeOpacity={0.75}>
                <BatterSilhouetteSVG side="L" />
              </TouchableOpacity>
            )}

            {/* タップ可能なキャンバス */}
            <View
              style={styles.canvasArea}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderTerminationRequest={() => false}
              onResponderGrant={(e) => {
                cursorX.value = e.nativeEvent.locationX;
                cursorY.value = e.nativeEvent.locationY;
                setIsTouching(true);
                setScrollLocked(true);
              }}
              onResponderMove={(e) => {
                // Reanimated shared value → UIスレッドで更新、JSリレンダなし
                cursorX.value = e.nativeEvent.locationX;
                cursorY.value = e.nativeEvent.locationY;
              }}
              onResponderRelease={(e) => {
                const rawPx = e.nativeEvent.locationX;
                const rawPy = e.nativeEvent.locationY;
                const offsetPy = Math.max(0, Math.min(CANVAS_H, rawPy - CURSOR_OFFSET));
                const offsetPx = Math.max(0, Math.min(CANVAS_W, rawPx));
                setIsTouching(false);
                setScrollLocked(false);
                handleCanvasTap(offsetPx, offsetPy);
              }}
              onResponderTerminate={() => {
                setIsTouching(false);
                setScrollLocked(false);
              }}
            >
              <Svg width={CANVAS_W} height={CANVAS_H} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}>
                {/* ストライクゾーン背景 */}
                <Rect
                  x={SZ_LEFT} y={SZ_TOP}
                  width={SZ_W} height={SZ_H}
                  fill="rgba(56,161,243,0.07)"
                  stroke="#38A1F3"
                  strokeWidth={2}
                />
                {/* ガイドライン */}
                <Line
                  x1={SZ_LEFT + SZ_W / 2} y1={SZ_TOP}
                  x2={SZ_LEFT + SZ_W / 2} y2={SZ_BOT}
                  stroke="rgba(56,161,243,0.22)" strokeWidth={1}
                />
                <Line
                  x1={SZ_LEFT} y1={SZ_TOP + SZ_H / 2}
                  x2={SZ_RIGHT} y2={SZ_TOP + SZ_H / 2}
                  stroke="rgba(56,161,243,0.22)" strokeWidth={1}
                />
                {/* ボールゾーンラベル */}
                <SvgText x={SZ_LEFT + SZ_W / 2} y={SZ_TOP / 2 + 5}                        textAnchor="middle" fontSize={11} fill="#8E8E93">高</SvgText>
                <SvgText x={SZ_LEFT + SZ_W / 2} y={SZ_BOT + (CANVAS_H - SZ_BOT) / 2 + 5} textAnchor="middle" fontSize={11} fill="#8E8E93">低</SvgText>
                <SvgText x={SZ_LEFT / 2}         y={SZ_TOP + SZ_H / 2 + 5}                textAnchor="middle" fontSize={11} fill="#8E8E93">{isLeftBatter ? '外' : '内'}</SvgText>
                <SvgText x={SZ_RIGHT + (CANVAS_W - SZ_RIGHT) / 2} y={SZ_TOP + SZ_H / 2 + 5} textAnchor="middle" fontSize={11} fill="#8E8E93">{isLeftBatter ? '内' : '外'}</SvgText>
                {/* 確定マーカー: 指を離した後・結果選択中に表示 */}
                {tapCoord && (
                  <Circle
                    cx={tapCoord.px}
                    cy={tapCoord.py}
                    r={9}
                    fill="rgba(196,30,58,0.88)"
                    stroke="#fff"
                    strokeWidth={2}
                  />
                )}
              </Svg>

              {/* ── Reanimatedカーソル: タッチ中のみ表示、UIスレッドで滑らか追従 ── */}
              {isTouching && (
                <Animated.View style={[styles.cursorDot, cursorStyle]} pointerEvents="none" />
              )}
            </View>

            {!isLeftBatter && (
              <TouchableOpacity onPress={toggleBatterSide} activeOpacity={0.75}>
                <BatterSilhouetteSVG side="R" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ===== 直前の投球 + Undo + 牽制 ===== */}
        <View style={styles.lastPitchRow}>
          {lastPitch ? (
            <View style={styles.lastPitchInfo}>
              <Text style={styles.lastPitchLabel}>{t.live.lastPitch}: </Text>
              <Text style={styles.lastPitchValue}>
                {(t.pitchTypes as Record<string, string>)[lastPitch.pitchType] ?? lastPitch.pitchType} → {lastPitch.zone} → {t.pitchResults[lastPitch.result]}
              </Text>
            </View>
          ) : (
            <Text style={styles.lastPitchLabel}>{t.live.zoneTitle}</Text>
          )}
          <View style={styles.actionBtnsRow}>
            {(game.runners.first || game.runners.second || game.runners.third) && (
              <TouchableOpacity style={styles.pickoffBtn} onPress={handlePickoffPress}>
                <MaterialCommunityIcons name="arrow-left-bold" size={16} color="#FFD700" />
                <Text style={styles.pickoffBtnText}>{t.live.pickoff}</Text>
              </TouchableOpacity>
            )}
            {game.pitchLogs.length > 0 && (
              <TouchableOpacity style={styles.undoBtn} onPress={handleUndo}>
                <MaterialCommunityIcons name="undo" size={18} color={Colors.white} />
                <Text style={styles.undoBtnText}>{t.live.undo}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ===== 選手交代ボタン ===== */}
        <View style={styles.subRow}>
          <Button
            mode="outlined"
            icon="account-switch-outline"
            onPress={() => { setSubSide('away'); setSubModalVisible(true); }}
            style={styles.subButton}
            textColor={Colors.primary}
          >
            {game.awayTeam.name} 交代
          </Button>
          <Button
            mode="outlined"
            icon="account-switch-outline"
            onPress={() => { setSubSide('home'); setSubModalVisible(true); }}
            style={styles.subButton}
            textColor={Colors.primary}
          >
            {game.homeTeam.name} 交代
          </Button>
        </View>

        {/* ===== 試合終了ボタン ===== */}
        <Button
          mode="outlined"
          onPress={handleEndGame}
          style={styles.endButton}
          textColor={Colors.error}
        >
          {t.live.endGame}
        </Button>

        {/* ===== プレイログ ===== */}
        {game.atBatLogs.length > 0 && (
          <PlayLogList logs={game.atBatLogs} onEdit={handleEditLog} />
        )}
      </ScrollView>

      {/* 選手交代モーダル */}
      <PlayerSubstitutionModal
        visible={subModalVisible}
        side={subSide}
        game={game}
        onClose={() => setSubModalVisible(false)}
        onSubstitute={substitutePlayer}
        onSubstituteWithNew={addBenchAndSubstitute}
      />

      {/* プレイログ編集モーダル */}
      <PlayLogEditModal
        visible={editModalVisible}
        log={editingLog}
        onSave={handleSaveEdit}
        onClose={() => setEditModalVisible(false)}
      />

      {/* ===== 牽制: 塁選択モーダル ===== */}
      <Portal>
        <Modal visible={showPickoffBase} onDismiss={() => setShowPickoffBase(false)} contentContainerStyle={styles.modal}>
          <View>
            <Text style={styles.modalTitle}>{t.live.pickoffBase}</Text>
            <View style={styles.resultGrid}>
              {game.runners.first && (
                <TouchableOpacity style={[styles.resultBtn, { backgroundColor: '#1565C0' }]} onPress={() => handlePickoffBaseSelect('first')}>
                  <Text style={styles.resultBtnText}>{t.advancement.first}</Text>
                </TouchableOpacity>
              )}
              {game.runners.second && (
                <TouchableOpacity style={[styles.resultBtn, { backgroundColor: '#1565C0' }]} onPress={() => handlePickoffBaseSelect('second')}>
                  <Text style={styles.resultBtnText}>{t.advancement.second}</Text>
                </TouchableOpacity>
              )}
              {game.runners.third && (
                <TouchableOpacity style={[styles.resultBtn, { backgroundColor: '#1565C0' }]} onPress={() => handlePickoffBaseSelect('third')}>
                  <Text style={styles.resultBtnText}>{t.advancement.third}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      </Portal>

      {/* ===== 牽制: 結果選択モーダル ===== */}
      <Portal>
        <Modal visible={!!pickoffTargetBase} onDismiss={() => setPickoffTargetBase(null)} contentContainerStyle={styles.modal}>
          <View>
            <Text style={styles.modalTitle}>{t.live.pickoffResult}</Text>
            <View style={styles.resultGrid}>
              <TouchableOpacity style={[styles.resultBtn, { backgroundColor: '#43A047' }]} onPress={() => handlePickoffResult('safe')}>
                <Text style={styles.resultBtnText}>{t.live.pickoffSafe}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.resultBtn, { backgroundColor: '#E53935' }]} onPress={() => handlePickoffResult('out')}>
                <Text style={styles.resultBtnText}>{t.live.pickoffOut}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.resultBtn, { backgroundColor: '#FB8C00' }]} onPress={() => handlePickoffResult('balk')}>
                <Text style={styles.resultBtnText}>{t.live.pickoffBalk}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.resultBtn, { backgroundColor: '#795548' }]} onPress={() => handlePickoffResult('error')}>
                <Text style={styles.resultBtnText}>{t.live.pickoffError}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </Portal>

      {/* ===== スワイプ盗塁: 結果選択モーダル ===== */}
      <Portal>
        <Modal visible={!!swipeStealBase} onDismiss={() => setSwipeStealBase(null)} contentContainerStyle={styles.modal}>
          <View>
            <Text style={styles.modalTitle}>{t.live.stealResult}</Text>
            {swipeStealBase && (
              <Text style={styles.lastPitchLabel}>
                {(t.advancement as Record<string, string>)[swipeStealBase]}塁走者
              </Text>
            )}
            <View style={[styles.resultGrid, { marginTop: Spacing.sm }]}>
              <TouchableOpacity
                style={[styles.resultBtn, { backgroundColor: '#43A047', width: 96 }]}
                onPress={handleSwipeStealSuccess}
              >
                <MaterialCommunityIcons name="check-bold" size={20} color="#fff" />
                <Text style={styles.resultBtnText}>{t.live.stealSuccess}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resultBtn, { backgroundColor: '#E53935', width: 96 }]}
                onPress={handleSwipeStealFail}
              >
                <MaterialCommunityIcons name="close-thick" size={20} color="#fff" />
                <Text style={styles.resultBtnText}>{t.live.stealFail}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </Portal>

      {/* ===== 球速入力モード設定モーダル (ハーフシート) ===== */}
      <Portal>
        <Modal
          visible={settingsModalVisible}
          onDismiss={() => setSettingsModalVisible(false)}
          contentContainerStyle={styles.bottomSheet}
        >
          {/* ハンドルバー */}
          <View style={styles.bottomSheetHandle} />
          <Text style={styles.bottomSheetTitle}>⚙ 球速入力モード</Text>

          {[
            {
              mode: 'hold' as const,
              icon: 'hand-back-left-outline',
              label: '① 長押し計測',
              desc: 'リリース〜捕球までの時間を計測（デフォルト）',
              color: '#607D8B',
            },
            {
              mode: 'drag' as const,
              icon: 'gesture-swipe-horizontal',
              label: '② ドラッグ式メーター',
              desc: 'スライダーをドラッグして 80〜165 km/h を直接入力',
              color: Colors.primary,
            },
            {
              mode: 'auto' as const,
              icon: 'robot-outline',
              label: '③ 平均球速（自動）',
              desc: `今日の平均 ${averageVelocity} km/h を自動入力（確認なし）`,
              color: '#2E7D32',
            },
          ].map(({ mode, icon, label, desc, color }) => {
            const isActive = velocityMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[styles.modeOption, isActive && { borderColor: color, borderWidth: 2 }]}
                onPress={() => { setVelocityMode(mode); setSettingsModalVisible(false); }}
                activeOpacity={0.75}
              >
                <View style={[styles.modeIconWrap, { backgroundColor: color }]}>
                  <MaterialCommunityIcons name={icon as any} size={22} color={Colors.white} />
                </View>
                <View style={styles.modeTextWrap}>
                  <Text style={[styles.modeLabel, isActive && { color }]}>{label}</Text>
                  <Text style={styles.modeDesc}>{desc}</Text>
                </View>
                {isActive && (
                  <MaterialCommunityIcons name="check-circle" size={22} color={color} />
                )}
              </TouchableOpacity>
            );
          })}

          {!velocityEnabled && (
            <View style={styles.velocityDisabledNote}>
              <MaterialCommunityIcons name="information-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.velocityDisabledNoteText}>
                球速計測は試合設定でONにすると有効になります
              </Text>
            </View>
          )}
        </Modal>
      </Portal>

      {/* ===== 下書き保存トースト ===== */}
      <Portal>
        {draftSaved && (
          <View style={styles.draftToast} pointerEvents="none">
            <MaterialCommunityIcons name="content-save-check-outline" size={18} color={Colors.white} />
            <Text style={styles.draftToastText}>下書きに保存しました</Text>
          </View>
        )}
      </Portal>

      {/* ===== 盗塁: 走者選択モーダル ===== */}
      <Portal>
        <Modal visible={showStealBase} onDismiss={() => setShowStealBase(false)} contentContainerStyle={styles.modal}>
          <View>
            <Text style={styles.modalTitle}>{t.live.stealBase}</Text>
            <View style={styles.resultGrid}>
              {game.runners.first && (
                <TouchableOpacity style={[styles.resultBtn, { backgroundColor: '#00ACC1' }]} onPress={() => handleStealBaseSelect('first')}>
                  <Text style={styles.resultBtnText}>{t.advancement.first}</Text>
                </TouchableOpacity>
              )}
              {game.runners.second && (
                <TouchableOpacity style={[styles.resultBtn, { backgroundColor: '#00ACC1' }]} onPress={() => handleStealBaseSelect('second')}>
                  <Text style={styles.resultBtnText}>{t.advancement.second}</Text>
                </TouchableOpacity>
              )}
              {game.runners.third && (
                <TouchableOpacity style={[styles.resultBtn, { backgroundColor: '#00ACC1' }]} onPress={() => handleStealBaseSelect('third')}>
                  <Text style={styles.resultBtnText}>{t.advancement.third}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      </Portal>

      {/* ===== 投球結果選択モーダル ===== */}
      <Portal>
        <Modal
          visible={resultModalVisible}
          onDismiss={() => {
            setResultModalVisible(false);
            setPendingZone(null);
            setPendingCoords(null);
            setTapCoord(null);
            setSelectedRunnerEvents([]);
          }}
          contentContainerStyle={styles.modal}
        >
          <View>
            <Text style={styles.modalTitle}>{t.live.resultTitle}</Text>

            {/* ── 層B: 走者イベントチップ (ランナーがいる時のみ) ── */}
            {(game.runners.first || game.runners.second || game.runners.third) && (
              <View style={styles.runnerEventSection}>
                <Text style={styles.runnerEventLabel}>走者イベント（任意）</Text>
                <View style={styles.chipRow}>
                  {game.runners.first && (
                    <>
                      <RunnerEventChip
                        label="1→2 盗塁"
                        selected={selectedRunnerEvents.some(e => e.base === 'first' && e.type === 'stolen')}
                        color={Colors.primary}
                        onPress={() => toggleRunnerEvent('first', 'stolen')}
                      />
                      <RunnerEventChip
                        label="1塁 刺殺"
                        selected={selectedRunnerEvents.some(e => e.base === 'first' && e.type === 'caught')}
                        color={Colors.secondary}
                        onPress={() => toggleRunnerEvent('first', 'caught')}
                      />
                    </>
                  )}
                  {game.runners.second && (
                    <>
                      <RunnerEventChip
                        label="2→3 盗塁"
                        selected={selectedRunnerEvents.some(e => e.base === 'second' && e.type === 'stolen')}
                        color={Colors.primary}
                        onPress={() => toggleRunnerEvent('second', 'stolen')}
                      />
                      <RunnerEventChip
                        label="2塁 刺殺"
                        selected={selectedRunnerEvents.some(e => e.base === 'second' && e.type === 'caught')}
                        color={Colors.secondary}
                        onPress={() => toggleRunnerEvent('second', 'caught')}
                      />
                    </>
                  )}
                  {game.runners.third && (
                    <>
                      <RunnerEventChip
                        label="3→本 盗塁"
                        selected={selectedRunnerEvents.some(e => e.base === 'third' && e.type === 'stolen')}
                        color={Colors.primary}
                        onPress={() => toggleRunnerEvent('third', 'stolen')}
                      />
                      <RunnerEventChip
                        label="3塁 刺殺"
                        selected={selectedRunnerEvents.some(e => e.base === 'third' && e.type === 'caught')}
                        color={Colors.secondary}
                        onPress={() => toggleRunnerEvent('third', 'caught')}
                      />
                    </>
                  )}
                </View>
              </View>
            )}

            {/* ── 層A: メイン投球結果ボタン ── */}
            <Text style={styles.runnerEventLabel}>投球結果</Text>
            <View style={styles.resultGrid}>
              {PITCH_RESULT_OPTIONS.map(({ result, color, label }) => (
                <TouchableOpacity
                  key={result}
                  style={[styles.resultBtn, { backgroundColor: color }]}
                  onPress={() => handleResultSelect(result)}
                >
                  <Text style={styles.resultBtnText}>{label ?? t.pitchResults[result]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

// ============================================================
// 投球結果の選択肢 (層A)
// ============================================================

const PITCH_RESULT_OPTIONS: { result: PitchResult; color: string; label?: string }[] = [
  { result: 'ball',            color: '#2E7D9F', label: 'ボール' },
  { result: 'strike_called',   color: '#C41E3A', label: '見逃し' },
  { result: 'strike_swinging', color: '#9B1528', label: '空振り' },
  { result: 'foul',            color: '#B87A00', label: 'ファウル' },
  { result: 'foul_tip',        color: '#8B5E00', label: 'チップ' },
  { result: 'in_play',         color: '#38A1F3', label: 'インプレイ' },
  { result: 'hit_by_pitch',    color: '#5A1A5C', label: '死球' },
];

// ============================================================
// サブコンポーネント
// ============================================================

function CountDots({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  return (
    <View style={styles.countItem}>
      <Text style={[styles.countLabel, { color }]}>{label}</Text>
      <View style={styles.dotsRow}>
        {Array.from({ length: max }, (_, i) => (
          <View
            key={i}
            style={[styles.dot, { borderColor: color }, i < count && { backgroundColor: color }]}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * SwipeableDiamond — インタラクティブなダイヤモンド表示
 *
 * ランナーがいる塁の走者サークルを水平スワイプすることで
 * 盗塁試行ダイアログを呼び出せます。
 * ScrollViewのスクロールと競合しないよう、走者にヒットした時のみ
 * ジェスチャーを取得します。
 */
function SwipeableDiamond({
  runners,
  onRunnerSwipe,
  setScrollLocked,
}: {
  runners: { first: { name: string } | null; second: { name: string } | null; third: { name: string } | null };
  onRunnerSwipe: (fromBase: 'first' | 'second' | 'third') => void;
  setScrollLocked: (locked: boolean) => void;
}) {
  const SIZE = 88;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = 30;
  const RUNNER_R = 12;
  const HIT_R = 18;
  const BASE_HS = 8; // half-size of base square

  const POS = {
    second: { x: cx, y: cy - r },
    third:  { x: cx - r, y: cy },
    first:  { x: cx + r, y: cy },
    home:   { x: cx, y: cy + r },
  };

  const swipeRef = useRef<{ startX: number; base: 'first' | 'second' | 'third' | null }>({
    startX: 0, base: null,
  });

  function hitTest(lx: number, ly: number): 'first' | 'second' | 'third' | null {
    for (const base of ['first', 'second', 'third'] as const) {
      if (!runners[base]) continue;
      const pos = POS[base];
      if (Math.abs(lx - pos.x) <= HIT_R && Math.abs(ly - pos.y) <= HIT_R) return base;
    }
    return null;
  }

  const hasRunners = !!(runners.first || runners.second || runners.third);

  return (
    <View
      style={{ width: SIZE, height: SIZE }}
      onStartShouldSetResponder={(e) => {
        const base = hitTest(e.nativeEvent.locationX, e.nativeEvent.locationY);
        if (base) {
          swipeRef.current = { startX: e.nativeEvent.locationX, base };
          return true;
        }
        return false;
      }}
      onMoveShouldSetResponder={() => !!swipeRef.current.base}
      onResponderTerminationRequest={() => false}
      onResponderGrant={() => {
        if (swipeRef.current.base) setScrollLocked(true);
      }}
      onResponderRelease={(e) => {
        setScrollLocked(false);
        const { base, startX } = swipeRef.current;
        if (base) {
          const dx = e.nativeEvent.locationX - startX;
          if (Math.abs(dx) >= 38) {
            onRunnerSwipe(base);
          }
        }
        swipeRef.current = { startX: 0, base: null };
      }}
      onResponderTerminate={() => {
        setScrollLocked(false);
        swipeRef.current = { startX: 0, base: null };
      }}
    >
      <Svg width={SIZE} height={SIZE}>
        {/* ダイヤモンド線 */}
        <Line x1={POS.home.x}   y1={POS.home.y}   x2={POS.first.x}  y2={POS.first.y}  stroke={Colors.border} strokeWidth={1.5} />
        <Line x1={POS.first.x}  y1={POS.first.y}  x2={POS.second.x} y2={POS.second.y} stroke={Colors.border} strokeWidth={1.5} />
        <Line x1={POS.second.x} y1={POS.second.y} x2={POS.third.x}  y2={POS.third.y}  stroke={Colors.border} strokeWidth={1.5} />
        <Line x1={POS.third.x}  y1={POS.third.y}  x2={POS.home.x}   y2={POS.home.y}   stroke={Colors.border} strokeWidth={1.5} />

        {/* ベース (ひし形) */}
        {(['home', 'first', 'second', 'third'] as const).map((b) => {
          const pos = POS[b];
          const isOccupied = b !== 'home' && !!runners[b];
          return (
            <Rect
              key={b}
              x={pos.x - BASE_HS}
              y={pos.y - BASE_HS}
              width={BASE_HS * 2}
              height={BASE_HS * 2}
              transform={`rotate(45, ${pos.x}, ${pos.y})`}
              fill={isOccupied ? Colors.accent : Colors.primaryLight}
              stroke={isOccupied ? Colors.accent : Colors.primary}
              strokeWidth={1.5}
            />
          );
        })}

        {/* ランナーサークル (選手名2文字) */}
        {(['first', 'second', 'third'] as const).map((base) => {
          const player = runners[base];
          if (!player) return null;
          const pos = POS[base];
          return (
            <React.Fragment key={base}>
              <Circle
                cx={pos.x} cy={pos.y} r={RUNNER_R}
                fill={Colors.primary}
                stroke="#fff"
                strokeWidth={2}
              />
              <SvgText
                x={pos.x} y={pos.y + 4}
                textAnchor="middle"
                fontSize={8}
                fontWeight="bold"
                fill="#FFF"
              >
                {player.name.slice(0, 2)}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* スワイプヒント */}
        {hasRunners && (
          <SvgText
            x={cx} y={SIZE - 1}
            textAnchor="middle"
            fontSize={6.5}
            fill={Colors.primary}
            opacity={0.65}
          >
            ← → スワイプ=盗塁
          </SvgText>
        )}
      </Svg>
    </View>
  );
}

/**
 * BatterSilhouetteSVG — インラインSVGによる打者シルエット
 *
 * 外部画像ファイルを使わないためバグが発生しない。
 * 右打者 (side='R') はデフォルト形状、左打者 (side='L') はscaleX:-1で反転。
 * サイズ: BATTER_W × CANVAS_H = 68 × 284
 */
function BatterSilhouetteSVG({ side }: { side: 'L' | 'R' }) {
  const FILL = '#1A1A1A';
  return (
    <Svg
      width={BATTER_W}
      height={CANVAS_H}
      viewBox="0 0 68 284"
      style={side === 'L' ? { transform: [{ scaleX: -1 }] } : undefined}
    >
      {/* ── 頭 ── */}
      <Circle cx={30} cy={72} r={15} fill={FILL} />

      {/* ── ヘルメット(ドーム部) ── */}
      <Path d="M15 72 Q15 53 30 53 Q45 53 45 68 L45 78 Z" fill={FILL} />
      {/* ヘルメット庇(投手側=左へ) */}
      <Path d="M13 77 Q9 77 10 73 L20 71 L20 78 Z" fill={FILL} />

      {/* ── 首 ── */}
      <Rect x={25} y={87} width={10} height={12} rx={3} fill={FILL} />

      {/* ── 上半身(胴体) ── */}
      <Path
        d="M14 99 Q10 108 12 148 L16 158 L44 156 L46 146 Q48 110 44 99 Q37 96 28 98 Q21 96 14 99 Z"
        fill={FILL}
      />

      {/* ── 後ろ腕 (バックハンド/バット側) ── */}
      <Path d="M44 106 L54 91 L60 82 L64 86 L55 97 L46 115 Z" fill={FILL} />

      {/* ── 前腕 ── */}
      <Path d="M38 106 L48 94 L54 86 L58 90 L49 101 L40 114 Z" fill={FILL} />

      {/* ── 両手グリップ ── */}
      <Ellipse cx={55} cy={89} rx={7} ry={9} fill={FILL} />

      {/* ── バット(グリップ→バレル) ── */}
      <Path d="M52 95 L57 30 L61 31 L58 97 Z" fill={FILL} />
      {/* バット先端ノブ */}
      <Ellipse cx={59} cy={30} rx={5} ry={4} fill={FILL} />

      {/* ── 腰・ヒップ ── */}
      <Path d="M12 156 L8 174 L48 172 L48 156 Z" fill={FILL} />

      {/* ── 後ろ足(利き足側) ── */}
      <Path d="M32 172 Q38 202 36 232 L24 232 Q20 204 24 172 Z" fill={FILL} />

      {/* ── 前足(踏み込み足) ── */}
      <Path d="M24 172 Q12 198 10 228 L22 228 Q26 202 30 172 Z" fill={FILL} />

      {/* ── 後ろ足フット ── */}
      <Path d="M22 230 Q20 240 34 240 Q42 238 40 230 Z" fill={FILL} />

      {/* ── 前足フット ── */}
      <Path d="M8 226 Q4 238 18 240 Q28 238 24 228 Z" fill={FILL} />
    </Svg>
  );
}

/**
 * RunnerEventChip — 走者イベント選択チップ (層B)
 */
function RunnerEventChip({
  label,
  selected,
  color,
  onPress,
}: {
  label: string;
  selected: boolean;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.eventChip,
        selected
          ? { backgroundColor: color, borderColor: color }
          : { backgroundColor: 'transparent', borderColor: color },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.eventChipText, { color: selected ? '#fff' : color }]}>
        {selected ? '✓ ' : ''}{label}
      </Text>
    </TouchableOpacity>
  );
}

// rdStyles: RunnerDiamond → SwipeableDiamond に移行済み (削除)

// ============================================================
// VelocityDragMeter — ドラッグ式球速メーター
// ============================================================

const VEL_MIN = 80;
const VEL_MAX = 165;
const SCREEN_W = Dimensions.get('window').width;
const METER_TRACK_W = SCREEN_W - 100; // strip padding を除いた追跡幅

function VelocityDragMeter({
  value,
  onChange,
  onReset,
  setScrollLocked,
}: {
  value: number;
  onChange: (v: number) => void;
  onReset: () => void;
  setScrollLocked: (l: boolean) => void;
}) {
  const fillRatio = (value - VEL_MIN) / (VEL_MAX - VEL_MIN);

  const handleTouch = (locationX: number) => {
    const ratio = Math.max(0, Math.min(1, locationX / METER_TRACK_W));
    onChange(Math.round(VEL_MIN + ratio * (VEL_MAX - VEL_MIN)));
  };

  return (
    <View style={meterStyles.wrap}>
      {/* 大きな数値表示 */}
      <View style={meterStyles.valueRow}>
        <MaterialCommunityIcons name="speedometer" size={18} color="#2E7D32" />
        <Text style={meterStyles.valueLarge}>{value}</Text>
        <Text style={meterStyles.unitText}>km/h</Text>
        <TouchableOpacity onPress={onReset} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons name="refresh" size={16} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ドラッグトラック */}
      <View
        style={meterStyles.track}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          setScrollLocked(true);
          handleTouch(e.nativeEvent.locationX);
        }}
        onResponderMove={(e) => handleTouch(e.nativeEvent.locationX)}
        onResponderRelease={() => setScrollLocked(false)}
        onResponderTerminate={() => setScrollLocked(false)}
      >
        {/* 背景 */}
        <View style={meterStyles.trackBg} />
        {/* 塗りつぶし */}
        <View style={[meterStyles.trackFill, { width: `${fillRatio * 100}%` as any }]} />
        {/* サム */}
        <View style={[meterStyles.thumb, { left: fillRatio * (METER_TRACK_W - 20) }]} />
      </View>

      {/* レンジラベル */}
      <View style={meterStyles.rangeRow}>
        <Text style={meterStyles.rangeLabel}>{VEL_MIN}</Text>
        <Text style={meterStyles.rangeLabel}>{VEL_MAX}</Text>
      </View>
    </View>
  );
}

const meterStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingVertical: 4,
    gap: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  valueLarge: {
    fontSize: 22,
    fontWeight: '900',
    color: '#2E7D32',
    lineHeight: 26,
  },
  unitText: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    fontWeight: '600',
    flex: 1,
  },
  track: {
    height: 28,
    width: METER_TRACK_W,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
    top: 10,
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2E7D32',
    top: 10,
  },
  thumb: {
    position: 'absolute',
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2E7D32',
    borderWidth: 2.5,
    borderColor: Colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: METER_TRACK_W,
  },
  rangeLabel: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
});

// ============================================================
// スタイル
// ============================================================

const PITCH_COL_W = 64;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  msg: { fontSize: Typography.body, color: Colors.textSecondary, marginBottom: Spacing.md },

  unmappedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.secondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  unmappedBannerText: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.white,
  },

  scoreBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingTop: 56,
  },
  teamScore: { alignItems: 'center', flex: 1 },
  teamName: { color: 'rgba(255,255,255,0.6)', fontSize: Typography.caption, fontWeight: '600' },
  teamNameActive: { color: Colors.white },
  score: { color: Colors.white, fontSize: 36, fontWeight: '900' },
  inningBadge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  inningText: { fontSize: Typography.caption, fontWeight: '800', color: Colors.black },

  mainScroll: { flex: 1 },
  mainContent: { paddingBottom: 40 },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.xl,
  },
  countSection: { gap: 4 },
  countItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countLabel: { fontSize: Typography.bodySmall, fontWeight: '800', width: 16 },
  dotsRow: { flexDirection: 'row', gap: 3 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  diamondWrap: { paddingVertical: 0 },

  matchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  matchupPlayer: { flex: 1 },
  matchupRole: { fontSize: Typography.tiny, color: Colors.textSecondary, fontWeight: '600' },
  matchupName: { fontSize: Typography.bodySmall, fontWeight: '700', color: Colors.text },
  matchupStat: { fontSize: Typography.tiny, color: Colors.textSecondary },

  // ── 左右打ち切り替えバッジ ────────────────────────────────
  handBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  handBadgeLeft: {
    backgroundColor: 'rgba(196,30,58,0.1)',
    borderColor: Colors.secondary,
  },
  handBadgeText: {
    fontSize: Typography.tiny,
    fontWeight: '700',
    color: Colors.primary,
  },

  // ── ゾーンセクション全体 ──────────────────────────────────
  zoneSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.sm,
    gap: 4,
  },

  // ── 球種縦列 (サイドメニュー) ─────────────────────────────
  pitchColumn: {
    width: PITCH_COL_W,
    height: CANVAS_H,
    gap: 3,
  },
  pitchColBtn: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 3,
    alignItems: 'center',
  },
  pitchColBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pitchColBtnCustom: {
    borderColor: '#FFD700',
    borderStyle: 'dashed' as any,
  },
  pitchColLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  pitchColLabelActive: {
    color: Colors.white,
  },
  pitchColInput: {
    backgroundColor: Colors.card,
    fontSize: 9,
    height: 32,
    marginBottom: 3,
  },
  pitchColAddBtn: {
    height: 28,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: '#FFD700',
    borderStyle: 'dashed' as any,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.card,
    marginBottom: 3,
  },

  // ── バッター + キャンバス ─────────────────────────────────
  zoneBatterArea: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  canvasArea: {
    width: CANVAS_W,
    height: CANVAS_H,
    overflow: 'hidden',
  },

  // ── Reanimated カーソルドット ─────────────────────────────
  cursorDot: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: CURSOR_R * 2,
    height: CURSOR_R * 2,
    borderRadius: CURSOR_R,
    backgroundColor: 'rgba(196,30,58,0.85)',
    borderWidth: 2.5,
    borderColor: '#fff',
    zIndex: 10,
  },

  lastPitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  lastPitchInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  lastPitchLabel: { fontSize: Typography.caption, color: Colors.textSecondary },
  lastPitchValue: { fontSize: Typography.caption, fontWeight: '700', color: Colors.text },
  actionBtnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pickoffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,215,0,0.15)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  pickoffBtnText: { fontSize: Typography.tiny, color: '#FFD700', fontWeight: '700' },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  undoBtnText: { fontSize: Typography.tiny, color: Colors.white, fontWeight: '600' },

  advancementOverlay: {
    backgroundColor: 'rgba(13, 13, 26, 0.85)',
  },

  subRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  subButton: {
    flex: 1,
    borderColor: Colors.primary,
  },
  endButton: {
    margin: Spacing.md,
    borderColor: Colors.error,
  },

  modal: {
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  modalTitle: {
    fontSize: Typography.h4,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  resultGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  resultBtn: {
    width: 72,
    height: 52,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  resultBtnText: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.white,
    textAlign: 'center',
  },

  // ── 層B: 走者イベントチップ ───────────────────────────────
  runnerEventSection: {
    marginBottom: Spacing.md,
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
  },
  runnerEventLabel: {
    fontSize: Typography.tiny,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  eventChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventChipText: {
    fontSize: Typography.caption,
    fontWeight: '700',
  },

  // ── 球速計測ストリップ ────────────────────────────────────────────
  velocityStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceGray,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  velocitySettingsBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.border,
  },
  autoVelocityBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: '#2E7D32',
  },
  autoVelocityText: {
    fontSize: Typography.body,
    fontWeight: '800',
    color: Colors.white,
  },
  autoVelocitySubText: {
    fontSize: Typography.tiny,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
    flex: 1,
  },
  velocityOffGear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
    marginRight: Spacing.md,
    marginBottom: 2,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceGray,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  velocityOffGearText: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    fontWeight: '600',
  },

  // ── 設定ハーフシート ─────────────────────────────────────────
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 40,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 12,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing.xs,
  },
  bottomSheetTitle: {
    fontSize: Typography.h4,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  modeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  modeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeTextWrap: { flex: 1 },
  modeLabel: {
    fontSize: Typography.bodySmall,
    fontWeight: '800',
    color: Colors.text,
  },
  modeDesc: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  velocityDisabledNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceGray,
    marginTop: Spacing.xs,
  },
  velocityDisabledNoteText: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    flex: 1,
  },
  velocityHoldBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.lg,
    backgroundColor: '#607D8B',
  },
  velocityHoldBtnActive: {
    backgroundColor: Colors.secondary,
  },
  velocityHoldBtnDone: {
    backgroundColor: '#2E7D32',
  },
  velocityHoldBtnText: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.white,
  },
  velocityResetBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── 下書き保存トースト ─────────────────────────────────────────────
  draftToast: {
    position: 'absolute',
    bottom: 88,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: BorderRadius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },
  draftToastText: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.white,
  },
});
