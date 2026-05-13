import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Animated } from 'react-native';
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
} from '../../types/game';

// ============================================================
// 定数
// ============================================================

const DIAMOND_SIZE = 240;
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

// ベース選択ボタン定義
const BASE_BUTTONS: { base: BaseTarget; labelKey: 'first' | 'second' | 'third' | 'home' }[] = [
  { base: 'first',  labelKey: 'first' },
  { base: 'second', labelKey: 'second' },
  { base: 'third',  labelKey: 'third' },
  { base: 'home',   labelKey: 'home' },
];

// 進塁理由 (サブメニュー用)
const ADVANCEMENT_REASONS: {
  action: RunnerAction;
  outcome: RunnerOutcome;
  labelKey: string;
  color: string;
}[] = [
  { action: 'batted_ball',   outcome: 'safe',           labelKey: 'battedBall',    color: '#4CAF50' },
  { action: 'tag_up',        outcome: 'safe',           labelKey: 'tagUp',         color: '#2E7D32' },
  { action: 'batted_ball',   outcome: 'error_advance',  labelKey: 'errorAdvance',  color: '#FF9800' },
  { action: 'wild_pitch',    outcome: 'safe',           labelKey: 'wildPitch',     color: '#FFC107' },
  { action: 'stolen_base',   outcome: 'safe',           labelKey: 'stolenBase',    color: '#00ACC1' },
  { action: 'batted_ball',   outcome: 'out_force',      labelKey: 'outForce',      color: '#E53935' },
  { action: 'batted_ball',   outcome: 'out_tag',        labelKey: 'outTag',        color: '#F44336' },
];

// ============================================================
// Props
// ============================================================

interface RunnerAdvancementViewProps {
  advancements: RunnerAdvancement[];
  result: AtBatResult;
  fielding?: FieldingRecord;
  onConfirm: (finalAdvancements: RunnerAdvancement[]) => void;
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
  const [editable, setEditable] = useState<RunnerAdvancement[]>(advancements);
  const [expandedRunner, setExpandedRunner] = useState<string | null>(null);

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
    setEditable((prev) =>
      prev.map((adv) => {
        if (adv.runnerId !== runnerId) return adv;
        const newAction: RunnerAction = adv.action === 'tag_up' ? 'batted_ball' : 'tag_up';
        return { ...adv, action: newAction };
      }),
    );
  }, []);

  // 理由変更 (action + outcome を同時設定)
  const setReason = useCallback((runnerId: string, action: RunnerAction, outcome: RunnerOutcome) => {
    setEditable((prev) =>
      prev.map((adv) => {
        if (adv.runnerId !== runnerId) return adv;
        if (outcome === 'out_tag' || outcome === 'out_force') {
          return { ...adv, outcome, action, targetBase: 'out' as const };
        }
        if (adv.targetBase === 'out') {
          const curNum = BASE_ORDER[adv.fromBase] ?? 0;
          const minNum = BASE_ORDER[adv.minBase] ?? 1;
          const restoreNum = Math.max(minNum, curNum + 1);
          const restoreBase = restoreNum >= 4 ? 'home' : (['first', 'second', 'third'] as const)[restoreNum - 1];
          return { ...adv, outcome, action, targetBase: restoreBase };
        }
        return { ...adv, outcome, action };
      }),
    );
  }, []);

  // ベースボタン: 無効化判定
  const isBaseButtonDisabled = (adv: RunnerAdvancement, base: BaseTarget): boolean => {
    const baseNum = BASE_ORDER[base] ?? 0;
    const fromNum = BASE_ORDER[adv.fromBase] ?? 0;
    const minNum = adv.minBase !== 'out' ? (BASE_ORDER[adv.minBase] ?? 0) : 0;
    const minRequired = Math.max(minNum, fromNum + 1);
    return baseNum < minRequired;
  };

  // ベースボタンタップ → ダイアログ表示
  const handleBaseButtonTap = useCallback((runnerId: string, base: BaseTarget) => {
    setSafeOutDialog({ runnerId, base });
  }, []);

  // セーフ選択
  const handleSafeSelected = useCallback(() => {
    if (!safeOutDialog) return;
    const { runnerId, base } = safeOutDialog;
    setEditable((prev) =>
      prev.map((adv) => {
        if (adv.runnerId !== runnerId) return adv;
        return { ...adv, targetBase: base, outcome: 'safe' as RunnerOutcome, outDetail: undefined };
      }),
    );
    setSafeOutDialog(null);
  }, [safeOutDialog]);

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
    setEditable((prev) =>
      prev.map((adv) => {
        if (adv.runnerId !== runnerId) return adv;
        if (detail === 'force_out') {
        return { ...adv, targetBase: 'out' as BaseTarget, outcome: 'out_force' as RunnerOutcome, outDetail: undefined };
      }
      return { ...adv, targetBase: 'out' as BaseTarget, outcome: 'out_tag' as RunnerOutcome, outDetail: detail };
      }),
    );
    setOutDetailDialog(null);
  }, [outDetailDialog]);

  // バリデーション
  const validationError = (() => {
    const occupied = editable
      .filter((a) => a.targetBase !== 'out' && a.targetBase !== 'home' && a.outcome !== 'out_tag' && a.outcome !== 'out_force')
      .map((a) => a.targetBase);
    const dupes = occupied.filter((b, i) => occupied.indexOf(b) !== i);
    if (dupes.length > 0) return t.advancement.conflictError;
    return null;
  })();

  const handleConfirm = useCallback(() => {
    if (validationError) return;
    onConfirm(editable);
  }, [editable, validationError, onConfirm]);

  // 結果ラベル
  const resultLabel = t.atBatResults[result] ?? result;
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

  const reasonColor = (adv: RunnerAdvancement): string => {
    if (adv.fromBase === 'batter' && adv.action === 'batted_ball' &&
        (adv.outcome === 'out_tag' || adv.outcome === 'out_force')) {
      return '#E53935';
    }
    const match = ADVANCEMENT_REASONS.find(
      (r) => r.action === adv.action && r.outcome === adv.outcome,
    );
    return match?.color ?? '#4CAF50';
  };

  return (
    <>
      <ScrollView style={styles.wrapper} contentContainerStyle={styles.content}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.resultText}>{resultLabel}</Text>
          {fieldingLabel ? <Text style={styles.fieldingText}>{fieldingLabel}</Text> : null}
        </View>
        <Text style={styles.subtitle}>{t.advancement.title}</Text>

        {/* SVG ダイヤモンド */}
        <View style={styles.diamondWrap}>
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
              return (
                <React.Fragment key={b}>
                  {isTarget && <Circle cx={pos.x} cy={pos.y} r={18} fill={NEON_GLOW} />}
                  <Rect
                    x={pos.x - 10}
                    y={pos.y - 10}
                    width={20}
                    height={20}
                    transform={`rotate(45, ${pos.x}, ${pos.y})`}
                    fill={isTarget ? NEON : Colors.primaryLight}
                    stroke={isTarget ? NEON : Colors.primary}
                    strokeWidth={isTarget ? 2 : 1.5}
                  />
                </React.Fragment>
              );
            })}

            {/* ランナーの軌跡ライン + 円 */}
            {editable.map((adv) => {
              const from = BASE_POS[adv.fromBase];
              const isOut = adv.outcome === 'out_tag' || adv.outcome === 'out_force';
              const to = isOut ? from : BASE_POS[adv.targetBase] ?? from;

              return (
                <React.Fragment key={adv.runnerId}>
                  {!isOut && from !== to && (
                    <Line
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={NEON}
                      strokeWidth={2.5}
                      strokeDasharray="6,3"
                      opacity={0.8}
                    />
                  )}
                  <Circle
                    cx={from.x}
                    cy={from.y}
                    r={12}
                    fill={isOut ? Colors.secondary : Colors.primary}
                    stroke={isOut ? '#9B1528' : NEON}
                    strokeWidth={2.5}
                  />
                  <SvgText
                    x={from.x}
                    y={from.y + 4}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight="bold"
                    fill="#FFF"
                  >
                    {adv.playerName.slice(0, 2)}
                  </SvgText>
                </React.Fragment>
              );
            })}
          </Svg>
        </View>

        <Text style={styles.hint}>{t.advancement.tapToChange}</Text>

        {/* ランナーリスト */}
        {editable.map((adv) => {
          const isExpanded = expandedRunner === adv.runnerId;
          // 犠打・犠飛は打者が必ずアウト（固定）。通常の打球アウトはフォース/タッチを変更可能
          const isSacrificeOut = adv.fromBase === 'batter' && result === 'sacrifice_fly';
          const isBatterRegularOut = adv.fromBase === 'batter' &&
            (adv.outcome === 'out_force' || adv.outcome === 'out_tag') &&
            !isSacrificeOut &&
            result !== 'sacrifice_bunt' &&
            result !== 'flyout';
          const isBatterOut = isSacrificeOut || (adv.fromBase === 'batter' && result === 'flyout');
          const canTagUp = isFlyBall && adv.fromBase !== 'batter' && !isBatterOut;
          const isTaggingUp = adv.action === 'tag_up';
          const isOut = adv.outcome === 'out_tag' || adv.outcome === 'out_force';

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
                <View style={[styles.outcomeBadge, { backgroundColor: reasonColor(adv) }]}>
                  <Text style={styles.outcomeText}>{reasonLabel(adv)}</Text>
                </View>
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

              {/* ベース選択ボタン行 */}
            {!isBatterOut && !isBatterRegularOut && (
              <View style={styles.baseButtonRow}>
                  {BASE_BUTTONS.map(({ base, labelKey }) => {
                    const disabled = isBaseButtonDisabled(adv, base);
                    const isActive = adv.targetBase === base;
                    return (
                      <TouchableOpacity
                        key={base}
                        style={[
                          styles.baseBtn,
                          isActive && styles.baseBtnActive,
                          disabled && styles.baseBtnDisabled,
                        ]}
                        onPress={() => handleBaseButtonTap(adv.runnerId, base)}
                        disabled={disabled}
                      >
                        <Text style={[
                          styles.baseBtnText,
                          isActive && styles.baseBtnTextActive,
                          disabled && styles.baseBtnTextDisabled,
                        ]}>
                          {t.advancement[labelKey]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

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

              {/* 理由サブメニュー (展開時) */}
              {isExpanded && !isBatterOut && !isBatterRegularOut && (
                <View style={styles.subMenu}>
                  <Text style={styles.subLabel}>{t.advancement.title}:</Text>
                  <View style={styles.subRow}>
                    {ADVANCEMENT_REASONS.map((reason) => {
                      const isActive = adv.action === reason.action && adv.outcome === reason.outcome;
                      return (
                        <TouchableOpacity
                          key={reason.labelKey}
                          style={[
                            styles.subBtn,
                            { borderColor: reason.color },
                            isActive && { backgroundColor: reason.color },
                          ]}
                          onPress={() => setReason(adv.runnerId, reason.action, reason.outcome)}
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
          {OUT_DETAILS.map(({ key, labelKey }) => (
            <TouchableOpacity
              key={key}
              style={styles.outDetailBtn}
              onPress={() => handleOutDetailSelected(key)}
            >
              <Text style={styles.outDetailBtnText}>
                {(t.advancement as Record<string, string>)[labelKey]}
              </Text>
            </TouchableOpacity>
          ))}
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
  },
  hint: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
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

  // ベース選択ボタン行
  baseButtonRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: 4,
  },
  baseBtn: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  baseBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  baseBtnOut: {
    borderColor: Colors.secondary,
  },
  baseBtnOutActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  baseBtnDisabled: {
    borderColor: Colors.border,
    opacity: 0.4,
  },
  baseBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    textAlign: 'center',
  },
  baseBtnTextActive: {
    color: Colors.white,
  },
  baseBtnTextOut: {
    color: Colors.secondary,
  },
  baseBtnTextDisabled: {
    color: Colors.textSecondary,
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
