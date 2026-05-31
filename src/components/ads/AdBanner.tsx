import React from 'react';
import { Platform, View } from 'react-native';
import { usePlanGate } from '../../hooks/usePlanGate';

const PRODUCTION_BANNER_ID = process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID ?? '';

export default function AdBanner() {
  const { allowed } = usePlanGate('ad_free');
  if (allowed) return null;
  if (Platform.OS === 'web') return null;

  // AdMobモジュールが利用できない環境（シミュレータ・Expo Go）ではnullを返す
  try {
    const { BannerAd, BannerAdSize, TestIds } = require('react-native-google-mobile-ads');
    const BANNER_ID = __DEV__ ? TestIds.BANNER : PRODUCTION_BANNER_ID;
    return (
      <View style={{ alignItems: 'center' }}>
        <BannerAd
          unitId={BANNER_ID}
          size={BannerAdSize.BANNER}
          requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        />
      </View>
    );
  } catch {
    return null;
  }
}
