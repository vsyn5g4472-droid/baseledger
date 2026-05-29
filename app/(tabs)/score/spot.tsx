import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { router, Stack } from 'expo-router';
import { Timestamp } from 'firebase/firestore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { useAuth } from '../../../src/contexts/AuthContext';
import { createSpotAtBat } from '../../../src/services/spotAtBatService';
import type { AtBatResult } from '../../../src/types/game';
import type { SpotAtBatPitch } from '../../../src/models/types';

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
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: 状況入力
  const [playerName, setPlayerName]   = useState('');
  const [pitcherName, setPitcherName] = useState('');
  const [opponent, setOpponent]       = useState('');
  const [outs, setOuts]               = useState(0);
  const [runners, setRunners]         = useState({ first: false, second: false, third: false });

  // Step 2: 投球記録（Step2実装後に追記）
  const [pitches] = useState<SpotAtBatPitch[]>([]);

  // Step 3: 打席結果・保存
  const [atBatResult, setAtBatResult] = useState<AtBatResult | null>(null);
  const [memo, setMemo]               = useState('');
  const [saving, setSaving]           = useState(false);

  const toggleRunner = (base: 'first' | 'second' | 'third') =>
    setRunners((prev) => ({ ...prev, [base]: !prev[base] }));

  const handleSave = async () => {
    if (!currentUser) return;
    if (!atBatResult) {
      Alert.alert('エラー', '打席結果を選択してください');
      return;
    }
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
        memo:          memo.trim() || undefined,
      });
      Alert.alert('保存完了', 'スポット打席を記録しました', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('エラー', '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // ── Step 1: 状況入力 ─────────────────────────────────────────
  if (step === 1) {
    return (
      <>
        <Stack.Screen options={{ title: 'スポット打席', headerShown: true }} />
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <Text style={styles.stepLabel}>STEP 1 / 状況入力</Text>

          <TextInput
            mode="outlined"
            label="打者名 *"
            value={playerName}
            onChangeText={setPlayerName}
            style={styles.input}
          />
          <TextInput
            mode="outlined"
            label="投手名"
            value={pitcherName}
            onChangeText={setPitcherName}
            style={styles.input}
          />
          <TextInput
            mode="outlined"
            label="対戦相手チーム"
            value={opponent}
            onChangeText={setOpponent}
            style={styles.input}
          />

          {/* アウトカウント */}
          <Text style={styles.sectionLabel}>アウトカウント</Text>
          <View style={styles.outsRow}>
            {([0, 1, 2] as const).map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.outBtn, outs === n && styles.outBtnActive]}
                onPress={() => setOuts(n)}
              >
                <Text style={[styles.outBtnText, outs === n && styles.outBtnTextActive]}>
                  {n}アウト
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ランナー */}
          <Text style={styles.sectionLabel}>ランナー</Text>
          <View style={styles.runnerRow}>
            {([
              { key: 'first',  label: '1塁' },
              { key: 'second', label: '2塁' },
              { key: 'third',  label: '3塁' },
            ] as const).map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[styles.runnerBtn, runners[key] && styles.runnerBtnOn]}
                onPress={() => toggleRunner(key)}
              >
                <Text style={[styles.runnerBtnText, runners[key] && styles.runnerBtnTextOn]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Button
            mode="contained"
            onPress={() => {
              if (!playerName.trim()) {
                Alert.alert('エラー', '打者名を入力してください');
                return;
              }
              setStep(2);
            }}
            style={styles.nextBtn}
            buttonColor={Colors.primary}
            icon="baseball"
          >
            次へ: 投球記録
          </Button>
        </ScrollView>
      </>
    );
  }

  // ── Step 2: 投球記録（TODO: Step2実装で置換） ────────────────
  if (step === 2) {
    return (
      <>
        <Stack.Screen options={{ title: 'スポット打席 — 投球記録', headerShown: true }} />
        <View style={styles.container}>
          <View style={styles.step2Header}>
            <Text style={styles.stepLabel}>STEP 2 / 投球記録</Text>
            <Text style={styles.step2Sub}>{playerName} vs {pitcherName || '投手'}</Text>
            <Text style={styles.step2Outs}>
              {outs}アウト
              {runners.first  ? ' ・1塁' : ''}
              {runners.second ? ' ・2塁' : ''}
              {runners.third  ? ' ・3塁' : ''}
            </Text>
          </View>

          {/* TODO: SVGキャンバス + 球種列 + ResultModal (Step2実装) */}
          <View style={styles.todoCenterArea}>
            <MaterialCommunityIcons name="baseball" size={56} color={Colors.border} />
            <Text style={styles.todoTitle}>投球記録</Text>
            <Text style={styles.todoSub}>Step 2 は別途実装予定</Text>
            <Text style={styles.todoPitchCount}>現在記録済み: {pitches.length}球</Text>
          </View>

          <View style={styles.step2Footer}>
            <Button mode="outlined" onPress={() => setStep(1)} style={styles.footerBtn}>
              戻る
            </Button>
            <Button
              mode="contained"
              onPress={() => setStep(3)}
              style={styles.footerBtn}
              buttonColor={Colors.primary}
              icon="chevron-right"
            >
              打席結果へ
            </Button>
          </View>
        </View>
      </>
    );
  }

  // ── Step 3: 打席結果・保存 ────────────────────────────────────
  return (
    <>
      <Stack.Screen options={{ title: 'スポット打席 — 結果確定', headerShown: true }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.stepLabel}>STEP 3 / 打席結果</Text>
        <Text style={styles.step2Sub}>{playerName}（{pitches.length}球）</Text>

        <Text style={styles.sectionLabel}>打席結果 *</Text>
        <View style={styles.resultGrid}>
          {AT_BAT_RESULTS.map(({ result, label, color }) => (
            <TouchableOpacity
              key={result}
              style={[
                styles.resultBtn,
                { backgroundColor: atBatResult === result ? color : Colors.surfaceGray },
              ]}
              onPress={() => setAtBatResult(result)}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.resultBtnText,
                { color: atBatResult === result ? Colors.white : Colors.text },
              ]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          mode="outlined"
          label="メモ（任意）"
          value={memo}
          onChangeText={setMemo}
          multiline
          numberOfLines={3}
          style={styles.input}
        />

        <View style={styles.footerRow}>
          <Button mode="outlined" onPress={() => setStep(2)} style={styles.footerBtn}>
            戻る
          </Button>
          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={!atBatResult || saving}
            style={styles.footerBtn}
            buttonColor={Colors.primary}
            icon="content-save"
          >
            保存
          </Button>
        </View>
      </ScrollView>
    </>
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

  nextBtn: { marginTop: Spacing.lg, borderRadius: BorderRadius.lg },

  // Step 2
  step2Header:    { padding: Spacing.md, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  step2Sub:       { fontSize: Typography.body, color: Colors.text, fontWeight: '600', marginTop: 2 },
  step2Outs:      { fontSize: Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  todoCenterArea: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  todoTitle:      { fontSize: Typography.h4, color: Colors.textSecondary, fontWeight: '600' },
  todoSub:        { fontSize: Typography.bodySmall, color: Colors.textDisabled },
  todoPitchCount: { fontSize: Typography.caption, color: Colors.textSecondary, marginTop: Spacing.sm },
  step2Footer:    { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md },
  footerBtn:      { flex: 1 },
  footerRow:      { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },

  // Step 3
  resultGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  resultBtn:     { width: 80, height: 52, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  resultBtnText: { fontSize: Typography.caption, fontWeight: '700' },
});
