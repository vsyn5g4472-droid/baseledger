import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, PanResponder, Dimensions, TouchableOpacity, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Typography } from '../../constants/theme';

const VEL_MIN = 80;
const VEL_MAX = 165;
const SCREEN_W = Dimensions.get('window').width;
const METER_TRACK_W = SCREEN_W - 100;

interface VelocityDragMeterProps {
  value: number;
  onChange: (v: number) => void;
  onReset: () => void;
  setScrollLocked: (locked: boolean) => void;
}

export default function VelocityDragMeter({
  value,
  onChange,
  onReset,
  setScrollLocked,
}: VelocityDragMeterProps) {
  const fillRatio = (value - VEL_MIN) / (VEL_MAX - VEL_MIN);
  const dragRef = useRef<{ startPageX: number; startValue: number } | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const setScrollLockedRef = useRef(setScrollLocked);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { setScrollLockedRef.current = setScrollLocked; }, [setScrollLocked]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => {
        setScrollLockedRef.current(true);
        dragRef.current = {
          startPageX: e.nativeEvent.pageX,
          startValue: valueRef.current,
        };
      },
      onPanResponderMove: (e) => {
        if (!dragRef.current) return;
        const deltaX = e.nativeEvent.pageX - dragRef.current.startPageX;
        const deltaV = (deltaX / METER_TRACK_W) * (VEL_MAX - VEL_MIN);
        const next = Math.round(
          Math.max(VEL_MIN, Math.min(VEL_MAX, dragRef.current.startValue + deltaV)),
        );
        onChangeRef.current(next);
      },
      onPanResponderRelease: () => {
        setScrollLockedRef.current(false);
        dragRef.current = null;
      },
      onPanResponderTerminate: () => {
        setScrollLockedRef.current(false);
        dragRef.current = null;
      },
    }),
  ).current;

  return (
    <View style={styles.wrap}>
      <View style={styles.valueRow}>
        <MaterialCommunityIcons name="speedometer" size={18} color="#2E7D32" />
        <Text style={styles.valueLarge}>{value}</Text>
        <Text style={styles.unitText}>km/h</Text>
        <TouchableOpacity onPress={onReset} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons name="refresh" size={16} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.track} {...panResponder.panHandlers}>
        <View style={styles.trackBg} />
        <View style={[styles.trackFill, { width: `${fillRatio * 100}%` as `${number}%` }]} />
        <View style={[styles.thumb, { left: fillRatio * (METER_TRACK_W - 20) }]} />
      </View>

      <View style={styles.rangeRow}>
        <Text style={styles.rangeLabel}>{VEL_MIN}</Text>
        <Text style={styles.rangeLabel}>{VEL_MAX}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingVertical: 4,
    gap: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  valueLarge: {
    fontSize: 22,
    fontWeight: '900',
    color: '#2E7D32',
    lineHeight: 26,
  },
  unitText: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    fontWeight: '600',
    flex: 1,
  },
  track: {
    height: 28,
    width: METER_TRACK_W,
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
    backgroundColor: '#2E7D32',
    top: 10,
  },
  thumb: {
    position: 'absolute',
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2E7D32',
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
    width: METER_TRACK_W,
  },
  rangeLabel: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
});
