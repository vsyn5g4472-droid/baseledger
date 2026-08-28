import React from 'react';
import { UserPlan } from '../../services/planService';

interface Props {
  plan: UserPlan;
}

// AdMobはネイティブビルドが必要なため、審査通過後のビルドで有効化する
export default function AdBanner(_props: Props) {
  return null;
}
