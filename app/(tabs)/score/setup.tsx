import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Switch,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { Text, TextInput, Button, Menu } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';
import { useGameStore } from '../../../src/stores/gameStore';
import { POSITIONS, type Position, type PlayerInput, type GameSetupInput } from '../../../src/types/game';

// Android LayoutAnimation を有効化
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// 打順に使用可能な守備位置 (DH制ON時は「P」を除外)
const BATTING_ORDER_POSITIONS = POSITIONS.filter((p) => p !== 'P') as Position[];

/** 空の選手入力を生成 */
function emptyStarters(isDH: boolean): PlayerInput[] {
  const defaultPos: Position[] = isDH
    ? ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']
    : ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
  return defaultPos.map((pos) => ({
    name: '',
    number: '',
    position: pos,
    bats: 'R' as const,
    throws: 'R' as const,
  }));
}

function emptyPitcher(): PlayerInput {
  return { name: '', number: '', position: 'P', bats: 'R', throws: 'R' };
}

export default function SetupScreen() {
  const { t } = useI18n();
  const params = useLocalSearchParams<{
    awayName: string;
    homeName: string;
    ballparkName: string;
    fenceLeft: string;
    fenceCenter: string;
    fenceRight: string;
    category: string;
    tournamentName: string;
    velocityEnabled: string;
    pitchDistanceM: string;
  }>();
  const initGame = useGameStore((s) => s.initGame);

  const [isAwayDH, setIsAwayDH] = useState(false);
  const [isHomeDH, setIsHomeDH] = useState(false);
  const [activeTeam, setActiveTeam] = useState<'away' | 'home'>('away');
  const [awayStarters, setAwayStarters] = useState<PlayerInput[]>(emptyStarters(false));
  const [homeStarters, setHomeStarters] = useState<PlayerInput[]>(emptyStarters(false));
  const [awayPitcher, setAwayPitcher] = useState<PlayerInput>(emptyPitcher());
  const [homePitcher, setHomePitcher] = useState<PlayerInput>(emptyPitcher());
  const [errors, setErrors] = useState<string[]>([]);

  const starters = activeTeam === 'away' ? awayStarters : homeStarters;
  const setStarters = activeTeam === 'away' ? setAwayStarters : setHomeStarters;
  const pitcher = activeTeam === 'away' ? awayPitcher : homePitcher;
  const setPitcher = activeTeam === 'away' ? setAwayPitcher : setHomePitcher;

  // アクティブチームのDHのみ切り替え: LayoutAnimation でスムーズに表示/非表示
  const handleActiveTeamDHToggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const currentDH = activeTeam === 'away' ? isAwayDH : isHomeDH;
    const next = !currentDH;
    const setActiveDH = activeTeam === 'away' ? setIsAwayDH : setIsHomeDH;
    const setActiveStarters = activeTeam === 'away' ? setAwayStarters : setHomeStarters;
    const setActivePitcher = activeTeam === 'away' ? setAwayPitcher : setHomePitcher;
    setActiveDH(next);
    // スタメンのデフォルト守備位置を切り替える (未入力の選手のみリセット)
    const resetIfEmpty = (players: PlayerInput[], newDefault: boolean): PlayerInput[] =>
      players.map((p, i) => {
        const defaultPositions: Position[] = newDefault
          ? ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']
          : ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
        if (p.name.trim()) return p; // 入力済みは維持
        return { ...p, position: defaultPositions[i] ?? p.position };
      });
    setActiveStarters((prev) => resetIfEmpty(prev, next));
    if (!next) setActivePitcher(emptyPitcher());
  }, [activeTeam, isAwayDH, isHomeDH]);

  const activeTeamIsDH = activeTeam === 'away' ? isAwayDH : isHomeDH;

  const updatePlayer = useCallback(
    (index: number, field: keyof PlayerInput, value: string) => {
      setStarters((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    [setStarters],
  );

  const updatePitcher = useCallback(
    (field: keyof PlayerInput, value: string) => {
      setPitcher((prev) => ({ ...prev, [field]: value }));
    },
    [setPitcher],
  );

  /** 守備位置の重複インデックスを取得 (DH以外) */
  const getDuplicatePositionIndices = (players: PlayerInput[]): Set<number> => {
    const dupes = new Set<number>();
    const posMap = new Map<string, number[]>();
    players.forEach((p, i) => {
      if (p.position === 'DH') return;
      const indices = posMap.get(p.position) || [];
      indices.push(i);
      posMap.set(p.position, indices);
    });
    posMap.forEach((indices) => {
      if (indices.length > 1) indices.forEach((i) => dupes.add(i));
    });
    return dupes;
  };

  const duplicatePositions = getDuplicatePositionIndices(starters);

  const validate = (): string[] => {
    const errs: string[] = [];
    const checkTeam = (players: PlayerInput[], pitcherInput: PlayerInput, label: string, teamIsDH: boolean) => {
      if (players.some((p) => !p.name.trim())) {
        errs.push(`${label}: ${t.setup.validation.startersRequired}`);
      }
      const nums = players.map((p) => p.number).filter((n) => n.trim());
      if (new Set(nums).size !== nums.length) {
        errs.push(`${label}: ${t.setup.validation.duplicateNumber}`);
      }
      const dupes = getDuplicatePositionIndices(players);
      if (dupes.size > 0) {
        errs.push(`${label}: ${t.setup.validation.duplicatePosition}`);
      }
      if (teamIsDH) {
        if (!pitcherInput.name.trim()) {
          errs.push(`${label}: ${t.setup.validation.pitcherRequired}`);
        }
        if (players.some((p) => p.position === 'P')) {
          errs.push(`${label}: ${t.setup.validation.pitcherInBattingOrder}`);
        }
      }
    };
    checkTeam(awayStarters, awayPitcher, params.awayName || t.setup.awayTeam, isAwayDH);
    checkTeam(homeStarters, homePitcher, params.homeName || t.setup.homeTeam, isHomeDH);
    return errs;
  };

  /** 仮名でスキップして即座に計測画面へ */
  const handleSkipRegistration = async () => {
    const defaultPos: Position[] = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
    const makePlaceholders = (): PlayerInput[] =>
      defaultPos.map((pos, i) => ({
        name: `選手${i + 1}`,
        number: `${i + 1}`,
        position: pos,
        bats: 'R' as const,
        throws: 'R' as const,
        isPlaceholder: true,
      }));

    const makeDHPlaceholders = (): PlayerInput[] => {
      const pos: Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
      return pos.map((p, i) => ({
        name: `選手${i + 1}`,
        number: `${i + 1}`,
        position: p,
        bats: 'R' as const,
        throws: 'R' as const,
        isPlaceholder: true,
      }));
    };

    const placeholderPitcher: PlayerInput = {
      name: '投手1',
      number: '18',
      position: 'P',
      bats: 'R',
      throws: 'R',
      isPlaceholder: true,
    };

    const input: GameSetupInput = {
      metadata: {
        category: (params.category as any) || 'practice',
        tournamentName: params.tournamentName || '',
      },
      awayTeam: {
        name: params.awayName || 'チームA',
        starters: isAwayDH ? makeDHPlaceholders() : makePlaceholders(),
        bench: [],
        ...(isAwayDH ? { pitcher: placeholderPitcher } : {}),
      },
      homeTeam: {
        name: params.homeName || 'チームB',
        starters: isHomeDH ? makeDHPlaceholders() : makePlaceholders(),
        bench: [],
        ...(isHomeDH ? { pitcher: placeholderPitcher } : {}),
      },
      ballpark: {
        name: params.ballparkName || '',
        fenceLeft:   params.fenceLeft   || '91',
        fenceCenter: params.fenceCenter || '120',
        fenceRight:  params.fenceRight  || '91',
      },
      isQuickStart: true,
      velocityEnabled: params.velocityEnabled === 'true',
      pitchDistanceM: parseFloat(params.pitchDistanceM || '18.44'),
      awayIsDH: isAwayDH,
      homeIsDH: isHomeDH,
    };

    await initGame(input);
    router.replace('/(tabs)/score/main' as any);
  };

  const handlePlayBall = async () => {
    const errs = validate();
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);

    const input: GameSetupInput = {
      metadata: {
        category: (params.category as any) || 'practice',
        tournamentName: params.tournamentName || '',
      },
      awayTeam: {
        name: params.awayName || '',
        starters: awayStarters,
        bench: [],
        ...(isAwayDH ? { pitcher: awayPitcher } : {}),
      },
      homeTeam: {
        name: params.homeName || '',
        starters: homeStarters,
        bench: [],
        ...(isHomeDH ? { pitcher: homePitcher } : {}),
      },
      ballpark: {
        name: params.ballparkName || '',
        fenceLeft: params.fenceLeft || '100',
        fenceCenter: params.fenceCenter || '122',
        fenceRight: params.fenceRight || '100',
      },
      velocityEnabled: params.velocityEnabled === 'true',
      pitchDistanceM: parseFloat(params.pitchDistanceM || '18.44'),
      awayIsDH: isAwayDH,
      homeIsDH: isHomeDH,
    };

    await initGame(input);
    router.replace('/(tabs)/score/main' as any);
  };

  const teamLabel = activeTeam === 'away'
    ? params.awayName || t.setup.awayTeam
    : params.homeName || t.setup.homeTeam;
  const teamColor = activeTeam === 'away' ? Colors.primary : Colors.secondary;

  // Play Ball ボタンの disabled 判定
  const awayDupes = getDuplicatePositionIndices(awayStarters).size > 0;
  const homeDupes = getDuplicatePositionIndices(homeStarters).size > 0;
  const hasPositionConflict = awayDupes || homeDupes;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* DH制トグル */}
        <View style={styles.dhRow}>
          <View style={styles.dhLeft}>
            <MaterialCommunityIcons name="baseball" size={18} color={Colors.primary} />
            <Text style={styles.dhLabel}>{t.setup.dhToggle}</Text>
          </View>
          <View style={styles.dhRight}>
            <Text style={[styles.dhStateText, !activeTeamIsDH && styles.dhStateActive]}>{t.setup.dhOff}</Text>
            <Switch
              value={activeTeamIsDH}
              onValueChange={handleActiveTeamDHToggle}
              thumbColor={activeTeamIsDH ? Colors.primary : Colors.textSecondary}
              trackColor={{ false: Colors.border, true: Colors.primaryLight }}
            />
            <Text style={[styles.dhStateText, activeTeamIsDH && styles.dhStateActive]}>{t.setup.dhOn}</Text>
          </View>
        </View>

        {/* チーム切り替えタブ */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTeam === 'away' && styles.tabActive, activeTeam === 'away' && { borderBottomColor: Colors.primary }]}
            onPress={() => setActiveTeam('away')}
          >
            <Text style={[styles.tabText, activeTeam === 'away' && { color: Colors.primary, fontWeight: '700' }]}>
              {params.awayName || t.setup.awayTeam}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTeam === 'home' && styles.tabActive, activeTeam === 'home' && { borderBottomColor: Colors.secondary }]}
            onPress={() => setActiveTeam('home')}
          >
            <Text style={[styles.tabText, activeTeam === 'home' && { color: Colors.secondary, fontWeight: '700' }]}>
              {params.homeName || t.setup.homeTeam}
            </Text>
          </TouchableOpacity>
        </View>

        {/* チームヘッダー */}
        <View style={[styles.teamHeader, { backgroundColor: teamColor }]}>
          <MaterialCommunityIcons name="account-group" size={20} color={Colors.white} />
          <Text style={styles.teamHeaderText}>{teamLabel} - {t.setup.starters}</Text>
        </View>

        {/* スタメン9人 */}
        {starters.map((player, idx) => (
          <PlayerRow
            key={`${activeTeam}-${idx}`}
            index={idx}
            player={player}
            onUpdate={updatePlayer}
            isDuplicate={duplicatePositions.has(idx)}
            availablePositions={activeTeamIsDH ? BATTING_ORDER_POSITIONS : POSITIONS}
            t={t}
          />
        ))}

        {/* DH制ON: 投手登録セクション */}
        {activeTeamIsDH && (
          <View>
            <View style={[styles.pitcherHeader, { borderTopColor: teamColor }]}>
              <MaterialCommunityIcons name="baseball-bat" size={18} color={teamColor} />
              <Text style={[styles.pitcherHeaderText, { color: teamColor }]}>
                {t.setup.pitcherSection}
              </Text>
            </View>
            <PitcherRow pitcher={pitcher} onUpdate={updatePitcher} t={t} />
          </View>
        )}

        {/* バリデーションエラー */}
        {errors.length > 0 && (
          <View style={styles.errorBox}>
            {errors.map((err, i) => (
              <Text key={i} style={styles.errorText}>• {err}</Text>
            ))}
          </View>
        )}

        {/* 後で登録バナー */}
        <TouchableOpacity
          style={styles.skipBanner}
          onPress={handleSkipRegistration}
          activeOpacity={0.85}
        >
          <View style={styles.skipLeft}>
            <MaterialCommunityIcons name="clock-fast" size={22} color={Colors.primary} />
            <View style={styles.skipTexts}>
              <Text style={styles.skipTitle}>今は登録しない（後で登録）</Text>
              <Text style={styles.skipSub}>仮名で登録 → 試合中・終了後に実名へ変更できます</Text>
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.primary} />
        </TouchableOpacity>

        {/* Play Ball ボタン */}
        <Button
          mode="contained"
          onPress={handlePlayBall}
          style={[styles.playButton, hasPositionConflict && { opacity: 0.4 }]}
          buttonColor={Colors.secondary}
          labelStyle={styles.playLabel}
          icon="baseball-bat"
          disabled={hasPositionConflict}
        >
          {t.setup.playBall}
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ============================================================
// 選手入力行コンポーネント
// ============================================================

interface PlayerRowProps {
  index: number;
  player: PlayerInput;
  onUpdate: (index: number, field: keyof PlayerInput, value: string) => void;
  isDuplicate: boolean;
  availablePositions: readonly Position[];
  t: any;
}

function PlayerRow({ index, player, onUpdate, isDuplicate, availablePositions, t }: PlayerRowProps) {
  const [posMenuVisible, setPosMenuVisible] = useState(false);
  const [batsMenuVisible, setBatsMenuVisible] = useState(false);

  return (
    <View style={[styles.playerRow, isDuplicate && styles.playerRowError]}>
      {/* 打順番号 */}
      <View style={styles.orderBadge}>
        <Text style={styles.orderText}>{index + 1}</Text>
      </View>

      {/* 守備位置セレクタ */}
      <Menu
        visible={posMenuVisible}
        onDismiss={() => setPosMenuVisible(false)}
        anchor={
          <TouchableOpacity
            style={[styles.posButton, isDuplicate && styles.posButtonError]}
            onPress={() => setPosMenuVisible(true)}
          >
            <Text style={[styles.posText, isDuplicate && { color: Colors.error }]}>{t.positions[player.position]}</Text>
          </TouchableOpacity>
        }
      >
        {availablePositions.map((pos) => (
          <Menu.Item
            key={pos}
            onPress={() => {
              onUpdate(index, 'position', pos);
              setPosMenuVisible(false);
            }}
            title={t.positions[pos]}
          />
        ))}
      </Menu>

      {/* 背番号 */}
      <TextInput
        mode="outlined"
        placeholder="#"
        value={player.number}
        onChangeText={(v) => onUpdate(index, 'number', v)}
        keyboardType="numeric"
        style={styles.numberInput}
        dense
      />

      {/* 選手名 */}
      <TextInput
        mode="outlined"
        placeholder={t.setup.playerName}
        value={player.name}
        onChangeText={(v) => onUpdate(index, 'name', v)}
        style={styles.nameInput}
        dense
      />

      {/* 打席 L/R/S */}
      <Menu
        visible={batsMenuVisible}
        onDismiss={() => setBatsMenuVisible(false)}
        anchor={
          <TouchableOpacity
            style={styles.batsButton}
            onPress={() => setBatsMenuVisible(true)}
          >
            <Text style={styles.batsText}>{player.bats}</Text>
          </TouchableOpacity>
        }
      >
        {(['R', 'L', 'S'] as const).map((b) => (
          <Menu.Item
            key={b}
            onPress={() => {
              onUpdate(index, 'bats', b);
              setBatsMenuVisible(false);
            }}
            title={b}
          />
        ))}
      </Menu>
    </View>
  );
}

// ============================================================
// 投手入力行コンポーネント (DH制専用)
// ============================================================

interface PitcherRowProps {
  pitcher: PlayerInput;
  onUpdate: (field: keyof PlayerInput, value: string) => void;
  t: any;
}

function PitcherRow({ pitcher, onUpdate, t }: PitcherRowProps) {
  const [batsMenuVisible, setBatsMenuVisible] = useState(false);
  const [throwsMenuVisible, setThrowsMenuVisible] = useState(false);

  return (
    <View style={[styles.playerRow, styles.pitcherRow]}>
      {/* 投手アイコンバッジ */}
      <View style={[styles.orderBadge, styles.pitcherBadge]}>
        <MaterialCommunityIcons name="baseball" size={13} color={Colors.white} />
      </View>

      {/* 守備位置 (P固定) */}
      <View style={styles.posButtonFixed}>
        <Text style={[styles.posText, { color: Colors.secondary }]}>P</Text>
      </View>

      {/* 背番号 */}
      <TextInput
        mode="outlined"
        placeholder="#"
        value={pitcher.number}
        onChangeText={(v) => onUpdate('number', v)}
        keyboardType="numeric"
        style={styles.numberInput}
        dense
      />

      {/* 選手名 */}
      <TextInput
        mode="outlined"
        placeholder={t.setup.playerName}
        value={pitcher.name}
        onChangeText={(v) => onUpdate('name', v)}
        style={styles.nameInput}
        dense
      />

      {/* 打席 */}
      <Menu
        visible={batsMenuVisible}
        onDismiss={() => setBatsMenuVisible(false)}
        anchor={
          <TouchableOpacity style={styles.batsButton} onPress={() => setBatsMenuVisible(true)}>
            <Text style={styles.batsText}>{pitcher.bats}</Text>
          </TouchableOpacity>
        }
      >
        {(['R', 'L', 'S'] as const).map((b) => (
          <Menu.Item key={b} onPress={() => { onUpdate('bats', b); setBatsMenuVisible(false); }} title={b} />
        ))}
      </Menu>

      {/* 投球腕 L/R */}
      <Menu
        visible={throwsMenuVisible}
        onDismiss={() => setThrowsMenuVisible(false)}
        anchor={
          <TouchableOpacity style={[styles.batsButton, { borderColor: Colors.secondary + '80' }]} onPress={() => setThrowsMenuVisible(true)}>
            <Text style={[styles.batsText, { color: Colors.secondary }]}>{pitcher.throws}</Text>
          </TouchableOpacity>
        }
      >
        {(['R', 'L'] as const).map((th) => (
          <Menu.Item key={th} onPress={() => { onUpdate('throws', th); setThrowsMenuVisible(false); }} title={th} />
        ))}
      </Menu>
    </View>
  );
}

// ============================================================
// スタイル
// ============================================================

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: 120 },

  // DH制トグル
  dhRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dhLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dhLabel: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.text,
  },
  dhRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dhStateText: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  dhStateActive: {
    color: Colors.primary,
    fontWeight: '800',
  },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {},
  tabText: {
    fontSize: Typography.body,
    color: Colors.textSecondary,
  },

  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  teamHeaderText: {
    color: Colors.white,
    fontSize: Typography.body,
    fontWeight: '700',
  },

  // 投手セクションヘッダー
  pitcherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceGray,
    borderTopWidth: 3,
  },
  pitcherHeaderText: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
  },

  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 4,
  },
  playerRowError: {
    backgroundColor: '#FFF5F5',
  },
  pitcherRow: {
    backgroundColor: '#FFF8F8',
  },

  orderBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.text,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderText: {
    color: Colors.white,
    fontSize: Typography.caption,
    fontWeight: '700',
  },
  pitcherBadge: {
    backgroundColor: Colors.secondary,
  },

  posButton: {
    minWidth: 52,
    height: 36,
    paddingHorizontal: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  posButtonFixed: {
    minWidth: 52,
    height: 36,
    paddingHorizontal: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    borderColor: Colors.secondary + '80',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF0F0',
  },
  posText: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.primary,
  },
  posButtonError: {
    borderColor: Colors.error,
    borderWidth: 2,
    backgroundColor: '#FFF0F0',
  },

  numberInput: {
    width: 52,
    backgroundColor: Colors.card,
    textAlign: 'center',
  },
  nameInput: {
    flex: 1,
    backgroundColor: Colors.card,
  },

  batsButton: {
    width: 32,
    height: 36,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  batsText: {
    fontSize: Typography.caption,
    fontWeight: '600',
    color: Colors.text,
  },

  errorBox: {
    margin: Spacing.md,
    padding: Spacing.md,
    backgroundColor: '#FFF0F0',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#FFD0D0',
  },
  errorText: {
    fontSize: Typography.bodySmall,
    color: Colors.error,
    marginBottom: 2,
  },

  skipBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.primary + '60',
  },
  skipLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  skipTexts: { flex: 1 },
  skipTitle: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.primary,
  },
  skipSub: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },

  playButton: {
    margin: Spacing.md,
    borderRadius: BorderRadius.lg,
    paddingVertical: 8,
  },
  playLabel: {
    fontSize: Typography.h4,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
