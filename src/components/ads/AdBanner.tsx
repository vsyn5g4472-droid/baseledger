import React from 'react';
import { Platform, View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { usePlanGate } from '../../hooks/usePlanGate';

const PRODUCTION_BANNER_ID = process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID ?? '';
const BANNER_ID = __DEV__ ? TestIds.BANNER : PRODUCTION_BANNER_ID;

export default function AdBanner() {
  const { allowed } = usePlanGate('ad_free');

  // LIGHT以上（ad_free allowed）は広告非表示
  if (allowed) return null;
  // Webは非対応
  if (Platform.OS === 'web') return null;

  return (
    <View style={{ alignItems: 'center' }}>
      <BannerAd
        unitId={BANNER_ID}
        size={BannerAdSize.BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
      />
    </View>
  );
}
