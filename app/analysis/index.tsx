/**
 * 分析トップ画面 — 打者分析 / バッテリー分析の対象を選択する
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
  extractPitchers,
  type BatterInfo,
  type BatteryPair,
  type PitcherInfo,
} from '../../src/utils/analysisEngine';
import { getUserSpotAtBats } from '../../src/services/spotAtBatService';
import type { SpotAtBat } from '../../src/models/types';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Spacing, Typography, BorderRadius, CardShadow } from '../../src/constants/theme';

// ── Tab type ──────────────────────────────────────────────────────────────────

type TabKey = 'batter' | 'pitcher' | 'battery' | 'spot';

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
  const { currentUser } = useAuth();
  const [tab, setTab]       = useState<TabKey>('batter');
  const [games, setGames]   = useState<GameState[]>([]);
  const [loading, setLoading] = useState(true);

  // Spot tab state
  const [spotAtBats, setSpotAtBats]             = useState<SpotAtBat[]>([]);
  const [selectedSpotTeam, setSelectedSpotTeam] = useState<string | null>(null);
  const [selectedSpotPlayer, setSelectedSpotPlayer] = useState<string | null>(null);
  const [spotPlayerPickerOpen, setSpotPlayerPickerOpen] = useState(false);

  // Batter tab state
  const [batters, setBatters]                 = useState<BatterInfo[]>([]);
  const [selectedBatter, setSelectedBatter]   = useState<BatterInfo | null>(null);
  const [batterPickerOpen, setBatterPickerOpen] = useState(false);

  // Pitcher tab state
  const [pitchers, setPitchers]                     = useState<PitcherInfo[]>([]);
  const [selectedPitcher, setSelectedPitcher]       = useState<PitcherInfo | null>(null);
  const [pitcherPickerOpen, setPitcherPickerOpen]   = useState(false);
  const [selectedPitcherTeam, setSelectedPitcherTeam] = useState<string | null>(null);

  // Battery tab state
  const [batteries, setBatteries]               = useState<BatteryPair[]>([]);
  const [selectedBattery, setSelectedBattery]   = useState<BatteryPair | null>(null);
  const [batteryPickerOpen, setBatteryPickerOpen] = useState(false);

  // チーム選択 state
  const [selectedBatterTeam,  setSelectedBatterTeam]  = useState<string | null>(null);
  const [selectedBatteryTeam, setSelectedBatteryTeam] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const all = await db.games.getAll();
    setGames(all);
    setBatters(extractBatters(all));
    setPitchers(extractPitchers(all));
    setBatteries(extractBatteryPairs(all));
  }, []);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  // Spot tab: load all SpotAtBats for current user
  useEffect(() => {
    if (!currentUser?.uid) return;
    getUserSpotAtBats(currentUser.uid)
      .then(setSpotAtBats)
      .catch(() => {});
  }, [currentUser?.uid]);

  // チーム名 → 打者リスト
  const teamBattersMap = useMemo(() => {
    const map = new Map<string, BatterInfo[]>();
    for (const game of games) {
      for (const team of [game.awayTeam, game.homeTeam]) {
        const ids = new Set([
          ...team.roster.starters.map((p) => p.id),
          ...team.roster.bench.map((p) => p.id),
        ]);
        const list = batters.filter((b) => ids.has(b.batterId));
        if (list.length === 0) continue;
        const existing = map.get(team.name) ?? [];
        const merged = [...existing];
        for (const b of list) {
          if (!merged.some((e) => e.batterId === b.batterId)) merged.push(b);
        }
        map.set(team.name, merged);
      }
    }
    return map;
  }, [games, batters]);

  // チーム名 → 投手リスト
  const teamPitchersMap = useMemo(() => {
    const map = new Map<string, PitcherInfo[]>();
    for (const game of games) {
      for (const team of [game.awayTeam, game.homeTeam]) {
        const ids = new Set([
          ...team.roster.starters.map((p) => p.id),
          ...team.roster.bench.map((p) => p.id),
          ...(team.roster.pitcher ? [team.roster.pitcher.id] : []),
        ]);
        const list = pitchers.filter((p) => ids.has(p.pitcherId));
        if (list.length === 0) continue;
        const existing = map.get(team.name) ?? [];
        const merged = [...existing];
        for (const p of list) {
          if (!merged.some((e) => e.pitcherId === p.pitcherId)) merged.push(p);
        }
        map.set(team.name, merged);
      }
    }
    return map;
  }, [games, pitchers]);

  // チーム名 → バッテリーペアリスト
  const teamBatteryMap = useMemo(() => {
    const map = new Map<string, BatteryPair[]>();
    for (const game of games) {
      for (const team of [game.awayTeam, game.homeTeam]) {
        const ids = new Set([
          ...team.roster.starters.map((p) => p.id),
          ...team.roster.bench.map((p) => p.id),
          ...(team.roster.pitcher ? [team.roster.pitcher.id] : []),
        ]);
        const list = batteries.filter((b) => ids.has(b.pitcherId) || ids.has(b.catcherId));
        if (list.length === 0) continue;
        const existing = map.get(team.name) ?? [];
        const merged = [...existing];
        for (const b of list) {
          const key = `${b.pitcherId}-${b.catcherId}`;
          if (!merged.some((e) => `${e.pitcherId}-${e.catcherId}` === key)) merged.push(b);
        }
        map.set(team.name, merged);
      }
    }
    return map;
  }, [games, batteries]);

  const teamNames = useMemo(
    () => [...new Set([...teamBattersMap.keys(), ...teamPitchersMap.keys(), ...teamBatteryMap.keys()])].sort(),
    [teamBattersMap, teamPitchersMap, teamBatteryMap],
  );

  const filteredBatters   = selectedBatterTeam  ? (teamBattersMap.get(selectedBatterTeam)   ?? []) : [];
  const filteredPitchers  = selectedPitcherTeam ? (teamPitchersMap.get(selectedPitcherTeam) ?? []) : [];
  const filteredBatteries = selectedBatteryTeam ? (teamBatteryMap.get(selectedBatteryTeam)  ?? []) : [];

  // Spot: チーム一覧（opponent フィールド）
  const spotTeamNames = useMemo(() => {
    const named = [...new Set(spotAtBats.map((s) => s.opponent).filter((o): o is string => !!o))].sort();
    return [...named, '未設定'];
  }, [spotAtBats]);

  // Spot: 選択チームの選手一覧
  const spotPlayersForTeam = useMemo(() => {
    if (!selectedSpotTeam) return [];
    const filtered = selectedSpotTeam === '未設定'
      ? spotAtBats.filter((s) => !s.opponent)
      : spotAtBats.filter((s) => s.opponent === selectedSpotTeam);
    return [...new Set(filtered.map((s) => s.playerName))].sort();
  }, [spotAtBats, selectedSpotTeam]);

  const handleBatterTeamSelect = (name: string) => {
    setSelectedBatterTeam(name === selectedBatterTeam ? null : name);
    setSelectedBatter(null);
  };
  const handlePitcherTeamSelect = (name: string) => {
    setSelectedPitcherTeam(name === selectedPitcherTeam ? null : name);
    setSelectedPitcher(null);
  };
  const handleBatteryTeamSelect = (name: string) => {
    setSelectedBatteryTeam(name === selectedBatteryTeam ? null : name);
    setSelectedBattery(null);
  };
  const handleSpotTeamSelect = (name: string) => {
    setSelectedSpotTeam(name === selectedSpotTeam ? null : name);
    setSelectedSpotPlayer(null);
  };

  const canStart =
    tab === 'batter' ? !!selectedBatter
    : tab === 'pitcher' ? !!selectedPitcher
    : tab === 'battery' ? !!selectedBattery
    : !!selectedSpotPlayer;

  const handleStart = useCallback(() => {
    if (tab === 'batter' && selectedBatter) {
      router.push({
        pathname: '/analysis/batter-report' as any,
        params: {
          batterId:   selectedBatter.batterId,
          batterName: selectedBatter.batterName,
        },
      });
    } else if (tab === 'pitcher' && selectedPitcher) {
      router.push({
        pathname: '/analysis/pitcher-report' as any,
        params: {
          pitcherId:   selectedPitcher.pitcherId,
          pitcherName: selectedPitcher.pitcherName,
        },
      });
    } else if (tab === 'spot' && selectedSpotPlayer && selectedSpotTeam) {
      router.push({
        pathname: '/analysis/spot-report' as any,
        params: {
          playerName: selectedSpotPlayer,
          opponent:   selectedSpotTeam,
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
  }, [tab, selectedBatter, selectedPitcher, selectedBattery]);

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
            <Text style={styles.heroTitle}>選手・捕手分析</Text>
            <Text style={styles.heroSub}>
              {hasData
                ? `${games.length}試合のログから癖を特定します`
                : 'まず試合を記録してください'}
            </Text>
          </View>
        </View>

        {/* ── タブ ── */}
        <View style={styles.tabBar}>
          {(['batter', 'pitcher', 'battery', 'spot'] as const).map((key) => {
            const isActive = tab === key;
            const icon  = key === 'batter' ? 'baseball-bat' : key === 'pitcher' ? 'baseball' : key === 'battery' ? 'account-group' : 'baseball-bat';
            const label = key === 'batter' ? '打者分析' : key === 'pitcher' ? '投手分析' : key === 'battery' ? '捕手分析' : 'スポット';
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

            {/* Step 1: チーム選択 */}
            <Text style={styles.stepLabel}>① チームを選ぶ</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teamChipScroll}>
              <View style={styles.teamChipRow}>
                {teamNames.map((name) => (
                  <TouchableOpacity
                    key={name}
                    style={[styles.teamChip, selectedBatterTeam === name && styles.teamChipActive]}
                    onPress={() => handleBatterTeamSelect(name)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.teamChipText, selectedBatterTeam === name && styles.teamChipTextActive]}>
                      {name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Step 2: 選手選択 */}
            <Text style={[styles.stepLabel, !selectedBatterTeam && styles.stepLabelDim]}>② 選手を選ぶ</Text>
            <TouchableOpacity
              style={[
                styles.selector,
                !selectedBatter && styles.selectorEmpty,
                !selectedBatterTeam && styles.selectorDisabled,
              ]}
              onPress={() => { if (selectedBatterTeam) setBatterPickerOpen(true); }}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="account-outline"
                size={20}
                color={selectedBatter ? Colors.primary : Colors.textSecondary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.selectorText, !selectedBatter && styles.selectorPlaceholder]}>
                  {selectedBatter?.batterName ?? (selectedBatterTeam ? '選手を選ぶ…' : 'まずチームを選択')}
                </Text>
                {selectedBatter && (
                  <Text style={styles.selectorSub}>{selectedBatter.gameCount}試合のデータあり</Text>
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
        ) : tab === 'pitcher' ? (
          // ── 投手分析タブ ──────────────────────────────────────────────────
          <View style={styles.card}>
            <Text style={styles.cardTitle}>投手を選択</Text>
            <Text style={styles.cardDesc}>
              全捕手との投球ログを合算した投手総合分析を表示します。
            </Text>

            {/* Step 1: チーム選択 */}
            <Text style={styles.stepLabel}>① チームを選ぶ</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teamChipScroll}>
              <View style={styles.teamChipRow}>
                {teamNames.map((name) => (
                  <TouchableOpacity
                    key={name}
                    style={[styles.teamChip, selectedPitcherTeam === name && styles.teamChipActive]}
                    onPress={() => handlePitcherTeamSelect(name)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.teamChipText, selectedPitcherTeam === name && styles.teamChipTextActive]}>
                      {name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Step 2: 投手選択 */}
            <Text style={[styles.stepLabel, !selectedPitcherTeam && styles.stepLabelDim]}>② 投手を選ぶ</Text>
            <TouchableOpacity
              style={[
                styles.selector,
                !selectedPitcher && styles.selectorEmpty,
                !selectedPitcherTeam && styles.selectorDisabled,
              ]}
              onPress={() => { if (selectedPitcherTeam) setPitcherPickerOpen(true); }}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="baseball"
                size={20}
                color={selectedPitcher ? Colors.primary : Colors.textSecondary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.selectorText, !selectedPitcher && styles.selectorPlaceholder]}>
                  {selectedPitcher?.pitcherName ?? (selectedPitcherTeam ? '投手を選ぶ…' : 'まずチームを選択')}
                </Text>
                {selectedPitcher && (
                  <Text style={styles.selectorSub}>{selectedPitcher.gameCount}試合のデータあり</Text>
                )}
              </View>
              <MaterialCommunityIcons name="chevron-down" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            {selectedPitcher && (
              <View style={styles.infoChips}>
                <View style={styles.chip}>
                  <MaterialCommunityIcons name="chart-donut" size={12} color={Colors.primary} />
                  <Text style={styles.chipText}>球種割合</Text>
                </View>
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
        ) : tab === 'battery' ? (
          // ── バッテリー分析タブ ────────────────────────────────────────────
          <View style={styles.card}>
            <Text style={styles.cardTitle}>バッテリーを選択</Text>
            <Text style={styles.cardDesc}>
              投手×捕手ペアの決め球・カウント別配球傾向を解析します。
            </Text>

            {/* Step 1: チーム選択 */}
            <Text style={styles.stepLabel}>① チームを選ぶ</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teamChipScroll}>
              <View style={styles.teamChipRow}>
                {teamNames.map((name) => (
                  <TouchableOpacity
                    key={name}
                    style={[styles.teamChip, selectedBatteryTeam === name && styles.teamChipActive]}
                    onPress={() => handleBatteryTeamSelect(name)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.teamChipText, selectedBatteryTeam === name && styles.teamChipTextActive]}>
                      {name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Step 2: バッテリー選択 */}
            <Text style={[styles.stepLabel, !selectedBatteryTeam && styles.stepLabelDim]}>② バッテリーを選ぶ</Text>
            <TouchableOpacity
              style={[
                styles.selector,
                !selectedBattery && styles.selectorEmpty,
                !selectedBatteryTeam && styles.selectorDisabled,
              ]}
              onPress={() => { if (selectedBatteryTeam) setBatteryPickerOpen(true); }}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="account-multiple"
                size={20}
                color={selectedBattery ? Colors.primary : Colors.textSecondary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.selectorText, !selectedBattery && styles.selectorPlaceholder]}>
                  {selectedBattery
                    ? `${selectedBattery.pitcherName} × ${selectedBattery.catcherName}`
                    : (selectedBatteryTeam ? 'バッテリーを選ぶ…' : 'まずチームを選択')}
                </Text>
                {selectedBattery && (
                  <Text style={styles.selectorSub}>{selectedBattery.gameCount}試合のデータあり</Text>
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
        ) : (
          // ── スポット打席タブ ──────────────────────────────────────────────
          <View style={styles.card}>
            <Text style={styles.cardTitle}>スポット打席を選択</Text>
            <Text style={styles.cardDesc}>
              スポット打席記録から選手ごとの傾向を分析します。
            </Text>

            {spotAtBats.length === 0 ? (
              <View style={styles.emptyBox}>
                <MaterialCommunityIcons name="database-off-outline" size={40} color={Colors.border} />
                <Text style={styles.emptyText}>スポット打席データがありません</Text>
              </View>
            ) : (
              <>
                {/* Step 1: チーム選択 */}
                <Text style={styles.stepLabel}>① 対戦チームを選ぶ</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teamChipScroll}>
                  <View style={styles.teamChipRow}>
                    {spotTeamNames.map((name) => (
                      <TouchableOpacity
                        key={name}
                        style={[styles.teamChip, selectedSpotTeam === name && styles.teamChipActive]}
                        onPress={() => handleSpotTeamSelect(name)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.teamChipText, selectedSpotTeam === name && styles.teamChipTextActive]}>
                          {name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                {/* Step 2: 選手選択 */}
                <Text style={[styles.stepLabel, !selectedSpotTeam && styles.stepLabelDim]}>② 選手を選ぶ</Text>
                <TouchableOpacity
                  style={[
                    styles.selector,
                    !selectedSpotPlayer && styles.selectorEmpty,
                    !selectedSpotTeam && styles.selectorDisabled,
                  ]}
                  onPress={() => { if (selectedSpotTeam) setSpotPlayerPickerOpen(true); }}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name="account-outline"
                    size={20}
                    color={selectedSpotPlayer ? Colors.primary : Colors.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.selectorText, !selectedSpotPlayer && styles.selectorPlaceholder]}>
                      {selectedSpotPlayer ?? (selectedSpotTeam ? '選手を選ぶ…' : 'まずチームを選択')}
                    </Text>
                    {selectedSpotPlayer && (
                      <Text style={styles.selectorSub}>
                        {spotAtBats.filter((s) =>
                          s.playerName === selectedSpotPlayer &&
                          (selectedSpotTeam === '未設定' ? !s.opponent : s.opponent === selectedSpotTeam)
                        ).length}打席のデータあり
                      </Text>
                    )}
                  </View>
                  <MaterialCommunityIcons name="chevron-down" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>

                {selectedSpotPlayer && (
                  <View style={styles.infoChips}>
                    <View style={styles.chip}>
                      <MaterialCommunityIcons name="chart-bar" size={12} color={Colors.primary} />
                      <Text style={styles.chipText}>打席結果サマリ</Text>
                    </View>
                    <View style={styles.chip}>
                      <MaterialCommunityIcons name="target" size={12} color={Colors.primary} />
                      <Text style={styles.chipText}>コース分布</Text>
                    </View>
                    <View style={styles.chip}>
                      <MaterialCommunityIcons name="baseball" size={12} color={Colors.primary} />
                      <Text style={styles.chipText}>球種別集計</Text>
                    </View>
                  </View>
                )}
              </>
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
        {hasData && (
          (batters.length === 0 && tab === 'batter') ||
          (pitchers.length === 0 && tab === 'pitcher') ||
          (batteries.length === 0 && tab === 'battery')
        ) && (
          <Text style={styles.noDataHint}>
            {tab === 'batter'
              ? '打席データのある選手が見つかりません。'
              : tab === 'pitcher'
              ? '投球データのある投手が見つかりません。'
              : '投球データのある試合がありません。'}
          </Text>
        )}
      </ScrollView>

      {/* ── ピッカー モーダル ── */}
      <PickerModal<BatterInfo>
        visible={batterPickerOpen}
        items={filteredBatters}
        onSelect={setSelectedBatter}
        onClose={() => setBatterPickerOpen(false)}
        labelFn={(b) => b.batterName}
        subFn={(b) => `${b.gameCount}試合`}
      />

      <PickerModal<PitcherInfo>
        visible={pitcherPickerOpen}
        items={filteredPitchers}
        onSelect={setSelectedPitcher}
        onClose={() => setPitcherPickerOpen(false)}
        labelFn={(p) => p.pitcherName}
        subFn={(p) => `${p.gameCount}試合`}
      />

      <PickerModal<BatteryPair>
        visible={batteryPickerOpen}
        items={filteredBatteries}
        onSelect={setSelectedBattery}
        onClose={() => setBatteryPickerOpen(false)}
        labelFn={(b) => `${b.pitcherName} × ${b.catcherName}`}
        subFn={(b) => `投手: ${b.pitcherName} / 捕手: ${b.catcherName} — ${b.gameCount}試合`}
      />

      <PickerModal<string>
        visible={spotPlayerPickerOpen}
        items={spotPlayersForTeam}
        onSelect={setSelectedSpotPlayer}
        onClose={() => setSpotPlayerPickerOpen(false)}
        labelFn={(p) => p}
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

  // 2段階選択UI
  stepLabel: {
    fontSize:      Typography.tiny,
    fontWeight:    '700',
    color:         Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  stepLabelDim: { opacity: 0.35 },
  teamChipScroll: { marginHorizontal: -Spacing.md },
  teamChipRow: {
    flexDirection: 'row',
    gap:           Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingBottom: 4,
  },
  teamChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical:   6,
    borderRadius:      BorderRadius.full,
    backgroundColor:   Colors.surfaceGray,
    borderWidth:       1.5,
    borderColor:       Colors.border,
  },
  teamChipActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  teamChipText:       { fontSize: Typography.caption, fontWeight: '600', color: Colors.text },
  teamChipTextActive: { color: Colors.white },
  selectorDisabled:   { opacity: 0.4 },
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
