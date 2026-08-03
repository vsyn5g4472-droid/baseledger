/**
 * 選手を統合 — 別 ID で記録された同一人物を、自分専用の名寄せメモで束ねる画面。
 *
 * 書き込むのは playerMerges コレクションのみ。
 * 試合データ・TeamPlayer 名簿には一切触れない（ソフト統合）。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { db } from '../../src/db';
import type { GameState } from '../../src/types/game';
import { listEditablePlayers } from '../../src/services/gamePlayerEditService';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  getPlayerMergeEntries,
  savePlayerMergeEntries,
  upsertMergeEntry,
  removeMergeEntry,
  type PlayerMergeEntry,
} from '../../src/services/playerMergeService';
import { Colors, Spacing, Typography, BorderRadius, CardShadow } from '../../src/constants/theme';

const UNKNOWN_PLAYER_LABEL = '(不明な選手)';

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function gameLabel(g: GameState): string {
  return `${formatDate(g.createdAt)} ${g.awayTeam.name} vs ${g.homeTeam.name}`;
}

/** 統合候補の1行 = 通算集計キー (resolvedId) 単位に畳んだ選手 */
interface CandidateRow {
  resolvedId:   string;
  realPlayerId?: string;
  name:         string;
  number:       number | null;
  teamNames:    string[];
  gameLabels:   string[];
}

export default function MergePlayersScreen() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;

  const [tab, setTab]         = useState<'new' | 'merged'>('new');
  const [games, setGames]     = useState<GameState[]>([]);
  const [entries, setEntries] = useState<PlayerMergeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  // ① 試合 / ② チーム / ③ 選手
  const [gameIds, setGameIds]         = useState<string[]>([]);
  const [teamNames, setTeamNames]     = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [primaryId, setPrimaryId]     = useState<string | null>(null);
  const [expanded, setExpanded]       = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [all, saved] = await Promise.all([
        db.games.getAll(),
        uid ? getPlayerMergeEntries(uid).catch(() => [] as PlayerMergeEntry[]) : Promise.resolve([]),
      ]);
      setGames(all);
      setEntries(saved);
      setLoading(false);
    })();
  }, [uid]);

  // ── ① で選ばれた試合 ────────────────────────────────────────────────────
  const selectedGames = useMemo(
    () => games.filter((g) => gameIds.includes(g.id)),
    [games, gameIds],
  );

  // ── ② の候補チーム名（①の試合に登場するもの。自動照合はしない） ──────────
  const availableTeamNames = useMemo(() => {
    const set = new Set<string>();
    for (const g of selectedGames) {
      set.add(g.awayTeam.name);
      set.add(g.homeTeam.name);
    }
    return [...set].sort();
  }, [selectedGames]);

  // ── ③ の選手候補（resolvedId 単位に畳む） ───────────────────────────────
  const candidates = useMemo<CandidateRow[]>(() => {
    const map = new Map<string, CandidateRow>();
    for (const g of selectedGames) {
      const label = gameLabel(g);
      for (const { teamName, player } of listEditablePlayers(g)) {
        if (!teamNames.includes(teamName)) continue;
        // この画面では名寄せメモを適用しない生の resolvedId で並べる。
        // 既存エントリとの合流は upsertMergeEntry の吸収に任せる。
        const resolvedId = player.realPlayerId ?? player.id;
        const row = map.get(resolvedId);
        if (row) {
          if (!row.teamNames.includes(teamName)) row.teamNames.push(teamName);
          if (!row.gameLabels.includes(label)) row.gameLabels.push(label);
          if (!row.realPlayerId && player.realPlayerId) row.realPlayerId = player.realPlayerId;
        } else {
          map.set(resolvedId, {
            resolvedId,
            realPlayerId: player.realPlayerId,
            name:         player.name,
            number:       player.number,
            teamNames:    [teamName],
            gameLabels:   [label],
          });
        }
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }, [selectedGames, teamNames]);

  // 選択済みだが候補から消えた行を掃除する
  useEffect(() => {
    const alive = new Set(candidates.map((c) => c.resolvedId));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => alive.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [candidates]);

  useEffect(() => {
    if (primaryId && !selectedIds.includes(primaryId)) setPrimaryId(selectedIds[0] ?? null);
    if (!primaryId && selectedIds.length > 0) setPrimaryId(selectedIds[0]);
  }, [selectedIds, primaryId]);

  // ── 統合内容の決定 ──────────────────────────────────────────────────────
  const plan = useMemo(() => {
    const selected = candidates.filter((c) => selectedIds.includes(c.resolvedId));
    if (selected.length < 2) return null;

    const primary = selected.find((c) => c.resolvedId === primaryId) ?? selected[0];
    // ① 名簿に紐づく realPlayerId があればそれを canonical に優先する
    //    （主が持っていれば主のもの、無ければ選択内で最初に見つかったもの）
    // ② 誰も持たない（名簿外選手同士）場合は主の resolvedId を canonical にする
    const withReal = selected.find((c) => !!c.realPlayerId);
    const canonicalId =
      primary.realPlayerId ?? withReal?.realPlayerId ?? primary.resolvedId;
    // ③ 表示名は主の名前
    const canonicalName = primary.name;
    const memberIds = selected
      .map((c) => c.resolvedId)
      .filter((id) => id !== canonicalId);

    return { canonicalId, canonicalName, memberIds, count: selected.length };
  }, [candidates, selectedIds, primaryId]);

  // ── 保存 ────────────────────────────────────────────────────────────────
  const handleMerge = useCallback(() => {
    if (!plan) return;
    if (!uid) {
      Alert.alert('ログインが必要です', '選手の統合はログイン中のみ利用できます。');
      return;
    }
    Alert.alert(
      '選手を統合',
      `「${plan.canonicalName}」に ${plan.memberIds.length}件を統合します。\n\n`
        + '分析画面の集計が合算されます。試合データは変更されません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '統合する',
          onPress: async () => {
            setSaving(true);
            try {
              const current = await getPlayerMergeEntries(uid);
              const next = upsertMergeEntry(current, {
                canonicalId:   plan.canonicalId,
                canonicalName: plan.canonicalName,
                memberIds:     plan.memberIds,
              });
              await savePlayerMergeEntries(uid, next);
              setEntries(next);
              setSelectedIds([]);
              setPrimaryId(null);
              setTab('merged');
            } catch {
              Alert.alert('保存に失敗しました', '通信状況を確認して、もう一度お試しください。');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }, [plan, uid]);

  const handleUnmerge = useCallback((entry: PlayerMergeEntry) => {
    if (!uid) return;
    Alert.alert(
      '統合を解除',
      `「${entry.canonicalName}」の統合を解除します。\n\n分析画面では再び別の選手として集計されます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '解除する',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              const current = await getPlayerMergeEntries(uid);
              const next = removeMergeEntry(current, entry.canonicalId);
              await savePlayerMergeEntries(uid, next);
              setEntries(next);
            } catch {
              Alert.alert('保存に失敗しました', '通信状況を確認して、もう一度お試しください。');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }, [uid]);

  // ── 統合済みタブの表示名解決 ────────────────────────────────────────────
  const displayNameMap = useMemo(() => {
    const m = new Map<string, { name: string; teamName: string }>();
    for (const g of games) {
      for (const { teamName, player } of listEditablePlayers(g)) {
        const resolvedId = player.realPlayerId ?? player.id;
        if (!m.has(resolvedId)) m.set(resolvedId, { name: player.name, teamName });
      }
    }
    return m;
  }, [games]);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: '選手を統合' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: '選手を統合' }} />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* ── タブ ── */}
        <View style={styles.tabBar}>
          {([
            ['new', '新規統合'],
            ['merged', `統合済み (${entries.length})`],
          ] as const).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.tabBtn, tab === key && styles.tabBtnActive]}
              onPress={() => setTab(key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabLabel, tab === key && styles.tabLabelActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'new' ? (
          <>
            <View style={styles.noteBox}>
              <MaterialCommunityIcons name="information-outline" size={16} color={Colors.primary} />
              <Text style={styles.noteText}>
                別の試合で別 ID として記録された同じ選手を束ねます。試合データは変更されません。
              </Text>
            </View>

            {/* ── ① 試合を選ぶ ── */}
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.stepLabel}>① 試合を選ぶ</Text>
                {games.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setGameIds(gameIds.length === games.length ? [] : games.map((g) => g.id))}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.linkText}>
                      {gameIds.length === games.length ? 'すべて解除' : 'すべて選択'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {games.length === 0 ? (
                <Text style={styles.emptyText}>試合データがありません</Text>
              ) : (
                games.map((g) => {
                  const on = gameIds.includes(g.id);
                  return (
                    <TouchableOpacity
                      key={g.id}
                      style={[styles.row, on && styles.rowActive]}
                      onPress={() => {
                        setGameIds(toggle(gameIds, g.id));
                        setTeamNames([]);
                        setSelectedIds([]);
                      }}
                      activeOpacity={0.75}
                    >
                      <MaterialCommunityIcons
                        name={on ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={20}
                        color={on ? Colors.primary : Colors.border}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowLabel}>{gameLabel(g)}</Text>
                        {!!g.metadata.tournamentName && (
                          <Text style={styles.rowSub}>{g.metadata.tournamentName}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            {/* ── ② チームを選ぶ ── */}
            <View style={styles.card}>
              <Text style={[styles.stepLabel, gameIds.length === 0 && styles.stepLabelDim]}>
                ② チームを選ぶ
              </Text>
              <Text style={styles.cardDesc}>
                表記ゆれがあっても自動では照合しません。束ねたいチームを手動で選んでください。
              </Text>
              {availableTeamNames.length === 0 ? (
                <Text style={styles.emptyText}>まず試合を選択してください</Text>
              ) : (
                <View style={styles.chipWrap}>
                  {availableTeamNames.map((name) => {
                    const on = teamNames.includes(name);
                    return (
                      <TouchableOpacity
                        key={name}
                        style={[styles.chip, on && styles.chipActive]}
                        onPress={() => { setTeamNames(toggle(teamNames, name)); setSelectedIds([]); }}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.chipText, on && styles.chipTextActive]}>{name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* ── ③ 選手を選ぶ ── */}
            <View style={styles.card}>
              <Text style={[styles.stepLabel, teamNames.length === 0 && styles.stepLabelDim]}>
                ③ 選手を選ぶ（2人以上）
              </Text>
              <Text style={styles.cardDesc}>
                同じ人物の行をすべて選び、王冠アイコンで代表（主）を指定します。
              </Text>

              {candidates.length === 0 ? (
                <Text style={styles.emptyText}>まずチームを選択してください</Text>
              ) : (
                candidates.map((c) => {
                  const on = selectedIds.includes(c.resolvedId);
                  const isPrimary = on && primaryId === c.resolvedId;
                  return (
                    <TouchableOpacity
                      key={c.resolvedId}
                      style={[styles.row, on && styles.rowActive]}
                      onPress={() => setSelectedIds(toggle(selectedIds, c.resolvedId))}
                      activeOpacity={0.75}
                    >
                      <MaterialCommunityIcons
                        name={on ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={20}
                        color={on ? Colors.primary : Colors.border}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowLabel}>
                          {c.name}
                          {c.number !== null ? ` (#${c.number})` : ''}
                          {c.realPlayerId ? ' ・名簿' : ''}
                        </Text>
                        {/* チーム名は誤統合を防ぐ手がかりなので必ず表示する */}
                        <Text style={styles.rowTeam}>{c.teamNames.join(' / ')}</Text>
                        <Text style={styles.rowSub}>
                          {c.gameLabels[0]}
                          {c.gameLabels.length > 1 ? ` 他${c.gameLabels.length - 1}試合` : ''}
                        </Text>
                      </View>
                      {on && (
                        <TouchableOpacity
                          onPress={() => setPrimaryId(c.resolvedId)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MaterialCommunityIcons
                            name={isPrimary ? 'crown' : 'crown-outline'}
                            size={20}
                            color={isPrimary ? Colors.primary : Colors.border}
                          />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            {!!plan && (
              <Text style={styles.planText}>
                「{plan.canonicalName}」に {plan.memberIds.length}件を統合します
              </Text>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, (!plan || saving) && styles.primaryBtnDisabled]}
              onPress={handleMerge}
              disabled={!plan || saving}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="merge" size={20} color={Colors.white} />
              <Text style={styles.primaryBtnText}>統合する</Text>
            </TouchableOpacity>
          </>
        ) : (
          // ── 統合済みタブ ────────────────────────────────────────────────
          <>
            {entries.length === 0 ? (
              <View style={styles.emptyBox}>
                <MaterialCommunityIcons name="account-multiple-outline" size={48} color={Colors.border} />
                <Text style={styles.emptyText}>統合済みの選手はありません</Text>
              </View>
            ) : (
              entries.map((e) => {
                const open = expanded === e.canonicalId;
                return (
                  <View key={e.canonicalId} style={styles.card}>
                    <TouchableOpacity
                      style={styles.entryHead}
                      onPress={() => setExpanded(open ? null : e.canonicalId)}
                      activeOpacity={0.75}
                    >
                      <MaterialCommunityIcons name="crown" size={18} color={Colors.primary} />
                      <View style={{ flex: 1 }}>
                        {/* canonicalName はエントリに保存済みなので常に表示できる */}
                        <Text style={styles.rowLabel}>{e.canonicalName}</Text>
                        <Text style={styles.rowSub}>{e.memberIds.length}人を統合中</Text>
                      </View>
                      <MaterialCommunityIcons
                        name={open ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={Colors.textSecondary}
                      />
                    </TouchableOpacity>

                    {open && (
                      <>
                        {e.memberIds.map((id) => {
                          const info = displayNameMap.get(id);
                          return (
                            <View key={id} style={styles.memberRow}>
                              <MaterialCommunityIcons
                                name="subdirectory-arrow-right"
                                size={16}
                                color={Colors.textSecondary}
                              />
                              <Text style={styles.memberName}>
                                {info?.name ?? UNKNOWN_PLAYER_LABEL}
                              </Text>
                              {!!info?.teamName && (
                                <Text style={styles.memberTeam}>{info.teamName}</Text>
                              )}
                            </View>
                          );
                        })}
                        <TouchableOpacity
                          style={[styles.dangerBtn, saving && styles.primaryBtnDisabled]}
                          onPress={() => handleUnmerge(e)}
                          disabled={saving}
                          activeOpacity={0.85}
                        >
                          <MaterialCommunityIcons name="call-split" size={16} color={Colors.error} />
                          <Text style={styles.dangerBtnText}>統合を解除</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content:   { padding: Spacing.md, gap: Spacing.md, paddingBottom: 60 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  tabBar: {
    flexDirection:   'row',
    backgroundColor: Colors.surfaceGray,
    borderRadius:    BorderRadius.lg,
    padding:         4,
    gap:             4,
  },
  tabBtn: {
    flex:            1,
    alignItems:      'center',
    paddingVertical: Spacing.sm,
    borderRadius:    BorderRadius.md,
  },
  tabBtnActive:   { backgroundColor: Colors.primary },
  tabLabel:       { fontSize: Typography.caption, fontWeight: '700', color: Colors.textSecondary },
  tabLabelActive: { color: Colors.white },

  noteBox: {
    flexDirection:   'row',
    gap:             Spacing.sm,
    backgroundColor: Colors.primaryLight,
    borderRadius:    BorderRadius.lg,
    padding:         Spacing.sm,
  },
  noteText: { flex: 1, fontSize: Typography.tiny, color: Colors.primary, lineHeight: 16 },

  card: {
    backgroundColor: Colors.white,
    borderRadius:    BorderRadius.xl,
    padding:         Spacing.md,
    gap:             Spacing.sm,
    ...CardShadow,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardDesc: { fontSize: Typography.caption, color: Colors.textSecondary, lineHeight: 18 },
  linkText: { fontSize: Typography.caption, fontWeight: '700', color: Colors.primary },

  stepLabel: {
    fontSize:      Typography.tiny,
    fontWeight:    '700',
    color:         Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  stepLabelDim: { opacity: 0.35 },

  row: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius:    BorderRadius.md,
    backgroundColor: Colors.surfaceGray,
  },
  rowActive: { backgroundColor: Colors.primaryLight },
  rowLabel:  { fontSize: Typography.bodySmall, fontWeight: '700', color: Colors.text },
  rowTeam:   { fontSize: Typography.tiny, fontWeight: '700', color: Colors.primary, marginTop: 2 },
  rowSub:    { fontSize: Typography.tiny, color: Colors.textSecondary, marginTop: 2 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical:   6,
    borderRadius:      BorderRadius.full,
    backgroundColor:   Colors.surfaceGray,
    borderWidth:       1.5,
    borderColor:       Colors.border,
  },
  chipActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:       { fontSize: Typography.caption, fontWeight: '600', color: Colors.text },
  chipTextActive: { color: Colors.white },

  planText: { fontSize: Typography.caption, color: Colors.textSecondary, textAlign: 'center' },

  primaryBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius:    BorderRadius.full,
    paddingVertical: Spacing.md,
  },
  primaryBtnDisabled: { backgroundColor: Colors.border, opacity: 0.7 },
  primaryBtnText: {
    fontSize:      Typography.body,
    fontWeight:    '900',
    color:         Colors.white,
    letterSpacing: 0.5,
  },

  entryHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  memberRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.xs,
    paddingLeft:   Spacing.md,
  },
  memberName: { fontSize: Typography.caption, color: Colors.text, fontWeight: '600' },
  memberTeam: { fontSize: Typography.tiny, color: Colors.textSecondary },

  dangerBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             Spacing.xs,
    borderRadius:    BorderRadius.full,
    borderWidth:     1.5,
    borderColor:     Colors.error,
    paddingVertical: Spacing.sm,
    marginTop:       Spacing.xs,
  },
  dangerBtnText: { fontSize: Typography.caption, fontWeight: '800', color: Colors.error },

  emptyBox:  { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xxl },
  emptyText: { fontSize: Typography.caption, color: Colors.textSecondary },
});
