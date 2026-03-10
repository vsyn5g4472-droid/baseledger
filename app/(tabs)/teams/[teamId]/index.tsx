import React from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, Avatar, Button, Card, Chip } from 'react-native-paper';
import { useLocalSearchParams, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTeamDetail } from '../../../../src/hooks/useTeam';
import PostCard from '../../../../src/components/PostCard';
import EmptyState from '../../../../src/components/EmptyState';
import { Colors, Spacing, Typography, BorderRadius } from '../../../../src/constants/theme';

export default function TeamDetailScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const { team, members, loading, isOwner } = useTeamDetail(teamId ?? '');

  if (!team) {
    return <EmptyState icon="account-group" title="Team not found" />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Avatar.Text size={64} label={team.name.charAt(0)} style={styles.avatar} />
        <Text style={styles.teamName}>{team.name}</Text>
        <Text style={styles.description}>{team.description}</Text>
        <View style={styles.metaRow}>
          <Chip compact icon="account-group">{members.length} members</Chip>
          {team.isPrivate && <Chip compact icon="lock">Private</Chip>}
          {isOwner && <Chip compact icon="crown" style={styles.ownerChip} textStyle={{ color: Colors.white }}>Owner</Chip>}
        </View>
        <View style={styles.actionRow}>
          <Button
            mode="outlined"
            onPress={() => router.push(`/(tabs)/teams/${teamId}/chat` as any)}
            icon="chat"
            compact
          >
            Chat
          </Button>
          <Button
            mode="outlined"
            onPress={() => router.push(`/(tabs)/teams/${teamId}/scores` as any)}
            icon="chart-bar"
            compact
          >
            Scores
          </Button>
          {isOwner && (
            <Button mode="outlined" onPress={() => {}} icon="account-plus" compact>
              Invite
            </Button>
          )}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Members</Text>
      <FlatList
        data={members}
        keyExtractor={(item) => item.userId}
        horizontal
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.memberItem}>
            <Avatar.Text size={44} label={(item.user?.displayName ?? 'U').charAt(0)} style={styles.memberAvatar} />
            <Text style={styles.memberName} numberOfLines={1}>
              {item.user?.displayName ?? 'User'}
            </Text>
            <Text style={styles.memberRole}>{item.role}</Text>
          </View>
        )}
        contentContainerStyle={styles.membersList}
      />

      <Text style={styles.sectionTitle}>Team Feed</Text>
      <EmptyState
        icon="message-text-outline"
        title="No team posts yet"
        subtitle="Share updates with your team"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatar: { backgroundColor: Colors.primary },
  teamName: { fontSize: Typography.h2, fontWeight: '700', color: Colors.text, marginTop: Spacing.sm },
  description: { fontSize: Typography.body, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  ownerChip: { backgroundColor: Colors.accent },
  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  sectionTitle: { fontSize: Typography.h4, fontWeight: '600', color: Colors.text, margin: Spacing.md },
  membersList: { paddingHorizontal: Spacing.md, gap: Spacing.md },
  memberItem: { alignItems: 'center', width: 70 },
  memberAvatar: { backgroundColor: Colors.primary },
  memberName: { fontSize: Typography.tiny, color: Colors.text, marginTop: 4, textAlign: 'center' },
  memberRole: { fontSize: Typography.tiny, color: Colors.textSecondary },
});
