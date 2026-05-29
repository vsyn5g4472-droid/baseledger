import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Avatar, Button, Badge, Card, Chip, Divider } from 'react-native-paper';
import { useNotificationContext } from '../../../src/contexts/NotificationContext';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../../src/contexts/AuthContext';
import { getUserSpotAtBats } from '../../../src/services/spotAtBatService';
import BuntSignStatsCard from '../../../src/components/BuntSignStatsCard';
import StatsChart from '../../../src/components/StatsChart';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';

export default function ProfileScreen() {
  const { currentUser, signOut, userPlan } = useAuth();
  const { t } = useI18n();
  const { unreadCount } = useNotificationContext();

  const [spotStats, setSpotStats] = useState<{
    games: number; atBats: number; hits: number; avg: string;
  } | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    getUserSpotAtBats(currentUser.uid).then((records) => {
      const atBats = records.filter(
        (r) => !['walk', 'hit_by_pitch', 'sacrifice_bunt', 'sacrifice_fly'].includes(r.result),
      ).length;
      const hits = records.filter(
        (r) => ['single', 'double', 'triple', 'home_run'].includes(r.result),
      ).length;
      const avg = atBats > 0 ? (hits / atBats).toFixed(3) : '.000';
      setSpotStats({ games: records.length, atBats, hits, avg });
    }).catch(() => {});
  }, [currentUser]);

  // Guest landing — show sign-up CTA
  if (!currentUser) {
    return (
      <View style={styles.guestContainer}>
        <View style={styles.guestIconRing}>
          <MaterialCommunityIcons name="account-plus" size={48} color={Colors.primary} />
        </View>
        <Text style={styles.guestTitle}>{t.authGate.profileTitle}</Text>
        <Text style={styles.guestSubtitle}>{t.authGate.profileSubtitle}</Text>
        <Button
          mode="contained"
          onPress={() => router.push('/(auth)/register')}
          style={styles.guestPrimaryBtn}
          buttonColor={Colors.primary}
          labelStyle={styles.guestBtnLabel}
          icon="account-plus"
        >
          {t.authGate.profileSignUp}
        </Button>
        <Button
          mode="outlined"
          onPress={() => router.push('/(auth)/login')}
          style={styles.guestSecondaryBtn}
          textColor={Colors.primary}
          icon="login"
        >
          {t.authGate.profileLogin}
        </Button>
        <Text style={styles.guestHint}>{t.authGate.guestInfo}</Text>
      </View>
    );
  }

  const u = currentUser;
  const roleColors: Record<string, string> = {
    player: Colors.primary,
    scout: Colors.secondary,
    coach: Colors.accent,
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerSection}>
        {u.photoURL ? (
          <Avatar.Image size={80} source={{ uri: u.photoURL }} />
        ) : (
          <Avatar.Text size={80} label={u.displayName.charAt(0)} style={styles.avatar} />
        )}
        <Text style={styles.name}>{u.displayName}</Text>
        <View style={styles.roleRow}>
          <Chip
            compact
            style={[styles.roleBadge, { backgroundColor: roleColors[u.role] ?? Colors.primary }]}
            textStyle={styles.roleBadgeText}
          >
            {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
          </Chip>
          {u.position && (
            <Chip compact style={{ backgroundColor: Colors.primaryLight }} textStyle={{ color: Colors.primary, fontWeight: '700', fontSize: 12 }}>
              {u.position}
            </Chip>
          )}
        </View>
        {u.team && <Text style={styles.team}>{u.team}</Text>}
        <Text style={styles.bio}>{u.bio}</Text>

        <View style={styles.countsRow}>
          <TouchableOpacity style={styles.countItem}>
            <Text style={styles.countNumber}>{u.postsCount}</Text>
            <Text style={styles.countLabel}>{t.profile.posts}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.countItem}>
            <Text style={styles.countNumber}>{u.followersCount}</Text>
            <Text style={styles.countLabel}>{t.profile.followers}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.countItem}>
            <Text style={styles.countNumber}>{u.followingCount}</Text>
            <Text style={styles.countLabel}>{t.profile.following}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.actionRow}>
        <Button
          mode="outlined"
          onPress={() => router.push('/(tabs)/profile/edit' as any)}
          icon="pencil"
          style={styles.actionButton}
        >
          {t.profile.editProfile}
        </Button>
        <Button
          mode="outlined"
          onPress={() => router.push('/messages' as any)}
          icon="message"
          style={styles.actionButton}
        >
          {t.profile.messages}
        </Button>
      </View>

      {/* 通知ボタン */}
      <TouchableOpacity
        style={styles.notifRow}
        onPress={() => router.push('/(tabs)/profile/notifications' as any)}
        activeOpacity={0.8}
      >
        <View style={styles.notifIconWrap}>
          <MaterialCommunityIcons name="bell-outline" size={20} color={Colors.primary} />
          {unreadCount > 0 && (
            <Badge style={styles.notifBadge} size={16}>{unreadCount}</Badge>
          )}
        </View>
        <Text style={styles.notifLabel}>通知</Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textDisabled} />
      </TouchableOpacity>

      <Divider style={styles.divider} />

      <Text style={styles.sectionTitle}>{t.profile.statsOverview}</Text>

      <Card style={styles.statsCard}>
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{u.stats.batting.avg.toFixed(3)}</Text>
            <Text style={styles.statLabel}>{t.profile.battingAvg}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{u.stats.pitching.era.toFixed(2)}</Text>
            <Text style={styles.statLabel}>{t.profile.era}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{(u.stats.fielding.fieldingPct * 100).toFixed(1)}%</Text>
            <Text style={styles.statLabel}>{t.profile.fieldingPct}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{u.stats.batting.totalHomeRuns}</Text>
            <Text style={styles.statLabel}>{t.profile.homeRuns}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{u.stats.pitching.totalStrikeouts}</Text>
            <Text style={styles.statLabel}>{t.profile.strikeouts}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{u.stats.batting.gamesPlayed}</Text>
            <Text style={styles.statLabel}>{t.profile.games}</Text>
          </View>
        </View>
      </Card>

      {spotStats && spotStats.games > 0 && (
        <>
          <Divider style={styles.divider} />
          <Text style={styles.sectionTitle}>スポット打席</Text>
          <Card style={styles.statsCard}>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/score/spot-history' as any)}
              activeOpacity={0.85}
            >
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{spotStats.avg}</Text>
                  <Text style={styles.statLabel}>打率</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{spotStats.atBats}</Text>
                  <Text style={styles.statLabel}>打数</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{spotStats.games}</Text>
                  <Text style={styles.statLabel}>打席数</Text>
                </View>
              </View>
            </TouchableOpacity>
          </Card>
        </>
      )}

      <BuntSignStatsCard userPlan={userPlan} />

      <Divider style={styles.divider} />

      {/* Personal stats feed shortcut */}
      <Button
        mode="contained"
        onPress={() => router.push('/(tabs)/profile/feed' as any)}
        icon="chart-timeline-variant"
        style={styles.feedButton}
        buttonColor={Colors.primaryLight}
        labelStyle={{ color: Colors.primary, fontWeight: '600' }}
      >
        マイ成績フィード
      </Button>

      <Button
        mode="outlined"
        onPress={() => router.push('/(tabs)/profile/settings' as any)}
        icon="cog"
        style={styles.settingsButton}
      >
        {t.profile.settings}
      </Button>

      <Button
        mode="text"
        onPress={async () => {
          await signOut();
          router.replace('/(auth)/login');
        }}
        textColor={Colors.error}
        icon="logout"
      >
        {t.profile.signOut}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Guest landing
  guestContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: 80,
  },
  guestIconRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  guestTitle: {
    fontSize: Typography.h3,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  guestSubtitle: {
    fontSize: Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  guestPrimaryBtn: {
    borderRadius: BorderRadius.lg,
    paddingVertical: 4,
    width: '100%',
    marginBottom: Spacing.sm,
  },
  guestSecondaryBtn: {
    borderRadius: BorderRadius.lg,
    width: '100%',
    marginBottom: Spacing.md,
  },
  guestBtnLabel: {
    fontSize: Typography.body,
    fontWeight: '600',
  },
  guestHint: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  // Authenticated profile
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: Spacing.xxl },
  headerSection: {
    backgroundColor: Colors.white,
    padding: Spacing.lg,
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  avatar: { backgroundColor: Colors.primary },
  name: { fontSize: Typography.h2, fontWeight: '700', color: Colors.text, marginTop: Spacing.sm },
  roleRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  roleBadge: {},
  roleBadgeText: { color: Colors.white, fontSize: Typography.caption },
  team: { fontSize: Typography.body, color: Colors.textSecondary, marginTop: 4 },
  bio: { fontSize: Typography.bodySmall, color: Colors.text, textAlign: 'center', marginTop: Spacing.sm, paddingHorizontal: Spacing.lg },
  countsRow: { flexDirection: 'row', marginTop: Spacing.lg, gap: Spacing.xl },
  countItem: { alignItems: 'center' },
  countNumber: { fontSize: Typography.h3, fontWeight: '700', color: Colors.primary },
  countLabel: { fontSize: Typography.caption, color: Colors.textSecondary },
  actionRow: { flexDirection: 'row', padding: Spacing.md, gap: Spacing.sm },
  actionButton: { flex: 1 },
  divider: { marginVertical: Spacing.md },
  sectionTitle: { fontSize: Typography.h4, fontWeight: '600', color: Colors.text, marginHorizontal: Spacing.md, marginBottom: Spacing.sm },
  statsCard: {
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    backgroundColor: Colors.surfaceGray,
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statBox: { width: '33%', alignItems: 'center', paddingVertical: Spacing.sm },
  statValue: { fontSize: Typography.h3, fontWeight: '700', color: Colors.primary },
  statLabel: { fontSize: Typography.tiny, color: Colors.textSecondary, marginTop: 2 },
  feedButton: { marginHorizontal: Spacing.md, marginBottom: Spacing.sm },
  settingsButton: { marginHorizontal: Spacing.md, marginBottom: Spacing.sm },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
  },
  notifIconWrap: {
    position: 'relative',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    backgroundColor: Colors.error,
  },
  notifLabel: {
    flex: 1,
    fontSize: Typography.body,
    color: Colors.text,
    fontWeight: '500',
  },
});
