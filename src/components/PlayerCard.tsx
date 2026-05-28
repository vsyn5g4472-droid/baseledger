import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Card, Text, Avatar, Button, Chip } from 'react-native-paper';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme';
import { useFollow } from '../hooks/useFollow';

interface PlayerCardProps {
  userId: string;
  name: string;
  photoURL: string | null;
  position: string | null;
  team: string | null;
  age: number | null;
  battingAvg: number;
  era: number;
  fieldingPct: number;
  onPress?: () => void;
}

export default function PlayerCard({
  userId,
  name,
  photoURL,
  position,
  team,
  age,
  battingAvg,
  era,
  fieldingPct,
  onPress,
}: PlayerCardProps) {
  const { isFollowing, toggleFollow, loading: followLoading } = useFollow(userId);

  return (
    <Card style={styles.card} onPress={onPress}>
      <View style={styles.row}>
        <View style={styles.avatarSection}>
          {photoURL ? (
            <Avatar.Image size={56} source={{ uri: photoURL }} />
          ) : (
            <Avatar.Text size={56} label={name.charAt(0).toUpperCase()} style={styles.avatar} />
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{name}</Text>
          <View style={styles.metaRow}>
            {position && <Chip compact style={styles.chip} textStyle={styles.chipText}>{position}</Chip>}
            {age && <Text style={styles.metaText}>Age {age}</Text>}
          </View>
          {team && <Text style={styles.team}>{team}</Text>}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{battingAvg.toFixed(3)}</Text>
              <Text style={styles.statLabel}>AVG</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{era.toFixed(2)}</Text>
              <Text style={styles.statLabel}>ERA</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{(fieldingPct * 100).toFixed(1)}%</Text>
              <Text style={styles.statLabel}>FLD%</Text>
            </View>
          </View>
        </View>
        <Button
          mode={isFollowing ? 'outlined' : 'contained'}
          compact
          onPress={toggleFollow}
          disabled={followLoading}
          loading={followLoading}
          style={styles.followButton}
          labelStyle={styles.followButtonLabel}
          buttonColor={isFollowing ? undefined : Colors.primary}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </Button>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    padding: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarSection: {
    marginRight: Spacing.md,
  },
  avatar: {
    backgroundColor: Colors.primary,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: Typography.body,
    fontWeight: '600',
    color: Colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
    gap: Spacing.sm,
  },
  chip: {
    backgroundColor: Colors.primary,
    height: 24,
  },
  chipText: {
    fontSize: Typography.tiny,
    color: Colors.white,
    fontWeight: '700',
  },
  metaText: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
  },
  team: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: Spacing.sm,
    gap: Spacing.md,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.primary,
  },
  statLabel: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
  },
  followButton: {
    borderRadius: BorderRadius.full,
  },
  followButtonLabel: {
    fontSize: Typography.caption,
  },
});
