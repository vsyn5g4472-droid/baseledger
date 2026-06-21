import React from 'react';
import { Platform } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { UserPlan } from '../../services/planService';

const IOS_BANNER_ID = 'ca-app-pub-2314368742124091/8590583255';
const AD_UNIT_ID = __DEV__ ? TestIds.BANNER : IOS_BANNER_ID;

interface Props {
  plan: UserPlan;
}

export default function AdBanner({ plan }: Props) {
  if (plan !== UserPlan.FREE) return null;
  if (Platform.OS !== 'ios') return null;

  return (
    <BannerAd
      unitId={AD_UNIT_ID}
      size={BannerAdSize.BANNER}
      requestOptions={{ requestNonPersonalizedAdsOnly: true }}
    />
  );
}
