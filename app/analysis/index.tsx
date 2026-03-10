/**
 * 分析トップ画面 — 打者分析 / バッテリー分析の対象を選択する
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { db } from '../../src/db';
import type { GameState } from '../../src/types/game';
import {
  extractBatters,
  extractBatteryPairs,
  type BatterInfo,
  type BatteryPair,
} from '../../src/utils/analysisEngine';
import { Colors, Spacing, Typography, BorderRadius, CardShadow } from '../../src/constants/theme';

// ── Tab type ──────────────────────────────────────────────────────────────────

type TabKey = 'batter' | 'battery';

// ── Picker Modal ──────────────────────────────────────────────────────────────

function PickerModal<T>({
  visible,
  items,
  onSelect,
  onClose,
  labelFn,
  subFn,
}: {
  visible:  boolean;
  items:    T[];
  onSelect: (item: T) => void;
  onClose:  () => void;
  labelFn:  (item: T) => string;
  subFn?:   (item: T) => string;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={modalStyles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={modalStyles.sheet}>
        <View style={modalStyles.handle} />
        <Text style={modalStyles.sheetTitle}>選手を選択</Text>
        <FlatList
          data={items}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={modalStyles.row}
              onPress={() => { onSelect(item); onClose(); }}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={modalStyles.rowLabel}>{labelFn(item)}</Text>
                {subFn && (
                  <Text style={modalStyles.rowSub}>{subFn(item)}</Text>
                )}
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={modalStyles.sep} />}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AnalysisIndexScreen() {
  const [tab, setTab]       = useState<TabKey>('batter');
  const [games, setGames]   = useState<GameState[]>([]);
  const [loading, setLoading] = useState(true);

  // Batter tab state
  const [batters, setBatters]                 = useState<BatterInfo[]>([]);
  const [selectedBatter, setSelectedBatter]   = useState<BatterInfo | null>(null);
  const [batterPickerOpen, setBatterPickerOpen] = useState(false);

  // Battery tab state
  const [batteries, setBatteries]               = useState<BatteryPair[]>([]);
  const [selectedBattery, setSelectedBattery]   = useState<BatteryPair | null>(null);
  const [batteryPickerOpen, setBatteryPickerOpen] = useState(false);

  const loadData = useCallback(async () => {
    const all = await db.games.getAll();
    setGames(all);
    setBatters(extractBatters(all));
    setBatteries(extractBatteryPairs(all));
  }, []);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const canStart =
    tab === 'batter' ? !!selectedBatter : !!selectedBattery;

  const handleStart = useCallback(() => {
    if (tab === 'batter' && selectedBatter) {
      router.push({
        pathname: '/analysis/batter-report' as any,
        params: {
          batterId:   selectedBatter.batterId,
          batterName: selectedBatter.batterName,
        },
      });
    } else if (tab === 'battery' && selectedBattery) {
      router.push({
        pathname: '/analysis/battery-report' as any,
        params: {
          pitcherId:   selectedBattery.pitcherId,
          catcherId:   selectedBattery.catcherId,
          pitcherName: selectedBattery.pitcherName,
          catcherName: selectedBattery.catcherName,
        },
      });
    }
  }, [tab, selectedBatter, selectedBattery]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: '選手分析' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const hasData = games.length > 0;

  return (
    <>
      <Stack.Screen options={{ title: '選手分析' }} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── ヘッダバナー ── */}
        <View style={styles.heroBanner}>
          <MaterialCommunityIcons name="magnify-scan" size={32} color={Colors.white} />
          <View>
            <Text style={styles.heroTitle}>選手・バッテリー分析</Text>
            <Text style={styles.heroSub}>
              {hasData
                ? `${games.length}試合のログから癖を特定します`
                : 'まず試合を記録してください'}
            </Text>
          </View>
        </View>

        {/* ── タブ ── */}
        <View style={styles.tabBar}>
          {(['batter', 'battery'] as const).map((key) => {
            const isActive = tab === key;
            const icon     = key === 'batter' ? 'baseball-bat' : 'account-group';
            const label    = key === 'batter' ? '打者分析' : 'バッテリー分析';
            return (
              <TouchableOpacity
                key={key}
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                onPress={() => setTab(key)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={icon as any}
                  size={18}
                  color={isActive ? Colors.white : Colors.textSecondary}
                />
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── コンテンツ ── */}
        {!hasData ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="database-off-outline" size={48} color={Colors.border} />
            <Text style={styles.emptyText}>試合データがありません</Text>
          </View>
        ) : tab === 'batter' ? (
          // ── 打者分析タブ ──────────────────────────────────────────────────
          <View style={styles.card}>
            <Text style={styles.cardTitle}>打者を選択</Text>
            <Text style={styles.cardDesc}>
              過去の全打席ログから、打球傾向・苦手コース・球速対応を分析します。
            </Text>

            <TouchableOpacity
              style={[styles.selector, !selectedBatter && styles.selectorEmpty]}
              onPress={() => setBatterPickerOpen(true)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="account-outline"
                size={20}
                color={selectedBatter ? Colors.primary : Colors.textSecondary}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.selectorText,
                    !selectedBatter && styles.selectorPlaceholder,
                  ]}
                >
                  {selectedBatter?.batterName ?? '選手を選ぶ…'}
                </Text>
                {selectedBatter && (
                  <Text style={styles.selectorSub}>
                    {selectedBatter.gameCount}試合のデータあり
                  </Text>
                )}
              </View>
              <MaterialCommunityIcons name="chevron-down" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            {selectedBatter && (
              <View style={styles.infoChips}>
                <View style={styles.chip}>
                  <MaterialCommunityIcons name="chart-bar" size={12} color={Colors.primary} />
                  <Text style={styles.chipText}>打撃傾向マップ</Text>
                </View>
                <View style={styles.chip}>
                  <MaterialCommunityIcons name="speedometer" size={12} color={Colors.primary} />
                  <Text style={styles.chipText}>球速帯別成績</Text>
                </View>
                <View style={styles.chip}>
                  <MaterialCommunityIcons name="target" size={12} color={Colors.primary} />
                  <Text style={styles.chipText}>コース別分析</Text>
                </View>
              </View>
            )}
          </View>
        ) : (
          // ── バッテリー分析タブ ────────────────────────────────────────────
          <View style={styles.card}>
            <Text style={styles.cardTitle}>バッテリーを選択</Text>
            <Text style={styles.cardDesc}>
              投手×捕手ペアの決め球・カウント別配球傾向を解析します。
            </Text>

            <TouchableOpacity
              style={[styles.selector, !selectedBattery && styles.selectorEmpty]}
              onPress={() => setBatteryPickerOpen(true)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="account-multiple"
                size={20}
                color={selectedBattery ? Colors.primary : Colors.textSecondary}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.selectorText,
                    !selectedBattery && styles.selectorPlaceholder,
                  ]}
                >
                  {selectedBattery
                    ? `${selectedBattery.pitcherName} × ${selectedBattery.catcherName}`
                    : 'バッテリーを選ぶ…'}
                </Text>
                {selectedBattery && (
                  <Text style={styles.selectorSub}>
                    {selectedBattery.gameCount}試合のデータあり
                  </Text>
                )}
              </View>
              <MaterialCommunityIcons name="chevron-down" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            {selectedBattery && (
              <View style={styles.infoChips}>
                <View style={styles.chip}>
                  <MaterialCommunityIcons name="fire" size={12} color={Colors.primary} />
                  <Text style={styles.chipText}>決め球分析</Text>
                </View>
                <View style={styles.chip}>
                  <MaterialCommunityIcons name="grid" size={12} color={Colors.primary} />
                  <Text style={styles.chipText}>カウント別傾向</Text>
                </View>
                <View style={styles.chip}>
                  <MaterialCommunityIcons name="robot-outline" size={12} color={Colors.primary} />
                  <Text style={styles.chipText}>AI要約</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── 分析開始ボタン ── */}
        <TouchableOpacity
          style={[styles.startBtn, !canStart && styles.startBtnDisabled]}
          onPress={handleStart}
          disabled={!canStart}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="magnify" size={20} color={Colors.white} />
          <Text style={styles.startBtnText}>分析開始</Text>
        </TouchableOpacity>

        {/* ── データなし補足 ── */}
        {hasData && (batters.length === 0 && tab === 'batter' ||
          batteries.length === 0 && tab === 'battery') && (
          <Text style={styles.noDataHint}>
            {tab === 'batter'
              ? '打席データのある選手が見つかりません。'
              : '投球データのある試合がありません。'}
          </Text>
        )}
      </ScrollView>

      {/* ── ピッカー モーダル ── */}
      <PickerModal<BatterInfo>
        visible={batterPickerOpen}
        items={batters}
        onSelect={setSelectedBatter}
        onClose={() => setBatterPickerOpen(false)}
        labelFn={(b) => b.batterName}
        subFn={(b) => `${b.gameCount}試合`}
      />

      <PickerModal<BatteryPair>
        visible={batteryPickerOpen}
        items={batteries}
        onSelect={setSelectedBattery}
        onClose={() => setBatteryPickerOpen(false)}
        labelFn={(b) => `${b.pitcherName} × ${b.catcherName}`}
        subFn={(b) => `投手: ${b.pitcherName} / 捕手: ${b.catcherName} — ${b.gameCount}試合`}
      />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content:   { padding: Spacing.md, gap: Spacing.md, paddingBottom: 60 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  heroBanner: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius:   BorderRadius.xl,
    padding:        Spacing.md,
  },
  heroTitle: { fontSize: Typography.body, fontWeight: '900', color: Colors.white },
  heroSub:   { fontSize: Typography.caption, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceGray,
    borderRadius:    BorderRadius.lg,
    padding:         4,
    gap:             4,
  },
  tabBtn: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
    paddingVertical: Spacing.sm,
    borderRadius:   BorderRadius.md,
  },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabLabel:     { fontSize: Typography.caption, fontWeight: '700', color: Colors.textSecondary },
  tabLabelActive: { color: Colors.white },

  card: {
    backgroundColor: Colors.white,
    borderRadius:    BorderRadius.xl,
    padding:         Spacing.md,
    gap:             Spacing.sm,
    ...CardShadow,
  },
  cardTitle: { fontSize: Typography.h4, fontWeight: '800', color: Colors.text },
  cardDesc:  { fontSize: Typography.caption, color: Colors.textSecondary, lineHeight: 18 },

  selector: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            Spacing.sm,
    backgroundColor: Colors.surfaceGray,
    borderRadius:   BorderRadius.lg,
    padding:        Spacing.md,
    borderWidth:    1.5,
    borderColor:    Colors.primary,
  },
  selectorEmpty:  { borderColor: Colors.border },
  selectorText:   { fontSize: Typography.body, fontWeight: '700', color: Colors.text },
  selectorPlaceholder: { color: Colors.textSecondary, fontWeight: '400' },
  selectorSub:    { fontSize: Typography.tiny, color: Colors.textSecondary, marginTop: 2 },

  infoChips: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap', marginTop: 4 },
  chip: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            4,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius:   BorderRadius.full,
  },
  chipText: { fontSize: Typography.tiny, color: Colors.primary, fontWeight: '700' },

  startBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius:   BorderRadius.full,
    paddingVertical: Spacing.md,
    marginTop:      Spacing.xs,
  },
  startBtnDisabled: { backgroundColor: Colors.border },
  startBtnText: {
    fontSize:   Typography.body,
    fontWeight: '900',
    color:      Colors.white,
    letterSpacing: 0.5,
  },

  emptyBox: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xxl },
  emptyText: { fontSize: Typography.bodySmall, color: Colors.textSecondary },
  noDataHint: {
    fontSize: Typography.caption,
    color:    Colors.textSecondary,
    textAlign: 'center',
  },
});

const modalStyles = StyleSheet.create({
  backdrop: {
    flex:            1,
    backgroundColor: Colors.overlay,
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    padding:   Spacing.md,
    maxHeight: '70%',
  },
  handle: {
    alignSelf:       'center',
    width:           40,
    height:          4,
    backgroundColor: Colors.border,
    borderRadius:    2,
    marginBottom:    Spacing.md,
  },
  sheetTitle: {
    fontSize:    Typography.h4,
    fontWeight:  '800',
    color:       Colors.text,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  rowLabel: { fontSize: Typography.body, fontWeight: '600', color: Colors.text },
  rowSub:   { fontSize: Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  sep:      { height: 0.5, backgroundColor: Colors.border },
});
