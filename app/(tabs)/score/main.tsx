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
  Switch,
  Image,
  PanResponder,
} from 'react-native';

// Android で LayoutAnimation を有効化
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Text, Button, Modal, Portal, TextInput } from 'react-native-paper';
import { router } from 'expo-router';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Rect, Line, Text as SvgText, Circle, Path, Ellipse } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { useGameStore } from '../../../src/stores/gameStore';
import { useI18n } from '../../../src/i18n';
import { useAuth } from '../../../src/contexts/AuthContext';
import { gameService } from '../../../src/services/gameService';
import { DRAFT_GAME_KEY } from '../../../src/db';
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
  type BuntType,
  type SignPlayTag,
  type BuntOutcome,
  type BatterAdvancementReason,
} from '../../../src/types/game';
import FieldView from '../../../src/components/score/FieldView';
import SignPlayPicker from '../../../src/components/score/SignPlayPicker';
import PlayConfirmSnack from '../../../src/components/score/PlayConfirmSnack';
import { useRecordingPreferences, isRecItem } from '../../../src/hooks/useRecordingPreferences';
import { makeFieldViewFilter, filterPitchResultOptions } from '../../../src/utils/recordingFilters';
import { mergeRecordingPreferences } from '../../../src/constants/recordingPreferences';
import RunnerAdvancementView from '../../../src/components/score/RunnerAdvancementView';
import PlayLogList from '../../../src/components/score/PlayLogList';
import CurrentAtBatPitchLog from '../../../src/components/score/CurrentAtBatPitchLog';
import PlayLogEditModal from '../../../src/components/score/PlayLogEditModal';
import PlayerSubstitutionModal from '../../../src/components/score/PlayerSubstitutionModal';
import InGameStatsPanel from '../../../src/components/score/InGameStatsPanel';
import { usePlanGate } from '../../../src/hooks/usePlanGate';
import { showOpponentDataPlanAlert } from '../../../src/utils/planLimitAlerts';
import type { AtBatLog, Player } from '../../../src/types/game';

// ── 投球コース記録キャンバス定数 (横4:縦7 ストライクゾーン) ──────────
const SZ_W       = 112;
const SZ_H       = Math.round(SZ_W * 7 / 4);   // = 196px
const BALL_PAD_H = 52;
const BALL_PAD_V = 44;
const CANVAS_W   = SZ_W + 2 * BALL_PAD_H;      // = 216px
const CANVAS_H   = SZ_H + 2 * BALL_PAD_V;      // = 284px
const BATTER_W   = 100;
const CURSOR_OFFSET = 50;
const CURSOR_R   = 10;

const SZ_LEFT    = BALL_PAD_H;                  // = 52
const SZ_TOP     = BALL_PAD_V;                  // = 44
const SZ_RIGHT   = BALL_PAD_H + SZ_W;           // = 164
const SZ_BOT     = BALL_PAD_V + SZ_H;           // = 240


/** タップ座標 (canvas px) → StrikeZone。simple 時は外角4領域を中芯 '5' に寄せる */
function coordToZone(px: number, py: number, simple: boolean): StrikeZone {
  const inX = px >= SZ_LEFT && px <= SZ_RIGHT;
  const inY = py >= SZ_TOP && py <= SZ_BOT;
  if (inX && inY) {
    const col = Math.min(Math.floor((px - SZ_LEFT) / (SZ_W / 3)), 2) + 1;
    const row = Math.min(Math.floor((py - SZ_TOP) / (SZ_H / 3)), 2) + 1;
    return String((row - 1) * 3 + col) as StrikeZone;
  }
  if (simple) return '5';
  if (py < SZ_TOP) return 'BH';
  if (py > SZ_BOT) return 'BL';
  if (px < SZ_LEFT) return 'BI';
  return 'BO';
}

export default function LiveScoreScreen() {
  const { t } = useI18n();
  const { currentUser, refreshUser } = useAuth();
  const { prefs, isItemOn } = useRecordingPreferences(currentUser);
  const fieldViewFilter = useMemo(() => makeFieldViewFilter(prefs), [prefs]);
  const pitchResultRows = useMemo(() => filterPitchResultOptions(prefs), [prefs]);
  const detailMode = mergeRecordingPreferences(prefs).detailMode;
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
  const pendingPickoffSafe = useGameStore((s) => s.pendingPickoffSafe);
  const confirmPickoffSafeAdvancement = useGameStore((s) => s.confirmPickoffSafeAdvancement);
  const cancelPickoffSafe = useGameStore((s) => s.cancelPickoffSafe);
  const recordStolenBase = useGameStore((s) => s.recordStolenBase);
  const recordCaughtStealing = useGameStore((s) => s.recordCaughtStealing);
  const recordSignMiss = useGameStore((s) => s.recordSignMiss);
  const updatePlayerBats = useGameStore((s) => s.updatePlayerBats);
  const revertToPreAdvancement = useGameStore((s) => s.revertToPreAdvancement);

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
  const [modalVelocity, setModalVelocity] = useState<number>(130);
  const [modalVelocityEnabled, setModalVelocityEnabled] = useState(true);
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
  const [showSignMissModal, setShowSignMissModal] = useState(false);
  const [signMissToast, setSignMissToast] = useState<string | null>(null);
  const [buntStance, setBuntStance] = useState(false);
  const [atBatSign, setAtBatSign] = useState<SignPlayTag | 'none'>('none');
  const [stealSign, setStealSign] = useState<SignPlayTag | 'none'>('none');
  const [showPitcherStats, setShowPitcherStats] = useState(false);
  const [showBatterStats, setShowBatterStats] = useState(false);
  const opponentDataGate = usePlanGate('opponent_data');

  const openPitcherStats = useCallback(() => {
    if (!opponentDataGate.allowed) {
      showOpponentDataPlanAlert();
      return;
    }
    setShowPitcherStats(true);
  }, [opponentDataGate.allowed]);

  const openBatterStats = useCallback(() => {
    if (!opponentDataGate.allowed) {
      showOpponentDataPlanAlert();
      return;
    }
    setShowBatterStats(true);
  }, [opponentDataGate.allowed]);
  const [playSnack, setPlaySnack] = useState<{
    id: string;
    batter: string;
    resultLabel: string;
  } | null>(null);
  const atBatLogCountRef = useRef(-1);

  // 新しい打席ログが追記されたらメモ用スナックの表示用フラグを立てる
  useEffect(() => {
    if (!game) return;
    if (atBatLogCountRef.current < 0) {
      atBatLogCountRef.current = game.atBatLogs.length;
      return;
    }
    if (game.atBatLogs.length > atBatLogCountRef.current) {
      const last = game.atBatLogs[game.atBatLogs.length - 1];
      if (last?.result) {
        const team = last.inning.half === 'top' ? game.awayTeam : game.homeTeam;
        const batter = team.roster.starters.find((p) => p.id === last.batterId);
        setPlaySnack({
          id: last.id,
          batter: batter?.name ?? '',
          resultLabel: t.atBatResults[last.result],
        });
      }
    }
    atBatLogCountRef.current = game.atBatLogs.length;
  }, [game, game?.atBatLogs.length, t]);

  useEffect(() => {
    atBatLogCountRef.current = -1;
  }, [game?.id]);

  // ── ダイヤモンドタップ盗塁: 結果選択モーダル ──────────────────────────
  const [pendingStealBase, setPendingStealBase] = useState<'first' | 'second' | 'third' | null>(null);

  // ── 投球結果モーダル: 走者アクション（盗塁成功/失敗）─────────────────
  type PitchRunnerAction = { type: 'steal'; result: 'safe' | 'out' };
  const [runnerActions, setRunnerActions] = useState<
    Partial<Record<'first' | 'second' | 'third', PitchRunnerAction>>
  >({});

  const toggleRunnerAction = useCallback((base: 'first' | 'second' | 'third') => {
    setRunnerActions(prev => {
      if (prev[base]) {
        const next = { ...prev };
        delete next[base];
        return next;
      }
      return { ...prev, [base]: { type: 'steal' as const, result: 'safe' as const } };
    });
  }, []);

  const setRunnerActionResult = useCallback((
    base: 'first' | 'second' | 'third',
    result: 'safe' | 'out',
  ) => {
    setRunnerActions(prev => {
      if (!prev[base]) return prev;
      return { ...prev, [base]: { ...prev[base]!, result } };
    });
  }, []);

  // ── スクロールロック ────────────────────────────────────────────────
  const [scrollLocked, setScrollLocked] = useState(false);

  // ── 球速計測 ─────────────────────────────────────────────────────
  const pitchDistanceM = game?.pitchDistanceM ?? 18.44;
  const velocityEnabled = game?.velocityEnabled ?? false;
  const setVelocityEnabled = useGameStore((s) => s.setVelocityEnabled);
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
    const newIsLeft = !isLeftBatter;
    setIsLeftBatter(newIsLeft);
    if (game) {
      const offSide = game.inning.half === 'top' ? 'away' : 'home';
      const offTeam = game.inning.half === 'top' ? game.awayTeam : game.homeTeam;
      const currentBatter = offTeam.roster.starters[game.currentBatterIndex[offSide]];
      if (currentBatter?.id) {
        updatePlayerBats(currentBatter.id, newIsLeft ? 'L' : 'R');
        persist();
      }
    }
  }, [isLeftBatter, game, updatePlayerBats, persist]);

  // ── 下書き保存・戻るガード ────────────────────────────────────────
  // game / persist の最新値を ref で保持し beforeRemove クロージャ内で参照
  const gameRef = useRef(game);
  useEffect(() => { gameRef.current = game; });
  const persistRef = useRef(persist);
  useEffect(() => { persistRef.current = persist; }, [persist]);

  const [draftSaved, setDraftSaved] = useState(false);
  const draftToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // マウント時: 下書き復元チェック (game が null の時のみ)
  // start.tsx の「下書きを再開する」経由では game がロード済みのためスキップされる
  useEffect(() => {
    if (game) return;
    AsyncStorage.getItem(DRAFT_GAME_KEY).then((json) => {
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
              onPress: () => AsyncStorage.removeItem(DRAFT_GAME_KEY),
            },
            {
              text: '再開する',
              onPress: async () => {
                await loadGame(gameId);
                await AsyncStorage.removeItem(DRAFT_GAME_KEY);
              },
            },
          ],
          { cancelable: false },
        );
      } catch {}
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 戻るガード: 進行中の記録セッション中は確認ダイアログを表示
  // usePreventRemove により native-stack がスワイプバックを事前に無効化し
  // 「ネイティブ除去と JS 状態の乖離」による警告を解消する
  usePreventRemove(!!game && game.phase === 'live', ({ data }) => {
    Alert.alert(
      '記録を中断しますか？',
      '入力中のデータは破棄されます。一時保存して終了することも可能です。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '破棄して戻る',
          style: 'destructive',
          onPress: () => {
            AsyncStorage.removeItem(DRAFT_GAME_KEY);
            navigation.dispatch(data.action);
          },
        },
        {
          text: '下書きに保存して戻る',
          onPress: async () => {
            const currentGame = gameRef.current;
            if (currentGame) {
              await persistRef.current();
              await AsyncStorage.setItem(
                DRAFT_GAME_KEY,
                JSON.stringify({ gameId: currentGame.id }),
              );
            }
            setDraftSaved(true);
            if (draftToastTimerRef.current) clearTimeout(draftToastTimerRef.current);
            draftToastTimerRef.current = setTimeout(() => {
              setDraftSaved(false);
              navigation.dispatch(data.action);
            }, 1400);
          },
        },
      ],
    );
  });

  // draftToastTimer のクリーンアップ
  useEffect(() => {
    return () => {
      if (draftToastTimerRef.current) clearTimeout(draftToastTimerRef.current);
    };
  }, []);

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
  const catcher = defTeam.roster.starters.find((p) => p.position === 'C');

  const inningLabel = `${game.inning.number}${t.common.inning}${isTop ? t.common.top : t.common.bottom}`;
  const lastPitch = game.pitchLogs.length > 0 ? game.pitchLogs[game.pitchLogs.length - 1] : null;

  const simpleZone = !isRecItem(prefs, 'pitch_zone_detail');

  const handleCanvasTap = useCallback((px: number, py: number) => {
    if (measuredVelocity !== null) {
      setModalVelocity(measuredVelocity);
      setModalVelocityEnabled(true);
      setMeasuredVelocity(null);
    } else {
      setModalVelocity(130);
      setModalVelocityEnabled(false);
    }
    const zone = coordToZone(px, py, simpleZone);
    setTapCoord({ px, py });
    setPendingCoords({ x: px / CANVAS_W, y: py / CANVAS_H });
    setPendingZone(zone);
    setResultModalVisible(true);
  }, [simpleZone, measuredVelocity]);

  const handleResultSelect = useCallback((result: PitchResult) => {
    if (!pendingZone) return;
    setResultModalVisible(false);
    const normX = pendingCoords?.x;
    const normY = pendingCoords?.y;

    // 走者アクション（盗塁成功/失敗）を取り出してリセット
    const actionsToApply = { ...runnerActions };
    setRunnerActions({});

    const applyRunnerActions = (pitchResult: typeof result, vel: number | undefined) => {
      const pitchContext: Parameters<typeof recordStolenBase>[1] = {
        pitchType:     selectedPitch,
        pitchZone:     pendingZone ?? undefined,
        pitchVelocity: vel,
        countBefore:   game.count,
        pitchResult,
        ...(isItemOn('sign_play') && stealSign !== 'none' ? { signPlay: stealSign as SignPlayTag } : {}),
      };
      for (const [base, action] of Object.entries(actionsToApply)) {
        if (!action) continue;
        const b = base as 'first' | 'second' | 'third';
        if (action.result === 'safe') {
          recordStolenBase(b, pitchContext);
        } else {
          recordCaughtStealing(b, pitchContext);
        }
      }
    };

    // モード別の球速決定（モーダル内スライダーが最優先）
    let velocity: number | undefined;
    if (modalVelocityEnabled && modalVelocity !== null) {
      velocity = modalVelocity;
    } else if (velocityMode === 'auto') {
      velocity = averageVelocity;
    } else {
      // hold / drag どちらも measuredVelocity を使う
      velocity = measuredVelocity ?? undefined;
      setMeasuredVelocity(null);
    }
    setModalVelocity(130);
    setModalVelocityEnabled(true);

    let pitchExtra: { buntAttempt?: boolean; buntOutcome?: BuntOutcome } | undefined;
    if (buntStance && isItemOn('bunt_stance')) {
      pitchExtra = { buntAttempt: true };
      if (result === 'foul') pitchExtra.buntOutcome = 'foul';
      else if (result === 'strike_swinging') pitchExtra.buntOutcome = 'swing_miss';
      else if (result === 'in_play') pitchExtra.buntOutcome = 'in_play';
      else if (result === 'ball' || result === 'strike_called') pitchExtra.buntOutcome = 'stance_only';
    }

    if (result === 'in_play') {
      recordPitch(selectedPitch, pendingZone, 'in_play', velocity, normX, normY, pitchExtra);
      applyRunnerActions('in_play', velocity);
      setPendingZone(null);
      setPendingCoords(null);
      setTapCoord(null);
      setStealSign('none');
      setBuntStance(false);
      setShowFieldView(true);
      return;
    }

    recordPitch(selectedPitch, pendingZone, result, velocity, normX, normY, pitchExtra);
    applyRunnerActions(result, velocity);
    setPendingZone(null);
    setPendingCoords(null);
    setTapCoord(null);
    setStealSign('none');
    setBuntStance(false);
    persist();
  }, [pendingZone, pendingCoords, selectedPitch, recordPitch, recordStolenBase, recordCaughtStealing, persist, runnerActions, velocityMode, measuredVelocity, averageVelocity, game.count, buntStance, isItemOn, stealSign, modalVelocity, modalVelocityEnabled]);

  const handleFieldConfirm = useCallback((result: AtBatResult, battedBall: BattedBall, buntType?: BuntType) => {
    const g = useGameStore.getState().game;
    const hasRunners = g && (g.runners.first || g.runners.second || g.runners.third);
    if (!hasRunners) {
      setShowFieldView(false);
    }
    const sp = atBatSign !== 'none' ? atBatSign : undefined;
    resolveAtBat(result, battedBall, 0, { buntType, signPlay: sp });
    setAtBatSign('none');
    if (hasRunners && !useGameStore.getState().game?.pendingAdvancement) {
      setShowFieldView(false);
    }
    persist();
  }, [resolveAtBat, persist, atBatSign]);

  const handleAdvancementConfirm = useCallback((
    finalAdvancements: RunnerAdvancement[],
    batterAdvancementReasons?: BatterAdvancementReason[],
  ) => {
    const sp = atBatSign !== 'none' ? atBatSign : undefined;
    confirmAdvancement(finalAdvancements, { signPlay: sp, batterAdvancementReasons });
    setAtBatSign('none');
    setShowFieldView(false);
    persist();
  }, [confirmAdvancement, persist, atBatSign]);

  const handleAdvancementCancel = useCallback(() => {
    cancelAdvancement();
    persist();
    setShowFieldView(true);
  }, [cancelAdvancement, persist, setShowFieldView]);

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
            if (__DEV__) console.error('[handleEndGame] 保存失敗:', error);
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

  const handleSaveEdit = useCallback((logId: string, newResult: AtBatResult, newRbi: number, note: string) => {
    editAtBatLog(logId, newResult, newRbi, note);
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

  const handlePickoffSafeConfirm = useCallback((finalAdvancements: RunnerAdvancement[]) => {
    if (finalAdvancements[0]) confirmPickoffSafeAdvancement(finalAdvancements[0]);
    persist();
  }, [confirmPickoffSafeAdvancement, persist]);

  // ── サインミス: 選手選択 → 記録 ─────────────────────────────────────
  const handleSignMissSelect = useCallback(
    (player: Player, side: 'away' | 'home', context: 'batting' | 'baserunning' | 'fielding' | 'pitching') => {
      recordSignMiss({
        playerId: player.id,
        playerName: player.name,
        side,
        context,
      });
      setShowSignMissModal(false);
      setSignMissToast(`${player.name} のサインミスを記録しました`);
      setTimeout(() => setSignMissToast(null), 2000);
      persist();
    },
    [recordSignMiss, persist],
  );

  // ── タップ盗塁: ランナータップ → 盗塁ON/OFFをトグル ──────────────────
  const handleRunnerTap = useCallback((fromBase: 'first' | 'second' | 'third') => {
    toggleRunnerAction(fromBase);
  }, [toggleRunnerAction]);

  // 「盗塁を試みた」: runnerActions にフラグを立てるだけ。セーフ/アウトは投球後に入力
  const handleStealAttempt = useCallback(() => {
    if (!pendingStealBase) return;
    setRunnerActions(prev => ({
      ...prev,
      [pendingStealBase]: { type: 'steal' as const, result: 'safe' as const },
    }));
    setPendingStealBase(null);
  }, [pendingStealBase]);

  // 「盗塁試みを取り消す」: runnerActions から該当塁を削除
  const handleCancelStealAttempt = useCallback(() => {
    if (!pendingStealBase) return;
    setRunnerActions(prev => {
      const next = { ...prev };
      delete next[pendingStealBase];
      return next;
    });
    setPendingStealBase(null);
  }, [pendingStealBase]);

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
              filterAtBatResult={fieldViewFilter}
              buntDetailEnabled={isItemOn('bunt_detail')}
              fieldLocationEnabled={isItemOn('batted_ball_location')}
              fieldDistanceLabelEnabled={isItemOn('batted_ball_distance')}
            />
            {isItemOn('sign_play') && (
              <View style={{ paddingHorizontal: 12, paddingBottom: 8, backgroundColor: Colors.background }}>
                <SignPlayPicker
                  value={atBatSign}
                  onChange={setAtBatSign}
                  labels={{
                    none: 'なし',
                    hit_and_run: 'H&R',
                    run_and_hit: 'R&H',
                    squeeze: 'スクイズ',
                    double_steal: 'D盗',
                    delayed_steal: '遅盗',
                    bunt_and_run: 'B&R',
                  }}
                />
              </View>
            )}
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

  if (pendingPickoffSafe) {
    const pickoffAdvancements: RunnerAdvancement[] = [{
      runnerId: pendingPickoffSafe.runnerId,
      playerName: pendingPickoffSafe.playerName,
      fromBase: pendingPickoffSafe.fromBase,
      targetBase: pendingPickoffSafe.fromBase,
      outcome: 'safe',
      action: 'batted_ball',
      isForced: false,
      minBase: pendingPickoffSafe.fromBase,
    }];
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
          advancements={pickoffAdvancements}
          result="pickoff_safe"
          onConfirm={handlePickoffSafeConfirm}
          onCancel={cancelPickoffSafe}
        />
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
        <TouchableOpacity
          style={styles.editRosterIcon}
          onPress={() => router.push('/(tabs)/score/mapping' as any)}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="account-edit-outline" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
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
            <TappableDiamond
              runners={game.runners}
              onRunnerTap={handleRunnerTap}
              stealingBases={{
                first:  !!runnerActions.first,
                second: !!runnerActions.second,
                third:  !!runnerActions.third,
              }}
            />
          </View>
        </View>

        {/* ===== 打者・投手情報 ===== */}
        <View style={styles.matchupRow}>
          <View style={styles.matchupPlayer}>
            <Text style={styles.matchupRole}>{t.live.pitcher}</Text>
            <Text style={styles.matchupName}>{pitcher.number != null ? `#${pitcher.number} ` : ''}{pitcher.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.matchupStat}>{game.totalPitchCount[defSide]}{t.live.pitchCount}</Text>
              <TouchableOpacity style={styles.detailBtn} onPress={openPitcherStats}>
                <Text style={styles.detailBtnText}>詳細</Text>
              </TouchableOpacity>
            </View>
          </View>
          <MaterialCommunityIcons name="arrow-right" size={20} color={Colors.textSecondary} />
          <View style={[styles.matchupPlayer, { alignItems: 'flex-end' }]}>
            <Text style={styles.matchupRole}>{t.live.batter}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity style={styles.detailBtn} onPress={openBatterStats}>
                <Text style={styles.detailBtnText}>詳細</Text>
              </TouchableOpacity>
              <Text style={styles.matchupName}>{batter.number != null ? `#${batter.number} ` : ''}{batter.name}</Text>
            </View>
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

        {/* ===== 現在打席の投球ログ ===== */}
        {game.currentAtBat && (
          <CurrentAtBatPitchLog
            batter={batter}
            pitcher={pitcher}
            pitches={game.currentAtBat.pitches}
          />
        )}

        {/* ===== 直前の打席を修正ボタン ===== */}
        {game?.preAdvancementSnapshot && !showFieldView && !pendingAdvancement && (
          <TouchableOpacity
            onPress={() => {
              revertToPreAdvancement();
              persist();
            }}
            style={styles.revertButton}
          >
            <MaterialCommunityIcons name="undo-variant" size={16} color="#FF9800" />
            <Text style={styles.revertButtonText}>直前の打席を修正</Text>
          </TouchableOpacity>
        )}

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
                {/* ボールゾーンラベル（高/低のみ。内外は打者シルエットで自明） */}
                <SvgText x={SZ_LEFT + SZ_W / 2} y={SZ_TOP / 2 + 5}                        textAnchor="middle" fontSize={11} fill="#8E8E93">高</SvgText>
                <SvgText x={SZ_LEFT + SZ_W / 2} y={SZ_BOT + (CANVAS_H - SZ_BOT) / 2 + 5} textAnchor="middle" fontSize={11} fill="#8E8E93">低</SvgText>
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
            {(game.runners.first || game.runners.second || game.runners.third) && isItemOn('pickoff') && (
              <TouchableOpacity style={styles.pickoffBtn} onPress={handlePickoffPress}>
                <MaterialCommunityIcons name="arrow-left-bold" size={16} color="#FFD700" />
                <Text style={styles.pickoffBtnText}>{t.live.pickoff}</Text>
              </TouchableOpacity>
            )}
            {isItemOn('sign_miss') && (
              <TouchableOpacity style={styles.signMissBtn} onPress={() => setShowSignMissModal(true)}>
                <MaterialCommunityIcons name="alert-octagon-outline" size={16} color="#fff" />
                <Text style={styles.signMissBtnText}>サインミス</Text>
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
        {isItemOn('substitution') && (
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
        )}

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
              {isItemOn('pickoff_balk') && (
                <TouchableOpacity style={[styles.resultBtn, { backgroundColor: '#FB8C00' }]} onPress={() => handlePickoffResult('balk')}>
                  <Text style={styles.resultBtnText}>{t.live.pickoffBalk}</Text>
                </TouchableOpacity>
              )}
              {isItemOn('pickoff_error') && (
                <TouchableOpacity style={[styles.resultBtn, { backgroundColor: '#795548' }]} onPress={() => handlePickoffResult('error')}>
                  <Text style={styles.resultBtnText}>{t.live.pickoffError}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      </Portal>


      {/* ===== ダイヤモンドタップ盗塁: 結果選択モーダル ===== */}
      <Portal>
        <Modal
          visible={!!pendingStealBase}
          onDismiss={() => setPendingStealBase(null)}
          contentContainerStyle={styles.modal}
        >
          {pendingStealBase && (
            <View>
              {/* タイトル */}
              <View style={styles.stealModalHeader}>
                <MaterialCommunityIcons name="run-fast" size={22} color={Colors.primary} />
                <Text style={styles.modalTitle}>
                  {pendingStealBase === 'first' ? '1塁' : pendingStealBase === 'second' ? '2塁' : '3塁'}走者
                </Text>
              </View>
              <Text style={styles.stealModalSub}>
                {game.runners[pendingStealBase]?.name ?? ''}
              </Text>

              {isItemOn('sign_play') && (
                <SignPlayPicker
                  value={stealSign}
                  onChange={setStealSign}
                  labels={{
                    none: 'なし',
                    hit_and_run: 'H&R',
                    run_and_hit: 'R&H',
                    squeeze: 'スクイズ',
                    double_steal: 'D盗',
                    delayed_steal: '遅盗',
                    bunt_and_run: 'B&R',
                  }}
                />
              )}

              {runnerActions[pendingStealBase] ? (
                /* 盗塁試み中 → 取り消しUI */
                <>
                  <View style={styles.stealAttemptHint}>
                    <MaterialCommunityIcons name="run-fast" size={15} color="#2E7D32" />
                    <Text style={styles.stealAttemptHintText}>盗塁試み中 — 投球後にセーフ/アウトを入力します</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.stealResultLargeBtn, { backgroundColor: '#C62828' }]}
                    onPress={handleCancelStealAttempt}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="close-circle-outline" size={26} color="#fff" />
                    <Text style={styles.stealResultLargeBtnText}>盗塁試みを取り消す</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.stealCancelBtn}
                    onPress={() => setPendingStealBase(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.stealCancelBtnText}>閉じる</Text>
                  </TouchableOpacity>
                </>
              ) : (
                /* 未登録 → 試み登録UI */
                <>
                  <TouchableOpacity
                    style={[styles.stealResultLargeBtn, { backgroundColor: Colors.primary }]}
                    onPress={handleStealAttempt}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="run-fast" size={28} color="#fff" />
                    <Text style={styles.stealResultLargeBtnText}>盗塁を試みた</Text>
                    <Text style={styles.stealResultLargeBtnSub}>セーフ/アウトは投球後に入力</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.stealCancelBtn}
                    onPress={() => setPendingStealBase(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.stealCancelBtnText}>キャンセル（盗塁なし）</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
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

          <View style={styles.velocityToggleRow}>
            <MaterialCommunityIcons name="speedometer" size={20} color={Colors.textSecondary} />
            <Text style={styles.velocityToggleLabel}>球速記録</Text>
            <Switch
              value={velocityEnabled}
              onValueChange={(v) => { setVelocityEnabled(v); setSettingsModalVisible(false); }}
            />
          </View>
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

      {/* ===== サインミス: 選手選択モーダル ===== */}
      <Portal>
        <Modal
          visible={showSignMissModal}
          onDismiss={() => setShowSignMissModal(false)}
          contentContainerStyle={styles.modal}
        >
          <View>
            <View style={styles.signMissHeader}>
              <MaterialCommunityIcons name="alert-octagon-outline" size={22} color="#E64A19" />
              <Text style={styles.modalTitle}>サインミス記録</Text>
            </View>
            <Text style={styles.signMissSub}>
              ミスをした選手を選択してください
            </Text>

            {/* 攻撃側: 打者・走者 */}
            <Text style={styles.signMissSection}>攻撃側（打席・走塁）</Text>
            <View style={styles.signMissList}>
              {(() => {
                const offSide = game.inning.half === 'top' ? 'away' : 'home';
                const offTeam = offSide === 'away' ? game.awayTeam : game.homeTeam;
                const batter = offTeam.roster.starters[
                  game.currentBatterIndex[offSide]
                ];
                const candidates: { player: Player; ctx: 'batting' | 'baserunning'; label: string }[] = [];
                if (batter) candidates.push({ player: batter, ctx: 'batting', label: '打席' });
                (['first', 'second', 'third'] as const).forEach((b) => {
                  const r = game.runners[b];
                  if (r) {
                    const baseLabel = b === 'first' ? '1塁' : b === 'second' ? '2塁' : '3塁';
                    candidates.push({ player: r, ctx: 'baserunning', label: `${baseLabel}走者` });
                  }
                });
                return candidates.map(({ player, ctx, label }) => (
                  <TouchableOpacity
                    key={`${player.id}-${ctx}`}
                    style={styles.signMissItem}
                    onPress={() => handleSignMissSelect(player, offSide, ctx)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.signMissItemLeft}>
                      <Text style={styles.signMissItemName} numberOfLines={1}>
                        {player.name}
                      </Text>
                      <Text style={styles.signMissItemRole}>{label}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                ));
              })()}
            </View>

            {/* 守備側: 投手・スタメン */}
            <Text style={styles.signMissSection}>守備側（投球・守備）</Text>
            <View style={styles.signMissList}>
              {(() => {
                const defSide = game.inning.half === 'top' ? 'home' : 'away';
                const defTeam = defSide === 'away' ? game.awayTeam : game.homeTeam;
                const pitcherId = game.currentPitcherId[defSide];
                const fielders: Player[] = [
                  ...defTeam.roster.starters,
                  ...(defTeam.roster.pitcher ? [defTeam.roster.pitcher] : []),
                ];
                // 重複排除（DH制で starters と pitcher が別の場合を考慮）
                const seen = new Set<string>();
                const unique = fielders.filter((p) => {
                  if (seen.has(p.id)) return false;
                  seen.add(p.id);
                  return true;
                });
                return unique.map((p) => {
                  const isPitcher = p.id === pitcherId;
                  const ctx: 'pitching' | 'fielding' = isPitcher ? 'pitching' : 'fielding';
                  const label = isPitcher ? '投手' : p.position;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.signMissItem}
                      onPress={() => handleSignMissSelect(p, defSide, ctx)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.signMissItemLeft}>
                        <Text style={styles.signMissItemName} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text style={styles.signMissItemRole}>{label}</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  );
                });
              })()}
            </View>

            <TouchableOpacity
              style={styles.signMissCancelBtn}
              onPress={() => setShowSignMissModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.signMissCancelText}>キャンセル</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      </Portal>

      {/* ===== サインミストースト ===== */}
      <Portal>
        {signMissToast && (
          <View style={styles.draftToast} pointerEvents="none">
            <MaterialCommunityIcons name="alert-octagon-outline" size={18} color={Colors.white} />
            <Text style={styles.draftToastText}>{signMissToast}</Text>
          </View>
        )}
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
            setRunnerActions({});
            setModalVelocity(130);
            setModalVelocityEnabled(true);
          }}
          contentContainerStyle={styles.modal}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  if (!game?.currentAtBat?.pitches?.length) return;
                  undoLastPitch();
                  persist();
                  setResultModalVisible(false);
                  setPendingZone(null);
                  setPendingCoords(null);
                }}
                disabled={!game?.currentAtBat?.pitches?.length}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ opacity: game?.currentAtBat?.pitches?.length ? 1 : 0.3 }}
              >
                <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{t.live.resultTitle}</Text>
              <View style={{ width: 22 }} />
            </View>

            {/* ── 走者アクション（盗塁）セクション ── */}
            {(game.runners.first || game.runners.second || game.runners.third) && (
              <View style={styles.runnerActionSection}>
                <Text style={styles.runnerEventLabel}>走者アクション</Text>
                {(['first', 'second', 'third'] as const).map((base) => {
                  const runner = game.runners[base];
                  if (!runner) return null;
                  const action = runnerActions[base];
                  const baseLabel = base === 'first' ? '1塁' : base === 'second' ? '2塁' : '3塁';
                  return (
                    <View key={base} style={styles.runnerActionRow}>
                      {/* ランナー情報 */}
                      <View style={styles.runnerActionInfo}>
                        <View style={styles.runnerDot} />
                        <Text style={styles.runnerActionName} numberOfLines={1}>
                          {baseLabel}·{runner.name.slice(0, 4)}
                        </Text>
                      </View>
                      {/* 盗塁ボタン */}
                      <TouchableOpacity
                        style={[styles.stealActionBtn, action && styles.stealActionBtnActive]}
                        onPress={() => toggleRunnerAction(base)}
                        activeOpacity={0.75}
                      >
                        <MaterialCommunityIcons
                          name="run-fast"
                          size={12}
                          color={action ? '#fff' : Colors.primary}
                        />
                        <Text style={[styles.stealActionBtnText, action && styles.stealActionBtnTextActive]}>
                          盗塁
                        </Text>
                      </TouchableOpacity>
                      {/* 成功/失敗トグル（盗塁選択時のみ表示） */}
                      {action && (
                        <View style={styles.stealResultToggle}>
                          <TouchableOpacity
                            style={[
                              styles.stealResultBtn,
                              styles.stealResultBtnSafe,
                              action.result === 'safe' && styles.stealResultBtnSafeActive,
                            ]}
                            onPress={() => setRunnerActionResult(base, 'safe')}
                            activeOpacity={0.8}
                          >
                            <Text style={[
                              styles.stealResultBtnText,
                              action.result === 'safe' && { color: '#fff' },
                            ]}>✓ セーフ</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.stealResultBtn,
                              styles.stealResultBtnOut,
                              action.result === 'out' && styles.stealResultBtnOutActive,
                            ]}
                            onPress={() => setRunnerActionResult(base, 'out')}
                            activeOpacity={0.8}
                          >
                            <Text style={[
                              styles.stealResultBtnText,
                              action.result === 'out' && { color: '#fff' },
                            ]}>✗ アウト</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* ── 層A: メイン投球結果ボタン ── */}
            <Text style={styles.runnerEventLabel}>投球結果</Text>
            {isItemOn('bunt_stance') && (
              <TouchableOpacity
                style={[styles.buntStanceRow, buntStance && styles.buntStanceRowOn]}
                onPress={() => setBuntStance((v) => !v)}
                activeOpacity={0.8}
                accessibilityRole="switch"
                accessibilityState={{ checked: buntStance }}
              >
                <MaterialCommunityIcons
                  name={buntStance ? 'baseball-bat' : 'baseball'}
                  size={18}
                  color={buntStance ? '#FFFFFF' : Colors.textSecondary}
                />
                <Text style={[styles.buntStanceText, buntStance && styles.buntStanceTextOn]}>
                  バント構え
                </Text>
                <View style={[styles.buntStanceBadge, buntStance && styles.buntStanceBadgeOn]}>
                  <Text style={[styles.buntStanceBadgeText, buntStance && styles.buntStanceBadgeTextOn]}>
                    {buntStance ? 'あり' : 'なし'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            <View style={styles.resultGrid}>
              {pitchResultRows.map(({ result, color, label }) => (
                <TouchableOpacity
                  key={result}
                  style={[styles.resultBtn, { backgroundColor: color }]}
                  onPress={() => handleResultSelect(result)}
                >
                  <Text style={styles.resultBtnText}>{label ?? t.pitchResults[result]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── 球速スライダーセクション ── */}
            <ModalVelocitySlider
              enabled={modalVelocityEnabled}
              value={modalVelocity}
              onToggle={(v) => {
                setModalVelocityEnabled(v);
              }}
              onChange={setModalVelocity}
            />
          </ScrollView>
        </Modal>
      </Portal>

      <PlayConfirmSnack
        visible={!!playSnack}
        batterLabel={playSnack?.batter ?? ''}
        resultLabel={playSnack?.resultLabel ?? ''}
        onSaveNote={(note) => {
          if (!playSnack || !game) return;
          const log = game.atBatLogs.find((l) => l.id === playSnack.id);
          if (log && log.result) {
            editAtBatLog(log.id, log.result, log.rbiCount, note);
            persist();
          }
          setPlaySnack(null);
        }}
        onDismiss={() => setPlaySnack(null)}
      />

      {showPitcherStats && (
        <View style={[StyleSheet.absoluteFill, styles.statsOverlay]}>
          <InGameStatsPanel
            mode="pitcher"
            pitcherId={pitcher?.id}
            catcherId={catcher?.id}
            playerName={pitcher?.name ?? ''}
            visible={showPitcherStats}
            onClose={() => setShowPitcherStats(false)}
            atBatId={game.currentAtBat?.id}
            count={game.count}
            outs={game.count.outs}
            runners={{
              first:  !!game.runners.first,
              second: !!game.runners.second,
              third:  !!game.runners.third,
            }}
          />
        </View>
      )}
      {showBatterStats && (
        <View style={[StyleSheet.absoluteFill, styles.statsOverlay]}>
          <InGameStatsPanel
            mode="batter"
            batterId={batter?.id}
            playerName={batter?.name ?? ''}
            visible={showBatterStats}
            onClose={() => setShowBatterStats(false)}
            atBatId={game.currentAtBat?.id}
          />
        </View>
      )}
    </View>
  );
}

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
 * TappableDiamond — ランナーをタップして盗塁を即記録するダイヤモンド
 *
 * 各ランナーサークルの下に「盗塁」バッジを表示し、
 * タップするだけで盗塁を記録できます。
 * スクロールと競合しないよう、ランナーにヒットした時のみ
 * タッチイベントを取得します。
 */
function TappableDiamond({
  runners,
  onRunnerTap,
  stealingBases = {},
}: {
  runners: { first: { name: string } | null; second: { name: string } | null; third: { name: string } | null };
  onRunnerTap: (fromBase: 'first' | 'second' | 'third') => void;
  stealingBases?: Partial<Record<'first' | 'second' | 'third', boolean>>;
}) {
  const SIZE = 88;
  const BADGE_H = 14; // 「盗塁」バッジ分の高さ
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = 30;
  const RUNNER_R = 12;
  const HIT_R = 20;
  const BASE_HS = 8;

  const POS = {
    second: { x: cx,     y: cy - r },
    third:  { x: cx - r, y: cy     },
    first:  { x: cx + r, y: cy     },
    home:   { x: cx,     y: cy + r },
  };

  const tapRef = useRef<{ startX: number; startY: number; base: 'first' | 'second' | 'third' | null }>({
    startX: 0, startY: 0, base: null,
  });

  function hitTest(lx: number, ly: number): 'first' | 'second' | 'third' | null {
    for (const base of ['first', 'second', 'third'] as const) {
      if (!runners[base]) continue;
      const pos = POS[base];
      if (Math.abs(lx - pos.x) <= HIT_R && Math.abs(ly - pos.y) <= HIT_R) return base;
    }
    return null;
  }

  return (
    <View
      style={{ width: SIZE, height: SIZE + BADGE_H }}
      onStartShouldSetResponder={(e) => {
        const base = hitTest(e.nativeEvent.locationX, e.nativeEvent.locationY);
        if (base) {
          tapRef.current = { startX: e.nativeEvent.locationX, startY: e.nativeEvent.locationY, base };
          return true;
        }
        return false;
      }}
      onMoveShouldSetResponder={() => !!tapRef.current.base}
      onResponderTerminationRequest={() => false}
      onResponderRelease={(e) => {
        const { base, startX, startY } = tapRef.current;
        if (base) {
          const dx = e.nativeEvent.locationX - startX;
          const dy = e.nativeEvent.locationY - startY;
          // 指がほぼ動いていない = タップと判定
          if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
            onRunnerTap(base);
          }
        }
        tapRef.current = { startX: 0, startY: 0, base: null };
      }}
      onResponderTerminate={() => {
        tapRef.current = { startX: 0, startY: 0, base: null };
      }}
    >
      <Svg width={SIZE} height={SIZE + BADGE_H}>
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

        {/* ランナーサークル + 「盗塁」バッジ */}
        {(['first', 'second', 'third'] as const).map((base) => {
          const player = runners[base];
          if (!player) return null;
          const pos = POS[base];
          const badgeY = pos.y + RUNNER_R + 8;

          return (
            <React.Fragment key={base}>
              {/* タップ可能を示す点線リング */}
              <Circle
                cx={pos.x} cy={pos.y} r={RUNNER_R + 4}
                fill="none"
                stroke={Colors.accent}
                strokeWidth={1}
                strokeDasharray="3,2"
                opacity={0.6}
              />
              {/* ランナーサークル本体 */}
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
              {/* バッジ: 盗塁試み中は橙「走中」/ 通常は金「盗塁」 */}
              <Rect
                x={pos.x - 13} y={badgeY - 8}
                width={26} height={11}
                rx={3}
                fill={stealingBases[base] ? '#E65100' : Colors.accent}
              />
              <SvgText
                x={pos.x} y={badgeY}
                textAnchor="middle"
                fontSize={7}
                fontWeight="bold"
                fill={stealingBases[base] ? '#fff' : Colors.primary}
              >
                {stealingBases[base] ? '走中!' : '盗塁'}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

/**
 * BatterSilhouetteSVG — 打者シルエット画像
 * サイズ: BATTER_W × CANVAS_H = 68 × 284
 */
function BatterSilhouetteSVG({ side }: { side: 'L' | 'R' }) {
  const source = side === 'R'
    ? require('../../../assets/batter_right.png')
    : require('../../../assets/batter_left.png');
  return (
    <Image
      source={source}
      style={{ width: BATTER_W, height: CANVAS_H }}
      resizeMode="contain"
    />
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

  // デルタドラッグ: タッチ開始時の位置と値を記録し、移動量だけ値を変化させる
  const dragRef = useRef<{ startPageX: number; startValue: number } | null>(null);

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
          // タッチ開始位置と現在値を記録 (値はジャンプしない)
          dragRef.current = {
            startPageX: e.nativeEvent.pageX,
            startValue: value,
          };
        }}
        onResponderMove={(e) => {
          if (!dragRef.current) return;
          const deltaX = e.nativeEvent.pageX - dragRef.current.startPageX;
          const deltaV = (deltaX / METER_TRACK_W) * (VEL_MAX - VEL_MIN);
          const next = Math.round(
            Math.max(VEL_MIN, Math.min(VEL_MAX, dragRef.current.startValue + deltaV))
          );
          onChange(next);
        }}
        onResponderRelease={() => {
          setScrollLocked(false);
          dragRef.current = null;
        }}
        onResponderTerminate={() => {
          setScrollLocked(false);
          dragRef.current = null;
        }}
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
// ModalVelocitySlider — 投球結果モーダル内の球速入力
// ============================================================

const MODAL_VEL_MIN = 50;
const MODAL_VEL_MAX = 160;
const MODAL_TRACK_W = Dimensions.get('window').width - 80;

function ModalVelocitySlider({
  enabled,
  value,
  onToggle,
  onChange,
}: {
  enabled: boolean;
  value: number;
  onToggle: (v: boolean) => void;
  onChange: (v: number) => void;
}) {
  const fillRatio = (value - MODAL_VEL_MIN) / (MODAL_VEL_MAX - MODAL_VEL_MIN);
  const startRef = useRef<{ pageX: number; value: number } | null>(null);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderGrant: (e) => {
        startRef.current = { pageX: e.nativeEvent.pageX, value };
      },
      onPanResponderMove: (e) => {
        if (!startRef.current) return;
        const deltaX = e.nativeEvent.pageX - startRef.current.pageX;
        const deltaV = (deltaX / MODAL_TRACK_W) * (MODAL_VEL_MAX - MODAL_VEL_MIN);
        onChange(Math.round(Math.max(MODAL_VEL_MIN, Math.min(MODAL_VEL_MAX,
          startRef.current.value + deltaV))));
      },
      onPanResponderRelease: () => { startRef.current = null; },
      onPanResponderTerminate: () => { startRef.current = null; },
    })
  ).current;

  return (
    <View style={modalVelStyles.section}>
      {/* ON/OFFトグル行 */}
      <TouchableOpacity
        style={[modalVelStyles.toggleRow, enabled && modalVelStyles.toggleRowOn]}
        onPress={() => onToggle(!enabled)}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons
          name="speedometer"
          size={16}
          color={enabled ? '#fff' : Colors.textSecondary}
        />
        <Text style={[modalVelStyles.toggleLabel, enabled && modalVelStyles.toggleLabelOn]}>
          球速を入力
        </Text>
        {enabled && (
          <Text style={modalVelStyles.toggleValue}>{value} km/h</Text>
        )}
        <View style={[modalVelStyles.badge, enabled && modalVelStyles.badgeOn]}>
          <Text style={[modalVelStyles.badgeText, enabled && modalVelStyles.badgeTextOn]}>
            {enabled ? 'あり' : 'なし'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* スライダー（ONの場合のみ表示） */}
      {enabled && (
        <View style={modalVelStyles.sliderWrap}>
          <View
            style={modalVelStyles.track}
            {...panResponder.panHandlers}
          >
            <View style={modalVelStyles.trackBg} />
            <View style={[modalVelStyles.trackFill, { width: `${fillRatio * 100}%` as any }]} />
            <View style={[modalVelStyles.thumb, { left: fillRatio * (MODAL_TRACK_W - 20) }]} />
          </View>
          <View style={modalVelStyles.rangeRow}>
            <Text style={modalVelStyles.rangeLabel}>{MODAL_VEL_MIN}</Text>
            <Text style={modalVelStyles.rangeLabel}>{MODAL_VEL_MAX}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const modalVelStyles = StyleSheet.create({
  section: {
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  toggleRowOn: {
    backgroundColor: '#1565C0',
    borderColor: '#0D47A1',
  },
  toggleLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  toggleLabelOn: { color: '#fff' },
  toggleValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#fff',
    marginRight: 4,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  badgeOn: { backgroundColor: '#fff' },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  badgeTextOn: { color: '#1565C0' },
  sliderWrap: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  track: {
    height: 28,
    width: MODAL_TRACK_W,
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
    backgroundColor: '#1565C0',
    top: 10,
  },
  thumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 2.5,
    borderColor: '#1565C0',
    top: 4,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: MODAL_TRACK_W,
    marginTop: 2,
  },
  rangeLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
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
  editRosterIcon: {
    position: 'absolute',
    right: Spacing.md,
    bottom: Spacing.sm,
    padding: 4,
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
  detailBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  detailBtnText: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: '600',
  },

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
  signMissBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#E64A19',
  },
  signMissBtnText: {
    fontSize: Typography.tiny,
    color: '#fff',
    fontWeight: '700',
  },
  signMissHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 4,
  },
  signMissSub: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  signMissSection: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    marginBottom: 6,
    paddingHorizontal: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  signMissList: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  signMissItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  signMissItemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  signMissItemName: {
    flex: 1,
    fontSize: Typography.body,
    fontWeight: '600',
    color: Colors.text,
  },
  signMissItemRole: {
    fontSize: Typography.tiny,
    fontWeight: '700',
    color: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
    overflow: 'hidden',
  },
  signMissCancelBtn: {
    marginTop: Spacing.md,
    alignItems: 'center',
    paddingVertical: 10,
  },
  signMissCancelText: {
    color: Colors.textSecondary,
    fontWeight: '600',
  },
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

  revertButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,152,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,152,0,0.4)',
    marginTop: 4,
  },
  revertButtonText: {
    fontSize: 12,
    color: '#FF9800',
    fontWeight: '600',
  },

  advancementOverlay: {
    backgroundColor: 'rgba(13, 13, 26, 0.85)',
  },

  statsOverlay: {
    backgroundColor: Colors.card,
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
  buntStanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  buntStanceRowOn: {
    backgroundColor: '#2E7D32',
    borderColor: '#1B5E20',
  },
  buntStanceText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  buntStanceTextOn: {
    color: '#FFFFFF',
  },
  buntStanceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  buntStanceBadgeOn: {
    backgroundColor: '#FFFFFF',
  },
  buntStanceBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  buntStanceBadgeTextOn: {
    color: '#1B5E20',
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

  // ── 走者アクション セクション ──────────────────────────────
  runnerActionSection: {
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: 6,
  },
  runnerEventLabel: {
    fontSize: Typography.tiny,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  runnerActionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  runnerActionInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    flex: 1,
    minWidth: 70,
  },
  runnerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  runnerActionName: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.text,
    flexShrink: 1,
  },
  stealActionBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: 'transparent',
  },
  stealActionBtnActive: {
    backgroundColor: Colors.primary,
  },
  stealActionBtnText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  stealActionBtnTextActive: {
    color: '#fff',
  },
  stealResultToggle: {
    flexDirection: 'row' as const,
    gap: 4,
  },
  stealResultBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
  },
  stealResultBtnSafe: {
    borderColor: '#2E7D32',
  },
  stealResultBtnSafeActive: {
    backgroundColor: '#2E7D32',
  },
  stealResultBtnOut: {
    borderColor: '#C41E3A',
  },
  stealResultBtnOutActive: {
    backgroundColor: '#C41E3A',
  },
  stealResultBtnText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },

  // ── ダイヤモンドタップ盗塁 結果モーダル ─────────────────────────────
  stealModalHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginBottom: 2,
  },
  stealModalSub: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    marginLeft: 2,
  },
  stealResultRow: {
    flexDirection: 'row' as const,
    gap: 10,
    marginBottom: Spacing.md,
  },
  stealResultLargeBtn: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    paddingVertical: 16,
    alignItems: 'center' as const,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  stealResultLargeBtnText: {
    fontSize: Typography.h4,
    fontWeight: '800' as const,
    color: '#fff',
  },
  stealResultLargeBtnSub: {
    fontSize: Typography.tiny,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600' as const,
  },
  stealCancelBtn: {
    alignItems: 'center' as const,
    paddingVertical: Spacing.sm,
  },
  stealCancelBtnText: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  stealAttemptHint: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: 'rgba(46,125,50,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(46,125,50,0.3)',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    marginBottom: Spacing.md,
  },
  stealAttemptHintText: {
    flex: 1,
    fontSize: Typography.caption,
    color: '#2E7D32',
    fontWeight: '600' as const,
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
  velocityToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceGray,
    marginTop: Spacing.xs,
  },
  velocityToggleLabel: {
    flex: 1,
    fontSize: Typography.bodySmall,
    color: Colors.text,
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
