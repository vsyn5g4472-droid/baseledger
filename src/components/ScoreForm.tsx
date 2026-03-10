import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { TextInput, Button, SegmentedButtons, Text } from 'react-native-paper';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme';
import type { BattingScore, PitchingScore, FieldingScore } from '../models/types';

type ScoreTab = 'batting' | 'pitching' | 'fielding';

interface ScoreFormProps {
  onSave: (data: {
    opponent: string;
    gameDate: string;
    batting: BattingScore | null;
    pitching: PitchingScore | null;
    fielding: FieldingScore | null;
  }) => void;
  loading?: boolean;
}

const emptyBatting: BattingScore = {
  atBats: 0, hits: 0, doubles: 0, triples: 0,
  homeRuns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0,
};

const emptyPitching: PitchingScore = {
  inningsPitched: 0, hits: 0, runs: 0, earnedRuns: 0,
  walks: 0, strikeouts: 0, homeRunsAllowed: 0,
};

const emptyFielding: FieldingScore = {
  putouts: 0, assists: 0, errors: 0,
};

export default function ScoreForm({ onSave, loading }: ScoreFormProps) {
  const [tab, setTab] = useState<ScoreTab>('batting');
  const [opponent, setOpponent] = useState('');
  const [gameDate, setGameDate] = useState(new Date().toISOString().split('T')[0]);
  const [batting, setBatting] = useState<BattingScore>({ ...emptyBatting });
  const [pitching, setPitching] = useState<PitchingScore>({ ...emptyPitching });
  const [fielding, setFielding] = useState<FieldingScore>({ ...emptyFielding });
  const [enabledTabs, setEnabledTabs] = useState<Set<ScoreTab>>(new Set(['batting']));

  const toggleTab = (t: ScoreTab) => {
    const next = new Set(enabledTabs);
    if (next.has(t)) {
      next.delete(t);
    } else {
      next.add(t);
    }
    setEnabledTabs(next);
  };

  const numField = (label: string, value: number, onChange: (v: number) => void) => (
    <TextInput
      key={label}
      label={label}
      mode="outlined"
      keyboardType="numeric"
      value={value === 0 ? '' : String(value)}
      onChangeText={(t) => onChange(Number(t) || 0)}
      style={styles.numInput}
      outlineColor={Colors.border}
      activeOutlineColor={Colors.primary}
    />
  );

  const handleSave = () => {
    onSave({
      opponent,
      gameDate,
      batting: enabledTabs.has('batting') ? batting : null,
      pitching: enabledTabs.has('pitching') ? pitching : null,
      fielding: enabledTabs.has('fielding') ? fielding : null,
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <TextInput
        label="Opponent"
        mode="outlined"
        value={opponent}
        onChangeText={setOpponent}
        style={styles.input}
        outlineColor={Colors.border}
        activeOutlineColor={Colors.primary}
      />
      <TextInput
        label="Game Date (YYYY-MM-DD)"
        mode="outlined"
        value={gameDate}
        onChangeText={setGameDate}
        style={styles.input}
        outlineColor={Colors.border}
        activeOutlineColor={Colors.primary}
      />

      <Text style={styles.sectionTitle}>Stats Categories</Text>
      <SegmentedButtons
        value={tab}
        onValueChange={(v) => setTab(v as ScoreTab)}
        buttons={[
          { value: 'batting', label: 'Batting', checkedColor: Colors.primary },
          { value: 'pitching', label: 'Pitching', checkedColor: Colors.primary },
          { value: 'fielding', label: 'Fielding', checkedColor: Colors.primary },
        ]}
        style={styles.segmented}
      />

      {tab === 'batting' && (
        <View style={styles.fieldGroup}>
          <View style={styles.fieldRow}>
            {numField('At Bats', batting.atBats, (v) => setBatting({ ...batting, atBats: v }))}
            {numField('Hits', batting.hits, (v) => setBatting({ ...batting, hits: v }))}
          </View>
          <View style={styles.fieldRow}>
            {numField('Doubles', batting.doubles, (v) => setBatting({ ...batting, doubles: v }))}
            {numField('Triples', batting.triples, (v) => setBatting({ ...batting, triples: v }))}
          </View>
          <View style={styles.fieldRow}>
            {numField('Home Runs', batting.homeRuns, (v) => setBatting({ ...batting, homeRuns: v }))}
            {numField('RBIs', batting.rbis, (v) => setBatting({ ...batting, rbis: v }))}
          </View>
          <View style={styles.fieldRow}>
            {numField('Walks', batting.walks, (v) => setBatting({ ...batting, walks: v }))}
            {numField('Strikeouts', batting.strikeouts, (v) => setBatting({ ...batting, strikeouts: v }))}
          </View>
          {numField('Stolen Bases', batting.stolenBases, (v) => setBatting({ ...batting, stolenBases: v }))}
        </View>
      )}

      {tab === 'pitching' && (
        <View style={styles.fieldGroup}>
          <View style={styles.fieldRow}>
            {numField('Innings Pitched', pitching.inningsPitched, (v) => setPitching({ ...pitching, inningsPitched: v }))}
            {numField('Hits Allowed', pitching.hits, (v) => setPitching({ ...pitching, hits: v }))}
          </View>
          <View style={styles.fieldRow}>
            {numField('Runs', pitching.runs, (v) => setPitching({ ...pitching, runs: v }))}
            {numField('Earned Runs', pitching.earnedRuns, (v) => setPitching({ ...pitching, earnedRuns: v }))}
          </View>
          <View style={styles.fieldRow}>
            {numField('Walks', pitching.walks, (v) => setPitching({ ...pitching, walks: v }))}
            {numField('Strikeouts', pitching.strikeouts, (v) => setPitching({ ...pitching, strikeouts: v }))}
          </View>
          {numField('HR Allowed', pitching.homeRunsAllowed, (v) => setPitching({ ...pitching, homeRunsAllowed: v }))}
        </View>
      )}

      {tab === 'fielding' && (
        <View style={styles.fieldGroup}>
          {numField('Putouts', fielding.putouts, (v) => setFielding({ ...fielding, putouts: v }))}
          {numField('Assists', fielding.assists, (v) => setFielding({ ...fielding, assists: v }))}
          {numField('Errors', fielding.errors, (v) => setFielding({ ...fielding, errors: v }))}
        </View>
      )}

      <Button
        mode="contained"
        onPress={handleSave}
        style={styles.saveButton}
        buttonColor={Colors.primary}
        loading={loading}
        disabled={!opponent.trim()}
      >
        Save Score
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  input: {
    marginBottom: Spacing.md,
    backgroundColor: Colors.card,
  },
  sectionTitle: {
    fontSize: Typography.h4,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  segmented: {
    marginBottom: Spacing.md,
  },
  fieldGroup: {
    marginBottom: Spacing.md,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  numInput: {
    flex: 1,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.card,
  },
  saveButton: {
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.xs,
  },
});
