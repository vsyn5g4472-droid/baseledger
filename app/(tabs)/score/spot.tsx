import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, KeyboardAvoidingView, Platform, FlatList } from 'react-native';
import { Text, TextInput, Button, Portal, Modal } from 'react-native-paper';
import { router, Stack } from 'expo-router';
import { Timestamp } from 'firebase/firestore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Rect, Line, Circle, Polygon, Text as SvgText } from 'react-native-svg';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { useAuth } from '../../../src/contexts/AuthContext';
import { createSpotAtBat, getUserSpotAtBats } from '../../../src/services/spotAtBatService';
import { PITCH_TYPES, DEFAULT_BALLPARK } from '../../../src/types/game';
import FieldView from '../../../src/components/score/FieldView';
import ModalVelocitySlider from '../../../src/components/score/ModalVelocitySlider';
import type { AtBatResult, PitchResult, StrikeZone, PitchType, BattedBall } from '../../../src/types/game';
import type { SpotAtBatPitch } from '../../../src/models/types';

// ── キャンバス定数 ────────────────────────────────────────────────
const SZ_W          = 112;
const SZ_H          = Math.round(SZ_W * 7 / 4);   // 196
const BALL_PAD_H    = 52;
const BALL_PAD_V    = 44;
const CANVAS_W      = SZ_W + 2 * BALL_PAD_H;       // 216
const CANVAS_H      = SZ_H + 2 * BALL_PAD_V;       // 284
const PITCH_COL_W   = 64;
const CURSOR_OFFSET = 50;
const CURSOR_R      = 10;
const BATTER_W      = 100;

const SZ_LEFT  = BALL_PAD_H;
const SZ_TOP   = BALL_PAD_V;
const SZ_RIGHT = BALL_PAD_H + SZ_W;
const SZ_BOT   = BALL_PAD_V + SZ_H;

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

const PITCH_LABELS: Record<string, string> = {
  fastball: 'ストレート', curve: 'カーブ',     slider:    'スライダー',
  changeup: 'チェンジアップ', cutter: 'カットボール', sinker: 'シンカー',
  splitter: 'スプリット',  knuckle: 'ナックル',  fork:      'フォーク',
  shootball: 'シュート',
};

const PITCH_RESULT_ROWS: { result: PitchResult; label: string; color: string }[] = [
  { result: 'ball',            label: 'ボール',    color: '#2E7D9F' },
  { result: 'strike_called',   label: '見逃し',    color: '#C41E3A' },
  { result: 'strike_swinging', label: '空振り',    color: '#9B1528' },
  { result: 'foul',            label: 'ファウル',  color: '#B87A00' },
  { result: 'foul_tip',        label: 'チップ',    color: '#8B5E00' },
  { result: 'in_play',         label: 'インプレー', color: '#38A1F3' },
  { result: 'hit_by_pitch',    label: '死球',      color: '#5A1A5C' },
];

const AT_BAT_RESULTS: { result: AtBatResult; label: string; color: string }[] = [
  { result: 'single',            label: '単打',      color: '#43A047' },
  { result: 'double',            label: '二塁打',    color: '#2E7D32' },
  { result: 'triple',            label: '三塁打',    color: '#1B5E20' },
  { result: 'home_run',          label: '本塁打',    color: '#FFB300' },
  { result: 'strikeout',         label: '三振',      color: '#E53935' },
  { result: 'strikeout_looking', label: '見三振',    color: '#C62828' },
  { result: 'walk',              label: '四球',      color: '#1565C0' },
  { result: 'hit_by_pitch',      label: '死球',      color: '#6A1B9A' },
  { result: 'groundout',         label: 'ゴロ',      color: '#795548' },
  { result: 'flyout',            label: 'フライ',    color: '#5D4037' },
  { result: 'lineout',           label: 'ライナー',  color: '#4E342E' },
  { result: 'sacrifice_bunt',    label: '犠打',      color: '#607D8B' },
  { result: 'sacrifice_fly',     label: '犠飛',      color: '#546E7A' },
  { result: 'error',             label: 'エラー',    color: '#F57C00' },
  { result: 'double_play',       label: '併殺',      color: '#8D6E63' },
];

export default function SpotAtBatScreen() {
  const { currentUser } = useAuth();
  const [step, setStep] = useState<1 | 2>(2);

  // 状況入力 (編集モーダルで管理)
  const [playerName, setPlayerName]   = useState('');
  const [pitcherName, setPitcherName] = useState('');
  const [opponent, setOpponent]       = useState('');
  const [outs, setOuts]               = useState(0);
  const [runners, setRunners]         = useState({ first: false, second: false, third: false });

  // Step 2: 投球記録
  const [pitches, setPitches]             = useState<SpotAtBatPitch[]>([]);
  const [balls, setBalls]                 = useState(0);
  const [strikes, setStrikes]             = useState(0);
  const [selectedPitch, setSelectedPitch] = useState<PitchType | string>(PITCH_TYPES[0]);
  const [isLeftBatter, setIsLeftBatter]   = useState(false);
  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [pendingZone, setPendingZone]       = useState<StrikeZone | null>(null);
  const [pendingCoords, setPendingCoords]   = useState<{ x: number; y: number } | null>(null);
  const [tapCoord, setTapCoord]             = useState<{ px: number; py: number } | null>(null);
  const [isTouching, setIsTouching]         = useState(false);

  // 球速スライダー
  const [modalVelocity, setModalVelocity]               = useState(130);
  const [modalVelocityEnabled, setModalVelocityEnabled] = useState(false);

  // 打球位置
  const [showFieldView, setShowFieldView] = useState(false);
  const [battedBall, setBattedBall]       = useState<BattedBall | null>(null);

  const cursorX = useSharedValue(0);
  const cursorY = useSharedValue(0);
  const cursorStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cursorX.value - CURSOR_R },
      { translateY: cursorY.value - CURSOR_OFFSET - CURSOR_R },
    ],
  }));

  // 確認・保存画面 (旧 Step 3 → 打席結果グリッドなし、メモのみ)
  const [showConfirm, setShowConfirm]   = useState(false);
  const [atBatResult, setAtBatResult]   = useState<AtBatResult | null>(null);
  const [memo, setMemo]                 = useState('');
  const [saving, setSaving]             = useState(false);

  // サジェスト
  const [pastOpponents, setPastOpponents] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // 過去の対戦相手を取得
  useEffect(() => {
    if (!currentUser) return;
    getUserSpotAtBats(currentUser.uid)
      .then((spots) => {
        const unique = [...new Set(spots.map((s) => s.opponent).filter((o): o is string => !!o))];
        setPastOpponents(unique);
      })
      .catch(() => {});
  }, [currentUser]);

  const handleSave = async () => {
    if (!currentUser || !atBatResult) return;
    setSaving(true);
    try {
      await createSpotAtBat(currentUser.uid, {
        playerName:    playerName.trim(),
        pitcherName:   pitcherName.trim(),
        opponent:      opponent.trim() || undefined,
        gameDate:      Timestamp.now(),
        outs,
        runnersOnBase: runners,
        pitches,
        result:        atBatResult,
        battedBall:    battedBall ?? undefined,
        memo:          memo.trim() || undefined,
      });
      Alert.alert('保存完了', 'スポット打席を記録しました', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? '不明なエラー';
      Alert.alert('エラー', `保存に失敗しました: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCanvasTap = useCallback((px: number, py: number) => {
    const zone = coordToZone(px, py);
    setTapCoord({ px, py });
    setPendingCoords({ x: px / CANVAS_W, y: py / CANVAS_H });
    setPendingZone(zone);
    setResultModalVisible(true);
  }, []);

  const handlePitchResultSelect = useCallback((result: PitchResult) => {
    if (!pendingZone) return;
    setResultModalVisible(false);

    const pitchNumber = pitches.length + 1;
    const countBefore = { balls, strikes, outs };
    let newBalls   = balls;
    let newStrikes = strikes;

    if (result === 'ball') {
      newBalls = balls + 1;
    } else if (result === 'strike_called' || result === 'strike_swinging') {
      newStrikes = strikes + 1;
    } else if (result === 'foul' || result === 'foul_tip') {
      if (strikes < 2) newStrikes = strikes + 1;
    }

    const countAfter = { balls: newBalls, strikes: newStrikes, outs };

    const pitch: SpotAtBatPitch = {
      pitchNumber,
      pitchType:   selectedPitch,
      zone:        pendingZone,
      pitchX:      pendingCoords?.x,
      pitchY:      pendingCoords?.y,
      result,
      velocity:    modalVelocityEnabled ? modalVelocity : undefined,
      countBefore,
      countAfter,
    };
    const newPitches = [...pitches, pitch];
    setPitches(newPitches);
    setTapCoord(null);
    setPendingZone(null);
    setPendingCoords(null);
    setModalVelocityEnabled(false);
    setModalVelocity(130);

    // 打席終了判定
    if (result === 'hit_by_pitch') {
      setAtBatResult('hit_by_pitch');
      setShowConfirm(true);
      return;
    }
    if (result === 'in_play') {
      setShowFieldView(true);
      return;
    }
    if (newBalls >= 4) {
      setAtBatResult('walk');
      setShowConfirm(true);
      return;
    }
    if (newStrikes >= 3) {
      setAtBatResult(result === 'strike_called' ? 'strikeout_looking' : 'strikeout');
      setShowConfirm(true);
      return;
    }
    setBalls(newBalls);
    setStrikes(newStrikes);
  }, [pendingZone, pendingCoords, pitches, balls, strikes, outs, selectedPitch, modalVelocityEnabled, modalVelocity]);

  const handleFieldConfirm = useCallback((result: AtBatResult, bb: BattedBall) => {
    setBattedBall(bb);
    setAtBatResult(result);
    setShowFieldView(false);
    setShowConfirm(true);
  }, []);

  const handleFieldCancel = useCallback(() => {
    setPitches((prev) => prev.slice(0, -1));
    setShowFieldView(false);
  }, []);

  // ── FieldView: 打球位置入力 ──────────────────────────────────────
  if (showFieldView) {
    return (
      <>
        <Stack.Screen options={{ title: 'スポット打席 — 打球位置', headerShown: true }} />
        <FieldView
          ballpark={DEFAULT_BALLPARK}
          onConfirm={handleFieldConfirm}
          onCancel={handleFieldCancel}
        />
      </>
    );
  }

  // ── 確認・メモ・保存画面 (旧 Step 3 に相当) ────────────────────
  if (showConfirm) {
    const resultLabel = AT_BAT_RESULTS.find((r) => r.result === atBatResult)?.label ?? '—';
    const resultColor = AT_BAT_RESULTS.find((r) => r.result === atBatResult)?.color ?? Colors.primary;

    return (
      <>
        <Stack.Screen options={{ title: 'スポット打席 — 保存', headerShown: true }} />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={88}
        >
          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.stepLabel}>打席結果を保存</Text>

            {/* 結果サマリ or 結果選択 */}
            {atBatResult ? (
              <View style={styles.confirmSummaryRow}>
                <View style={[styles.confirmResultBadge, { backgroundColor: resultColor }]}>
                  <Text style={styles.confirmResultText}>{resultLabel}</Text>
                </View>
                <View style={styles.confirmMeta}>
                  <Text style={styles.confirmPlayerName}>{playerName}</Text>
                  <Text style={styles.confirmPitches}>
                    {pitches.length > 0 ? `${pitches.length}球` : '投球記録なし'}
                    {pitcherName ? ` vs ${pitcherName}` : ''}
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.sectionLabel}>打席結果 *</Text>
                <View style={styles.resultGrid}>
                  {AT_BAT_RESULTS.map(({ result, label, color }) => (
                    <TouchableOpacity
                      key={result}
                      style={[
                        styles.resultBtn,
                        { backgroundColor: color },
                      ]}
                      onPress={() => setAtBatResult(result)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.resultBtnText}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* メモ */}
            <Text style={styles.sectionLabel}>メモ（任意）</Text>
            <TextInput
              mode="outlined"
              label="メモ（任意）"
              value={memo}
              onChangeText={setMemo}
              multiline
              numberOfLines={4}
              style={styles.input}
              autoFocus={false}
              returnKeyType="done"
              blurOnSubmit={false}
            />
            {memo.length > 0 && (
              <View style={styles.memoPreview}>
                <Text style={styles.memoPreviewText}>{memo}</Text>
              </View>
            )}

            <View style={styles.footerRow}>
              <Button
                mode="outlined"
                onPress={() => { setShowConfirm(false); setShowFieldView(false); }}
                style={styles.footerBtn}
              >
                戻る
              </Button>
              <Button
                mode="contained"
                onPress={handleSave}
                loading={saving}
                disabled={saving || atBatResult === null}
                style={styles.footerBtn}
                buttonColor={Colors.primary}
                icon="content-save"
              >
                保存
              </Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </>
    );
  }

  // ── Step 2: 投球記録 ──────────────────────────────────────────
  if (step === 2) {
    return (
      <>
        <Stack.Screen options={{ title: 'スポット打席 — 投球記録', headerShown: true }} />
        <View style={styles.container}>

          {/* 選手情報ヘッダー */}
          <View style={styles.editInfoHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.editInfoText, { flex: 0 }]} numberOfLines={1}>
                {playerName || '打者名未入力'} vs {pitcherName || '投手'} | {opponent || 'チーム未入力'} | {outs}アウト
                {runners.first ? ' ・1塁' : ''}{runners.second ? ' ・2塁' : ''}{runners.third ? ' ・3塁' : ''}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 2 }}>
                Oをタップしてアウトカウントを設定
              </Text>
            </View>
          </View>

          {/* カウント + マッチアップ行 */}
          <View style={styles.s2CountRow}>
            <View style={styles.s2CountSection}>
              <CountDots label="B" count={balls}   max={3} color="#4CAF50" />
              <CountDots label="S" count={strikes} max={2} color="#FFC107" />
              <CountDots label="O" count={outs}    max={2} color="#F44336" />
            </View>
            <View style={styles.s2Matchup}>
              <Text style={styles.step2Sub}>{playerName} vs {pitcherName || '投手'}</Text>
              <Text style={styles.step2Outs}>
                {pitches.length}球目
                {runners.first  ? ' ・1塁' : ''}
                {runners.second ? ' ・2塁' : ''}
                {runners.third  ? ' ・3塁' : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.handBadge, isLeftBatter && styles.handBadgeLeft]}
              onPress={() => setIsLeftBatter((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={[styles.handBadgeText, isLeftBatter && { color: Colors.secondary }]}>
                {isLeftBatter ? '左打ち' : '右打ち'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 球種縦列 + バッターシルエット + キャンバス */}
          <View style={[styles.zoneSection, { flexDirection: isLeftBatter ? 'row-reverse' : 'row' }]}>

            {/* 球種縦ボタン列 */}
            <View style={styles.pitchColumn}>
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                {PITCH_TYPES.map((pt) => {
                  const isActive = selectedPitch === pt;
                  return (
                    <TouchableOpacity
                      key={pt}
                      style={[styles.pitchColBtn, isActive && styles.pitchColBtnActive]}
                      onPress={() => setSelectedPitch(pt)}
                    >
                      <Text
                        style={[styles.pitchColLabel, isActive && styles.pitchColLabelActive]}
                        numberOfLines={1}
                      >
                        {PITCH_LABELS[pt] ?? pt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* バッターシルエット + タップ可能なキャンバス */}
            <View style={styles.zoneBatterArea}>
              {isLeftBatter && (
                <TouchableOpacity onPress={() => setIsLeftBatter((v) => !v)} activeOpacity={0.75}>
                  <BatterSilhouetteSVG side="L" />
                </TouchableOpacity>
              )}

              <View
                style={styles.canvasArea}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderTerminationRequest={() => false}
                onResponderGrant={(e) => {
                  cursorX.value = e.nativeEvent.locationX;
                  cursorY.value = e.nativeEvent.locationY;
                  setIsTouching(true);
                }}
                onResponderMove={(e) => {
                  cursorX.value = e.nativeEvent.locationX;
                  cursorY.value = e.nativeEvent.locationY;
                }}
                onResponderRelease={(e) => {
                  const rawPx = e.nativeEvent.locationX;
                  const rawPy = e.nativeEvent.locationY;
                  const offsetPy = Math.max(0, Math.min(CANVAS_H, rawPy - CURSOR_OFFSET));
                  const offsetPx = Math.max(0, Math.min(CANVAS_W, rawPx));
                  setIsTouching(false);
                  handleCanvasTap(offsetPx, offsetPy);
                }}
                onResponderTerminate={() => setIsTouching(false)}
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
                  {/* 高低ラベル */}
                  <SvgText
                    x={SZ_LEFT + SZ_W / 2} y={SZ_TOP / 2 + 5}
                    textAnchor="middle" fontSize={11} fill="#8E8E93"
                  >高</SvgText>
                  <SvgText
                    x={SZ_LEFT + SZ_W / 2} y={SZ_BOT + (CANVAS_H - SZ_BOT) / 2 + 5}
                    textAnchor="middle" fontSize={11} fill="#8E8E93"
                  >低</SvgText>
                  {/* 確定マーカー */}
                  {tapCoord && (
                    <Circle
                      cx={tapCoord.px} cy={tapCoord.py}
                      r={9}
                      fill="rgba(196,30,58,0.88)"
                      stroke="#fff" strokeWidth={2}
                    />
                  )}
                </Svg>

                {isTouching && (
                  <Animated.View style={[styles.cursorDot, cursorStyle]} pointerEvents="none" />
                )}
              </View>

              {!isLeftBatter && (
                <TouchableOpacity onPress={() => setIsLeftBatter((v) => !v)} activeOpacity={0.75}>
                  <BatterSilhouetteSVG side="R" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* 選手情報インライン入力エリア */}
          <View style={styles.inlineInfoArea}>
            {/* 上段: アウトカウント + 対戦相手チーム */}
            <View style={styles.inlineTopRow}>
              <TouchableOpacity
                style={styles.inlineOutBtn}
                onPress={() => setOuts((prev) => (prev >= 2 ? 0 : prev + 1))}
                activeOpacity={0.8}
              >
                <Text style={styles.inlineOutText}>{outs}アウト</Text>
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <TextInput
                  mode="flat"
                  placeholder="対戦相手チーム"
                  value={opponent}
                  onChangeText={(t) => { setOpponent(t); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  style={styles.inlineInput}
                  dense
                />
                {showSuggestions && pastOpponents.filter((o) => !opponent || o.toLowerCase().includes(opponent.toLowerCase())).length > 0 && (
                  <FlatList
                    data={pastOpponents.filter((o) => !opponent || o.toLowerCase().includes(opponent.toLowerCase()))}
                    keyExtractor={(item, idx) => `${item}-${idx}`}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.suggestionItem}
                        onPress={() => { setOpponent(item); setShowSuggestions(false); }}
                      >
                        <Text style={styles.suggestionText}>{item}</Text>
                      </TouchableOpacity>
                    )}
                    style={styles.suggestionList}
                    scrollEnabled={false}
                  />
                )}
              </View>
            </View>
            {/* 下段: ランナー + 打者名・投手名 */}
            <View style={styles.inlineBottomRow}>
              <SpotDiamond
                runners={runners}
                onToggle={(base) => setRunners(prev => ({ ...prev, [base]: !prev[base] }))}
              />
              <View style={styles.inlinePlayerCol}>
                <TextInput
                  mode="flat"
                  placeholder="打者名 *"
                  value={playerName}
                  onChangeText={setPlayerName}
                  style={styles.inlineInput}
                  dense
                />
                <TextInput
                  mode="flat"
                  placeholder="投手名"
                  value={pitcherName}
                  onChangeText={setPitcherName}
                  style={styles.inlineInput}
                  dense
                />
              </View>
            </View>
          </View>

          {/* フッター */}
          <View style={styles.step2Footer}>
            <Button
              mode="outlined"
              onPress={() => {
                if (pitches.length === 0) {
                  Alert.alert('エラー', '投球を1球以上記録してください');
                  return;
                }
                // 最後の投球結果から打席結果を推定
                const lastPitch = pitches[pitches.length - 1];
                if (lastPitch.result === 'in_play') {
                  setShowFieldView(true);
                } else {
                  setAtBatResult(null);
                  setShowConfirm(true);
                }
              }}
              style={styles.footerBtn}
              icon="chevron-right"
            >
              スキップして保存へ
            </Button>
          </View>

          {/* 投球結果モーダル */}
          <Portal>
            <Modal
              visible={resultModalVisible}
              onDismiss={() => {
                setResultModalVisible(false);
                setPendingZone(null);
                setPendingCoords(null);
                setTapCoord(null);
              }}
              contentContainerStyle={styles.pitchModal}
            >
              <Text style={styles.pitchModalTitle}>投球結果</Text>
              <View style={styles.pitchResultGrid}>
                {PITCH_RESULT_ROWS.map(({ result, label, color }) => (
                  <TouchableOpacity
                    key={result}
                    style={[styles.pitchResultBtn, { backgroundColor: color }]}
                    onPress={() => handlePitchResultSelect(result)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.pitchResultBtnText}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <ModalVelocitySlider
                enabled={modalVelocityEnabled}
                value={modalVelocity}
                onToggle={setModalVelocityEnabled}
                onChange={setModalVelocity}
              />
            </Modal>
          </Portal>
        </View>

      </>
    );
  }

  // ── Step 2 に戻る (デフォルト) ──────────────────────────────
  return null;
}

function SpotDiamond({
  runners,
  onToggle,
}: {
  runners: { first: boolean; second: boolean; third: boolean };
  onToggle: (base: 'first' | 'second' | 'third') => void;
}) {
  return (
    <Svg width={100} height={100} viewBox="0 0 100 100">
      <Line x1={50} y1={85} x2={80} y2={55} stroke="#ccc" strokeWidth={2} />
      <Line x1={80} y1={55} x2={50} y2={25} stroke="#ccc" strokeWidth={2} />
      <Line x1={50} y1={25} x2={20} y2={55} stroke="#ccc" strokeWidth={2} />
      <Line x1={20} y1={55} x2={50} y2={85} stroke="#ccc" strokeWidth={2} />
      <Polygon
        points="50,75 60,85 50,95 40,85"
        fill="white"
        stroke="#ccc"
        strokeWidth={2}
      />
      <Polygon
        points="80,45 90,55 80,65 70,55"
        fill={runners.first ? '#C0392B' : 'white'}
        stroke={runners.first ? '#C0392B' : '#ccc'}
        strokeWidth={2}
        onPress={() => onToggle('first')}
      />
      <Polygon
        points="50,15 60,25 50,35 40,25"
        fill={runners.second ? '#C0392B' : 'white'}
        stroke={runners.second ? '#C0392B' : '#ccc'}
        strokeWidth={2}
        onPress={() => onToggle('second')}
      />
      <Polygon
        points="20,45 30,55 20,65 10,55"
        fill={runners.third ? '#C0392B' : 'white'}
        stroke={runners.third ? '#C0392B' : '#ccc'}
        strokeWidth={2}
        onPress={() => onToggle('third')}
      />
    </Svg>
  );
}

function CountDots({ label, count, max, color }: {
  label: string; count: number; max: number; color: string;
}) {
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content:   { padding: Spacing.md, paddingBottom: 80 },

  stepLabel:    { fontSize: Typography.caption, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm, letterSpacing: 1 },
  sectionLabel: { fontSize: Typography.bodySmall, fontWeight: '600', color: Colors.text, marginTop: Spacing.md, marginBottom: Spacing.sm },
  input:        { marginBottom: Spacing.sm, backgroundColor: Colors.white },

  // アウト
  outsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  outBtn: {
    flex: 1, paddingVertical: Spacing.sm, alignItems: 'center',
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  outBtnActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  outBtnText:       { fontSize: Typography.bodySmall, color: Colors.text, fontWeight: '600' },
  outBtnTextActive: { color: Colors.white },

  // ランナー
  runnerRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  runnerBtn: {
    flex: 1, paddingVertical: Spacing.sm, alignItems: 'center',
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  runnerBtnOn:      { backgroundColor: '#E65100', borderColor: '#E65100' },
  runnerBtnText:    { fontSize: Typography.bodySmall, color: Colors.text, fontWeight: '600' },
  runnerBtnTextOn:  { color: Colors.white },

  // 選手情報ヘッダー
  editInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 8,
  },
  editInfoText: {
    flex: 1,
    color: '#fff',
    fontSize: Typography.bodySmall,
    fontWeight: '600',
  },

  // 編集モーダル
  editModal: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  editModalContent: {
    padding: Spacing.md,
    paddingBottom: 80,
  },

  // サジェスト
  suggestionList: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    maxHeight: 160,
  },
  suggestionItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  suggestionText: {
    fontSize: Typography.body,
    color: Colors.text,
  },

  // Step 2 共通
  step2Sub:    { fontSize: Typography.body, color: Colors.text, fontWeight: '600', marginTop: 2 },
  step2Outs:   { fontSize: Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  step2Footer: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md },
  footerBtn:   { flex: 1 },
  footerRow:   { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },

  // Step 2 カウント行
  s2CountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  s2CountSection: { gap: 4 },
  s2Matchup: { flex: 1 },

  // Step 2 左右打ちバッジ
  handBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  handBadgeLeft: {
    backgroundColor: Colors.card,
    borderColor: Colors.secondary,
  },
  handBadgeText: { fontSize: Typography.tiny, fontWeight: '700', color: Colors.primary },

  // Step 2 キャンバスエリア
  zoneSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.sm,
    gap: 4,
  },
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
  pitchColBtnActive:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pitchColLabel:       { fontSize: 9, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  pitchColLabelActive: { color: Colors.white },

  zoneBatterArea: { flexDirection: 'row', alignItems: 'center' },
  canvasArea: {
    width: CANVAS_W,
    height: CANVAS_H,
    overflow: 'hidden',
  },
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

  // Step 2 投球結果モーダル
  pitchModal: {
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  pitchModalTitle: {
    fontSize: Typography.h4,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  pitchResultGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  pitchResultBtn: {
    width: 80,
    height: 52,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pitchResultBtnText: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.white,
    textAlign: 'center',
  },

  // Step 2 CountDots
  countItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countLabel: { fontSize: Typography.bodySmall, fontWeight: '800', width: 16 },
  dotsRow: { flexDirection: 'row', gap: 3 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },

  // 打席結果グリッド (スキップ時のみ表示)
  resultGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  resultBtn:     { width: 80, height: 52, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  resultBtnText: { fontSize: Typography.caption, fontWeight: '700', color: Colors.white },

  // 確認・保存画面
  confirmSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  confirmResultBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    minWidth: 72,
    alignItems: 'center',
  },
  confirmResultText: {
    fontSize: Typography.body,
    fontWeight: '800',
    color: Colors.white,
  },
  confirmMeta: { flex: 1 },
  confirmPlayerName: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.text,
  },
  confirmPitches: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  memoPreview: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: 4,
    marginBottom: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  memoPreviewText: {
    fontSize: Typography.bodySmall,
    color: Colors.text,
    lineHeight: 20,
  },

  // インライン選手情報入力エリア
  inlineInfoArea: {
    margin: 8,
    padding: 12,
    backgroundColor: Colors.card,
    borderRadius: 8,
  },
  inlineTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  inlineOutBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineOutText: {
    color: Colors.white,
    fontSize: Typography.bodySmall,
    fontWeight: '700',
  },
  inlineInput: {
    backgroundColor: Colors.surfaceGray,
    marginBottom: 4,
  },
  inlineBottomRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  inlineRunnerCol: {
    width: 100,
    gap: 4,
  },
  inlineRunnerBtn: {
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  inlineRunnerBtnOn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  inlineRunnerBtnText: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  inlineRunnerBtnTextOn: {
    color: Colors.white,
  },
  inlinePlayerCol: {
    flex: 1,
  },
});
