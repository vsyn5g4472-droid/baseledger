import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Card, Text, Avatar, FAB, Button, TextInput, Portal, Modal } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import EmptyState from '../../../src/components/EmptyState';
import { useTeams } from '../../../src/hooks/useTeam';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { usePlanGate } from '../../../src/hooks/usePlanGate';
import { showTeamCreatePlanAlert } from '../../../src/utils/planLimitAlerts';

export default function TeamsScreen() {
  const { teams, loading, joinByCode } = useTeams();
  const teamCreateGate = usePlanGate('team_create');
  const [joinModal, setJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const { inviteCode: initialInviteCode } = useLocalSearchParams<{ inviteCode?: string }>();

  useEffect(() => {
    if (initialInviteCode) {
      setInviteCode(initialInviteCode);
      setJoinModal(true);
    }
  }, [initialInviteCode]);

  const handleJoin = async () => {
    if (inviteCode.trim()) {
      await joinByCode(inviteCode.trim().toUpperCase());
      setJoinModal(false);
      setInviteCode('');
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={teams}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card
            style={styles.card}
            onPress={() => router.push(`/(tabs)/teams/${item.id}` as any)}
          >
            <View style={styles.cardContent}>
              <Avatar.Text
                size={48}
                label={item.name.charAt(0)}
                style={styles.avatar}
              />
              <View style={styles.info}>
                <Text style={styles.teamName}>{item.name}</Text>
                <Text style={styles.description} numberOfLines={1}>
                  {item.description}
                </Text>
                <View style={styles.metaRow}>
                  <MaterialCommunityIcons name="account-group" size={14} color={Colors.textSecondary} />
                  <Text style={styles.memberCount}>{item.memberIds.length} members</Text>
                  {item.isPrivate && (
                    <>
                      <MaterialCommunityIcons name="lock" size={14} color={Colors.textSecondary} style={{ marginLeft: 8 }} />
                      <Text style={styles.memberCount}>Private</Text>
                    </>
                  )}
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.textSecondary} />
            </View>
          </Card>
        )}
        contentContainerStyle={teams.length === 0 ? styles.emptyContainer : styles.listContent}
        ListHeaderComponent={
          <Button
            mode="outlined"
            onPress={() => setJoinModal(true)}
            icon="key"
            style={styles.joinButton}
          >
            Join with Invite Code
          </Button>
        }
        ListEmptyComponent={
          <EmptyState
            icon="account-group"
            title="No teams yet"
            subtitle="Create a team or join with an invite code"
          />
        }
      />

      <FAB
        icon="plus"
        style={styles.fab}
        color={Colors.white}
        onPress={() => {
          if (!teamCreateGate.allowed) {
            showTeamCreatePlanAlert();
            return;
          }
          router.push('/(tabs)/teams/create' as any);
        }}
      />

      <Portal>
        <Modal visible={joinModal} onDismiss={() => setJoinModal(false)} contentContainerStyle={styles.modal}>
          <Text style={styles.modalTitle}>Join Team</Text>
          <TextInput
            label="Invite Code"
            value={inviteCode}
            onChangeText={setInviteCode}
            mode="outlined"
            style={styles.modalInput}
            autoCapitalize="characters"
          />
          <Button mode="contained" onPress={handleJoin} buttonColor={Colors.primary}>
            Join
          </Button>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  listContent: { padding: Spacing.md, paddingBottom: 80 },
  emptyContainer: { flex: 1, padding: Spacing.md },
  card: {
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  cardContent: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md },
  avatar: { backgroundColor: Colors.primary },
  info: { flex: 1, marginLeft: Spacing.md },
  teamName: { fontSize: Typography.body, fontWeight: '600', color: Colors.text },
  description: { fontSize: Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  memberCount: { fontSize: Typography.tiny, color: Colors.textSecondary },
  joinButton: { marginBottom: Spacing.md },
  fab: { position: 'absolute', right: Spacing.md, bottom: Spacing.md, backgroundColor: Colors.secondary },
  modal: { backgroundColor: Colors.card, margin: Spacing.lg, padding: Spacing.lg, borderRadius: BorderRadius.lg },
  modalTitle: { fontSize: Typography.h3, fontWeight: '600', marginBottom: Spacing.md },
  modalInput: { marginBottom: Spacing.md, backgroundColor: Colors.card },
});
