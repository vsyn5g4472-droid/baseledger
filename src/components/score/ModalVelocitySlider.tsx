import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Dimensions,
  TouchableOpacity,
  Text,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography } from '../../constants/theme';

const MODAL_VEL_MIN = 50;
const MODAL_VEL_MAX = 160;
const MODAL_TRACK_W = Dimensions.get('window').width - 80;

interface ModalVelocitySliderProps {
  enabled: boolean;
  value: number;
  onToggle: (v: boolean) => void;
  onChange: (v: number) => void;
  /** ドラッグ中に親 ScrollView の縦スクロールを無効化する */
  onScrollLock?: (locked: boolean) => void;
}

export default function ModalVelocitySlider({
  enabled,
  value,
  onToggle,
  onChange,
  onScrollLock,
}: ModalVelocitySliderProps) {
  const fillRatio = (value - MODAL_VEL_MIN) / (MODAL_VEL_MAX - MODAL_VEL_MIN);
  const startRef = useRef<{ pageX: number; value: number } | null>(null);
  const onChangeRef = useRef(onChange);
  const onScrollLockRef = useRef(onScrollLock);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onScrollLockRef.current = onScrollLock; }, [onScrollLock]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => {
        onScrollLockRef.current?.(true);
        startRef.current = { pageX: e.nativeEvent.pageX, value };
      },
      onPanResponderMove: (e) => {
        if (!startRef.current) return;
        const deltaX = e.nativeEvent.pageX - startRef.current.pageX;
        const deltaV = (deltaX / MODAL_TRACK_W) * (MODAL_VEL_MAX - MODAL_VEL_MIN);
        onChangeRef.current(Math.round(Math.max(
          MODAL_VEL_MIN,
          Math.min(MODAL_VEL_MAX, startRef.current.value + deltaV),
        )));
      },
      onPanResponderRelease: () => {
        onScrollLockRef.current?.(false);
        startRef.current = null;
      },
      onPanResponderTerminate: () => {
        onScrollLockRef.current?.(false);
        startRef.current = null;
      },
    }),
  ).current;

  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={[styles.toggleRow, enabled && styles.toggleRowOn]}
        onPress={() => onToggle(!enabled)}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons
          name="speedometer"
          size={16}
          color={enabled ? '#fff' : Colors.textSecondary}
        />
        <Text style={[styles.toggleLabel, enabled && styles.toggleLabelOn]}>
          球速を入力
        </Text>
        {enabled && (
          <Text style={styles.toggleValue}>{value} km/h</Text>
        )}
        <View style={[styles.badge, enabled && styles.badgeOn]}>
          <Text style={[styles.badgeText, enabled && styles.badgeTextOn]}>
            {enabled ? 'あり' : 'なし'}
          </Text>
        </View>
      </TouchableOpacity>

      {enabled && (
        <View style={styles.sliderWrap}>
          <View style={styles.track} {...panResponder.panHandlers}>
            <View style={styles.trackBg} />
            <View style={[styles.trackFill, { width: `${fillRatio * 100}%` as `${number}%` }]} />
            <View style={[styles.thumb, { left: fillRatio * (MODAL_TRACK_W - 20) }]} />
          </View>
          <View style={styles.rangeRow}>
            <Text style={styles.rangeLabel}>{MODAL_VEL_MIN}</Text>
            <Text style={styles.rangeLabel}>{MODAL_VEL_MAX}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  toggleRowOn: {
    backgroundColor: '#1565C0',
    borderColor: '#0D47A1',
  },
  toggleLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  toggleLabelOn: { color: '#fff' },
  toggleValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#fff',
    marginRight: 4,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  badgeOn: { backgroundColor: '#fff' },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  badgeTextOn: { color: '#1565C0' },
  sliderWrap: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  track: {
    height: 28,
    width: MODAL_TRACK_W,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
    top: 10,
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1565C0',
    top: 10,
  },
  thumb: {
    position: 'absolute',
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1565C0',
    borderWidth: 2.5,
    borderColor: Colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: MODAL_TRACK_W,
  },
  rangeLabel: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
});
