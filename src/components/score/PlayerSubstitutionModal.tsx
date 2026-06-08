import React, { useState, useCallback } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { POSITIONS } from '../../types/game';
import type { Player, Team, GameState, Position } from '../../types/game';
import { getAvailablePositions } from '../../utils/positionAvailability';

const NEW_PLAYER_ID = '__new_player__';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface NewPlayerData {
  name: string;
  number: number | null;
  bats: 'L' | 'R' | 'S';
  throws: 'L' | 'R';
  position?: string;
}

const POSITION_LABELS: Record<string, string> = {
  P: '投手', C: '捕手', '1B': '一塁手', '2B': '二塁手', '3B': '三塁手',
  SS: '遊撃手', LF: '左翼手', CF: '中堅手', RF: '右翼手', DH: '指名打者',
};

interface Props {
  visible: boolean;
  side: 'away' | 'home';
  game: GameState;
  onClose: () => void;
  onSubstitute: (side: 'away' | 'home', playerOutId: string, playerInId: string) => void;
  onSubstituteWithNew?: (side: 'away' | 'home', playerOutId: string, newPlayerData: NewPlayerData) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function posLabel(pos: string): string {
  return POSITION_LABELS[pos] ?? pos;
}

// ── Sub-component: Quick Register Form ────────────────────────────────────────
interface QuickRegisterProps {
  playerOutName: string;
  playerOutPosition: string;
  playerOutId: string;
  game: GameState;
  side: 'away' | 'home';
  onConfirm: (data: NewPlayerData) => void;
  onBack: () => void;
}

function rosterEntriesExcluding(
  game: GameState,
  side: 'away' | 'home',
  excludePlayerId: string,
): { playerId: string; position: Position; isPitcher?: boolean }[] {
  const team = side === 'away' ? game.awayTeam : game.homeTeam;
  const hasDH = game.isDH?.[side] ?? false;
  const entries = team.roster.starters
    .filter((p) => p.id !== excludePlayerId)
    .map((p) => ({ playerId: p.id, position: p.position, isPitcher: false }));
  if (hasDH && team.roster.pitcher && team.roster.pitcher.id !== excludePlayerId) {
    entries.push({ playerId: team.roster.pitcher.id, position: 'P', isPitcher: true });
  }
  return entries;
}

function QuickRegisterForm({
  playerOutName,
  playerOutPosition,
  playerOutId,
  game,
  side,
  onConfirm,
  onBack,
}: QuickRegisterProps) {
  const [name, setName] = useState('');
  const [numberStr, setNumberStr] = useState('');
  const [bats, setBats] = useState<'L' | 'R' | 'S'>('R');
  const [throws, setThrows] = useState<'L' | 'R'>('R');
  // 退場する選手のポジションをデフォルト値にセット（変更可）
  const [position, setPosition] = useState<Position>(playerOutPosition as Position);

  const canConfirm = name.trim().length > 0;
  const teamHasDH = game.isDH?.[side] ?? false;
  const rosterEntries = rosterEntriesExcluding(game, side, playerOutId);
  const availablePositions = new Set(
    getAvailablePositions(
      [...rosterEntries, { playerId: NEW_PLAYER_ID, position, isPitcher: false }],
      NEW_PLAYER_ID,
      teamHasDH,
    ),
  );

  const handleConfirm = () => {
    if (!canConfirm) return;
    const num = numberStr.trim() ? parseInt(numberStr, 10) : null;
    onConfirm({ name: name.trim(), number: num, bats, throws, position });
  };

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <View style={styles.qrContext}>
        <MaterialCommunityIcons name="swap-horizontal" size={16} color={Colors.primary} />
        <Text style={styles.qrContextText}>
          {playerOutName}（{posLabel(playerOutPosition)}）との交代
        </Text>
      </View>

      {/* 選手名 */}
      <Text style={styles.qrLabel}>選手名 *</Text>
      <TextInput
        style={styles.qrInput}
        placeholder="例: 田中 太郎"
        placeholderTextColor={Colors.textSecondary}
        value={name}
        onChangeText={setName}
        autoFocus
      />

      {/* 背番号 */}
      <Text style={styles.qrLabel}>背番号（任意）</Text>
      <TextInput
        style={[styles.qrInput, styles.qrInputSmall]}
        placeholder="例: 18"
        placeholderTextColor={Colors.textSecondary}
        value={numberStr}
        onChangeText={setNumberStr}
        keyboardType="number-pad"
        maxLength={3}
      />

      {/* ポジション — 退場選手のポジションがデフォルト、変更可能 */}
      <Text style={styles.qrLabel}>ポジション</Text>
      <View style={styles.positionGrid}>
        {POSITIONS.map((pos) => {
          const isAvail = availablePositions.has(pos);
          return (
            <TouchableOpacity
              key={pos}
              style={[
                styles.posBtn,
                position === pos && styles.posBtnActive,
                !isAvail && styles.posBtnTaken,
              ]}
              onPress={() => isAvail && setPosition(pos)}
              activeOpacity={isAvail ? 0.7 : 1}
            >
              <Text
                style={[
                  styles.posBtnText,
                  position === pos && styles.posBtnTextActive,
                  !isAvail && styles.posBtnTextTaken,
                ]}
              >
                {pos}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 打席 */}
      <Text style={styles.qrLabel}>打席</Text>
      <View style={styles.toggleRow}>
        {(['L', 'R', 'S'] as const).map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.toggleBtn, bats === v && styles.toggleBtnActive]}
            onPress={() => setBats(v)}
          >
            <Text style={[styles.toggleText, bats === v && styles.toggleTextActive]}>
              {v === 'L' ? '左' : v === 'R' ? '右' : '両'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 投球 */}
      <Text style={styles.qrLabel}>投球</Text>
      <View style={styles.toggleRow}>
        {(['L', 'R'] as const).map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.toggleBtn, throws === v && styles.toggleBtnActive]}
            onPress={() => setThrows(v)}
          >
            <Text style={[styles.toggleText, throws === v && styles.toggleTextActive]}>
              {v === 'L' ? '左' : '右'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Actions */}
      <View style={styles.qrActions}>
        <TouchableOpacity style={styles.qrCancelBtn} onPress={onBack}>
          <Text style={styles.qrCancelText}>戻る</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.qrConfirmBtn, !canConfirm && styles.qrConfirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={!canConfirm}
        >
          <MaterialCommunityIcons name="check" size={16} color="white" />
          <Text style={styles.qrConfirmText}>登録して交代</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PlayerSubstitutionModal({
  visible,
  side,
  game,
  onClose,
  onSubstitute,
  onSubstituteWithNew,
}: Props) {
  const [step, setStep] = useState<'selectOut' | 'selectIn' | 'quickRegister'>('selectOut');
  const [playerOut, setPlayerOut] = useState<Player | null>(null);

  const team: Team = side === 'away' ? game.awayTeam : game.homeTeam;
  const teamColor = side === 'away' ? Colors.primary : '#E53935';

  const handleClose = useCallback(() => {
    setStep('selectOut');
    setPlayerOut(null);
    onClose();
  }, [onClose]);

  const handleSelectOut = useCallback((player: Player) => {
    setPlayerOut(player);
    setStep('selectIn');
  }, []);

  const handleSelectIn = useCallback(
    (playerIn: Player) => {
      if (!playerOut) return;
      onSubstitute(side, playerOut.id, playerIn.id);
      handleClose();
    },
    [playerOut, side, onSubstitute, handleClose],
  );

  const handleBack = useCallback(() => {
    setStep('selectOut');
    setPlayerOut(null);
  }, []);

  const handleQuickRegisterConfirm = useCallback(
    (data: NewPlayerData) => {
      if (!playerOut || !onSubstituteWithNew) return;
      onSubstituteWithNew(side, playerOut.id, data);
      handleClose();
    },
    [playerOut, side, onSubstituteWithNew, handleClose],
  );

  const headerTitle = () => {
    if (step === 'selectOut') return '交代する選手を選択';
    if (step === 'quickRegister') return '新規選手を登録して交代';
    return `${playerOut?.name} → 交代選手を選択`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.sheet}>
          {/* ── Header ── */}
          <View style={styles.header}>
            {step !== 'selectOut' ? (
              <TouchableOpacity onPress={handleBack} style={styles.headerBtn}>
                <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.text} />
              </TouchableOpacity>
            ) : (
              <View style={styles.headerBtn} />
            )}
            <View style={styles.headerCenter}>
              <View style={[styles.teamBadge, { backgroundColor: teamColor }]}>
                <Text style={styles.teamBadgeText}>{team.name}</Text>
              </View>
              <Text style={styles.headerTitle}>{headerTitle()}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
              <MaterialCommunityIcons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* ── Step 1: pick starter to replace ── */}
          {step === 'selectOut' && (
            <ScrollView contentContainerStyle={styles.list}>
              {/* DH制: 打順外の投手を先頭に表示 */}
              {game.isDH?.[side] && team.roster.pitcher && (
                <>
                  <Text style={styles.sectionLabel}>投手（打順外）</Text>
                  <TouchableOpacity
                    style={[styles.playerRow, styles.pitcherRow]}
                    onPress={() => handleSelectOut(team.roster.pitcher!)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.playerNumBadge, styles.pitcherBadge]}>
                      <Text style={styles.playerNum}>{team.roster.pitcher.number ?? '-'}</Text>
                    </View>
                    <View style={styles.playerInfo}>
                      <Text style={styles.playerName}>{team.roster.pitcher.name}</Text>
                      <Text style={styles.playerPos}>投手（DH制・打順外）</Text>
                    </View>
                    <MaterialCommunityIcons name="swap-horizontal" size={20} color={Colors.primary} />
                  </TouchableOpacity>
                </>
              )}

              <Text style={styles.sectionLabel}>スターター ({team.roster.starters.length})</Text>
              {team.roster.starters.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.playerRow}
                  onPress={() => handleSelectOut(p)}
                  activeOpacity={0.7}
                >
                  <View style={styles.playerNumBadge}>
                    <Text style={styles.playerNum}>{p.number ?? '-'}</Text>
                  </View>
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>{p.name}</Text>
                    <Text style={styles.playerPos}>{posLabel(p.position)}</Text>
                  </View>
                  <MaterialCommunityIcons name="swap-horizontal" size={20} color={Colors.primary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* ── Step 2: pick bench replacement ── */}
          {step === 'selectIn' && (
            <ScrollView contentContainerStyle={styles.list}>
              {/* Quick register row — always at top */}
              {onSubstituteWithNew && (
                <TouchableOpacity
                  style={styles.quickRegisterRow}
                  onPress={() => setStep('quickRegister')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.playerNumBadge, styles.quickRegisterBadge]}>
                    <MaterialCommunityIcons name="account-plus" size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.playerInfo}>
                    <Text style={styles.quickRegisterLabel}>新しく選手を登録して交代</Text>
                    <Text style={styles.quickRegisterSub}>名前・番号・投打を入力</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.primary} />
                </TouchableOpacity>
              )}

              {team.roster.bench.length === 0 ? (
                <View style={styles.emptyBench}>
                  <MaterialCommunityIcons name="account-off-outline" size={40} color={Colors.border} />
                  <Text style={styles.emptyText}>控え選手がいません</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.sectionLabel}>控え ({team.roster.bench.length})</Text>
                  {team.roster.bench.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.playerRow}
                      onPress={() => handleSelectIn(p)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.playerNumBadge, styles.benchBadge]}>
                        <Text style={[styles.playerNum, { color: Colors.primary }]}>{p.number ?? '-'}</Text>
                      </View>
                      <View style={styles.playerInfo}>
                        <Text style={styles.playerName}>{p.name}</Text>
                        <Text style={styles.playerPos}>{posLabel(p.position)}</Text>
                      </View>
                      <MaterialCommunityIcons name="arrow-right-circle-outline" size={22} color={Colors.primary} />
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </ScrollView>
          )}

          {/* ── Step 3: quick register form ── */}
          {step === 'quickRegister' && playerOut && (
            <QuickRegisterForm
              playerOutName={playerOut.name}
              playerOutPosition={playerOut.position}
              playerOutId={playerOut.id}
              game={game}
              side={side}
              onConfirm={handleQuickRegisterConfirm}
              onBack={() => setStep('selectIn')}
            />
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: 300,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  headerBtn: {
    width: 36,
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  teamBadge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
  },
  teamBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
  },
  list: {
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  sectionLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    fontWeight: '500',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  playerNumBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benchBadge: {
    backgroundColor: Colors.primaryLight,
  },
  pitcherRow: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderStyle: 'solid',
  },
  pitcherBadge: {
    backgroundColor: '#2E7D32',
  },
  playerNum: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  playerPos: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  emptyBench: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  // Quick register row
  quickRegisterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
  },
  quickRegisterBadge: {
    backgroundColor: Colors.primaryLight,
  },
  quickRegisterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  quickRegisterSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  // Quick register form
  qrContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.md,
  },
  qrContextText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  qrLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 4,
    marginTop: Spacing.sm,
  },
  qrInput: {
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  qrInputSmall: {
    width: 120,
  },
  positionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  posBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceGray,
    borderWidth: 1.5,
    borderColor: Colors.border,
    minWidth: 40,
    alignItems: 'center',
  },
  posBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  posBtnTaken: {
    backgroundColor: Colors.surfaceGray,
    borderColor: Colors.border,
    opacity: 0.45,
  },
  posBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  posBtnTextActive: {
    color: Colors.white,
  },
  posBtnTextTaken: {
    color: Colors.textDisabled,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  toggleBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceGray,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  toggleTextActive: {
    color: 'white',
  },
  qrActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  qrCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceGray,
    alignItems: 'center',
  },
  qrCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  qrConfirmBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  qrConfirmBtnDisabled: {
    opacity: 0.4,
  },
  qrConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'white',
  },
});
