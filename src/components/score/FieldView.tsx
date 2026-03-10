import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useI18n } from '../../i18n';
import type { BallparkInfo, BattedBallType, BattedBall, AtBatResult } from '../../types/game';

// ============================================================
// 定数
// ============================================================

const SCREEN_W = Dimensions.get('window').width;
const FIELD_SIZE = Math.min(SCREEN_W - 16, 400);
const CENTER_X = FIELD_SIZE / 2;
const CENTER_Y = FIELD_SIZE - 20;
// レイアウト修正: 旧 FIELD_SIZE-40 ではファウル領域がキャンバス外にはみ出す
const FIELD_RADIUS = Math.floor(FIELD_SIZE * 0.59);

const ANGLE_LEFT = (-135 * Math.PI) / 180;
const ANGLE_RIGHT = (-45 * Math.PI) / 180;
const ANGLE_CENTER = (-90 * Math.PI) / 180;
// ファウルゾーン: ±12° (旧 ±30° → クリッピング解消)
const FOUL_ANGLE_LEFT = (-147 * Math.PI) / 180;
const FOUL_ANGLE_RIGHT = (-33 * Math.PI) / 180;

const CROSSHAIR_COLOR = '#FF9800';
const CONFIRM_COLOR = '#FFD700';
const MAGNIFIER_SIZE = 120;
const MAG_RANGE = 55;

// ============================================================
// 公認野球規則ダイヤモンド (正方形)
// ============================================================
const NINETY_FT = 27.431;
const MOUND_DIST = 18.44;
const DEFAULT_CF = 122;
const PX_PER_M = FIELD_RADIUS / DEFAULT_CF;
const SIDE_PX = NINETY_FT * PX_PER_M;
const C45 = Math.SQRT2 / 2;

const BASES = {
  home:   { x: CENTER_X, y: CENTER_Y },
  first:  { x: CENTER_X + SIDE_PX * C45, y: CENTER_Y - SIDE_PX * C45 },
  second: { x: CENTER_X, y: CENTER_Y - SIDE_PX * Math.SQRT2 },
  third:  { x: CENTER_X - SIDE_PX * C45, y: CENTER_Y - SIDE_PX * C45 },
};
const PITCHER = { x: CENTER_X, y: CENTER_Y - MOUND_DIST * PX_PER_M };

const BATTED_TYPE_KEYS: BattedBallType[] = ['grounder', 'liner', 'fly', 'popup'];
const DIST_TYPES: BattedBallType[] = ['fly', 'popup', 'liner'];

const HIT_RESULTS: { result: AtBatResult; color: string }[] = [
  { result: 'single', color: '#1565C0' },
  { result: 'double', color: '#1565C0' },
  { result: 'triple', color: '#1565C0' },
  { result: 'home_run', color: '#6A1B9A' },
];
const OUT_RESULTS: { result: AtBatResult; color: string }[] = [
  { result: 'groundout', color: '#E53935' },
  { result: 'flyout', color: '#E53935' },
  { result: 'lineout', color: '#E53935' },
  { result: 'pop_out', color: '#E53935' },
  { result: 'sacrifice_bunt', color: '#EF6C00' },
  { result: 'sacrifice_fly', color: '#EF6C00' },
  { result: 'fielders_choice', color: '#FF8F00' },
  { result: 'double_play', color: '#B71C1C' },
  { result: 'error', color: '#795548' },
];
const FOUL_RESULTS: { result: AtBatResult; color: string }[] = [
  { result: 'flyout', color: '#E53935' },
  { result: 'pop_out', color: '#E53935' },
  { result: 'error', color: '#795548' },
];

// ============================================================
// 事前計算 SVG パス
// ============================================================

function makeArc(a1: number, a2: number, r = FIELD_RADIUS): string {
  const x1 = CENTER_X + r * Math.cos(a1);
  const y1 = CENTER_Y + r * Math.sin(a1);
  const x2 = CENTER_X + r * Math.cos(a2);
  const y2 = CENTER_Y + r * Math.sin(a2);
  return `M ${CENTER_X} ${CENTER_Y} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;
}

const FAIR_PATH = makeArc(ANGLE_LEFT, ANGLE_RIGHT);
const FOUL_L_PATH = makeArc(FOUL_ANGLE_LEFT, ANGLE_LEFT);
const FOUL_R_PATH = makeArc(ANGLE_RIGHT, FOUL_ANGLE_RIGHT);

const FLL = FIELD_RADIUS + 8;
const FL = {
  left:  { x: CENTER_X + FLL * Math.cos(ANGLE_LEFT),  y: CENTER_Y + FLL * Math.sin(ANGLE_LEFT) },
  right: { x: CENTER_X + FLL * Math.cos(ANGLE_RIGHT), y: CENTER_Y + FLL * Math.sin(ANGLE_RIGHT) },
};

const LR = FIELD_RADIUS + 10;
const LBL = {
  left:   { x: CENTER_X + LR * Math.cos(ANGLE_LEFT + 0.08),   y: CENTER_Y + LR * Math.sin(ANGLE_LEFT + 0.08) },
  center: { x: CENTER_X + LR * Math.cos(ANGLE_CENTER),        y: CENTER_Y + LR * Math.sin(ANGLE_CENTER) },
  right:  { x: CENTER_X + LR * Math.cos(ANGLE_RIGHT - 0.08),  y: CENTER_Y + LR * Math.sin(ANGLE_RIGHT - 0.08) },
};

const FOUL_LBL = {
  left:  { x: CENTER_X + FIELD_RADIUS * 0.5 * Math.cos(FOUL_ANGLE_LEFT + 0.15),  y: CENTER_Y + FIELD_RADIUS * 0.5 * Math.sin(FOUL_ANGLE_LEFT + 0.15) },
  right: { x: CENTER_X + FIELD_RADIUS * 0.5 * Math.cos(FOUL_ANGLE_RIGHT - 0.15), y: CENTER_Y + FIELD_RADIUS * 0.5 * Math.sin(FOUL_ANGLE_RIGHT - 0.15) },
};

// 初期クロスヘア: キャンバス中央 (zoom=1 で全フィールド表示)
const INITIAL_TARGET = { x: CENTER_X, y: FIELD_SIZE / 2 };

// SVG viewBox (固定)
const SVG_VB = `0 0 ${FIELD_SIZE} ${FIELD_SIZE}`;

// Worklet用 clamp
function clamp(v: number, min: number, max: number): number {
  'worklet';
  return Math.max(min, Math.min(max, v));
}

// ============================================================
// ヘルパー
// ============================================================

function checkFoul(svgX: number, svgY: number): boolean {
  const dx = svgX - CENTER_X;
  const dy = svgY - CENTER_Y;
  if (dy > 10) return true;
  const angle = Math.atan2(dy, dx);
  return angle < ANGLE_LEFT || angle > ANGLE_RIGHT;
}

function hasFenceData(bp: BallparkInfo): boolean {
  const { left, center, right } = bp.fenceDistance;
  return left > 0 && center > 0 && right > 0;
}

function calcDist(svgX: number, svgY: number, bp: BallparkInfo): number {
  if (!hasFenceData(bp)) return 0;
  const dx = svgX - CENTER_X;
  const dy = svgY - CENTER_Y;
  const pxDist = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const norm = Math.min(pxDist / FIELD_RADIUS, 1.0);
  const { left, center, right } = bp.fenceDistance;
  let fd: number;
  if (angle < ANGLE_LEFT) fd = left;
  else if (angle > ANGLE_RIGHT) fd = right;
  else if (angle <= ANGLE_CENTER) {
    const tt = (angle - ANGLE_LEFT) / (ANGLE_CENTER - ANGLE_LEFT);
    fd = left + (center - left) * Math.max(0, Math.min(1, tt));
  } else {
    const tt = (angle - ANGLE_CENTER) / (ANGLE_RIGHT - ANGLE_CENTER);
    fd = center + (right - center) * Math.max(0, Math.min(1, tt));
  }
  return Math.round(norm * fd);
}

// ============================================================
// フィールドSVG (メイン・マグニファイア共用)
// ============================================================

function FieldSvgContent({ ballpark }: { ballpark: BallparkInfo }) {
  return (
    <>
      {/* ファウル領域 */}
      <Path d={FOUL_L_PATH} fill="#8D6E63" opacity={0.1} />
      <Path d={FOUL_L_PATH} fill="none" stroke="#8D6E63" strokeWidth={1} strokeDasharray="4,4" />
      <Path d={FOUL_R_PATH} fill="#8D6E63" opacity={0.1} />
      <Path d={FOUL_R_PATH} fill="none" stroke="#8D6E63" strokeWidth={1} strokeDasharray="4,4" />

      {/* フェアグラウンド */}
      <Path d={FAIR_PATH} fill="#43A047" opacity={0.25} />
      <Path d={FAIR_PATH} fill="none" stroke="#2E7D32" strokeWidth={2} />

      {/* ファウルライン (ネイビー薄: ダーク背景で視認) */}
      <Line x1={CENTER_X} y1={CENTER_Y} x2={FL.left.x}  y2={FL.left.y}  stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} />
      <Line x1={CENTER_X} y1={CENTER_Y} x2={FL.right.x} y2={FL.right.y} stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} />

      {/* ダイヤモンド (正方形: 塁間90ft) */}
      <Line x1={BASES.home.x}   y1={BASES.home.y}   x2={BASES.first.x}  y2={BASES.first.y}  stroke="#8D6E63" strokeWidth={1.5} />
      <Line x1={BASES.first.x}  y1={BASES.first.y}  x2={BASES.second.x} y2={BASES.second.y} stroke="#8D6E63" strokeWidth={1.5} />
      <Line x1={BASES.second.x} y1={BASES.second.y} x2={BASES.third.x}  y2={BASES.third.y}  stroke="#8D6E63" strokeWidth={1.5} />
      <Line x1={BASES.third.x}  y1={BASES.third.y}  x2={BASES.home.x}   y2={BASES.home.y}   stroke="#8D6E63" strokeWidth={1.5} />

      {/* ベース */}
      <Circle cx={BASES.home.x}   cy={BASES.home.y}   r={5} fill="#8D6E63" />
      <Circle cx={BASES.first.x}  cy={BASES.first.y}  r={4} fill="white" stroke="#8D6E63" strokeWidth={1} />
      <Circle cx={BASES.second.x} cy={BASES.second.y} r={4} fill="white" stroke="#8D6E63" strokeWidth={1} />
      <Circle cx={BASES.third.x}  cy={BASES.third.y}  r={4} fill="white" stroke="#8D6E63" strokeWidth={1} />

      {/* 投手板 (60ft6in) */}
      <Circle cx={PITCHER.x} cy={PITCHER.y} r={3} fill="#8D6E63" opacity={0.7} />

      {/* フェンス距離ラベル (データがある場合のみ) */}
      {hasFenceData(ballpark) && (
        <>
          <SvgText x={LBL.left.x}   y={LBL.left.y}   textAnchor="middle" fontSize={10} fill="#666">{ballpark.fenceDistance.left}m</SvgText>
          <SvgText x={LBL.center.x} y={LBL.center.y} textAnchor="middle" fontSize={10} fill="#666">{ballpark.fenceDistance.center}m</SvgText>
          <SvgText x={LBL.right.x}  y={LBL.right.y}  textAnchor="middle" fontSize={10} fill="#666">{ballpark.fenceDistance.right}m</SvgText>
        </>
      )}

      {/* FOULラベル */}
      <SvgText x={FOUL_LBL.left.x}  y={FOUL_LBL.left.y}  textAnchor="middle" fontSize={11} fill="#8D6E63" fontWeight="600" opacity={0.6}>FOUL</SvgText>
      <SvgText x={FOUL_LBL.right.x} y={FOUL_LBL.right.y} textAnchor="middle" fontSize={11} fill="#8D6E63" fontWeight="600" opacity={0.6}>FOUL</SvgText>
    </>
  );
}

// ============================================================
// Props
// ============================================================

interface FieldViewProps {
  ballpark: BallparkInfo;
  onConfirm: (result: AtBatResult, battedBall: BattedBall) => void;
  onCancel: () => void;
}

// ============================================================
// メインコンポーネント
// ============================================================

export default function FieldView({ ballpark, onConfirm, onCancel }: FieldViewProps) {
  const { t } = useI18n();

  // --- React State (JSスレッド) ---
  const [isDragging, setIsDragging] = useState(false);
  const [battedType, setBattedType] = useState<BattedBallType>('fly');
  const [confirmedPos, setConfirmedPos] = useState<{
    x: number; y: number; foul: boolean; dist: number;
  } | null>(null);
  const [magTarget, setMagTarget] = useState<{ x: number; y: number } | null>(null);
  const [zoomDisplay, setZoomDisplay] = useState(1);

  // --- Reanimated Shared Values (UIスレッド) ---
  const targetX = useSharedValue(INITIAL_TARGET.x);
  const targetY = useSharedValue(INITIAL_TARGET.y);
  const savedX = useSharedValue(INITIAL_TARGET.x);
  const savedY = useSharedValue(INITIAL_TARGET.y);
  const zoomSV = useSharedValue(1);
  const hasMoved = useSharedValue(false);

  // ダブルタップ検出
  const lastTapTs = useRef(0);

  const showDistance = DIST_TYPES.includes(battedType);

  // --- JS スレッドコールバック (runOnJSから呼び出し) ---
  const onDragStart = useCallback(() => {
    setIsDragging(true);
    setConfirmedPos(null);
  }, []);

  const onDragUpdate = useCallback((x: number, y: number) => {
    setMagTarget({ x, y });
  }, []);

  const onDragEnd = useCallback(() => {
    setIsDragging(false);
    setMagTarget(null);
  }, []);

  const onTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapTs.current < 300) {
      // ダブルタップ → ズーム切替
      const next = zoomSV.value >= 3 ? 1 : zoomSV.value + 1;
      zoomSV.value = next;
      setZoomDisplay(next);
      setConfirmedPos(null);
      if (next === 1) {
        targetX.value = INITIAL_TARGET.x;
        targetY.value = INITIAL_TARGET.y;
      }
      lastTapTs.current = 0;
    } else {
      lastTapTs.current = now;
    }
  }, [targetX, targetY, zoomSV]);

  // --- Gesture.Pan (UIスレッドで座標更新 → 再レンダリングなし) ---
  const panGesture = Gesture.Pan()
    .minDistance(0)
    .shouldCancelWhenOutside(false)
    .onStart(() => {
      'worklet';
      savedX.value = targetX.value;
      savedY.value = targetY.value;
      hasMoved.value = false;
    })
    .onUpdate((e) => {
      'worklet';
      if (Math.abs(e.translationX) > 3 || Math.abs(e.translationY) > 3) {
        if (!hasMoved.value) {
          hasMoved.value = true;
          runOnJS(onDragStart)();
        }
        const z = zoomSV.value;
        targetX.value = clamp(
          savedX.value - e.translationX / z,
          -20, FIELD_SIZE + 20,
        );
        targetY.value = clamp(
          savedY.value - e.translationY / z,
          -20, CENTER_Y + 10,
        );
        runOnJS(onDragUpdate)(targetX.value, targetY.value);
      }
    })
    .onEnd((e) => {
      'worklet';
      if (hasMoved.value) {
        runOnJS(onDragEnd)();
      } else {
        // 移動なし → タップ判定
        runOnJS(onTap)();
      }
    });

  // --- フィールドのアニメーションスタイル (UIスレッド) ---
  // SVG座標 (targetX, targetY) がコンテナ中央に来るように変換
  // RN transform は配列左→右で合成、右端が先に適用:
  //   scale(z) → translate → 結果: screen = (svg - target) * z + center
  const animatedFieldStyle = useAnimatedStyle(() => {
    const z = zoomSV.value;
    return {
      transform: [
        { translateX: -(targetX.value - FIELD_SIZE / 2) * z },
        { translateY: -(targetY.value - FIELD_SIZE / 2) * z },
        { scale: z },
      ],
    };
  });

  // --- ズームボタン ---
  const handleZoomIn = useCallback(() => {
    if (zoomSV.value >= 3) return;
    zoomSV.value = zoomSV.value + 1;
    setZoomDisplay(zoomSV.value);
    setConfirmedPos(null);
  }, [zoomSV]);

  const handleZoomOut = useCallback(() => {
    if (zoomSV.value <= 1) return;
    zoomSV.value = zoomSV.value - 1;
    setZoomDisplay(zoomSV.value);
    if (zoomSV.value === 1) {
      targetX.value = INITIAL_TARGET.x;
      targetY.value = INITIAL_TARGET.y;
    }
    setConfirmedPos(null);
  }, [zoomSV, targetX, targetY]);

  // --- 確定ボタン ---
  const handleConfirmPosition = useCallback(() => {
    const svgX = targetX.value;
    const svgY = targetY.value;
    const foul = checkFoul(svgX, svgY);
    const dist = showDistance ? calcDist(svgX, svgY, ballpark) : 0;
    setConfirmedPos({ x: svgX, y: svgY, foul, dist });
  }, [ballpark, showDistance, targetX, targetY]);

  // --- 結果選択 ---
  const handleResult = useCallback((result: AtBatResult) => {
    if (!confirmedPos) return;
    const battedBall: BattedBall = {
      type: battedType,
      fieldX: confirmedPos.x / FIELD_SIZE,
      fieldY: confirmedPos.y / FIELD_SIZE,
      estimatedDistance: confirmedPos.dist,
    };
    onConfirm(result, battedBall);
  }, [battedType, confirmedPos, onConfirm]);

  // --- マグニファイア viewBox ---
  const magVB = magTarget
    ? `${magTarget.x - MAG_RANGE / 2} ${magTarget.y - MAG_RANGE / 2} ${MAG_RANGE} ${MAG_RANGE}`
    : SVG_VB;

  const liveDist = isDragging && magTarget && showDistance
    ? calcDist(magTarget.x, magTarget.y, ballpark) : 0;
  const liveFoul = isDragging && magTarget
    ? checkFoul(magTarget.x, magTarget.y) : false;

  const chColor = confirmedPos
    ? (confirmedPos.foul ? '#FF9800' : '#F44336')
    : CROSSHAIR_COLOR;

  return (
    <ScrollView style={styles.wrapper} contentContainerStyle={styles.wrapperContent} showsVerticalScrollIndicator={false}>
      {/* タイトル + ズーム */}
      <View style={styles.topRow}>
        <Text style={styles.title}>{t.live.fieldTitle}</Text>
        <Text style={styles.zoomBadge}>{zoomDisplay}x</Text>
      </View>

      {/* 打球種類 */}
      <View style={styles.typeRow}>
        {BATTED_TYPE_KEYS.map((tp) => (
          <TouchableOpacity
            key={tp}
            style={[styles.typeBtn, battedType === tp && styles.typeBtnActive]}
            onPress={() => { setBattedType(tp); setConfirmedPos(null); }}
          >
            <Text style={[styles.typeLabel, battedType === tp && styles.typeLabelActive]}>
              {t.battedBallTypes[tp]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ===== フィールド + マグニファイア ===== */}
      <View style={styles.fieldSection}>
        {/* マグニファイア (フィールド上に絶対配置) */}
        {isDragging && magTarget && (
          <View style={styles.magOverlay} pointerEvents="none">
            <View style={styles.magCircle}>
              <Svg width={MAGNIFIER_SIZE} height={MAGNIFIER_SIZE} viewBox={magVB}>
                <FieldSvgContent ballpark={ballpark} />
                <Line
                  x1={magTarget.x - MAG_RANGE * 0.35} y1={magTarget.y}
                  x2={magTarget.x + MAG_RANGE * 0.35} y2={magTarget.y}
                  stroke={CROSSHAIR_COLOR} strokeWidth={0.8} opacity={0.7}
                />
                <Line
                  x1={magTarget.x} y1={magTarget.y - MAG_RANGE * 0.35}
                  x2={magTarget.x} y2={magTarget.y + MAG_RANGE * 0.35}
                  stroke={CROSSHAIR_COLOR} strokeWidth={0.8} opacity={0.7}
                />
                <Circle cx={magTarget.x} cy={magTarget.y} r={1.5} fill={CROSSHAIR_COLOR} />
              </Svg>
            </View>
            <Text style={[styles.magLabel, liveFoul && styles.magLabelFoul]}>
              {liveDist > 0 ? `${liveDist}m` : ''}{liveFoul ? ' FOUL' : ''}
            </Text>
          </View>
        )}

        {/* GestureDetector でドラッグ操作を捕捉 */}
        <GestureDetector gesture={panGesture}>
          <View style={styles.fieldWrap}>
            {/* Animated.View: UIスレッドで transform 更新 (再レンダリングなし) */}
            <Animated.View style={[styles.fieldInner, animatedFieldStyle]}>
              <Svg width={FIELD_SIZE} height={FIELD_SIZE} viewBox={SVG_VB}>
                <FieldSvgContent ballpark={ballpark} />
              </Svg>
            </Animated.View>

            {/* Viewクロスヘア・オーバーレイ (固定位置、transformの影響を受けない) */}
            <View style={styles.chOverlay} pointerEvents="none">
              <View style={[styles.chH, { backgroundColor: chColor }]} />
              <View style={[styles.chV, { backgroundColor: chColor }]} />
              <View style={[styles.chDot, { backgroundColor: chColor }]} />
              {confirmedPos && (
                <View style={[styles.chRing, { borderColor: chColor }]} />
              )}
            </View>
          </View>
        </GestureDetector>

        {/* ズームボタン (GestureDetector外 → タッチ干渉なし) */}
        <View style={styles.zoomBtns}>
          <TouchableOpacity style={styles.zoomBtn} onPress={handleZoomIn} disabled={zoomDisplay >= 3}>
            <MaterialCommunityIcons name="plus" size={20} color={zoomDisplay >= 3 ? 'rgba(255,255,255,0.3)' : Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomBtn} onPress={handleZoomOut} disabled={zoomDisplay <= 1}>
            <MaterialCommunityIcons name="minus" size={20} color={zoomDisplay <= 1 ? 'rgba(255,255,255,0.3)' : Colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ===== 確定ボタン (未確定時) ===== */}
      {!confirmedPos && (
        <TouchableOpacity
          style={[styles.confirmBtn, isDragging && styles.confirmBtnDragging]}
          onPress={handleConfirmPosition}
          activeOpacity={0.7}
          disabled={isDragging}
        >
          <Text style={[styles.confirmBtnText, isDragging && styles.confirmBtnTextDragging]}>
            {t.live.confirmPosition}
          </Text>
        </TouchableOpacity>
      )}

      {/* ===== 確定後: 距離 + 結果選択 ===== */}
      {confirmedPos && (
        <View style={styles.confirmedSection}>
          {showDistance && confirmedPos.dist > 0 && (
            <Text style={styles.distText}>
              {t.live.estimatedDistance}: {confirmedPos.dist}{t.common.meter}
              {confirmedPos.foul && <Text style={styles.foulLabel}> (FOUL)</Text>}
            </Text>
          )}

          {!confirmedPos.foul && (
            <>
              <Text style={styles.resultTitle}>{t.live.selectResult}</Text>
              <View style={styles.resultRow}>
                {HIT_RESULTS.map(({ result, color }) => (
                  <TouchableOpacity key={result} style={[styles.resultBtn, { backgroundColor: color }]}
                    onPress={() => handleResult(result)}>
                    <Text style={styles.resultBtnText}>{t.atBatResults[result]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.resultRow}>
                {OUT_RESULTS.map(({ result, color }) => (
                  <TouchableOpacity key={result} style={[styles.resultBtn, { backgroundColor: color }]}
                    onPress={() => handleResult(result)}>
                    <Text style={styles.resultBtnText}>{t.atBatResults[result]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {confirmedPos.foul && (
            <>
              <Text style={styles.foulTitle}>FOUL</Text>
              <View style={styles.resultRow}>
                {FOUL_RESULTS.map(({ result, color }) => (
                  <TouchableOpacity key={result} style={[styles.resultBtn, { backgroundColor: color }]}
                    onPress={() => handleResult(result)}>
                    <Text style={styles.resultBtnText}>{t.atBatResults[result]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>
      )}

      {/* キャンセル */}
      <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
        <Text style={styles.cancelText}>{t.live.cancel}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ============================================================
// スタイル
// ============================================================

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  wrapperContent: {
    paddingTop: 8,
    paddingBottom: 40,
  },

  topRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.text,
  },
  zoomBadge: {
    fontSize: Typography.caption,
    fontWeight: '800',
    color: CROSSHAIR_COLOR,
    backgroundColor: 'rgba(255,152,0,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },

  typeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  typeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  typeBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  typeLabel: {
    fontSize: Typography.caption,
    fontWeight: '600',
    color: Colors.text,
  },
  typeLabelActive: {
    color: Colors.white,
  },

  fieldSection: {
    alignSelf: 'center',
    width: FIELD_SIZE,
    height: FIELD_SIZE,
    position: 'relative',
  },

  magOverlay: {
    position: 'absolute',
    top: 4,
    left: (FIELD_SIZE - MAGNIFIER_SIZE) / 2,
    zIndex: 10,
    alignItems: 'center',
  },
  magCircle: {
    width: MAGNIFIER_SIZE,
    height: MAGNIFIER_SIZE,
    borderRadius: MAGNIFIER_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: CROSSHAIR_COLOR,
    shadowColor: CROSSHAIR_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
    backgroundColor: '#0D1B2A',   // ネイビー暗め (マグニファイア)
  },
  magLabel: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: CROSSHAIR_COLOR,
    marginTop: 2,
  },
  magLabelFoul: {
    color: '#FF9800',
  },

  fieldWrap: {
    width: FIELD_SIZE,
    height: FIELD_SIZE,
    overflow: 'hidden',
    backgroundColor: '#0D1B2A',   // ネイビーダーク: スタジアム夜空
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
  },

  fieldInner: {
    width: FIELD_SIZE,
    height: FIELD_SIZE,
  },

  chOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chH: {
    position: 'absolute',
    width: 36,
    height: 1.5,
    borderRadius: 1,
    opacity: 0.9,
  },
  chV: {
    position: 'absolute',
    width: 1.5,
    height: 36,
    borderRadius: 1,
    opacity: 0.9,
  },
  chDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.9,
  },
  chRing: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    opacity: 0.5,
  },

  zoomBtns: {
    position: 'absolute',
    right: 6,
    top: 6,
    gap: 4,
    zIndex: 20,
  },
  zoomBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(27,58,92,0.9)',   // ネイビー半透明
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.accent,   // ゴールドボーダー
  },

  confirmBtn: {
    alignSelf: 'center',
    marginTop: Spacing.md,
    paddingVertical: 14,
    paddingHorizontal: 48,
    backgroundColor: CONFIRM_COLOR,
    borderRadius: BorderRadius.md,
    shadowColor: CONFIRM_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  confirmBtnDragging: {
    opacity: 0.3,
    shadowOpacity: 0,
  },
  confirmBtnText: {
    fontSize: Typography.body,
    fontWeight: '900',
    color: Colors.primary,   // ネイビー on ゴールド
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  confirmBtnTextDragging: {
    opacity: 0.5,
  },

  confirmedSection: {
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
  },
  distText: {
    textAlign: 'center',
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  foulLabel: {
    color: '#FF9800',
    fontWeight: '800',
  },
  foulTitle: {
    fontSize: Typography.body,
    fontWeight: '800',
    color: '#FF9800',
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  resultTitle: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  resultRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 6,
  },
  resultBtn: {
    minWidth: 60,
    paddingHorizontal: 6,
    height: 40,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultBtnText: {
    color: Colors.white,
    fontSize: Typography.caption,
    fontWeight: '800',
  },

  cancelBtn: {
    alignSelf: 'center',
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  cancelText: {
    color: Colors.textSecondary,
    fontSize: Typography.body,
    fontWeight: '600',
  },
});
