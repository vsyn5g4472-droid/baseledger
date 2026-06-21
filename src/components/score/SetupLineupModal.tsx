import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Modal,
  View,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  LayoutChangeEvent,
  Dimensions,
  Alert,
} from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import type { Position, PlayerInput } from '../../types/game';
import {
  LocalPlayer,
  CANVAS_H,
  TILE_SIZE,
  SNAP_DIST,
  FIELD_POSITIONS,
  getPosCoords,
} from './PositionalSubstitutionModal';
import { getTeamPlayers, addTeamPlayer } from '../../services/teamPlayerService';

const SCREEN_H = Dimensions.get('window').height;
const SETUP_FIELD_H = SCREEN_H * 0.70;

// ─── ローカル型 ────────────────────────────────────────────────────────────────

type FieldEntry = {
  position: string;
  player: LocalPlayer;
  battingOrder: number;
};

// ─── BenchTileSimple ──────────────────────────────────────────────────────────

function BenchTileSimple({
  player,
  fieldOffsetX,
  fieldOffsetY,
  posCoords,
  onPlace,
  onDragStart,
  onDragEnd,
}: {
  player: LocalPlayer;
  fieldOffsetX: number;
  fieldOffsetY: number;
  posCoords: Record<string, { x: number; y: number }>;
  onPlace: (player: LocalPlayer, position: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const handleDragEnd = useCallback(
    (absX: number, absY: number) => {
      const fieldRelX = absX - fieldOffsetX;
      const fieldRelY = absY - fieldOffsetY;

      let nearestPos: string | null = null;
      let nearestDist = SNAP_DIST;
      for (const [pos, coord] of Object.entries(posCoords)) {
        const dist = Math.sqrt((fieldRelX - coord.x) ** 2 + (fieldRelY - coord.y) ** 2);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestPos = pos;
        }
      }
      if (!nearestPos) return;
      onPlace(player, nearestPos);
    },
    [player, fieldOffsetX, fieldOffsetY, posCoords, onPlace],
  );

  const panGesture = Gesture.Pan()
    .onStart(() => {
      isDragging.value = true;
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      isDragging.value = false;
      runOnJS(onDragEnd)();
      runOnJS(handleDragEnd)(e.absoluteX, e.absoluteY);
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
    zIndex: isDragging.value ? 9999 : 1,
    elevation: isDragging.value ? 9999 : 1,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.benchTile, animatedStyle]}>
        <Text style={styles.tilePos}>{player.position || 'SUB'}</Text>
        <Text style={styles.tileName} numberOfLines={1}>{player.name}</Text>
      </Animated.View>
    </GestureDetector>
  );
}

// ─── FieldPlayerTile ──────────────────────────────────────────────────────────

function FieldPlayerTile({
  entry,
  posCoords,
  onRemove,
}: {
  entry: FieldEntry;
  posCoords: Record<string, { x: number; y: number }>;
  onRemove: (position: string) => void;
}) {
  const coords = posCoords[entry.position];
  if (!coords) return null;

  return (
    <TouchableOpacity
      style={[
        styles.tile,
        { left: coords.x - TILE_SIZE / 2, top: coords.y - TILE_SIZE / 2 },
      ]}
      onPress={() => onRemove(entry.position)}
      activeOpacity={0.75}
    >
      <Text style={styles.tileOrder}>{entry.battingOrder}</Text>
      <Text style={styles.tileName} numberOfLines={1}>{entry.player.name}</Text>
    </TouchableOpacity>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  teamId: string;
  isDH: boolean;
  onConfirm: (starters: PlayerInput[]) => void;
  onDismiss: () => void;
}

// ─── SetupLineupModal ─────────────────────────────────────────────────────────

export default function SetupLineupModal({
  visible,
  teamId,
  isDH,
  onConfirm,
  onDismiss,
}: Props) {
  const [benchPlayers, setBenchPlayers] = useState<LocalPlayer[]>([]);
  const [fieldPlayers, setFieldPlayers] = useState<FieldEntry[]>([]);
  const [currentOrder, setCurrentOrder] = useState(1);
  const [fieldOffsetY, setFieldOffsetY] = useState(0);
  const [fieldOffsetX, setFieldOffsetX] = useState(0);
  const [fieldWidth, setFieldWidth] = useState(Dimensions.get('window').width);
  const [isDraggingAny, setIsDraggingAny] = useState(false);
  const [batsThrowsMap, setBatsThrowsMap] = useState<
    Record<string, { bats: 'L' | 'R' | 'S'; throws: 'L' | 'R' }>
  >({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const fieldPlayersRef = useRef<FieldEntry[]>([]);
  const currentOrderRef = useRef(1);
  const fieldRef = useRef<View>(null);
  const scrollY = useRef(0);
  const prevVisibleRef = useRef(false);

  useEffect(() => { fieldPlayersRef.current = fieldPlayers; }, [fieldPlayers]);
  useEffect(() => { currentOrderRef.current = currentOrder; }, [currentOrder]);

  // 初期化（モーダルオープン時）
  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = visible;

    // false→trueに変わった時（新規オープン）かつfieldPlayersが空の時だけリセット
    if (!visible || !teamId) return;
    if (wasVisible) return; // 既に開いていた場合はリセットしない
    if (fieldPlayers.length > 0) return; // 途中入力がある場合はリセットしない
    setCurrentOrder(1);
    setFieldPlayers([]);
    getTeamPlayers(teamId).then((players) => {
      const map: Record<string, { bats: 'L' | 'R' | 'S'; throws: 'L' | 'R' }> = {};
      setBenchPlayers(
        players.map((p) => {
          map[p.id] = { bats: p.bats, throws: p.throws };
          return {
            playerId: p.id,
            name: p.name,
            position: (p.position ?? '') as Position,
            isDisplaced: false,
            fromBench: true,
            originalPosition: (p.position ?? '') as Position,
            battingOrder: null,
          };
        }),
      );
      setBatsThrowsMap(map);
    });
  }, [visible, teamId, fieldPlayers.length]);

  const posCoords = useMemo(
    () => getPosCoords(fieldWidth, CANVAS_H),
    [fieldWidth],
  );

  const activePosCoords = useMemo(() => {
    const activeKeys: string[] = isDH
      ? [...FIELD_POSITIONS, 'DH']
      : [...FIELD_POSITIONS];
    return Object.fromEntries(
      Object.entries(posCoords).filter(([pos]) => activeKeys.includes(pos)),
    );
  }, [posCoords, isDH]);

  const maxOrder = isDH ? 10 : 9;
  const isComplete = fieldPlayers.length >= maxOrder;

  // ベンチ → フィールドへ配置
  const handlePlace = useCallback((player: LocalPlayer, position: string) => {
    if (fieldPlayersRef.current.some((fp) => fp.position === position)) return;
    const order = currentOrderRef.current;
    setFieldPlayers((prev) => [...prev, { position, player, battingOrder: order }]);
    setBenchPlayers((prev) => prev.filter((p) => p.playerId !== player.playerId));
    setCurrentOrder((prev) => prev + 1);
  }, []);

  // フィールド → ベンチへ取り外し（打順を詰め直す）
  const handleRemove = useCallback((position: string) => {
    const entry = fieldPlayersRef.current.find((fp) => fp.position === position);
    if (!entry) return;
    // 現在配置中の打順、または直前に配置した打順のみ取り外し可能
    if (entry.battingOrder < currentOrderRef.current - 1) return;
    const removedOrder = entry.battingOrder;
    setBenchPlayers((prev) => [...prev, entry.player]);
    setCurrentOrder(removedOrder);
    setFieldPlayers((prev) =>
      prev
        .filter((fp) => fp.position !== position)
        .map((fp) => ({
          ...fp,
          battingOrder: fp.battingOrder > removedOrder ? fp.battingOrder - 1 : fp.battingOrder,
        })),
    );
  }, []);

  const handleFieldLayout = useCallback((_e: LayoutChangeEvent) => {
    fieldRef.current?.measure((_x, _y, _w, _h, px, py) => {
      setFieldOffsetX(px);
      setFieldOffsetY(py + scrollY.current);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (!isComplete) return;
    const maxOrder = isDH ? 10 : 9;
    const result: PlayerInput[] = Array.from({ length: maxOrder }, (_, i) => {
      const order = i + 1;
      const fp = fieldPlayers.find((f) => f.battingOrder === order);
      if (!fp) return { name: '', number: '', position: '' as Position, bats: 'R' as const, throws: 'R' as const };
      return {
        name: fp.player.name,
        number: '',
        position: fp.position as Position,
        bats: batsThrowsMap[fp.player.playerId]?.bats ?? 'R',
        throws: batsThrowsMap[fp.player.playerId]?.throws ?? 'R',
      };
    });
    onConfirm(result);
  }, [isComplete, fieldPlayers, batsThrowsMap, onConfirm]);

  const handleClose = useCallback(() => {
    if (fieldPlayers.length === 0) {
      onDismiss();
      return;
    }
    Alert.alert(
      '登録を中断しますか？',
      `${fieldPlayers.length}人が配置済みです。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '破棄して戻る', style: 'destructive', onPress: onDismiss },
        {
          text: '配置済みで確定する',
          onPress: () => {
            const maxOrder = isDH ? 10 : 9;
            const result: PlayerInput[] = Array.from({ length: maxOrder }, (_, i) => {
              const order = i + 1;
              const fp = fieldPlayers.find((f) => f.battingOrder === order);
              if (!fp) return { name: '', number: '', position: '' as Position, bats: 'R' as const, throws: 'R' as const };
              return {
                name: fp.player.name,
                number: '',
                position: fp.position as Position,
                bats: batsThrowsMap[fp.player.playerId]?.bats ?? 'R',
                throws: batsThrowsMap[fp.player.playerId]?.throws ?? 'R',
              };
            });
            onConfirm(result);
          },
        },
      ],
    );
  }, [fieldPlayers, batsThrowsMap, onConfirm, onDismiss]);

  const handleDragStart = useCallback(() => {
    setIsDraggingAny(true);
    fieldRef.current?.measure((_x, _y, _w, _h, px, py) => {
      setFieldOffsetX(px);
      setFieldOffsetY(py);
    });
  }, []);
  const handleDragEnd   = useCallback(() => setIsDraggingAny(false), []);

  const handleAddPlayer = useCallback(async () => {
    if (!newName.trim() || !teamId) return;
    setSaving(true);
    try {
      const player = await addTeamPlayer(teamId, {
        name: newName.trim(),
        number: newNumber.trim() ? parseInt(newNumber, 10) : null,
        position: '',
        bats: 'R',
        throws: 'R',
      });
      setBenchPlayers((prev) => [...prev, {
        playerId: player.id,
        name: player.name,
        position: '' as any,
        isDisplaced: false,
        fromBench: true,
        originalPosition: '' as any,
        battingOrder: null,
      }]);
      setNewName('');
      setNewNumber('');
      setShowAddForm(false);
    } finally {
      setSaving(false);
    }
  }, [newName, newNumber, teamId]);

  const guideText = isComplete
    ? '配置完了！確定してください'
    : `${currentOrder}番バッターをドラッグして配置してください`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView style={styles.safeArea}>

        {/* ── ヘッダー ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
            <MaterialCommunityIcons name="close" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>スタメン簡単登録</Text>
          <TouchableOpacity
            style={[styles.confirmBtn, !isComplete && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!isComplete}
          >
            <Text style={[styles.confirmBtnText, !isComplete && styles.confirmBtnTextDisabled]}>
              確定する
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* ── 打順ガイドバナー ── */}
        <View style={[styles.guideBanner, isComplete && styles.guideBannerComplete]}>
          <MaterialCommunityIcons
            name={isComplete ? 'check-circle' : 'information-outline'}
            size={16}
            color={isComplete ? Colors.success : Colors.primary}
          />
          <Text style={[styles.guideText, isComplete && styles.guideTextComplete]}>
            {guideText}
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 32 }}
          scrollEnabled={!isDraggingAny}
          onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
        >

        {/* ── フィールド ── */}
        <View
          ref={fieldRef}
          style={styles.fieldContainer}
          onLayout={(e) => {
            setFieldWidth(e.nativeEvent.layout.width);
            handleFieldLayout(e);
          }}
        >
          <View style={styles.fieldBg}>
            <Image
              source={require('../../../assets/baseball_field.png')}
              style={styles.fieldImage}
              resizeMode="cover"
            />
          </View>
          <View style={styles.tilesLayer} pointerEvents="box-none">

            {/* 空きポジションスロット */}
            {Object.entries(activePosCoords).map(([pos, coord]) => {
              if (fieldPlayers.some((fp) => fp.position === pos)) return null;
              return (
                <View
                  key={pos}
                  pointerEvents="none"
                  style={[
                    styles.emptySlot,
                    { left: coord.x - TILE_SIZE / 2, top: coord.y - TILE_SIZE / 2 },
                  ]}
                >
                  <Text style={styles.emptySlotLabel}>{pos}</Text>
                </View>
              );
            })}

            {/* 配置済み選手タイル */}
            {fieldPlayers.map((entry) => (
              <FieldPlayerTile
                key={entry.position}
                entry={entry}
                posCoords={activePosCoords}
                onRemove={handleRemove}
              />
            ))}
          </View>
        </View>

        {/* ── ベンチエリア ── */}
        <View style={[styles.benchSection, isDraggingAny && styles.benchSectionDragging, { zIndex: 0 }]}>
          <Text style={styles.benchLabel}>
            ベンチ ({benchPlayers.length}人) — ドラッグして配置、タイルタップで取り外し
          </Text>
          <View style={styles.benchGrid}>
            {benchPlayers.map((player) => (
              <BenchTileSimple
                key={player.playerId}
                player={player}
                fieldOffsetX={fieldOffsetX}
                fieldOffsetY={fieldOffsetY}
                posCoords={activePosCoords}
                onPlace={handlePlace}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              />
            ))}
            {benchPlayers.length === 0 && (
              <Text style={styles.emptyBench}>全員配置済み</Text>
            )}
          </View>

          {/* 選手追加ボタン/フォーム */}
          {showAddForm ? (
            <View style={styles.addForm}>
              <TextInput
                style={styles.addNameInput}
                placeholder="選手名"
                value={newName}
                onChangeText={setNewName}
                placeholderTextColor={Colors.textSecondary}
              />
              <TextInput
                style={styles.addNumberInput}
                placeholder="#"
                value={newNumber}
                onChangeText={setNewNumber}
                keyboardType="numeric"
                placeholderTextColor={Colors.textSecondary}
              />
              <TouchableOpacity
                style={[styles.addSaveBtn, (!newName.trim() || saving) && styles.addSaveBtnDisabled]}
                onPress={handleAddPlayer}
                disabled={!newName.trim() || saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={styles.addSaveBtnText}>追加</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.addCancelBtn} onPress={() => setShowAddForm(false)}>
                <Text style={styles.addCancelBtnText}>キャンセル</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.addPlayerBtn} onPress={() => setShowAddForm(true)}>
              <MaterialCommunityIcons name="account-plus" size={16} color={Colors.primary} />
              <Text style={styles.addPlayerBtnText}>＋ 選手を追加</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── 確定ボタン ── */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.footerBtn, !isComplete && styles.footerBtnDisabled]}
            onPress={handleConfirm}
            disabled={!isComplete}
            activeOpacity={0.8}
          >
            <Text style={[styles.footerBtnText, !isComplete && styles.footerBtnTextDisabled]}>
              スタメンを確定する ({fieldPlayers.length}/{maxOrder})
            </Text>
          </TouchableOpacity>
        </View>

        </ScrollView>

      </SafeAreaView>
    </Modal>
  );
}

// ─── スタイル ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.card,
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.text,
  },
  confirmBtn: {
    backgroundColor: Colors.action,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
  },
  confirmBtnDisabled: {
    backgroundColor: Colors.border,
  },
  confirmBtnText: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.white,
  },
  confirmBtnTextDisabled: {
    color: Colors.textDisabled,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },

  // Guide banner
  guideBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primaryLight,
  },
  guideBannerComplete: {
    backgroundColor: Colors.statusDoneBg,
  },
  guideText: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.primary,
  },
  guideTextComplete: {
    color: Colors.success,
  },

  // Field
  fieldContainer: {
    width: '100%',
    height: SETUP_FIELD_H,
    backgroundColor: '#4A7C3F',
  },
  fieldBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: '#3A9440',
  },
  fieldImage: {
    position: 'absolute',
    width: '100%',
    height: '130%',
    top: '-15%',
  },
  tilesLayer: {
    ...StyleSheet.absoluteFillObject,
  },

  // Empty slot
  emptySlot: {
    position: 'absolute',
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: TILE_SIZE / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlotLabel: {
    fontSize: Typography.tiny,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
  },

  // Field player tile
  tile: {
    position: 'absolute',
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: TILE_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 2,
    borderColor: Colors.action,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    zIndex: 2,
  },
  tileOrder: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.action,
    lineHeight: 15,
  },

  // Shared tile text
  tilePos: {
    fontSize: Typography.tiny,
    fontWeight: '700',
    color: Colors.primary,
    lineHeight: 12,
  },
  tileName: {
    fontSize: 9,
    color: Colors.textSecondary,
    maxWidth: TILE_SIZE - 4,
    lineHeight: 10,
  },

  // Bench tile
  benchTile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: TILE_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    margin: 4,
  },

  // Bench section
  benchSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    overflow: 'visible',
  },
  benchSectionDragging: {
    borderWidth: 2,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
  },
  benchLabel: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  benchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  emptyBench: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    paddingVertical: 14,
  },

  // Footer
  footer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerBtn: {
    backgroundColor: Colors.action,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  footerBtnDisabled: {
    backgroundColor: Colors.border,
  },
  footerBtnText: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.white,
  },
  footerBtnTextDisabled: {
    color: Colors.textDisabled,
  },

  // Add player form
  addForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addNameInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.white,
  },
  addNumberInput: {
    width: 48,
    height: 36,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.white,
  },
  addSaveBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addSaveBtnDisabled: { opacity: 0.4 },
  addSaveBtnText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  addCancelBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  addCancelBtnText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  addPlayerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addPlayerBtnText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});
