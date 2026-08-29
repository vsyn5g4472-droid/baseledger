/**
 * OffensiveSubstitutionModal.tsx
 *
 * 攻撃時選手交代モーダル（代打・代走）
 * ドラッグ&ドロップ方式でダイアモンド選手と控えを入れ替える。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Dimensions,
  InputAccessoryView,
  Keyboard,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import type { GameState, Player, Position } from '../../types/game';

// ─── 定数 ────────────────────────────────────────────────────────────────────

const W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const DIAMOND_H = SCREEN_H * 0.60;
const BENCH_THRESHOLD = SCREEN_H * 0.62;
const TILE_SIZE = 52;
const SNAP_DIST = 70;
const NUMBER_INPUT_ACCESSORY_ID = 'offensive-substitution-number-input';

type DiamondSlot = 'batter' | 'first' | 'second' | 'third';

const ALL_SLOTS: DiamondSlot[] = ['batter', 'first', 'second', 'third'];

const DIAMOND_RADIUS = Math.min(W, DIAMOND_H) * 0.35;

/** 各スロットのタイル中心座標 */
const SLOT_COORDS: Record<DiamondSlot, { x: number; y: number }> = {
  second: { x: W * 0.5,                  y: DIAMOND_H * 0.5 - DIAMOND_RADIUS },
  first:  { x: W * 0.5 + DIAMOND_RADIUS, y: DIAMOND_H * 0.5 },
  third:  { x: W * 0.5 - DIAMOND_RADIUS, y: DIAMOND_H * 0.5 },
  batter: { x: W * 0.5,                  y: DIAMOND_H * 0.5 + DIAMOND_RADIUS },
};

const SLOT_LABEL: Record<DiamondSlot, string> = {
  batter: '打者',
  first:  '一塁',
  second: '二塁',
  third:  '三塁',
};

const SUB_TYPE_LABEL: Record<DiamondSlot, string> = {
  batter: '打者交代',
  first:  '代走（一塁）',
  second: '代走（二塁）',
  third:  '代走（三塁）',
};

// ─── 型定義 ──────────────────────────────────────────────────────────────────

interface LocalPlayer {
  id: string;
  name: string;
  number: number | null;
  position: Position;
  bats: 'L' | 'R' | 'S';
}

interface DiamondState {
  batter: LocalPlayer | null;
  first: LocalPlayer | null;
  second: LocalPlayer | null;
  third: LocalPlayer | null;
}

interface HistoryEntry {
  diamond: DiamondState;
  bench: LocalPlayer[];
}

interface NewPlayerData {
  name: string;
  number: number | null;
  bats: 'L' | 'R' | 'S';
  throws: 'L' | 'R';
}

interface Props {
  visible: boolean;
  side: 'away' | 'home';
  game: GameState;
  onClose: () => void;
  onCommit: (
    side: 'away' | 'home',
    substitutions: {
      playerOutId: string;
      playerInId: string;
      type: 'pinch_hitter' | 'pinch_runner';
      baseIfRunner?: 'first' | 'second' | 'third';
    }[],
  ) => void;
  onAddBench: (side: 'away' | 'home', newPlayerData: NewPlayerData) => void;
}

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

const toLocal = (p: Player): LocalPlayer => ({
  id: p.id,
  name: p.name,
  number: p.number,
  position: p.position,
  bats: p.bats,
});

// ─── 新規選手登録フォーム ──────────────────────────────────────────────────────

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
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.registerForm}>
        <Text style={styles.registerTitle}>新規選手登録</Text>
        <TextInput
          style={styles.input}
          placeholder="氏名"
          placeholderTextColor={Colors.textSecondary}
          value={name}
          onChangeText={setName}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />
        <TextInput
          style={styles.input}
          placeholder="背番号（任意）"
          placeholderTextColor={Colors.textSecondary}
          keyboardType="number-pad"
          value={number}
          onChangeText={setNumber}
          inputAccessoryViewID={Platform.OS === 'ios' ? NUMBER_INPUT_ACCESSORY_ID : undefined}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
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
        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID={NUMBER_INPUT_ACCESSORY_ID}>
            <View style={styles.keyboardAccessory}>
              <TouchableOpacity onPress={Keyboard.dismiss} style={styles.keyboardDoneBtn}>
                <Text style={styles.keyboardDoneText}>完了</Text>
              </TouchableOpacity>
            </View>
          </InputAccessoryView>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}

// ─── DiamondTile ─────────────────────────────────────────────────────────────
// ドラッグして BENCH_THRESHOLD 以下に離すとベンチへ退場

interface DiamondTileProps {
  slot: DiamondSlot;
  player: LocalPlayer;
  isChanged: boolean;
  onMoveToBench: (slot: DiamondSlot) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function DiamondTile({
  slot,
  player,
  isChanged,
  onMoveToBench,
  onDragStart,
  onDragEnd,
}: DiamondTileProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const handleDragEnd = useCallback(
    (absY: number) => {
      if (absY >= BENCH_THRESHOLD) {
        onMoveToBench(slot);
      }
    },
    [slot, onMoveToBench],
  );

  const panGesture = Gesture.Pan()
    .onStart(() => {
      isDragging.value = true;
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      isDragging.value = false;
      runOnJS(onDragEnd)();
      runOnJS(handleDragEnd)(e.absoluteY);
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    zIndex: isDragging.value ? 999 : 2,
  }));

  const center = SLOT_COORDS[slot];
  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.diamondTile,
          {
            left: center.x - TILE_SIZE / 2,
            top:  center.y - TILE_SIZE / 2,
          },
          isChanged && styles.diamondTileChanged,
          animatedStyle,
        ]}
      >
        <Text style={styles.tileSlotLabel}>{SLOT_LABEL[slot]}</Text>
        {player.number != null && (
          <Text style={styles.tileNum}>#{player.number}</Text>
        )}
        <Text style={styles.tileName} numberOfLines={1}>
          {player.name}
        </Text>
      </Animated.View>
    </GestureDetector>
  );
}

// ─── EmptyBaseMarker ─────────────────────────────────────────────────────────
// ランナーなし・または退場済みスロットに表示するベース形状

function EmptyBaseMarker({ slot }: { slot: DiamondSlot }) {
  const center = SLOT_COORDS[slot];
  const SIZE = 16;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.emptyBase,
        {
          left:  center.x - SIZE / 2,
          top:   center.y - SIZE / 2,
          width:  SIZE,
          height: SIZE,
        },
      ]}
    />
  );
}

// ─── BenchTile ────────────────────────────────────────────────────────────────
// ドラッグしてダイアモンドスロット付近（SNAP_DIST以内）に離すと交代

interface BenchTileProps {
  player: LocalPlayer;
  fieldOffsetY: number;
  validSlots: Set<DiamondSlot>;
  onSubstitute: (benchPlayerId: string, slot: DiamondSlot) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function BenchTile({
  player,
  fieldOffsetY,
  validSlots,
  onSubstitute,
  onDragStart,
  onDragEnd,
}: BenchTileProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const handleDragEnd = useCallback(
    (absX: number, absY: number) => {
      // ダイヤモンドエリア内のドロップのみ処理
      if (absY >= BENCH_THRESHOLD) return;

      const relX = absX;
      const relY = absY - fieldOffsetY;

      let nearestSlot: DiamondSlot | null = null;
      let nearestDist = SNAP_DIST;
      for (const slot of ALL_SLOTS) {
        if (!validSlots.has(slot)) continue;
        const center = SLOT_COORDS[slot];
        const dist = Math.sqrt((relX - center.x) ** 2 + (relY - center.y) ** 2);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestSlot = slot;
        }
      }
      if (nearestSlot) {
        onSubstitute(player.id, nearestSlot);
      }
    },
    [player.id, fieldOffsetY, validSlots, onSubstitute],
  );

  const panGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-10, 10])
    .onStart(() => {
      isDragging.value = true;
      runOnJS(onDragStart)();
    })
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
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    zIndex: isDragging.value ? 999 : 1,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.benchTile, animatedStyle]}>
        {player.number != null && (
          <Text style={styles.tileNum}>#{player.number}</Text>
        )}
        <Text style={styles.tileName} numberOfLines={1}>
          {player.name}
        </Text>
      </Animated.View>
    </GestureDetector>
  );
}

// ─── メインモーダル ───────────────────────────────────────────────────────────

export default function OffensiveSubstitutionModal({
  visible,
  side,
  game,
  onClose,
  onCommit,
  onAddBench,
}: Props) {
  const team = side === 'away' ? game.awayTeam : game.homeTeam;

  // ─── 初期ダイアモンド状態構築 ──────────────────────────────────────────────

  const buildInitialDiamond = useCallback((): DiamondState => {
    const idx = side === 'away' ? game.currentBatterIndex.away : game.currentBatterIndex.home;
    const batter = team.roster.starters[idx] ?? null;
    return {
      batter: batter                ? toLocal(batter)               : null,
      first:  game.runners.first   ? toLocal(game.runners.first)   : null,
      second: game.runners.second  ? toLocal(game.runners.second)  : null,
      third:  game.runners.third   ? toLocal(game.runners.third)   : null,
    };
  }, [side, game, team]);

  // ─── ローカル状態 ─────────────────────────────────────────────────────────

  const [initDiamond,  setInitDiamond]  = useState<DiamondState>(() => buildInitialDiamond());
  const [localDiamond, setLocalDiamond] = useState<DiamondState>(initDiamond);
  const [localBench,   setLocalBench]   = useState<LocalPlayer[]>(() => team.roster.bench.map(toLocal));
  const [history,      setHistory]      = useState<HistoryEntry[]>([]);
  const [fieldOffsetY, setFieldOffsetY] = useState(0);
  const [isDraggingAny, setIsDraggingAny] = useState(false);
  const [showConfirm,      setShowConfirm]      = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);

  // クロージャ古さ対策（ドラッグコールバック内で最新状態を参照）
  const localDiamondRef = useRef<DiamondState>(localDiamond);
  const localBenchRef   = useRef<LocalPlayer[]>(localBench);
  useEffect(() => { localDiamondRef.current = localDiamond; }, [localDiamond]);
  useEffect(() => { localBenchRef.current   = localBench;   }, [localBench]);

  // ダイヤモンドエリアのスクリーンY座標計測
  const diamondAreaRef = useRef<View>(null);

  // ─── ドラッグイベント ─────────────────────────────────────────────────────

  const handleTileDragStart = useCallback(() => setIsDraggingAny(true), []);
  const handleTileDragEnd   = useCallback(() => setIsDraggingAny(false), []);

  // ─── モーダルオープン時リセット ───────────────────────────────────────────

  useEffect(() => {
    if (!visible) return;
    const d = buildInitialDiamond();
    setInitDiamond(d);
    setLocalDiamond(d);
    setLocalBench(team.roster.bench.map(toLocal));
    setHistory([]);
    setIsDraggingAny(false);
    setShowConfirm(false);
    setShowRegisterForm(false);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── ベンチ同期（store に新規選手が追加された場合） ─────────────────────────

  useEffect(() => {
    if (!visible) return;
    const storeBench = (side === 'away' ? game.awayTeam : game.homeTeam).roster.bench;
    setLocalBench((prev) => {
      const prevIds = new Set(prev.map((p) => p.id));
      const newEntries = storeBench
        .filter((p) => !prevIds.has(p.id))
        .map(toLocal);
      return newEntries.length > 0 ? [...prev, ...newEntries] : prev;
    });
  }, [game.awayTeam, game.homeTeam, visible, side]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 有効スロット（初期に選手がいた塁のみBenchTileのドロップ先になる） ───

  const validSlots = useMemo((): Set<DiamondSlot> => {
    const s = new Set<DiamondSlot>(['batter' as DiamondSlot]);
    if (initDiamond.first)  s.add('first');
    if (initDiamond.second) s.add('second');
    if (initDiamond.third)  s.add('third');
    return s;
  }, [initDiamond]);

  // ─── DiamondTile → ベンチへ ──────────────────────────────────────────────

  const handleMoveToBench = useCallback((slot: DiamondSlot) => {
    const outPlayer = localDiamondRef.current[slot];
    if (!outPlayer) return;
    setHistory((h) => [
      ...h,
      { diamond: { ...localDiamondRef.current }, bench: [...localBenchRef.current] },
    ]);
    setLocalDiamond((prev) => ({ ...prev, [slot]: null }));
    setLocalBench((prev) => [...prev, outPlayer]);
  }, []);

  // ─── BenchTile → スロットへ ──────────────────────────────────────────────

  const handleSubstitute = useCallback((benchPlayerId: string, slot: DiamondSlot) => {
    const benchPlayer = localBenchRef.current.find((p) => p.id === benchPlayerId);
    if (!benchPlayer) return;
    const currentOccupant = localDiamondRef.current[slot];
    setHistory((h) => [
      ...h,
      { diamond: { ...localDiamondRef.current }, bench: [...localBenchRef.current] },
    ]);
    setLocalDiamond((prev) => ({ ...prev, [slot]: benchPlayer }));
    setLocalBench((prev) => {
      const next = prev.filter((p) => p.id !== benchPlayerId);
      return currentOccupant ? [...next, currentOccupant] : next;
    });
  }, []);

  // ─── アンドゥ ─────────────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last) return;
    setLocalDiamond(last.diamond);
    setLocalBench(last.bench);
    setHistory((h) => h.slice(0, -1));
  }, [history]);

  // ─── canCommit / hasOrphan ─────────────────────────────────────────────────

  const hasChange = ALL_SLOTS.some((s) => {
    const orig = initDiamond[s];
    const curr = localDiamond[s];
    return orig && curr && curr.id !== orig.id;
  });
  const hasOrphan = ALL_SLOTS.some((s) => initDiamond[s] && !localDiamond[s]);
  const canCommit = hasChange && !hasOrphan;

  // ─── 新規選手追加 ─────────────────────────────────────────────────────────

  const handleRegisterConfirm = useCallback(
    (data: NewPlayerData) => {
      onAddBench(side, data);
      setShowRegisterForm(false);
    },
    [onAddBench, side],
  );

  // ─── コミット ─────────────────────────────────────────────────────────────

  const handleCommit = useCallback(() => {
    if (!canCommit) return;
    const subs: {
      playerOutId: string;
      playerInId: string;
      type: 'pinch_hitter' | 'pinch_runner';
      baseIfRunner?: 'first' | 'second' | 'third';
    }[] = [];
    for (const slot of ALL_SLOTS) {
      const orig = initDiamond[slot];
      const curr = localDiamond[slot];
      if (!orig || !curr || orig.id === curr.id) continue;
      subs.push({
        playerOutId: orig.id,
        playerInId:  curr.id,
        type: slot === 'batter' ? 'pinch_hitter' : 'pinch_runner',
        ...(slot !== 'batter' ? { baseIfRunner: slot as 'first' | 'second' | 'third' } : {}),
      });
    }
    onCommit(side, subs);
    onClose();
  }, [canCommit, localDiamond, initDiamond, side, onCommit, onClose]);

  // ─── ダイヤモンドライン描画 ───────────────────────────────────────────────

  const renderLine = (s1: DiamondSlot, s2: DiamondSlot, key: number) => {
    const c1 = SLOT_COORDS[s1];
    const c2 = SLOT_COORDS[s2];
    const dx = c2.x - c1.x;
    const dy = c2.y - c1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const cx = (c1.x + c2.x) / 2;
    const cy = (c1.y + c2.y) / 2;
    return (
      <View
        key={key}
        pointerEvents="none"
        style={{
          position: 'absolute',
          left:  cx - len / 2,
          top:   cy - 1,
          width: len,
          height: 2,
          backgroundColor: '#8B7355',
          transform: [{ rotate: `${angle}deg` }],
        }}
      />
    );
  };

  // ─── 確認画面エントリ ─────────────────────────────────────────────────────

  const changeEntries = useMemo(
    () =>
      ALL_SLOTS.filter((s) => {
        const orig = initDiamond[s];
        const curr = localDiamond[s];
        return orig && curr && orig.id !== curr.id;
      }).map((s) => ({
        label:   SUB_TYPE_LABEL[s],
        outName: initDiamond[s]!.name,
        inName:  localDiamond[s]!.name,
      })),
    [localDiamond, initDiamond],
  );

  const teamName = side === 'away' ? game.awayTeam.name : game.homeTeam.name;

  // ─── 確認画面 ─────────────────────────────────────────────────────────────

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
            <Text style={styles.headerTitle}>変更内容の確認</Text>
            <TouchableOpacity style={styles.commitBtn} onPress={handleCommit}>
              <Text style={styles.commitBtnText}>確定する</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />
          <ScrollView contentContainerStyle={styles.confirmContent}>
            {changeEntries.map((entry, i) => (
              <View key={i} style={styles.changeRow}>
                <Text style={styles.changeLabel}>{entry.label}</Text>
                <View style={styles.changeNames}>
                  <Text style={styles.changeOut} numberOfLines={1}>{entry.outName}</Text>
                  <Text style={styles.changeArrow}>→</Text>
                  <Text style={styles.changeIn} numberOfLines={1}>{entry.inName}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }

  // ─── 通常画面 ─────────────────────────────────────────────────────────────

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

        {/* ── ダイヤモンドエリア（上部 60%） ── */}
        <View
          ref={diamondAreaRef}
          style={styles.diamondArea}
          onLayout={() => {
            diamondAreaRef.current?.measure((_x, _y, _w, _h, _px, py) => {
              setFieldOffsetY(py);
            });
          }}
        >
          {/* ベース間ライン */}
          {renderLine('batter', 'first',  0)}
          {renderLine('first',  'second', 1)}
          {renderLine('second', 'third',  2)}
          {renderLine('third',  'batter', 3)}

          {/* 有効スロット：選手がいれば DiamondTile、いなければ EmptyBaseMarker */}
          {ALL_SLOTS.map((slot) => {
            if (!validSlots.has(slot)) return null;
            const player = localDiamond[slot];
            if (player) {
              return (
                <DiamondTile
                  key={slot}
                  slot={slot}
                  player={player}
                  isChanged={player.id !== initDiamond[slot]?.id}
                  onMoveToBench={handleMoveToBench}
                  onDragStart={handleTileDragStart}
                  onDragEnd={handleTileDragEnd}
                />
              );
            }
            return <EmptyBaseMarker key={slot} slot={slot} />;
          })}

          {/* 無効スロット（初期ランナーなし）→ 空ベースマーカー */}
          {ALL_SLOTS.filter((s) => !validSlots.has(s)).map((slot) => (
            <EmptyBaseMarker key={`empty-${slot}`} slot={slot} />
          ))}
        </View>

        {/* ── 警告バナー（孤立スロット：退場したが未交代） ── */}
        {hasOrphan && (
          <View style={styles.warningBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={Colors.caution} />
            <Text style={styles.warningText}>
              控えから選手をドラッグして交代してください
            </Text>
          </View>
        )}

        {/* ── ベンチエリア（下部 40%、横スクロール） ── */}
        <View style={[styles.benchSection, isDraggingAny && styles.benchSectionDragging]}>
          {showRegisterForm ? (
            <ScrollView
              style={styles.registerScroll}
              contentContainerStyle={styles.registerScrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              automaticallyAdjustKeyboardInsets
              onScrollBeginDrag={Keyboard.dismiss}
            >
              <RegisterForm
                onConfirm={handleRegisterConfirm}
                onCancel={() => setShowRegisterForm(false)}
              />
            </ScrollView>
          ) : (
            <>
              <View style={styles.benchHeaderRow}>
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
                      key={player.id}
                      player={player}
                      fieldOffsetY={fieldOffsetY}
                      validSlots={validSlots}
                      onSubstitute={handleSubstitute}
                      onDragStart={handleTileDragStart}
                      onDragEnd={handleTileDragEnd}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* ── 操作ガイド ── */}
        <Text style={styles.guide}>
          {isDraggingAny
            ? '打者・走者のスロットへドロップ'
            : '控え選手をダイヤモンドへドラッグ / 打者・走者をベンチへドラッグ'}
        </Text>

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
  headerTitle: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.text,
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
  undoBtnDisabled: { opacity: 0.4 },
  undoBtnText: {
    fontSize: Typography.caption,
    color: Colors.text,
    fontWeight: '600',
  },
  undoBtnTextDisabled: { color: Colors.textDisabled },
  commitBtn: {
    backgroundColor: Colors.action,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
  },
  commitBtnDisabled: { backgroundColor: Colors.border },
  commitBtnText: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.white,
  },
  commitBtnTextDisabled: { color: Colors.textDisabled },

  divider: { height: 1, backgroundColor: Colors.border },

  // Diamond area
  diamondArea: {
    width: '100%',
    height: DIAMOND_H,
    backgroundColor: '#4A7C3F',
    position: 'relative',
  },

  // Diamond tile
  diamondTile: {
    position: 'absolute',
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: TILE_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  diamondTileChanged: {
    borderColor: Colors.success,
    backgroundColor: Colors.statusDoneBg,
  },
  tileSlotLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: Colors.primary,
    lineHeight: 10,
  },
  tileNum: {
    fontSize: 8,
    color: Colors.textSecondary,
    lineHeight: 9,
  },
  tileName: {
    fontSize: 9,
    color: Colors.text,
    fontWeight: '600',
    maxWidth: TILE_SIZE - 4,
    textAlign: 'center',
    lineHeight: 11,
  },

  // Empty base marker（45°回転した正方形）
  emptyBase: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.50)',
    transform: [{ rotate: '45deg' }],
  },

  // Warning
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cautionBg,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.xs,
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
    flex: 1,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    overflow: 'visible',
  },
  benchSectionDragging: {
    borderWidth: 2,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
  },
  benchTitle: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  emptyBench: {
    fontSize: Typography.bodySmall,
    color: Colors.textDisabled,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  benchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  benchTile: {
    width:  TILE_SIZE + 8,
    height: TILE_SIZE + 8,
    borderRadius: (TILE_SIZE + 8) / 2,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },

  // Guide text
  guide: {
    textAlign: 'center',
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },

  // Bench header
  benchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
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

  // Register form
  registerScroll: {
    flex: 1,
  },
  registerScrollContent: {
    flexGrow: 1,
    paddingBottom: Spacing.xl,
  },
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
  keyboardAccessory: {
    alignItems: 'flex-end',
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  keyboardDoneBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  keyboardDoneText: {
    color: Colors.action,
    fontSize: Typography.body,
    fontWeight: '700',
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

  // Confirm screen
  confirmContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  changeRow: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  changeLabel: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 4,
  },
  changeNames: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  changeOut: {
    flex: 1,
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  changeArrow: {
    fontSize: Typography.bodySmall,
    color: Colors.text,
    fontWeight: '700',
  },
  changeIn: {
    flex: 1,
    fontSize: Typography.bodySmall,
    color: Colors.text,
    fontWeight: '600',
  },
});
