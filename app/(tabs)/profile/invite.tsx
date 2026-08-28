import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Share, ActivityIndicator } from 'react-native';
import { Text, Button } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../src/services/firebase';
import { useAuth } from '../../../src/contexts/AuthContext';
import { getInviteCodeForUser } from '../../../src/services/inviteService';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';

export default function InviteScreen() {
  const { currentUser } = useAuth();
  const [inviteCode, setInviteCode] = useState('');
  const [inviteCount, setInviteCount] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [loadingCode, setLoadingCode] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    (async () => {
      try {
        const code = await getInviteCodeForUser(currentUser.uid);
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        if (!cancelled) {
          setInviteCode(code);
          setInviteCount(snap.data()?.inviteCount ?? 0);
        }
      } catch {
        if (!cancelled) setInviteCode('');
      } finally {
        if (!cancelled) setLoadingCode(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

  const handleCopy = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!inviteCode) return;
    await Share.share({
      message: `BaseLedgerで野球をデータで記録・分析しよう！\n招待コード【${inviteCode}】を入力して登録すると特典がもらえます。\nApp Store: https://apps.apple.com/jp/app/id6770819002`,
    });
  };

  if (!currentUser) return null;

  return (
    <View style={styles.container}>
      {/* 特典説明 */}
      <View style={styles.benefitCard}>
        <Text style={styles.benefitTitle}>友達を招待してボーナスをゲット！</Text>
        <View style={styles.benefitRow}>
          <Text style={styles.benefitText}>1〜3人目: AI分析+1回・試合記録+1回・PDF共有+1回</Text>
        </View>
        <View style={styles.benefitRow}>
          <Text style={styles.benefitText}>4〜5人目: AI分析+1回</Text>
        </View>
        <View style={styles.benefitRow}>
          <Text style={styles.benefitText}>10人達成: STANDARDプラン1ヶ月無料</Text>
        </View>
      </View>

      {/* 招待コード */}
      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>あなたの招待コード</Text>
        {loadingCode ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.md }} />
        ) : (
          <Text style={styles.codeText}>{inviteCode || '---'}</Text>
        )}
        {copied && <Text style={styles.copiedText}>コピーしました！</Text>}
        <View style={styles.buttonRow}>
          <Button
            mode="contained"
            onPress={handleCopy}
            icon="content-copy"
            style={styles.actionButton}
            buttonColor={Colors.primary}
            disabled={!inviteCode || loadingCode}
          >
            コピー
          </Button>
          <Button
            mode="outlined"
            onPress={handleShare}
            icon="share-variant"
            style={styles.actionButton}
            disabled={!inviteCode || loadingCode}
          >
            シェア
          </Button>
        </View>
      </View>

      {/* 招待済み人数 */}
      <View style={styles.countCard}>
        <Text style={styles.countLabel}>招待した人数</Text>
        <Text style={styles.countNumber}>
          {inviteCount}<Text style={styles.countUnit}> 人</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  benefitCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  benefitTitle: {
    fontSize: Typography.h4,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  benefitEmoji: {
    fontSize: Typography.body,
    width: 24,
  },
  benefitText: {
    flex: 1,
    fontSize: Typography.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  codeCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  codeLabel: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  codeText: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 4,
  },
  copiedText: {
    fontSize: Typography.caption,
    color: Colors.primary,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    width: '100%',
  },
  actionButton: {
    flex: 1,
    borderRadius: BorderRadius.lg,
  },
  countCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  countLabel: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginBottom: Spacing.xs,
  },
  countNumber: {
    fontSize: 48,
    fontWeight: '800',
    color: Colors.primary,
  },
  countUnit: {
    fontSize: Typography.h3,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
});
