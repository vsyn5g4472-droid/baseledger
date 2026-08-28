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
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { extractLineupFromImage } from '../../../src/services/aiReportService';
import { Text, TextInput, Button, Menu } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';
import { useGameStore } from '../../../src/stores/gameStore';
import { POSITIONS, type Position, type PlayerInput, type GameSetupInput } from '../../../src/types/game';
import { PositionDiamondPicker } from '../../../src/components/score/PositionDiamondPicker';
import RosterPickerModal from '../../../src/components/score/RosterPickerModal';
import SetupLineupModal, { FieldEntry } from '../../../src/components/score/SetupLineupModal';
import type { TeamPlayer } from '../../../src/models/types';
import { addTeamPlayer, getTeamPlayers } from '../../../src/services/teamPlayerService';
import { makeUnassignedPitcherInput } from '../../../src/services/unassignedPitcherService';

// Android LayoutAnimation を有効化
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// 打順に使用可能な守備位置 (DH制ON時は「P」を除外)
const BATTING_ORDER_POSITIONS = POSITIONS.filter((p) => p !== 'P') as Position[];

/** 空の選手入力を生成 */
function emptyStarters(_isDH: boolean): PlayerInput[] {
  return Array.from({ length: 9 }, () => ({
    name: '',
    number: '',
    position: '' as Position,
    bats: 'R' as const,
    throws: 'R' as const,
  }));
}

function emptyPitcher(): PlayerInput {
  return { name: '', number: '', position: '' as Position, bats: 'R', throws: 'R' };
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
    awayTeamId: string;
    homeTeamId: string;
    isScout: string;
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

  const [rosterModal, setRosterModal] = useState<{ teamId: string; rowIndex: number; target: 'starter' | 'pitcher' } | null>(null);
  const [extracting, setExtracting] = useState(false);

  const starters = activeTeam === 'away' ? awayStarters : homeStarters;
  const setStarters = activeTeam === 'away' ? setAwayStarters : setHomeStarters;
  const pitcher = activeTeam === 'away' ? awayPitcher : homePitcher;
  const setPitcher = activeTeam === 'away' ? setAwayPitcher : setHomePitcher;
  const activeTeamId = activeTeam === 'away' ? (params.awayTeamId || '') : (params.homeTeamId || '');
  const [showSetupLineup, setShowSetupLineup] = useState(false);
  const [savedFieldPlayersByTeam, setSavedFieldPlayersByTeam] = useState<Record<string, FieldEntry[]>>({});

  const selectFromRoster = useCallback((player: TeamPlayer) => {
    if (!rosterModal) return;
    const { rowIndex, target } = rosterModal;
    const patch: Partial<PlayerInput> = {
      name: player.name,
      number: player.number != null ? String(player.number) : '',
      bats: player.bats,
      realPlayerId: player.id,
    };
    if (target === 'starter') {
      setStarters((prev) => {
        const next = [...prev];
        next[rowIndex] = { ...next[rowIndex], ...patch };
        return next;
      });
    } else {
      setPitcher((prev) => ({ ...prev, ...patch }));
    }
    setRosterModal(null);
  }, [rosterModal, setStarters, setPitcher]);

  // アクティブチームのDHのみ切り替え: LayoutAnimation でスムーズに表示/非表示
  const handleActiveTeamDHToggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const currentDH = activeTeam === 'away' ? isAwayDH : isHomeDH;
    const next = !currentDH;
    const setActiveDH = activeTeam === 'away' ? setIsAwayDH : setIsHomeDH;
    const setActiveStarters = activeTeam === 'away' ? setAwayStarters : setHomeStarters;
    const setActivePitcher = activeTeam === 'away' ? setAwayPitcher : setHomePitcher;
    setActiveDH(next);
    setActiveStarters((prev) => prev);
    if (!next) setActivePitcher(emptyPitcher());
  }, [activeTeam, isAwayDH, isHomeDH]);

  const activeTeamIsDH = activeTeam === 'away' ? isAwayDH : isHomeDH;

  const processImage = async (base64: string, mimeType: string) => {
    setExtracting(true);
    try {
      const result = await extractLineupFromImage(base64, mimeType);
      if (!result.players || result.players.length === 0) {
        Alert.alert('読み取り失敗', 'メンバー表を認識できませんでした。手動で入力してください。');
        return;
      }
      const newStarters = [...starters];
      result.players.slice(0, 9).forEach((p, i) => {
        if (newStarters[i]) {
          newStarters[i] = {
            ...newStarters[i],
            name: p.name ?? '',
            number: p.number ?? '',
            position: (p.position || newStarters[i].position) as any,
          };
        }
      });
      setStarters(newStarters);
      Alert.alert('読み取り完了', `${result.players.length}人の選手情報を入力しました。内容を確認・修正してください。`);
    } catch {
      Alert.alert('エラー', '読み取りに失敗しました。手動で入力してください。');
    } finally {
      setExtracting(false);
    }
  };

  const handleCameraPress = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('権限エラー', 'カメラロールへのアクセスを許可してください');
      return;
    }
    Alert.alert(
      'メンバー表を読み取る',
      '画像の選択方法を選んでください',
      [
        {
          text: 'カメラで撮影',
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
              base64: true,
            });
            if (!result.canceled && result.assets[0].base64) {
              await processImage(result.assets[0].base64, result.assets[0].mimeType ?? 'image/jpeg');
            }
          },
        },
        {
          text: 'アルバムから選択',
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
              base64: true,
            });
            if (!result.canceled && result.assets[0].base64) {
              await processImage(result.assets[0].base64, result.assets[0].mimeType ?? 'image/jpeg');
            }
          },
        },
        { text: 'キャンセル', style: 'cancel' },
      ],
    );
  };

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
      } else if (!players.some((p) => p.position === 'P')) {
        // 通常のPlay Ballは誤登録防止のため投手必須。「今は登録しない」は別経路で扱う。
        errs.push(`${label}: ${t.setup.validation.pitcherPositionRequired}`);
      }
    };
    checkTeam(awayStarters, awayPitcher, params.awayName || t.setup.awayTeam, isAwayDH);
    checkTeam(homeStarters, homePitcher, params.homeName || t.setup.homeTeam, isHomeDH);
    return errs;
  };

  /** 仮名でスキップして即座に計測画面へ */
  const handleSkipRegistration = async () => {
    const mergeWithPlaceholders = (current: PlayerInput[]): PlayerInput[] => {
      return Array.from({ length: 9 }, (_, i) => {
        const existing = current[i];
        if (existing?.name.trim()) return { ...existing, isPlaceholder: false };
        return {
          name: `選手${i + 1}`,
          number: `${i + 1}`,
          // 未入力の守備位置を推測しない。投手は打順外の専用エンティティで保持する。
          position: '' as Position,
          bats: 'R' as const,
          throws: 'R' as const,
          isPlaceholder: true,
        };
      });
    };

    const awaySkippedStarters = mergeWithPlaceholders(awayStarters);
    const homeSkippedStarters = mergeWithPlaceholders(homeStarters);
    const awayKnownPitcher = isAwayDH
      ? (awayPitcher.name.trim() ? awayPitcher : undefined)
      : awaySkippedStarters.find((player) => player.position === 'P');
    const homeKnownPitcher = isHomeDH
      ? (homePitcher.name.trim() ? homePitcher : undefined)
      : homeSkippedStarters.find((player) => player.position === 'P');

    const input: GameSetupInput = {
      metadata: {
        category: (params.category as any) || 'practice',
        tournamentName: params.tournamentName || '',
      },
      awayTeam: {
        name: params.awayName || 'チームA',
        starters: awaySkippedStarters,
        bench: [],
        ...(isAwayDH && awayKnownPitcher ? { pitcher: awayKnownPitcher } : {}),
        ...(!awayKnownPitcher ? { unassignedPitchers: [makeUnassignedPitcherInput(1)] } : {}),
      },
      homeTeam: {
        name: params.homeName || 'チームB',
        starters: homeSkippedStarters,
        bench: [],
        ...(isHomeDH && homeKnownPitcher ? { pitcher: homeKnownPitcher } : {}),
        ...(!homeKnownPitcher ? { unassignedPitchers: [makeUnassignedPitcherInput(1)] } : {}),
      },
      ballpark: {
        name: params.ballparkName || '',
        fenceLeft:   params.fenceLeft   || '91',
        fenceCenter: params.fenceCenter || '120',
        fenceRight:  params.fenceRight  || '91',
      },
      isQuickStart: true,
      isScout: params.isScout === 'true',
      velocityEnabled: params.velocityEnabled === 'true',
      pitchDistanceM: parseFloat(params.pitchDistanceM || '18.44'),
      awayIsDH: isAwayDH,
      homeIsDH: isHomeDH,
    };

    await initGame(input);
    await Promise.all([
      savePlayersToTeam(params.awayTeamId || '', awayStarters),
      savePlayersToTeam(params.homeTeamId || '', homeStarters),
    ]);
    router.replace('/(tabs)/score/main' as any);
  };

  const savePlayersToTeam = async (teamId: string, players: PlayerInput[]): Promise<void> => {
    if (!teamId) return;
    try {
      const existing = await getTeamPlayers(teamId);
      const existingNames = new Set(existing.map((p) => p.name));
      for (const player of players) {
        if (!player.name.trim() || (player as any).isPlaceholder) continue;
        if (existingNames.has(player.name.trim())) continue;
        await addTeamPlayer(teamId, {
          name: player.name.trim(),
          number: player.number ? parseInt(player.number, 10) : null,
          position: player.position || '',
          bats: player.bats || 'R',
          throws: player.throws || 'R',
        });
      }
    } catch (_e) {}
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
      isScout: params.isScout === 'true',
      awayIsDH: isAwayDH,
      homeIsDH: isHomeDH,
    };

    await initGame(input);
    await Promise.all([
      savePlayersToTeam(params.awayTeamId || '', awayStarters),
      savePlayersToTeam(params.homeTeamId || '', homeStarters),
    ]);
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
          <TouchableOpacity
            onPress={handleCameraPress}
            disabled={extracting}
            style={styles.cameraButton}
          >
            {extracting
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <MaterialCommunityIcons name="camera" size={22} color={Colors.primary} />
            }
          </TouchableOpacity>
        </View>

        {/* チームヘッダー */}
        <View style={[styles.teamHeader, { backgroundColor: teamColor }]}>
          <MaterialCommunityIcons name="account-group" size={20} color={Colors.white} />
          <Text style={styles.teamHeaderText}>{teamLabel} - {t.setup.starters}</Text>
          {activeTeamId ? (
            <TouchableOpacity
              style={styles.quickSetupBtn}
              onPress={() => setShowSetupLineup(true)}
            >
              <MaterialCommunityIcons name="lightning-bolt" size={14} color={teamColor} />
              <Text style={[styles.quickSetupBtnText, { color: teamColor }]}>簡単登録</Text>
            </TouchableOpacity>
          ) : null}
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
            teamId={activeTeamId}
            onOpenRoster={(rowIndex) => setRosterModal({ teamId: activeTeamId, rowIndex, target: 'starter' })}
            isDH={activeTeamIsDH}
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

      {rosterModal && (
        <RosterPickerModal
          teamId={rosterModal.teamId}
          visible={!!rosterModal}
          onSelect={selectFromRoster}
          onDismiss={() => setRosterModal(null)}
        />
      )}
      <SetupLineupModal
        visible={showSetupLineup}
        teamId={activeTeamId}
        isDH={activeTeamIsDH}
        savedFieldPlayers={savedFieldPlayersByTeam[activeTeamId] ?? []}
        onFieldPlayersChange={(players) => {
          if (!activeTeamId) return;
          setSavedFieldPlayersByTeam((prev) => ({ ...prev, [activeTeamId]: players }));
        }}
        onConfirm={(newStarters) => {
          if (activeTeam === 'away') {
            setAwayStarters((prev) => {
              const merged = [...prev];
              newStarters.forEach((p, i) => {
                merged[i] = p;
              });
              return merged;
            });
          } else {
            setHomeStarters((prev) => {
              const merged = [...prev];
              newStarters.forEach((p, i) => {
                merged[i] = p;
              });
              return merged;
            });
          }
          setShowSetupLineup(false);
        }}
        onDismiss={() => setShowSetupLineup(false)}
      />
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
  teamId?: string;
  onOpenRoster?: (rowIndex: number) => void;
  isDH: boolean;
}

function ThrowsMenu({ throws, onUpdate }: { throws: string; onUpdate: (v: string) => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={
        <TouchableOpacity
          style={[styles.batsButton, { borderColor: Colors.secondary + '80' }]}
          onPress={() => setVisible(true)}
        >
          <Text style={[styles.batsText, { color: Colors.secondary }]}>{throws}</Text>
        </TouchableOpacity>
      }
    >
      {(['R', 'L'] as const).map((th) => (
        <Menu.Item key={th} onPress={() => { onUpdate(th); setVisible(false); }} title={th} />
      ))}
    </Menu>
  );
}

function PlayerRow({ index, player, onUpdate, isDuplicate, availablePositions, t, teamId, onOpenRoster, isDH }: PlayerRowProps) {
  const [batsMenuVisible, setBatsMenuVisible] = useState(false);

  return (
    <>
      {index === 0 && (
        <View style={styles.columnHeader}>
          <View style={styles.orderBadge} />
          <Text style={styles.columnHeaderPos}>守備位置</Text>
          <Text style={styles.columnHeaderNum}>#</Text>
          <Text style={styles.columnHeaderName}>氏名</Text>
          <Text style={styles.columnHeaderBats}>打</Text>
        </View>
      )}
    <View style={[styles.playerRow, isDuplicate && styles.playerRowError]}>
      {/* 打順番号 */}
      <View style={styles.orderBadge}>
        <Text style={styles.orderText}>{index + 1}</Text>
      </View>

      {/* 守備位置セレクタ */}
      <PositionDiamondPicker
        value={player.position}
        availablePositions={availablePositions}
        onChange={(pos) => onUpdate(index, 'position', pos)}
        isDuplicate={isDuplicate}
        label={t.positions[player.position]}
        positionLabels={t.positions}
      />

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

      {player.position === 'P' && (
        <ThrowsMenu
          throws={player.throws}
          onUpdate={(v) => onUpdate(index, 'throws', v)}
        />
      )}

      {/* 名簿から選択ボタン */}
      {!!teamId && (
        <TouchableOpacity style={styles.rosterBtn} onPress={() => onOpenRoster?.(index)}>
          <MaterialCommunityIcons name="account-search" size={18} color={Colors.primary} />
        </TouchableOpacity>
      )}
    </View>
    </>
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
  cameraButton: { padding: 8, marginLeft: 8 },
  tabText: {
    fontSize: Typography.body,
    color: Colors.textSecondary,
  },

  quickSetupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.white,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    marginLeft: 'auto',
  },
  quickSetupBtnText: {
    fontSize: Typography.tiny,
    fontWeight: '700',
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
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  columnHeaderPos: {
    fontSize: 10,
    color: Colors.textSecondary,
    width: 64,
    textAlign: 'center',
  },
  columnHeaderNum: {
    fontSize: 10,
    color: Colors.textSecondary,
    width: 48,
    textAlign: 'center',
  },
  columnHeaderName: {
    fontSize: 10,
    color: Colors.textSecondary,
    flex: 1,
    textAlign: 'center',
  },
  columnHeaderBats: {
    fontSize: 10,
    color: Colors.textSecondary,
    width: 36,
    textAlign: 'center',
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
  rosterBtn: {
    width: 32,
    height: 36,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '60',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
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
