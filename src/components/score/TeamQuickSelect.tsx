import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { getUserTeams } from '../../services/teamService';
import { gameService } from '../../services/gameService';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';

type TabId = 'myteam' | 'registered' | 'history';

const TABS: { id: TabId; label: string }[] = [
  { id: 'myteam',     label: 'マイチーム' },
  { id: 'registered', label: '登録済み'   },
  { id: 'history',    label: '対戦履歴'   },
];

interface Props {
  onSelect: (name: string) => void;
  side: 'away' | 'home';
}

export default function TeamQuickSelect({ onSelect }: Props) {
  const { currentUser } = useAuth();
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('myteam');
  const [myTeams, setMyTeams] = useState<string[]>([]);
  const [historyTeams, setHistoryTeams] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    Promise.all([
      getUserTeams(currentUser.uid),
      gameService.getUserGames(currentUser.uid),
    ])
      .then(([teams, games]) => {
        setMyTeams(teams.map((t) => t.name));

        const seen = new Set<string>();
        const names: string[] = [];
        for (const g of games) {
          for (const name of [g.awayTeam.name, g.homeTeam.name]) {
            if (name && !seen.has(name) && names.length < 5) {
              seen.add(name);
              names.push(name);
            }
          }
        }
        setHistoryTeams(names);
      })
      .finally(() => setLoading(false));
  }, [currentUser]);

  const names: string[] = activeTab === 'history' ? historyTeams : myTeams;

  return (
    <View style={styles.container}>
      {/* 折りたたみトグル */}
      <TouchableOpacity style={styles.toggleRow} onPress={() => setExpanded((v) => !v)}>
        <Text style={styles.toggleLabel}>クイック選択</Text>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={Colors.textSecondary}
        />
      </TouchableOpacity>

      {expanded && (
        <>
          {/* タブ */}
          <View style={styles.tabRow}>
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, activeTab === tab.id && styles.tabActive]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* コンテンツ */}
          {loading ? (
            <ActivityIndicator size="small" color={Colors.primary} style={styles.indicator} />
          ) : names.length === 0 ? (
            <Text style={styles.empty}>チームがありません</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {names.map((name) => (
                <TouchableOpacity key={name} style={styles.chip} onPress={() => onSelect(name)}>
                  <Text style={styles.chipText}>{name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  toggleLabel: {
    fontSize: Typography.caption,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  indicator: {
    marginVertical: Spacing.sm,
  },
  empty: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
  chipRow: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  chip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipText: {
    fontSize: Typography.caption,
    color: Colors.text,
    fontWeight: '600',
  },
});
