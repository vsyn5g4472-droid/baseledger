import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';

/**
 * iOS 26 クラッシュ切り分け用の最小ルート。
 * Auth / Firebase / RevenueCat 等を一切ロードしない。
 */
export default function MinimalRootLayout() {
  return (
    <View style={styles.root}>
      <Text style={styles.badge}>Step 0B Minimal</Text>
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  badge: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    zIndex: 10,
    fontSize: 12,
    fontWeight: '700',
    color: '#1B3A5C',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
});
