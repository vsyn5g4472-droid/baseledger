import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme';

interface StatBar {
  label: string;
  value: number;
  maxValue: number;
  color?: string;
}

interface StatsChartProps {
  title: string;
  bars: StatBar[];
}

export default function StatsChart({ title, bars }: StatsChartProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {bars.map((bar, index) => {
        const pct = bar.maxValue > 0 ? Math.min((bar.value / bar.maxValue) * 100, 100) : 0;
        return (
          <View key={index} style={styles.barRow}>
            <Text style={styles.label}>{bar.label}</Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${pct}%`, backgroundColor: bar.color ?? Colors.primary },
                ]}
              />
            </View>
            <Text style={styles.value}>{bar.value}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  title: {
    fontSize: Typography.h4,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  label: {
    width: 80,
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
  },
  barTrack: {
    flex: 1,
    height: 12,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    marginHorizontal: Spacing.sm,
  },
  barFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
  value: {
    width: 40,
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'right',
  },
});
