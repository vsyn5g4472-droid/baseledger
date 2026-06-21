import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Animated, PanResponder } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, Portal, Modal } from 'react-native-paper';
import Svg, { Rect, Line, Circle, Text as SvgText } from 'react-native-svg';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useI18n } from '../../i18n';
import type {
  RunnerAdvancement,
  BaseTarget,
  RunnerOutcome,
  RunnerAction,
  AtBatResult,
  FieldingRecord,
  OutDetail,
  BatterAdvancementReason,
} from '../../types/game';
import { HIT_RESULTS_NEEDING_BATTER_ADVANCEMENT } from '../../types/game';
import {
  baseToNum,
  capBatterTargetBase,
  isBatterPassingBlocked,
} from '../../utils/runnerAdvancementRules';

// ============================================================
// 定数
// ============================================================

const DIAMOND_SIZE = 280;
const SNAP_THRESHOLD = 30;
const DC = DIAMOND_SIZE / 2;
const DR = 80;
const NEON = '#FFD700';
const NEON_GLOW = 'rgba(255,215,0,0.3)';
const DARK_BG = Colors.background;
const CARD_BG = Colors.card;

const BASE_POS: Record<string, { x: number; y: number }> = {
  home: { x: DC, y: DC + DR },
  batter: { x: DC, y: DC + DR },
  first: { x: DC + DR, y: DC },
  second: { x: DC, y: DC - DR },
  third: { x: DC - DR, y: DC },
};

const BASE_ORDER: Record<string, number> = { first: 1, second: 2, third: 3, home: 4 };

/** ランナー表示位置（常に進塁前の塁） */
function getRunnerDisplayBase(adv: RunnerAdvancement): string {
  return adv.fromBase;
}

// 塁ごとのランナー識別色
const RUNNER_COLORS: Record<string, string> = {
  batter: '#4CAF50',   // グリーン (打者)
  first:  '#FFC107',   // アンバー (1塁走者)
  second: '#00ACC1',   // シアン (2塁走者)
  third:  '#E91E63',   // ピンク (3塁走者)
};

// アウト詳細選択肢
const OUT_DETAILS: { key: OutDetail; labelKey: string }[] = [
  { key: 'force_out',       labelKey: 'forceOut' },
  { key: 'tag_out',         labelKey: 'outDetailTagOut' },
  { key: 'caught_stealing', labelKey: 'caughtStealing' },
  { key: 'pickoff',         labelKey: 'pickoff' },
  { key: 'tag_up_fail',     labelKey: 'tagUpFail' },
  { key: 'rundown',         labelKey: 'rundown' },
  { key: 'other',           labelKey: 'outDetailOther' },
];

// ============================================================
// ドラッグ操作ヘルパー（モジュールレベル）
// ============================================================

/** ドラッグ操作を受け付ける走者かを判定 */
function isDraggable(adv: RunnerAdvancement, result: AtBatResult): boolean {
  if (adv.fromBase !== 'batter') return true;
  if (result === 'sacrifice_fly' || result === 'flyout') return false;
  if (result === 'sacrifice_bunt') return true;  // バントの打者は outcome に関わらずドラッグ可
  if (adv.outcome === 'out_force' || adv.outcome === 'out_tag') return false;
  return true;
}

/** タッチ座標 (x,y) から 25px 以内の走者を返す */
function findRunnerNear(
  advancements: RunnerAdvancement[],
  result: AtBatResult | string,
  x: number,
  y: number,
): RunnerAdvancement | null {
  for (const adv of advancements) {
    if (!isDraggable(adv, result as AtBatResult)) continue;
    const displayBase = getRunnerDisplayBase(adv);
    const p = BASE_POS[displayBase] ?? BASE_POS[adv.fromBase];
    if (p && Math.hypot(x - p.x, y - p.y) <= 25) return adv;
  }
  return null;
}

/** 座標 (x,y) から threshold 以内の最寄り塁を返す */
function nearestBase(x: number, y: number, threshold: number): BaseTarget | null {
  let best: BaseTarget | null = null;
  let min = threshold;
  for (const [b, p] of Object.entries(BASE_POS)) {
    if (b === 'batter') continue;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < min) { min = d; best = b as BaseTarget; }
  }
  return best;
}

/** 進塁先として選択不可かを判定 */
function isBaseDisabled(
  adv: RunnerAdvancement,
  base: BaseTarget,
  advancements: RunnerAdvancement[],
): boolean {
  // 残塁: 元の塁に戻す
  if (adv.fromBase !== 'batter' && base === adv.fromBase) return false;
  if (adv.fromBase === 'batter' && base === 'home') return false;

  const baseNum = BASE_ORDER[base] ?? 0;
  const fromNum = adv.fromBase === 'batter' ? 0 : (BASE_ORDER[adv.fromBase] ?? 0);
  const minNum  = adv.minBase !== 'out' ? (BASE_ORDER[adv.minBase] ?? 0) : 0;
  if (baseNum < Math.max(minNum, fromNum + 1)) return true;
  return isBatterPassingBlocked(adv, base, advancements);
}

const PATH_LEG_OFFSET_PX = 6;
const PATH_STROKE_WIDTH = 2.5;

interface PathLeg {
  segmentKey: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

function normalizeBaseKey(base: string): string {
  return base === 'batter' ? 'home' : base;
}

/** 塁間の折れ線経路（from → 中間塁 → target） */
function getPathLegs(
  fromBase: RunnerAdvancement['fromBase'],
  targetBase: BaseTarget,
): PathLeg[] {
  const fromNum = fromBase === 'batter' ? 0 : (BASE_ORDER[fromBase] ?? 0);
  const toNum = baseToNum(targetBase);
  if (targetBase === 'out' || toNum <= fromNum) return [];

  const legKeys = (['first', 'second', 'third', 'home'] as const);
  const legs: PathLeg[] = [];
  let prevKey = normalizeBaseKey(fromBase);
  let prevPos = { ...BASE_POS[fromBase === 'batter' ? 'batter' : fromBase] };

  for (let n = fromNum + 1; n <= toNum && n <= 4; n++) {
    const key = n === 4 ? 'home' : legKeys[n - 1];
    const pos = { ...BASE_POS[key] };
    legs.push({
      segmentKey: `${prevKey}-${key}`,
      from: prevPos,
      to: pos,
    });
    prevKey = key;
    prevPos = pos;
  }
  return legs;
}

/** 線分に対して垂直方向へオフセットした座標を返す */
function offsetLinePerpendicular(
  from: { x: number; y: number },
  to: { x: number; y: number },
  offset: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * offset;
  const py = (dx / len) * offset;
  return {
    x1: from.x + px,
    y1: from.y + py,
    x2: to.x + px,
    y2: to.y + py,
  };
}

/** 同一塁間を通過するランナーごとに線のオフセットを割り当てる */
function computeSegmentLineOffsets(
  advancements: RunnerAdvancement[],
  draggingRunnerId: string | null,
  activeBase: BaseTarget | null,
): Record<string, Record<string, number>> {
  const segmentRunners = new Map<string, string[]>();

  for (const adv of advancements) {
    if (adv.outcome === 'out_tag' || adv.outcome === 'out_force') continue;
    const pathTarget: BaseTarget =
      draggingRunnerId === adv.runnerId && activeBase
        ? activeBase
        : adv.targetBase;
    if (pathTarget === 'out') continue;

    const legs = getPathLegs(adv.fromBase, pathTarget);
    for (const leg of legs) {
      const list = segmentRunners.get(leg.segmentKey) ?? [];
      if (!list.includes(adv.runnerId)) list.push(adv.runnerId);
      segmentRunners.set(leg.segmentKey, list);
    }
  }

  const offsets: Record<string, Record<string, number>> = {};
  for (const [segmentKey, runnerIds] of segmentRunners) {
    if (runnerIds.length <= 1) continue;
    offsets[segmentKey] = {};
    runnerIds.forEach((runnerId, i) => {
      offsets[segmentKey][runnerId] = (i - (runnerIds.length - 1) / 2) * PATH_LEG_OFFSET_PX;
    });
  }
  return offsets;
}

/** 同一到達塁の走者をずらして重なりを避ける */
function computeDestinationOffsets(
  advancements: RunnerAdvancement[],
): Record<string, { dx: number; dy: number }> {
  const groups = new Map<string, RunnerAdvancement[]>();
  for (const adv of advancements) {
    if (adv.outcome === 'out_tag' || adv.outcome === 'out_force' || adv.targetBase === 'out') continue;
    const key = adv.targetBase;
    const list = groups.get(key) ?? [];
    list.push(adv);
    groups.set(key, list);
  }

  const offsets: Record<string, { dx: number; dy: number }> = {};
  for (const [, group] of groups) {
    if (group.length <= 1) continue;
    group.forEach((adv, i) => {
      const spread = (i - (group.length - 1) / 2) * 10;
      offsets[adv.runnerId] = { dx: spread, dy: -spread * 0.35 };
    });
  }
  return offsets;
}

// 打者の超過進塁理由（ヒット時・ダイヤモンド下）
const BATTER_ADVANCEMENT_REASONS: {
  key: BatterAdvancementReason;
  labelKey: string;
  color: string;
}[] = [
  { key: 'good_baserunning', labelKey: 'goodBaserunning', color: '#4CAF50' },
  { key: 'error', labelKey: 'batterError', color: '#FF9800' },
  { key: 'fielders_choice', labelKey: 'fieldersChoiceAdvance', color: '#00ACC1' },
];

// 進塁理由 (サブメニュー用)
const ADVANCEMENT_REASONS: {
  action: RunnerAction;
  outcome: RunnerOutcome;
  labelKey: string;
  color: string;
  outDetail?: OutDetail;
}[] = [
  { action: 'batted_ball',   outcome: 'safe',           labelKey: 'battedBall',    color: '#4CAF50' },
  { action: 'tag_up',        outcome: 'safe',           labelKey: 'tagUp',         color: '#2E7D32' },
  { action: 'batted_ball',   outcome: 'error_advance',  labelKey: 'errorAdvance',  color: '#FF9800' },
  { action: 'wild_pitch',    outcome: 'safe',           labelKey: 'wildPitch',     color: '#FFC107' },
  { action: 'stolen_base',   outcome: 'safe',           labelKey: 'stolenBase',    color: '#00ACC1' },
  { action: 'batted_ball',   outcome: 'out_force',      labelKey: 'outForce',      color: '#E53935' },
  { action: 'batted_ball',   outcome: 'out_tag',        labelKey: 'outTag',        color: '#F44336' },
  { action: 'tag_up',        outcome: 'out_tag',        labelKey: 'tagUpFail',     color: '#C62828', outDetail: 'tag_up_fail' },
];

function isReasonActive(
  adv: RunnerAdvancement,
  reason: (typeof ADVANCEMENT_REASONS)[number],
): boolean {
  if (adv.action !== reason.action || adv.outcome !== reason.outcome) return false;
  if (reason.outDetail) return adv.outDetail === reason.outDetail;
  if (reason.outcome === 'out_tag' && reason.action === 'batted_ball') {
    return adv.outDetail !== 'tag_up_fail';
  }
  return adv.outDetail === undefined;
}

// ============================================================
// Props
// ============================================================

interface RunnerAdvancementViewProps {
  advancements: RunnerAdvancement[];
  result: AtBatResult | string;
  fielding?: FieldingRecord;
  onConfirm: (
    finalAdvancements: RunnerAdvancement[],
    batterAdvancementReasons?: BatterAdvancementReason[],
  ) => void;
  onCancel: () => void;
}

// ============================================================
// コンポーネント
// ============================================================

export default function RunnerAdvancementView({
  advancements,
  result,
  fielding,
  onConfirm,
  onCancel,
}: RunnerAdvancementViewProps) {
  const { t } = useI18n();
  const [editable, setEditable] = useState<RunnerAdvancement[]>(() => capBatterTargetBase(advancements));

  const updateEditable = useCallback(
    (updater: (prev: RunnerAdvancement[]) => RunnerAdvancement[]) => {
      setEditable((prev) => capBatterTargetBase(updater(prev)));
    },
    [],
  );
  const [expandedRunner, setExpandedRunner] = useState<string | null>(null);
  const [batterAdvancementReasons, setBatterAdvancementReasons] = useState<BatterAdvancementReason[]>([]);

  // ドラッグ用 ref（PanResponder クロージャ内で最新値を読む）
  const draggingRunnerIdRef = useRef<string | null>(null);
  const activeBaseRef       = useRef<BaseTarget | null>(null);
  const editableRef         = useRef(editable);
  const resultRef           = useRef(result);
  useEffect(() => { editableRef.current = editable; }, [editable]);
  useEffect(() => { resultRef.current = result; }, [result]);

  // ドラッグ表示用 state
  const [draggingRunnerId, setDraggingRunnerId] = useState<string | null>(null);
  const [dragPos,          setDragPos]          = useState<{ x: number; y: number } | null>(null);
  const [activeBase,       setActiveBase]       = useState<BaseTarget | null>(null);
  const [scrollEnabled,    setScrollEnabled]    = useState(true);

  // ダイヤモンドコンテナの画面座標
  const diamondRef     = useRef<View>(null);
  const diamondPagePos = useRef({ x: 0, y: 0 });

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,

    onPanResponderGrant: (evt) => {
      setScrollEnabled(false);   // 他の処理より先に同期的に無効化
      const { pageX, pageY } = evt.nativeEvent;
      diamondRef.current?.measure((_fx, _fy, _w, _h, px, py) => {
        diamondPagePos.current = { x: px, y: py };
        const rx = pageX - px;
        const ry = pageY - py;
        const runner = findRunnerNear(editableRef.current, resultRef.current as AtBatResult, rx, ry);
        if (!runner) {
          setScrollEnabled(true);  // ランナー以外をタップした場合は即復元
          return;
        }
        draggingRunnerIdRef.current = runner.runnerId;
        setDraggingRunnerId(runner.runnerId);
        setDragPos(BASE_POS[getRunnerDisplayBase(runner)] ?? BASE_POS[runner.fromBase]);
      });
    },

    onPanResponderMove: (evt) => {
      if (!draggingRunnerIdRef.current) return;
      const { pageX, pageY } = evt.nativeEvent;
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      const rx = clamp(pageX - diamondPagePos.current.x, 0, DIAMOND_SIZE);
      const ry = clamp(pageY - diamondPagePos.current.y, 0, DIAMOND_SIZE);
      const snapped = nearestBase(rx, ry, SNAP_THRESHOLD);
      activeBaseRef.current = snapped;
      setActiveBase(snapped);
      setDragPos(snapped ? BASE_POS[snapped] : { x: rx, y: ry });
    },

    onPanResponderRelease: () => {
      const runnerId = draggingRunnerIdRef.current;
      const base     = activeBaseRef.current;
      if (runnerId && base) {
        const runner = editableRef.current.find((r) => r.runnerId === runnerId);
        if (runner && !isBaseDisabled(runner, base, editableRef.current)) {
          setSafeOutDialog({ runnerId, base });
        }
      }
      draggingRunnerIdRef.current = null;
      activeBaseRef.current       = null;
      setDraggingRunnerId(null);
      setDragPos(null);
      setActiveBase(null);
      setScrollEnabled(true);
    },

    onPanResponderTerminate: () => {
      draggingRunnerIdRef.current = null;
      activeBaseRef.current       = null;
      setDraggingRunnerId(null);
      setDragPos(null);
      setActiveBase(null);
      setScrollEnabled(true);
    },
  })).current;

  // ダイアログ状態
  const [safeOutDialog, setSafeOutDialog] = useState<{ runnerId: string; base: BaseTarget } | null>(null);
  const [outDetailDialog, setOutDetailDialog] = useState<{ runnerId: string } | null>(null);

  // フライボール系の打席結果: タッチアップ可能ランナーを強調
  const isFlyBall = ['flyout', 'pop_out', 'sacrifice_fly', 'lineout'].includes(result);

  // フライボール: タッチアップ強調パルス (カード用)
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isFlyBall) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isFlyBall, pulseAnim]);

  // ダイヤモンドベース: 共通パルスアニメ
  const basePulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(basePulse, { toValue: 1.15, duration: 700, useNativeDriver: true }),
        Animated.timing(basePulse, { toValue: 1.0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [basePulse]);

  // タッチアップトグル (batted_ball ↔ tag_up)
  const toggleTagUp = useCallback((runnerId: string) => {
    updateEditable((prev) =>
      prev.map((adv) => {
        if (adv.runnerId !== runnerId) return adv;
        if (adv.action === 'tag_up') {
          return { ...adv, action: 'batted_ball' as RunnerAction, outDetail: undefined };
        }
        const curNum = BASE_ORDER[adv.fromBase] ?? 0;
        const restoreBase: BaseTarget = adv.targetBase === 'out'
          ? (adv.minBase !== 'out'
            ? adv.minBase
            : (['first', 'second', 'third'] as const)[Math.min(curNum, 2)] ?? 'first')
          : adv.targetBase;
        return {
          ...adv,
          action: 'tag_up' as RunnerAction,
          outcome: 'safe' as RunnerOutcome,
          outDetail: undefined,
          targetBase: restoreBase,
        };
      }),
    );
  }, [updateEditable]);

  // 理由変更 (action + outcome を同時設定)
  const setReason = useCallback((
    runnerId: string,
    action: RunnerAction,
    outcome: RunnerOutcome,
    outDetail?: OutDetail,
  ) => {
    updateEditable((prev) =>
      prev.map((adv) => {
        if (adv.runnerId !== runnerId) return adv;
        if (outcome === 'out_tag' || outcome === 'out_force') {
          const resolvedDetail = outcome === 'out_tag'
            ? (outDetail ?? (action === 'tag_up' ? 'tag_up_fail' as OutDetail : undefined))
            : undefined;
          return {
            ...adv,
            outcome,
            action,
            targetBase: 'out' as const,
            outDetail: resolvedDetail,
          };
        }
        if (adv.targetBase === 'out') {
          const curNum = BASE_ORDER[adv.fromBase] ?? 0;
          const minNum = BASE_ORDER[adv.minBase] ?? 1;
          const restoreNum = Math.max(minNum, curNum + 1);
          const restoreBase = restoreNum >= 4 ? 'home' : (['first', 'second', 'third'] as const)[restoreNum - 1];
          return { ...adv, outcome, action, targetBase: restoreBase, outDetail: undefined };
        }
        return { ...adv, outcome, action, outDetail: undefined };
      }),
    );
  }, [updateEditable]);

  // セーフ選択
  const handleSafeSelected = useCallback(() => {
    if (!safeOutDialog) return;
    const { runnerId, base } = safeOutDialog;
    const runner = editableRef.current.find((r) => r.runnerId === runnerId);
    const destinationChanged = runner != null && runner.targetBase !== base;

    updateEditable((prev) =>
      prev.map((adv) => {
        if (adv.runnerId !== runnerId) return adv;
        if (!destinationChanged) {
          return { ...adv, outcome: 'safe' as RunnerOutcome, outDetail: undefined };
        }
        return {
          ...adv,
          targetBase: base,
          outcome: 'safe' as RunnerOutcome,
          outDetail: undefined,
          action: (adv.action === 'tag_up' ? 'tag_up' : 'batted_ball') as RunnerAction,
        };
      }),
    );

    if (destinationChanged) {
      setExpandedRunner((prev) => (prev === runnerId ? null : prev));
      if (runner?.fromBase === 'batter') {
        setBatterAdvancementReasons([]);
      }
    }
    setSafeOutDialog(null);
  }, [safeOutDialog, updateEditable]);

  // セーフ/アウト ダイアログから「アウト」選択
  const handleOutSelected = useCallback(() => {
    if (!safeOutDialog) return;
    const { runnerId } = safeOutDialog;
    setSafeOutDialog(null);
    setOutDetailDialog({ runnerId });
  }, [safeOutDialog]);

  // アウト詳細選択
  const handleOutDetailSelected = useCallback((detail: OutDetail) => {
    if (!outDetailDialog) return;
    const { runnerId } = outDetailDialog;
    updateEditable((prev) =>
      prev.map((adv) => {
        if (adv.runnerId !== runnerId) return adv;
        if (detail === 'force_out') {
          return { ...adv, targetBase: 'out' as BaseTarget, outcome: 'out_force' as RunnerOutcome, outDetail: undefined };
        }
        const action: RunnerAction = detail === 'tag_up_fail' && adv.action === 'tag_up'
          ? 'tag_up'
          : adv.action;
        return {
          ...adv,
          targetBase: 'out' as BaseTarget,
          outcome: 'out_tag' as RunnerOutcome,
          outDetail: detail,
          action,
        };
      }),
    );
    setOutDetailDialog(null);
  }, [outDetailDialog, updateEditable]);

  const destinationOffsets = computeDestinationOffsets(editable);
  const segmentLineOffsets = useMemo(
    () => computeSegmentLineOffsets(editable, draggingRunnerId, activeBase),
    [editable, draggingRunnerId, activeBase],
  );

  // バリデーション
  const validationError = (() => {
    const occupied = editable
      .filter((a) => a.targetBase !== 'out' && a.targetBase !== 'home' && a.outcome !== 'out_tag' && a.outcome !== 'out_force')
      .map((a) => a.targetBase);
    const dupes = occupied.filter((b, i) => occupied.indexOf(b) !== i);
    if (dupes.length > 0) return t.advancement.conflictError;
    const batterPassing = editable.find(
      (a) => a.fromBase === 'batter'
        && a.targetBase !== 'out'
        && isBatterPassingBlocked(a, a.targetBase, editable),
    );
    if (batterPassing) return t.advancement.batterPassingError;
    return null;
  })();

  const isHitResult = HIT_RESULTS_NEEDING_BATTER_ADVANCEMENT.includes(result as AtBatResult);
  const batterAdv = editable.find((a) => a.fromBase === 'batter');
  const showBatterReasonButtons = (() => {
    if (!isHitResult || !batterAdv) return false;
    if (batterAdv.minBase === 'out' || batterAdv.targetBase === 'out') return false;
    if (batterAdv.outcome === 'out_tag' || batterAdv.outcome === 'out_force') return false;
    return (BASE_ORDER[batterAdv.targetBase as string] ?? 0) > (BASE_ORDER[batterAdv.minBase as string] ?? 0);
  })();

  useEffect(() => {
    if (!showBatterReasonButtons) {
      setBatterAdvancementReasons([]);
    }
  }, [showBatterReasonButtons]);

  const toggleBatterReason = useCallback((reason: BatterAdvancementReason) => {
    setBatterAdvancementReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason],
    );
  }, []);

  const handleConfirm = useCallback(() => {
    if (validationError) return;
    onConfirm(
      editable,
      batterAdvancementReasons.length > 0 ? batterAdvancementReasons : undefined,
    );
  }, [editable, validationError, onConfirm, batterAdvancementReasons]);

  // 結果ラベル
  const resultLabel = (t.atBatResults as Record<string, string>)[result] ?? result;
  const fieldingLabel = fielding ? fielding.fielders.join('-') : '';

  // targetBase のラベル
  const baseLabel = (b: BaseTarget): string => {
    switch (b) {
      case 'first': return t.advancement.first;
      case 'second': return t.advancement.second;
      case 'third': return t.advancement.third;
      case 'home': return t.advancement.home;
      case 'out': return t.advancement.out;
    }
  };

  // 理由ラベル導出
  const reasonLabel = (adv: RunnerAdvancement): string => {
    if (adv.fromBase === 'batter' && adv.action === 'batted_ball' &&
        (adv.outcome === 'out_tag' || adv.outcome === 'out_force')) {
      return (t.atBatResults as Record<string, string>)[result] ?? t.advancement.outTag;
    }
    if (adv.outDetail) {
      const found = OUT_DETAILS.find((d) => d.key === adv.outDetail);
      if (found) return (t.advancement as Record<string, string>)[found.labelKey] ?? adv.outDetail;
    }
    if (adv.outcome === 'out_force') return t.advancement.outForce;
    if (adv.outcome === 'out_tag') return t.advancement.outTag;
    if (adv.outcome === 'error_advance') return t.advancement.errorAdvance;
    if (adv.action === 'tag_up') return t.advancement.tagUp;
    if (adv.action === 'wild_pitch') return t.advancement.wildPitch;
    if (adv.action === 'stolen_base') return t.advancement.stolenBase;
    return t.advancement.battedBall;
  };

  // 進塁理由がデフォルト(打球進塁)以外に選択されているかを判定
  const isReasonSelected = (adv: RunnerAdvancement): boolean => {
    return adv.action !== 'batted_ball' ||
           adv.outcome === 'out_tag' ||
           adv.outcome === 'out_force' ||
           adv.outcome === 'error_advance';
  };

  const reasonColor = (adv: RunnerAdvancement): string => {
    if (adv.fromBase === 'batter' && adv.action === 'batted_ball' &&
        (adv.outcome === 'out_tag' || adv.outcome === 'out_force')) {
      return '#E53935';
    }
    const match = ADVANCEMENT_REASONS.find((r) => isReasonActive(adv, r));
    return match?.color ?? '#4CAF50';
  };

  return (
    <>
      <ScrollView style={styles.wrapper} contentContainerStyle={styles.content} scrollEnabled={scrollEnabled}>
        {/* ヘッダー */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 }}>
          <TouchableOpacity
            onPress={onCancel}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <View style={[styles.header, { flex: 1, borderBottomWidth: 0, marginHorizontal: 0, paddingTop: 0 }]}>
            <Text style={styles.resultText}>{resultLabel}</Text>
            {fieldingLabel ? <Text style={styles.fieldingText}>{fieldingLabel}</Text> : null}
          </View>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.headerDivider} />
        <Text style={styles.subtitle}>{t.advancement.title}</Text>

        {/* SVG ダイヤモンド（インタラクティブ） */}
        <View
          ref={diamondRef}
          style={styles.diamondWrap}
          {...panResponder.panHandlers}
        >
          <Svg width={DIAMOND_SIZE} height={DIAMOND_SIZE} viewBox={`0 0 ${DIAMOND_SIZE} ${DIAMOND_SIZE}`}>
            {/* ダイヤモンド線 */}
            <Line x1={BASE_POS.home.x} y1={BASE_POS.home.y} x2={BASE_POS.first.x} y2={BASE_POS.first.y} stroke={Colors.border} strokeWidth={1.5} />
            <Line x1={BASE_POS.first.x} y1={BASE_POS.first.y} x2={BASE_POS.second.x} y2={BASE_POS.second.y} stroke={Colors.border} strokeWidth={1.5} />
            <Line x1={BASE_POS.second.x} y1={BASE_POS.second.y} x2={BASE_POS.third.x} y2={BASE_POS.third.y} stroke={Colors.border} strokeWidth={1.5} />
            <Line x1={BASE_POS.third.x} y1={BASE_POS.third.y} x2={BASE_POS.home.x} y2={BASE_POS.home.y} stroke={Colors.border} strokeWidth={1.5} />

            {/* ベース */}
            {(['home', 'first', 'second', 'third'] as const).map((b) => {
              const pos = BASE_POS[b];
              const isTarget = editable.some(
                (a) => a.targetBase === b && a.outcome !== 'out_tag' && a.outcome !== 'out_force',
              );
              const isSnapped = activeBase === b;
              return (
                <React.Fragment key={b}>
                  {(isTarget || isSnapped) && (
                    <Circle
                      cx={pos.x} cy={pos.y}
                      r={isSnapped ? 26 : 18}
                      fill={isSnapped ? 'rgba(255,215,0,0.55)' : NEON_GLOW}
                    />
                  )}
                  <Rect
                    x={pos.x - 10}
                    y={pos.y - 10}
                    width={20}
                    height={20}
                    transform={`rotate(45, ${pos.x}, ${pos.y})`}
                    fill={isSnapped || isTarget ? NEON : Colors.primaryLight}
                    stroke={isSnapped || isTarget ? NEON : Colors.primary}
                    strokeWidth={isSnapped ? 3 : isTarget ? 2 : 1.5}
                  />
                </React.Fragment>
              );
            })}

            {/* ランナーの軌跡ライン + 円 */}
            {editable.map((adv) => {
              const isOut = adv.outcome === 'out_tag' || adv.outcome === 'out_force';
              const isDraggingThis = draggingRunnerId === adv.runnerId;
              const runnerColor = RUNNER_COLORS[adv.fromBase] ?? Colors.primary;
              const dimmed = !!draggingRunnerId && !isDraggingThis;

              const destOffset = destinationOffsets[adv.runnerId] ?? { dx: 0, dy: 0 };
              const displayBase = getRunnerDisplayBase(adv);
              const displayPosRaw = BASE_POS[displayBase] ?? BASE_POS[adv.fromBase];
              const displayPos = {
                x: displayPosRaw.x + destOffset.dx,
                y: displayPosRaw.y + destOffset.dy,
              };

              const circlePos = isDraggingThis && dragPos ? dragPos : displayPos;

              const pathTarget: BaseTarget = isDraggingThis && activeBase
                ? activeBase
                : isOut
                  ? 'out'
                  : adv.targetBase;
              const pathLegs = isOut ? [] : getPathLegs(adv.fromBase, pathTarget);

              return (
                <React.Fragment key={adv.runnerId}>
                  {!isOut && pathLegs.map((leg, i) => {
                    const legOffset = segmentLineOffsets[leg.segmentKey]?.[adv.runnerId] ?? 0;
                    const { x1, y1, x2, y2 } = legOffset !== 0
                      ? offsetLinePerpendicular(leg.from, leg.to, legOffset)
                      : { x1: leg.from.x, y1: leg.from.y, x2: leg.to.x, y2: leg.to.y };
                    const isLastLeg = i === pathLegs.length - 1;
                    return (
                      <Line
                        key={`${adv.runnerId}-leg-${i}`}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={runnerColor}
                        strokeWidth={PATH_STROKE_WIDTH}
                        opacity={dimmed ? 0.35 : isLastLeg ? 1 : 0.7}
                      />
                    );
                  })}
                  <Circle
                    cx={circlePos.x}
                    cy={circlePos.y}
                    r={isDraggingThis ? 15 : 12}
                    fill={isOut ? Colors.secondary : runnerColor}
                    stroke={isDraggingThis ? '#FFFFFF' : isOut ? runnerColor : '#FFFFFF'}
                    strokeWidth={isDraggingThis ? 3 : 2}
                    opacity={dimmed ? 0.35 : 1}
                  />
                  <SvgText
                    x={circlePos.x}
                    y={circlePos.y + 4}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight="bold"
                    fill="#FFF"
                    opacity={dimmed ? 0.35 : 1}
                  >
                    {adv.playerName.slice(0, 2)}
                  </SvgText>
                </React.Fragment>
              );
            })}
          </Svg>
        </View>

        <Text style={styles.hint}>{'走者をドラッグして塁を選択'}</Text>

        {showBatterReasonButtons && (
          <View style={styles.batterReasonSection}>
            <Text style={styles.batterReasonLabel}>{t.advancement.batterAdvancementReasonLabel}</Text>
            <View style={styles.batterReasonRow}>
              {BATTER_ADVANCEMENT_REASONS.map((reason) => {
                const isActive = batterAdvancementReasons.includes(reason.key);
                return (
                  <TouchableOpacity
                    key={reason.key}
                    style={[
                      styles.batterReasonBtn,
                      { borderColor: reason.color },
                      isActive && { backgroundColor: reason.color },
                    ]}
                    onPress={() => toggleBatterReason(reason.key)}
                  >
                    <Text style={[
                      styles.batterReasonBtnText,
                      { color: isActive ? '#FFF' : reason.color },
                    ]}>
                      {(t.advancement as Record<string, string>)[reason.labelKey]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ランナーリスト */}
        {editable.map((adv) => {
          const isExpanded = expandedRunner === adv.runnerId;
          // 犠打・犠飛は打者が必ずアウト（固定）。通常の打球アウトはフォース/タッチを変更可能
          const isSacrificeOut = adv.fromBase === 'batter' && result === 'sacrifice_fly';
          const isBatterRegularOut = adv.fromBase === 'batter' &&
            (adv.outcome === 'out_force' || adv.outcome === 'out_tag') &&
            !isSacrificeOut &&
            result !== 'sacrifice_bunt' &&
            result !== 'flyout' &&
            result !== 'lineout';
          const isBatterOut = isSacrificeOut || (adv.fromBase === 'batter' && result === 'flyout');
          const canTagUp = isFlyBall && adv.fromBase !== 'batter' && !isBatterOut;
          const isTaggingUp = adv.action === 'tag_up';
          const isOut = adv.outcome === 'out_tag' || adv.outcome === 'out_force';
          const beyondMinBase =
            adv.fromBase === 'batter' &&
            adv.minBase !== undefined &&
            adv.minBase !== 'out' &&
            (BASE_ORDER[adv.targetBase as string] ?? 0) > (BASE_ORDER[adv.minBase as string] ?? 0);

          const CardWrapper = canTagUp ? Animated.View : View;
          const cardAnimProps = canTagUp
            ? { style: [styles.runnerCard, styles.runnerCardFlyHighlight, { transform: [{ scale: pulseAnim }] }] }
            : { style: styles.runnerCard };

          return (
            // @ts-ignore
            <CardWrapper key={adv.runnerId} {...cardAnimProps}>
              {/* カードヘッダー行 */}
              <TouchableOpacity
                style={styles.runnerMain}
                onPress={() => {
                  if (isBatterOut) return;
                  setExpandedRunner(isExpanded ? null : adv.runnerId);
                }}
                activeOpacity={(isBatterOut || isBatterRegularOut) ? 1 : 0.6}
              >
                <View style={styles.runnerInfo}>
                  <Text style={styles.runnerName}>{adv.playerName}</Text>
                  <Text style={styles.runnerFrom}>
                    {adv.fromBase === 'batter' ? t.advancement.batter : baseLabel(adv.fromBase as BaseTarget)}
                    {' → '}
                    <Text style={{ color: isOut ? Colors.secondary : Colors.primary, fontWeight: '700' }}>
                      {baseLabel(adv.targetBase)}
                    </Text>
                  </Text>
                </View>
                {/* 進塁理由が選択済みの場合はその理由を表示、未選択は「詳細」ボタン */}
                {!isBatterOut && !isBatterRegularOut && (
                  <TouchableOpacity
                    style={[styles.outcomeBadge, isExpanded && { backgroundColor: Colors.primary }]}
                    onPress={() => setExpandedRunner(isExpanded ? null : adv.runnerId)}
                  >
                    <Text style={[styles.outcomeText, isExpanded && { color: '#fff' }]}>
                      {isReasonSelected(adv) ? reasonLabel(adv) : `詳細 ${isExpanded ? '▲' : '▼'}`}
                    </Text>
                  </TouchableOpacity>
                )}
                {(isBatterOut || isBatterRegularOut) && (
                  <View style={[styles.outcomeBadge, { backgroundColor: reasonColor(adv) }]}>
                    <Text style={styles.outcomeText}>{reasonLabel(adv)}</Text>
                  </View>
                )}
                {/* タッチアップ: フライ系のみ */}
                {canTagUp && (
                  <TouchableOpacity
                    style={[styles.tagUpBtn, isTaggingUp && styles.tagUpBtnActive]}
                    onPress={() => toggleTagUp(adv.runnerId)}
                  >
                    <Text style={[styles.tagUpText, isTaggingUp && styles.tagUpTextActive]}>タグ</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>


              {/* フォース/タッチ切り替え（通常打球アウトの打者行） */}
              {isBatterRegularOut && (
                <View style={styles.outTypeRow}>
                  <TouchableOpacity
                    style={[styles.outTypeBtn, adv.outcome === 'out_force' && styles.outTypeBtnActive]}
                    onPress={() => setReason(adv.runnerId, 'batted_ball', 'out_force')}
                  >
                    <Text style={[styles.outTypeBtnText, adv.outcome === 'out_force' && styles.outTypeBtnTextActive]}>
                      フォースアウト
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.outTypeBtn, adv.outcome === 'out_tag' && styles.outTypeBtnActive]}
                    onPress={() => setReason(adv.runnerId, 'batted_ball', 'out_tag')}
                  >
                    <Text style={[styles.outTypeBtnText, adv.outcome === 'out_tag' && styles.outTypeBtnTextActive]}>
                      タッチアウト
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* 理由サブメニュー — フライアウト走者は常時表示、ヒット時の打者超過進塁はダイヤモンド下で選択 */}
              {isExpanded && !isBatterOut && !isBatterRegularOut && (
                <View style={styles.subMenu}>
                  <Text style={styles.subLabel}>{t.advancement.title}:</Text>
                  <View style={styles.subRow}>
                    {ADVANCEMENT_REASONS.map((reason) => {
                      const isActive = isReasonActive(adv, reason);
                      return (
                        <TouchableOpacity
                          key={`${reason.action}-${reason.outcome}-${reason.labelKey}`}
                          style={[
                            styles.subBtn,
                            { borderColor: reason.color },
                            isActive && { backgroundColor: reason.color },
                          ]}
                          onPress={() => setReason(adv.runnerId, reason.action, reason.outcome, reason.outDetail)}
                        >
                          <Text style={[
                            styles.subBtnText,
                            { color: isActive ? '#FFF' : reason.color },
                          ]}>
                            {(t.advancement as Record<string, string>)[reason.labelKey]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </CardWrapper>
          );
        })}

        {/* バリデーションエラー */}
        {validationError && (
          <Text style={styles.errorText}>{validationError}</Text>
        )}

        {/* ボタン */}
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelText}>{t.advancement.cancel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmBtn, !!validationError && styles.confirmDisabled]}
            onPress={handleConfirm}
            disabled={!!validationError}
          >
            <Text style={styles.confirmText}>{t.advancement.confirm}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* セーフ/アウト ダイアログ */}
      <Portal>
        <Modal
          visible={!!safeOutDialog}
          onDismiss={() => setSafeOutDialog(null)}
          contentContainerStyle={styles.dialogContainer}
        >
          <Text style={styles.dialogTitle}>{t.advancement.safeOrOut}</Text>
          {safeOutDialog && (
            <Text style={styles.dialogSubtitle}>
              {baseLabel(safeOutDialog.base)}
            </Text>
          )}
          <View style={styles.dialogBtnRow}>
            <TouchableOpacity style={styles.safeDialogBtn} onPress={handleSafeSelected}>
              <Text style={styles.safeDialogBtnText}>✓ {t.advancement.safeBtn}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.outDialogBtn} onPress={handleOutSelected}>
              <Text style={styles.outDialogBtnText}>✗ {t.advancement.outBtn}</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      </Portal>

      {/* アウト詳細ダイアログ */}
      <Portal>
        <Modal
          visible={!!outDetailDialog}
          onDismiss={() => setOutDetailDialog(null)}
          contentContainerStyle={styles.dialogContainer}
        >
          <Text style={styles.dialogTitle}>{t.advancement.outDetailTitle}</Text>
          {(() => {
            const runner = outDetailDialog
              ? editable.find((r) => r.runnerId === outDetailDialog.runnerId)
              : null;
            const details = runner?.action === 'tag_up'
              ? [...OUT_DETAILS].sort((a, b) => {
                  if (a.key === 'tag_up_fail') return -1;
                  if (b.key === 'tag_up_fail') return 1;
                  return 0;
                })
              : OUT_DETAILS;
            return details.map(({ key, labelKey }) => (
              <TouchableOpacity
                key={key}
                style={styles.outDetailBtn}
                onPress={() => handleOutDetailSelected(key)}
              >
                <Text style={styles.outDetailBtnText}>
                  {(t.advancement as Record<string, string>)[labelKey]}
                </Text>
              </TouchableOpacity>
            ));
          })()}
          <TouchableOpacity style={styles.outDetailCancelBtn} onPress={() => setOutDetailDialog(null)}>
            <Text style={styles.cancelText}>{t.advancement.cancel}</Text>
          </TouchableOpacity>
        </Modal>
      </Portal>
    </>
  );
}

// ============================================================
// スタイル
// ============================================================

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: DARK_BG },
  content: { paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  headerDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  resultText: {
    fontSize: Typography.h3,
    fontWeight: '900',
    color: Colors.primary,
  },
  fieldingText: {
    fontSize: Typography.h4,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  subtitle: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },

  diamondWrap: {
    alignSelf: 'center',
    width: DIAMOND_SIZE,
    height: DIAMOND_SIZE,
    // PanResponder のヒットエリアを確保
    overflow: 'hidden',
  },
  hint: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },

  batterReasonSection: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: CARD_BG,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  batterReasonLabel: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  batterReasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  batterReasonBtn: {
    borderWidth: 1.5,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  batterReasonBtnText: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
  },

  // ランナーカード
  runnerCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
    backgroundColor: CARD_BG,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  runnerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  runnerInfo: { flex: 1 },
  runnerName: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.text,
  },
  runnerFrom: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
  },
  outcomeBadge: {
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  outcomeText: {
    fontSize: Typography.tiny,
    fontWeight: '700',
    color: Colors.white,
  },

  // サブメニュー
  subMenu: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.primaryLight,
  },
  subLabel: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    marginBottom: 4,
  },
  subRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  subBtn: {
    borderWidth: 1.5,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  subBtnText: {
    fontSize: Typography.tiny,
    fontWeight: '700',
  },

  errorText: {
    color: Colors.error,
    fontSize: Typography.caption,
    textAlign: 'center',
    marginVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },

  // ボタン
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  cancelBtn: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  cancelText: {
    color: Colors.textSecondary,
    fontSize: Typography.body,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  confirmDisabled: { opacity: 0.3 },
  confirmText: {
    color: Colors.white,
    fontSize: Typography.body,
    fontWeight: '800',
  },

  // フライボール強調
  runnerCardFlyHighlight: {
    borderColor: '#FFD700',
    borderWidth: 2,
    shadowColor: '#FFD700',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },

  // タッチアップボタン
  tagUpBtn: {
    borderWidth: 1.5,
    borderColor: '#FFD700',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'transparent',
    marginLeft: 2,
  },
  tagUpBtnActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  tagUpText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFD700',
  },
  tagUpTextActive: {
    color: '#1A1A1A',
  },

  // ダイアログ共通
  dialogContainer: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.xl,
    marginHorizontal: Spacing.xl,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dialogTitle: {
    fontSize: Typography.h4,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  dialogSubtitle: {
    fontSize: Typography.body,
    color: Colors.primary,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  dialogBtnRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  safeDialogBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
  },
  safeDialogBtnText: {
    color: Colors.white,
    fontSize: Typography.body,
    fontWeight: '800',
  },
  outDialogBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
  },
  outDialogBtnText: {
    color: Colors.white,
    fontSize: Typography.body,
    fontWeight: '800',
  },

  // アウト詳細ダイアログ
  outDetailBtn: {
    paddingVertical: 13,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceGray,
    marginBottom: Spacing.xs,
    alignItems: 'center',
  },
  outDetailBtnText: {
    fontSize: Typography.body,
    fontWeight: '600',
    color: Colors.text,
  },
  outDetailCancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },

  // フォース/タッチアウト切り替え
  outTypeRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingTop: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  outTypeBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceGray,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  outTypeBtnActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  outTypeBtnText: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  outTypeBtnTextActive: {
    color: Colors.primary,
  },
});
