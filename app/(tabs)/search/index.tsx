import React, { useState } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Searchbar, Chip, Text, SegmentedButtons } from 'react-native-paper';
import { router } from 'expo-router';
import PlayerCard from '../../../src/components/PlayerCard';
import EmptyState from '../../../src/components/EmptyState';
import { usePlayerSearch } from '../../../src/hooks/useSearch';
import { Colors, Spacing, Typography } from '../../../src/constants/theme';

const positions = ['All', 'Pitcher', 'Catcher', 'Infield', 'Outfield'];

export default function SearchScreen() {
  const { results, loading, search, filters, setFilters, applyFilters, aiRecommendations } = usePlayerSearch();
  const [query, setQuery] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('All');

  const handleSearch = (text: string) => {
    setQuery(text);
    search(text);
  };

  const handlePositionFilter = (pos: string) => {
    setSelectedPosition(pos);
    if (pos === 'All') {
      setFilters({ ...filters, position: undefined });
    } else {
      setFilters({ ...filters, position: pos });
    }
    applyFilters();
  };

  const displayResults = query.length > 0 ? results : aiRecommendations;

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder="Search players, teams..."
        value={query}
        onChangeText={handleSearch}
        style={styles.searchBar}
      />

      <View style={styles.filterRow}>
        {positions.map((pos) => (
          <Chip
            key={pos}
            selected={selectedPosition === pos}
            onPress={() => handlePositionFilter(pos)}
            style={[styles.chip, selectedPosition === pos && styles.chipSelected]}
            textStyle={[styles.chipText, selectedPosition === pos && styles.chipTextSelected]}
            compact
          >
            {pos}
          </Chip>
        ))}
      </View>

      {query.length === 0 && (
        <Text style={styles.sectionTitle}>AI Recommended Players</Text>
      )}

      <FlatList
        data={displayResults}
        keyExtractor={(item) => item.uid}
        renderItem={({ item }) => (
          <PlayerCard
            name={item.displayName}
            photoURL={item.photoURL}
            position={item.position}
            team={item.team}
            age={item.age}
            battingAvg={item.stats.batting.avg}
            era={item.stats.pitching.era}
            fieldingPct={item.stats.fielding.fieldingPct}
            onPress={() => router.push(`/user/${item.uid}`)}
          />
        )}
        contentContainerStyle={displayResults.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <EmptyState
            icon="account-search"
            title={loading ? 'Searching...' : 'No players found'}
            subtitle="Try different keywords or filters"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchBar: {
    margin: Spacing.md,
    backgroundColor: Colors.card,
    elevation: 1,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  chip: { backgroundColor: Colors.card },
  chipSelected: { backgroundColor: Colors.primary },
  chipText: { color: Colors.text, fontSize: 12 },
  chipTextSelected: { color: Colors.white },
  sectionTitle: {
    fontSize: Typography.h4,
    fontWeight: '600',
    color: Colors.text,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  listContent: { paddingBottom: Spacing.xl },
  emptyContainer: { flex: 1 },
});
