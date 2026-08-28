/**
 * PositionalSubstitutionModal.tsx
 *
 * ポジション変更・交代モーダル（Step 1: シェル + プレースホルダーTile）
 * PlayerTile / BenchTile の実際のドラッグ実装は PositionalSubstitutionTiles.tsx (Step 2) に移譲する。
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Modal,
  View,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Alert,
  LayoutChangeEvent,
  Dimensions,
} from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import type { GameState, Position } from '../../types/game';

// ─── フィールド図定数 ─────────────────────────────────────────────────────────

export const CANVAS_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
export const CANVAS_H = SCREEN_H * 0.70;
export const TILE_SIZE = 48;
export const SNAP_DIST = 70;
const BENCH_THRESHOLD = SCREEN_H * 0.75;

/** 守備位置ラベル */
export const FIELD_POSITIONS: Position[] = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];

const W = CANVAS_W;
const H = CANVAS_H;

/** 実描画幅・高さを受け取り座標マップを返す */
export const getPosCoords = (w: number, h: number): Record<string, { x: number; y: number }> => ({
  CF:  { x: w * 0.50, y: h * 0.32 },
  LF:  { x: w * 0.12, y: h * 0.48 },
  RF:  { x: w * 0.88, y: h * 0.48 },
  SS:  { x: w * 0.35, y: h * 0.57 },
  '2B':{ x: w * 0.65, y: h * 0.57 },
  '3B':{ x: w * 0.18, y: h * 0.70 },
  P:   { x: w * 0.50, y: h * 0.65 },
  '1B':{ x: w * 0.82, y: h * 0.70 },
  C:   { x: w * 0.50, y: h * 0.82 },
  DH:  { x: w * 0.05, y: h * 0.82 },
});

/** フィールド図上の各ポジション中心座標 (left, top)・後方互換デフォルト値 */
export const POS_COORDS: Record<string, { x: number; y: number }> = getPosCoords(W, H);

// ─── ローカル選手型 ────────────────────────────────────────────────────────────

export type LocalPlayer = {
  playerId: string;
  name: string;
  position: Position;
  isDisplaced: boolean;    // ポジション未割り当て（交代で押し出された）
  fromBench: boolean;      // ベンチから昇格した選手
  originalPosition: Position;
  battingOrder: number | null; // 打順（1-indexed）、DH投手・ベンチは null
};

// ─── 変更エントリ型 ────────────────────────────────────────────────────────────

type ChangeEntry = {
  playerName: string;
  number: number | null;
  fromPosition: string;
  toPosition: string;
  toNumber: number | null;
  toName: string;
};

// ─── Tile Props ───────────────────────────────────────────────────────────────

export interface PlayerTileProps {
  player: LocalPlayer;
  fieldOffsetY: number;
  starters: LocalPlayer[];
  onSwap: (playerAId: string, playerBId: string) => void;
  onMoveTo: (playerId: string, newPosition: Position) => void;
  onMoveToBench: (playerId: string) => void;
  posCoords?: Record<string, { x: number; y: number }>;
  hasDisplaced: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}

export interface BenchTileProps {
  player: LocalPlayer;
  fieldOffsetY: number;
  starters: LocalPlayer[];
  onSubstitute: (benchPlayerId: string, targetPosition: Position) => void;
  posCoords?: Record<string, { x: number; y: number }>;
  hasDisplaced: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}

// ─── PlayerTile ───────────────────────────────────────────────────────────────

function PlayerTile({
  player,
  fieldOffsetY,
  starters,
  onSwap,
  onMoveTo,
  onMoveToBench,
  posCoords = POS_COORDS,
  hasDisplaced,
  onDragStart,
  onDragEnd,
}: PlayerTileProps) {
  const coords = posCoords[player.position];

  // 同ポジションに複数選手がいる場合の横オフセット
  const posIndex = starters
    .slice(0, starters.findIndex((s) => s.playerId === player.playerId))
    .filter((s) => s.position === player.position).length;

  const baseLeft = coords ? coords.x - TILE_SIZE / 2 + posIndex * TILE_SIZE * 0.6 : 0;
  const baseTop  = coords ? coords.y - TILE_SIZE / 2 : 0;

  const translateX    = useSharedValue(0);
  const translateY    = useSharedValue(0);
  const isDragging    = useSharedValue(false);
  const blinkProgress = useSharedValue(0);

  // isDisplaced 時: borderWidth を点滅（2px→4px）
  useEffect(() => {
    if (player.isDisplaced) {
      blinkProgress.value = withRepeat(withTiming(1, { duration: 400 }), -1, true);
    } else {
      cancelAnimation(blinkProgress);
      blinkProgress.value = 0;
    }
  }, [player.isDisplaced, blinkProgress]);

  // ドロップ時のスナップ処理（JS スレッド）
  const handleDragEnd = useCallback(
    (transX: number, transY: number, absY: number, absX: number) => {
      if (absY >= BENCH_THRESHOLD) {
        onMoveToBench(player.playerId);
        return;
      }
      if (absX < 0 || absX > CANVAS_W) return;

      const finalX = (coords?.x ?? 0) + transX;
      const finalY = (coords?.y ?? 0) + transY;

      let nearestPos: string | null = null;
      let nearestDist = SNAP_DIST;
      for (const [pos, coord] of Object.entries(posCoords)) {
        if (pos === player.position) continue;
        const dist = Math.sqrt((finalX - coord.x) ** 2 + (finalY - coord.y) ** 2);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestPos = pos;
        }
      }
      if (!nearestPos) return;

      onMoveTo(player.playerId, nearestPos as Position);
    },
    [coords, posCoords, player.position, player.playerId, onMoveTo, onMoveToBench],
  );

  const panGesture = Gesture.Pan()
    .enabled(!hasDisplaced || player.isDisplaced)
    .onStart(() => { isDragging.value = true; runOnJS(onDragStart)(); })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      isDragging.value = false;
      runOnJS(onDragEnd)();
      runOnJS(handleDragEnd)(e.translationX, e.translationY, e.absoluteY, e.absoluteX);
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  // isDisplaced の場合: zIndex を 10 に上げ、borderWidth を点滅させる（opacity は常に 1）
  const isDisplaced = player.isDisplaced;
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
    zIndex:      isDragging.value ? 999 : (isDisplaced ? 10 : 1),
    borderWidth: 2 + blinkProgress.value * 2,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.tile,
          player.isDisplaced && styles.tileDisplaced,
          { left: baseLeft, top: baseTop },
          animatedStyle,
        ]}
      >
        <Text style={styles.tilePos}>{player.position || '?'}</Text>
        <Text style={styles.tileName} numberOfLines={1}>{player.name}</Text>
      </Animated.View>
    </GestureDetector>
  );
}

// ─── BenchTile ────────────────────────────────────────────────────────────────

function BenchTile({
  player,
  fieldOffsetY,
  onSubstitute,
  posCoords = POS_COORDS,
  hasDisplaced,
  onDragStart,
  onDragEnd,
}: BenchTileProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const handleDragEnd = useCallback(
    (absX: number, absY: number) => {
      if (absY >= BENCH_THRESHOLD) return;
      if (absX < 0 || absX > CANVAS_W) return;

      const fieldRelX = absX;
      const fieldRelY = absY - fieldOffsetY;

      let nearestPos: string | null = null;
      let nearestDist = SNAP_DIST;
      for (const [pos, coord] of Object.entries(posCoords)) {
        const dist = Math.sqrt((fieldRelX - coord.x) ** 2 + (fieldRelY - coord.y) ** 2);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestPos = pos;
        }
      }
      if (!nearestPos) return;

      onSubstitute(player.playerId, nearestPos as Position);
    },
    [player.playerId, fieldOffsetY, posCoords, onSubstitute],
  );

  const panGesture = Gesture.Pan()
    .enabled(!hasDisplaced)
    .onStart(() => { isDragging.value = true; runOnJS(onDragStart)(); })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      isDragging.value = false;
      runOnJS(onDragEnd)();
      runOnJS(handleDragEnd)(e.absoluteX, e.absoluteY);
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
    zIndex: isDragging.value ? 999 : 1,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.benchTile, player.fromBench && styles.benchTileNew, animatedStyle]}>
        <Text style={styles.tilePos}>{player.position || 'SUB'}</Text>
        <Text style={styles.tileName} numberOfLines={1}>{player.name}</Text>
      </Animated.View>
    </GestureDetector>
  );
}

// ─── 新規選手登録フォーム ──────────────────────────────────────────────────────

interface NewPlayerData {
  name: string;
  number: number | null;
  bats: 'L' | 'R' | 'S';
  throws: 'L' | 'R';
  position?: string;
}

interface RegisterFormProps {
  onConfirm: (data: NewPlayerData) => void;
  onCancel: () => void;
}

function RegisterForm({ onConfirm, onCancel }: RegisterFormProps) {
  const [name, setName]     = useState('');
  const [number, setNumber] = useState('');
  const [bats, setBats]     = useState<'L' | 'R' | 'S'>('R');
  const [throws, setThrows] = useState<'L' | 'R'>('R');

  const canConfirm = name.trim().length > 0;

  return (
    <View style={styles.registerForm}>
      <Text style={styles.registerTitle}>新規選手登録</Text>
      <TextInput
        style={styles.input}
        placeholder="氏名"
        placeholderTextColor={Colors.textSecondary}
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="背番号（任意）"
        placeholderTextColor={Colors.textSecondary}
        keyboardType="number-pad"
        value={number}
        onChangeText={setNumber}
      />
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>打席</Text>
        {(['R', 'L', 'S'] as const).map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.toggleBtn, bats === v && styles.toggleBtnActive]}
            onPress={() => setBats(v)}
          >
            <Text style={[styles.toggleBtnText, bats === v && styles.toggleBtnTextActive]}>{v}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>投げ</Text>
        {(['R', 'L'] as const).map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.toggleBtn, throws === v && styles.toggleBtnActive]}
            onPress={() => setThrows(v)}
          >
            <Text style={[styles.toggleBtnText, throws === v && styles.toggleBtnTextActive]}>{v}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.registerActions}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>キャンセル</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
          onPress={() => {
            if (!canConfirm) return;
            onConfirm({
              name: name.trim(),
              number: number ? parseInt(number, 10) : null,
              bats,
              throws,
            });
          }}
          disabled={!canConfirm}
        >
          <Text style={styles.confirmBtnText}>追加</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── PositionLabel helper ──────────────────────────────────────────────────────

const POSITION_LABELS: Record<string, string> = {
  P: '投', C: '捕', '1B': '一', '2B': '二', '3B': '三',
  SS: '遊', LF: '左', CF: '中', RF: '右', DH: 'DH',
};

/** 確認画面用フルネーム */
const POSITION_FULL_LABELS: Record<string, string> = {
  P:  'ピッチャー',  C:  'キャッチャー',
  '1B': 'ファースト', '2B': 'セカンド',
  '3B': 'サード',   SS: 'ショート',
  LF: 'レフト',    CF: 'センター',   RF: 'ライト',  DH: 'DH',
};

// ─── メインモーダル Props ──────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  side: 'away' | 'home';
  game: GameState;
  onClose: () => void;
  onCommit: (
    side: 'away' | 'home',
    starterPositions: { playerId: string; newPosition: Position }[],
    substitutions: { playerOutId: string; playerInId: string; targetPosition: Position }[],
  ) => void;
  onAddBench: (side: 'away' | 'home', newPlayerData: NewPlayerData) => void;
  onStartUnassignedPitcherStint: (
    side: 'away' | 'home',
  ) => Promise<'started' | 'blocked' | 'save_failed' | 'unknown_local_state'>;
}

// ─── PositionalSubstitutionModal ──────────────────────────────────────────────

export default function PositionalSubstitutionModal({
  visible,
  side,
  game,
  onClose,
  onCommit,
  onAddBench,
  onStartUnassignedPitcherStint,
}: Props) {
  const [localStarters, setLocalStarters] = useState<LocalPlayer[]>([]);
  const [localBench,    setLocalBench]    = useState<LocalPlayer[]>([]);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [fieldOffsetY, setFieldOffsetY] = useState(0);
  const [fieldWidth, setFieldWidth] = useState(W);

  // アンドゥ用履歴スタック
  const [history, setHistory] = useState<{ starters: LocalPlayer[]; bench: LocalPlayer[]; movedToBench: string[] }[]>([]);

  // ドラッグ中フラグ（ベンチエリアのガイド表示用）
  const [isDraggingAny, setIsDraggingAny] = useState(false);
  const handleTileDragStart = useCallback(() => setIsDraggingAny(true), []);
  const handleTileDragEnd   = useCallback(() => setIsDraggingAny(false), []);

  // 確認画面
  const [initialStarters, setInitialStarters] = useState<LocalPlayer[]>([]);
  const [showConfirm,     setShowConfirm]     = useState(false);

  // 最新値を保持するref（ドラッグコールバックのクロージャ古さ対策）
  const [movedToBench, setMovedToBench] = useState<string[]>([]);
  const localStartersRef  = useRef<LocalPlayer[]>([]);
  const localBenchRef     = useRef<LocalPlayer[]>([]);
  const movedToBenchRef   = useRef<string[]>([]);
  useEffect(() => { localStartersRef.current = localStarters; }, [localStarters]);
  useEffect(() => { localBenchRef.current    = localBench;    }, [localBench]);
  useEffect(() => { movedToBenchRef.current  = movedToBench;  }, [movedToBench]);

  const posCoords = getPosCoords(fieldWidth, CANVAS_H);

  const fieldRef = useRef<View>(null);

  const team = side === 'away' ? game.awayTeam : game.homeTeam;

  // ── 初期化（モーダルオープン時） ──────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    const starters: LocalPlayer[] = team.roster.starters.map((p, idx) => ({
      playerId:        p.id,
      name:            p.name,
      position:        p.position,
      isDisplaced:     false,
      fromBench:       false,
      originalPosition: p.position,
      battingOrder:    idx + 1,
    }));
    // DH制：打順外投手
    if (team.roster.pitcher) {
      starters.push({
        playerId:        team.roster.pitcher.id,
        name:            team.roster.pitcher.name,
        position:        team.roster.pitcher.position,
        isDisplaced:     false,
        fromBench:       false,
        originalPosition: team.roster.pitcher.position,
        battingOrder:    null,
      });
    }
    const bench: LocalPlayer[] = team.roster.bench.map((p) => ({
      playerId:        p.id,
      name:            p.name,
      position:        p.position,
      isDisplaced:     false,
      fromBench:       false,
      originalPosition: p.position,
      battingOrder:    null,
    }));
    setLocalStarters(starters);
    setLocalBench(bench);
    setShowRegisterForm(false);
    setHistory([]);
    setMovedToBench([]);
    setInitialStarters(starters.map((p) => ({ ...p })));
    setShowConfirm(false);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ベンチ同期（store に新規選手が追加された場合） ─────────────────────────
  useEffect(() => {
    if (!visible) return;
    const storeBench = team.roster.bench;
    setLocalBench((prev) => {
      const prevIds = new Set(prev.map((p) => p.playerId));
      const newEntries: LocalPlayer[] = storeBench
        .filter((p) => !prevIds.has(p.id))
        .map((p) => ({
          playerId:        p.id,
          name:            p.name,
          position:        p.position,
          isDisplaced:     false,
          fromBench:       false,
          originalPosition: p.position,
          battingOrder:    null,
        }));
      return newEntries.length > 0 ? [...prev, ...newEntries] : prev;
    });
  }, [game.awayTeam, game.homeTeam, visible, side]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── フィールドオフセット計測 ──────────────────────────────────────────────
  const handleFieldLayout = useCallback((_e: LayoutChangeEvent) => {
    fieldRef.current?.measure((_x, _y, _w, _h, _px, py) => {
      setFieldOffsetY(py);
    });
  }, []);

  // ── ポジション入れ替え ────────────────────────────────────────────────────
  const handleSwap = useCallback((playerAId: string, playerBId: string) => {
    setLocalStarters((prev) => {
      const next = prev.map((p) => ({ ...p }));
      const a = next.find((p) => p.playerId === playerAId);
      const b = next.find((p) => p.playerId === playerBId);
      if (!a || !b) return prev;
      const tmp = a.position;
      a.position = b.position;
      b.position = tmp;
      return next;
    });
  }, []);

  // ── ポジション直接移動 ────────────────────────────────────────────────────
  const handleMoveTo = useCallback((playerId: string, newPosition: Position) => {
    setHistory((prev) => [
      ...prev,
      {
        starters:     localStartersRef.current.map((p) => ({ ...p })),
        bench:        localBenchRef.current.map((p) => ({ ...p })),
        movedToBench: [...movedToBenchRef.current],
      },
    ]);

    setLocalStarters((prev) => {
      const next = prev.map((p) => ({ ...p }));
      const target = next.find((p) => p.playerId === playerId);
      if (!target) return prev;
      if (next.filter((p) => p.playerId !== playerId && p.position === newPosition).length >= 2) return prev;
      const occupant = next.find((p) => p.playerId !== playerId && p.position === newPosition);
      if (occupant) {
        occupant.isDisplaced = true;
      }
      target.position = newPosition;
      target.isDisplaced = false;
      return next;
    });
  }, []);

  // ── ベンチ選手を起用（スターターへ昇格） ──────────────────────────────────
  const handleSubstitute = useCallback((benchPlayerId: string, targetPosition: Position) => {
    if (localStartersRef.current.filter((p) => p.position === targetPosition).length >= 2) return;

    setHistory((prev) => [
      ...prev,
      {
        starters:     localStartersRef.current.map((p) => ({ ...p })),
        bench:        localBenchRef.current.map((p) => ({ ...p })),
        movedToBench: [...movedToBenchRef.current],
      },
    ]);

    setLocalBench((prevBench) => {
      const benchPlayer = prevBench.find((p) => p.playerId === benchPlayerId);
      if (!benchPlayer) return prevBench;

      setLocalStarters((prevStarters) => {
        const nextStarters = prevStarters.map((p) => ({ ...p }));
        const displaced = nextStarters.find((p) => p.position === targetPosition);
        if (displaced) {
          displaced.isDisplaced = true;
        }
        // 交代選手は displaced の打順を引き継ぐ
        nextStarters.push({
          ...benchPlayer,
          position:     targetPosition,
          fromBench:    true,
          isDisplaced:  false,
          battingOrder: displaced?.battingOrder ?? null,
        });
        return nextStarters;
      });

      return prevBench.filter((p) => p.playerId !== benchPlayerId);
    });
  }, []);

  // ── スターターをベンチへ移動 ──────────────────────────────────────────────
  const handleMoveToBench = useCallback((playerId: string) => {
    setHistory(prev => [...prev, {
      starters:     localStartersRef.current.map(p => ({ ...p })),
      bench:        localBenchRef.current.map(p => ({ ...p })),
      movedToBench: [...movedToBenchRef.current],
    }]);
    const player = localStartersRef.current.find(p => p.playerId === playerId);
    if (!player) return;
    setLocalStarters(prev => prev.filter(p => p.playerId !== playerId));
    setLocalBench(prev => [...prev, { ...player, fromBench: true }]);
    setMovedToBench(prev => [...prev, playerId]);
  }, []);

  // ── アンドゥ ─────────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setLocalStarters(last.starters);
    setLocalBench(last.bench);
    setMovedToBench(last.movedToBench);
    setHistory((prev) => prev.slice(0, -1));
  }, [history]);

  // ── コミット可能判定 ──────────────────────────────────────────────────────
  const hasDisplaced  = localStarters.some((p) => p.isDisplaced);
  const positions     = localStarters.filter((p) => !p.isDisplaced).map((p) => p.position).filter(Boolean);
  const hasDuplicate  = positions.length !== new Set(positions).size;
  const canCommit     = !hasDisplaced && !hasDuplicate;

  // ── 変更エントリ計算（確認画面用） ────────────────────────────────────────
  const changeEntries = useMemo((): ChangeEntry[] => {
    const entries: ChangeEntry[] = [];

    // fromBench 選手と退場選手の対応マップを構築
    const fromBenchPlayers = localStarters.filter(p => p.fromBench);
    const benchInToOrder = new Map<string, number | null>();
    const usedMovedToBenchCE = new Set<string>();

    // Pass 1: 直接交代（そのポジションに元々いた選手が movedToBench にいる）
    for (const benchIn of fromBenchPlayers) {
      const originalOccupant = initialStarters.find(s => s.position === benchIn.position);
      if (originalOccupant && movedToBench.includes(originalOccupant.playerId)) {
        benchInToOrder.set(benchIn.playerId, originalOccupant.battingOrder ?? null);
        usedMovedToBenchCE.add(originalOccupant.playerId);
      }
    }
    // Pass 2: 間接交代（残った movedToBench 選手の打順を割り当て）
    for (const benchIn of fromBenchPlayers) {
      if (benchInToOrder.has(benchIn.playerId)) continue;
      const remainingMoved = movedToBench.find(id => !usedMovedToBenchCE.has(id));
      if (remainingMoved) {
        const movedPlayer = initialStarters.find(s => s.playerId === remainingMoved);
        benchInToOrder.set(benchIn.playerId, movedPlayer?.battingOrder ?? null);
        usedMovedToBenchCE.add(remainingMoved);
      } else {
        benchInToOrder.set(benchIn.playerId, null);
      }
    }

    // 初期スターターでポジションが変わった / いなくなった選手
    for (const init of initialStarters) {
      const curr = localStarters.find((p) => p.playerId === init.playerId);
      if (!curr) {
        entries.push({
          playerName:   init.name,
          number:       init.battingOrder,
          fromPosition: POSITION_FULL_LABELS[init.position] ?? init.position,
          toPosition:   '控え',
          toNumber:     null,
          toName:       init.name,
        });
      } else if (curr.position !== init.position) {
        entries.push({
          playerName:   init.name,
          number:       init.battingOrder,
          fromPosition: POSITION_FULL_LABELS[init.position] ?? init.position,
          toPosition:   POSITION_FULL_LABELS[curr.position] ?? curr.position,
          toNumber:     curr.battingOrder,
          toName:       curr.name,
        });
      }
    }
    // ベンチから起用された選手
    for (const curr of localStarters) {
      if (curr.fromBench) {
        entries.push({
          playerName:   curr.name,
          number:       null,
          fromPosition: '控え',
          toPosition:   POSITION_FULL_LABELS[curr.position] ?? curr.position,
          toNumber:     benchInToOrder.get(curr.playerId) ?? null,
          toName:       curr.name,
        });
      }
    }
    return entries;
  }, [initialStarters, localStarters, movedToBench]);

  // ── コミット処理 ──────────────────────────────────────────────────────────
  const handleCommit = useCallback(() => {
    if (!canCommit) return;

    const starterPositions = localStarters
      .filter((p) => !p.fromBench && p.position !== p.originalPosition)
      .map((p) => ({ playerId: p.playerId, newPosition: p.position }));

    const substitutions: { playerOutId: string; playerInId: string; targetPosition: Position }[] = [];
    const fromBenchPlayers = localStarters.filter((p) => p.fromBench);
    const usedMovedToBench = new Set<string>();

    // Pass 1: 直接交代（そのポジションに元々いた選手が movedToBench にいる）
    for (const benchIn of fromBenchPlayers) {
      const originalOccupant = initialStarters.find((s) => s.position === benchIn.position);
      if (originalOccupant && movedToBench.includes(originalOccupant.playerId)) {
        substitutions.push({ playerOutId: originalOccupant.playerId, playerInId: benchIn.playerId, targetPosition: benchIn.position });
        usedMovedToBench.add(originalOccupant.playerId);
      }
    }
    // Pass 2: 間接交代（残った movedToBench 選手を割り当て）
    for (const benchIn of fromBenchPlayers) {
      if (substitutions.some((s) => s.playerInId === benchIn.playerId)) continue;
      const remainingMoved = movedToBench.find((id) => !usedMovedToBench.has(id));
      if (remainingMoved) {
        substitutions.push({ playerOutId: remainingMoved, playerInId: benchIn.playerId, targetPosition: benchIn.position });
        usedMovedToBench.add(remainingMoved);
      }
    }

    onCommit(side, starterPositions, substitutions);
    onClose();
  }, [canCommit, localStarters, movedToBench, initialStarters, onCommit, onClose, side]);

  // ── 新規選手追加 ──────────────────────────────────────────────────────────
  const handleRegisterConfirm = useCallback(
    (data: NewPlayerData) => {
      onAddBench(side, data);
      setShowRegisterForm(false);
    },
    [onAddBench, side],
  );

  // ── チームバッジ ──────────────────────────────────────────────────────────
  const teamName = team.name || (side === 'away' ? '後攻' : '先攻');

  const confirmUnassignedPitcherChange = useCallback(() => {
    Alert.alert(
      '投手未登録のまま交代しますか？',
      '新しい投球区間として記録します。打順や選手交代履歴は変更されず、実投手は後から明示的に割り当てられます。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '交代する',
          onPress: async () => {
            const result = await onStartUnassignedPitcherStint(side);
            if (result === 'started') {
              onClose();
              return;
            }
            Alert.alert(
              '交代を保存できませんでした',
              result === 'unknown_local_state'
                ? '端末の保存状態を確認できません。試合を再読み込みするまで追加の記録は保存されません。'
                : '現在の投手は変更されていません。もう一度お試しください。',
            );
          },
        },
      ],
    );
  }, [onClose, onStartUnassignedPitcherStint, side]);

  // ── 確認画面 ─────────────────────────────────────────────────────────────
  if (showConfirm) {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowConfirm(false)}
      >
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowConfirm(false)}>
              <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.confirmScreenTitle}>変更内容の確認</Text>
            <TouchableOpacity style={styles.commitBtn} onPress={handleCommit}>
              <Text style={styles.commitBtnText}>確定する</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <View style={styles.confirmSection}>
              <Text style={styles.confirmSectionTitle}>変更内容</Text>
              {changeEntries.length === 0 ? (
                <Text style={styles.emptyBench}>変更なし</Text>
              ) : (
                changeEntries.map((entry, idx) => (
                  <View key={idx} style={styles.changeRow}>
                    {/* 変更前 */}
                    <View style={styles.changeLeft}>
                      {entry.number != null && (
                        <Text style={styles.changeOrderText}>{entry.number}番</Text>
                      )}
                      <Text style={styles.changePosText}>{entry.fromPosition}</Text>
                      <Text style={styles.changeNameText} numberOfLines={1}>{entry.playerName}</Text>
                    </View>
                    <Text style={styles.changeArrow}>→</Text>
                    {/* 変更後 */}
                    <View style={styles.changeRight}>
                      {entry.toNumber != null && (
                        <Text style={styles.changeOrderText}>{entry.toNumber}番</Text>
                      )}
                      <Text style={styles.changePosText}>{entry.toPosition}</Text>
                      <Text style={styles.changeNameText} numberOfLines={1}>{entry.toName}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }

  // ── 通常画面 ─────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* ── ヘッダー ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <MaterialCommunityIcons name="close" size={22} color={Colors.text} />
          </TouchableOpacity>

          <View style={styles.teamBadge}>
            <Text style={styles.teamBadgeText}>{teamName}</Text>
          </View>

          <TouchableOpacity
            style={[styles.undoBtn, history.length === 0 && styles.undoBtnDisabled]}
            onPress={handleUndo}
            disabled={history.length === 0}
          >
            <MaterialCommunityIcons
              name="arrow-u-left-top"
              size={14}
              color={history.length > 0 ? Colors.text : Colors.textDisabled}
            />
            <Text style={[styles.undoBtnText, history.length === 0 && styles.undoBtnTextDisabled]}>
              戻す
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.commitBtn, !canCommit && styles.commitBtnDisabled]}
            onPress={() => { if (canCommit) setShowConfirm(true); }}
            disabled={!canCommit}
          >
            <Text style={[styles.commitBtnText, !canCommit && styles.commitBtnTextDisabled]}>
              確定
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.unassignedPitcherBtn}
          onPress={confirmUnassignedPitcherChange}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="baseball" size={18} color={Colors.primary} />
          <View style={styles.unassignedPitcherTextWrap}>
            <Text style={styles.unassignedPitcherTitle}>投手を登録せず交代</Text>
            <Text style={styles.unassignedPitcherHint}>投球区間を分け、実投手は後から割り当てます</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>

        {/* ── コンテンツ ── */}
        {showRegisterForm ? (
          <RegisterForm
            onConfirm={handleRegisterConfirm}
            onCancel={() => setShowRegisterForm(false)}
          />
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* フィールドコンテナ */}
            <View
              ref={fieldRef}
              style={styles.fieldContainer}
              onLayout={(e) => {
                setFieldWidth(e.nativeEvent.layout.width);
                handleFieldLayout(e);
              }}
            >
              {/* 背景レイヤー（overflow:hidden で角丸クリップ） */}
              <View style={styles.fieldBg}>
                <Image
                  source={require('../../../assets/baseball_field.png')}
                  style={styles.fieldImage}
                  resizeMode="cover"
                />
              </View>

              {/* タイルレイヤー（絶対配置・overflowなし） */}
              <View style={styles.tilesLayer} pointerEvents="box-none">
                {localStarters.map((player) => (
                  <PlayerTile
                    key={player.playerId}
                    player={player}
                    fieldOffsetY={fieldOffsetY}
                    starters={localStarters}
                    onSwap={handleSwap}
                    onMoveTo={handleMoveTo}
                    onMoveToBench={handleMoveToBench}
                    posCoords={posCoords}
                    hasDisplaced={hasDisplaced}
                    onDragStart={handleTileDragStart}
                    onDragEnd={handleTileDragEnd}
                  />
                ))}
              </View>
            </View>

            {/* 警告バナー */}
            {(hasDisplaced || hasDuplicate) && (
              <View style={styles.warningBanner}>
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color={Colors.caution} />
                <Text style={styles.warningText}>
                  {hasDisplaced
                    ? 'ポジションが未割り当ての選手がいます'
                    : 'ポジションが重複しています'}
                </Text>
              </View>
            )}

            {/* ベンチセクション */}
            <View
              style={[styles.benchSection, isDraggingAny && styles.benchSectionDragging]}
            >
              <View style={styles.benchHeader}>
                <Text style={styles.benchTitle}>控え選手</Text>
                <TouchableOpacity
                  style={styles.addPlayerBtn}
                  onPress={() => setShowRegisterForm(true)}
                >
                  <MaterialCommunityIcons name="plus" size={16} color={Colors.action} />
                  <Text style={styles.addPlayerBtnText}>選手追加</Text>
                </TouchableOpacity>
              </View>

              {localBench.length === 0 ? (
                <Text style={styles.emptyBench}>控え選手なし</Text>
              ) : (
                <View style={styles.benchGrid}>
                  {localBench.map((player) => (
                    <BenchTile
                      key={player.playerId}
                      player={player}
                      fieldOffsetY={fieldOffsetY}
                      starters={localStarters}
                      onSubstitute={handleSubstitute}
                      posCoords={posCoords}
                      hasDisplaced={hasDisplaced}
                      onDragStart={handleTileDragStart}
                      onDragEnd={handleTileDragEnd}
                    />
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── スタイル ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.card,
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  teamBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  teamBadgeText: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.primary,
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  undoBtnDisabled: {
    opacity: 0.4,
  },
  undoBtnText: {
    fontSize: Typography.caption,
    color: Colors.text,
    fontWeight: '600',
  },
  undoBtnTextDisabled: {
    color: Colors.textDisabled,
  },
  commitBtn: {
    backgroundColor: Colors.action,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
  },
  commitBtnDisabled: {
    backgroundColor: Colors.border,
  },
  commitBtnText: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.white,
  },
  commitBtnTextDisabled: {
    color: Colors.textDisabled,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  unassignedPitcherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primaryLight,
  },
  unassignedPitcherTextWrap: { flex: 1 },
  unassignedPitcherTitle: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.primary,
  },
  unassignedPitcherHint: {
    marginTop: 2,
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },

  // Field
  fieldContainer: {
    width: '100%',
    height: CANVAS_H,
    marginTop: Spacing.md,
    backgroundColor: '#4A7C3F',
  },
  fieldBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: '#3A9440',
  },
  fieldImage: {
    position: 'absolute',
    width: '100%',
    height: '130%',
    top: '-15%',
  },
  tilesLayer: {
    ...StyleSheet.absoluteFillObject,
  },

  // Tile
  tile: {
    position: 'absolute',
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: TILE_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  tileDisplaced: {
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  tilePos: {
    fontSize: Typography.tiny,
    fontWeight: '700',
    color: Colors.primary,
    lineHeight: 12,
  },
  tileName: {
    fontSize: 9,
    color: Colors.textSecondary,
    maxWidth: TILE_SIZE - 4,
    lineHeight: 10,
  },

  // Bench tile
  benchTile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: TILE_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    margin: 4,
  },
  benchTileNew: {
    borderColor: Colors.action,
    borderWidth: 1.5,
  },

  // Warning
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cautionBg,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  warningText: {
    fontSize: Typography.caption,
    color: Colors.caution,
  },

  // Bench section
  benchSection: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    width: '100%',
  },
  benchSectionDragging: {
    borderWidth: 2,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
  },
  benchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  benchTitle: {
    fontSize: Typography.body,
    fontWeight: '600',
    color: Colors.text,
  },
  addPlayerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addPlayerBtnText: {
    fontSize: Typography.caption,
    color: Colors.action,
    fontWeight: '600',
  },
  emptyBench: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  benchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  // Confirm screen
  confirmScreenTitle: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.text,
  },
  confirmSection: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  confirmSectionTitle: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  changeLeft: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    paddingRight: Spacing.sm,
  },
  changeRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: Spacing.sm,
  },
  changeOrderText: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.text,
  },
  changePosText: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
  },
  changeNameText: {
    fontSize: Typography.body,
    color: Colors.text,
    flexShrink: 1,
  },
  changeArrow: {
    fontSize: Typography.body,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.xs,
  },

  // Register form
  registerForm: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  registerTitle: {
    fontSize: Typography.h4,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.body,
    color: Colors.text,
    backgroundColor: Colors.card,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  toggleLabel: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    width: 36,
  },
  toggleBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  toggleBtnActive: {
    backgroundColor: Colors.action,
    borderColor: Colors.action,
  },
  toggleBtnText: {
    fontSize: Typography.bodySmall,
    color: Colors.text,
  },
  toggleBtnTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  registerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: Typography.body,
    color: Colors.textSecondary,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.action,
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: Colors.border,
  },
  confirmBtnText: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.white,
  },
});
