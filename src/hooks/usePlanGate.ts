/**
 * 機能ゲートフック
 *
 * 現在のユーザープランに基づいて、指定した機能が利用可能かどうかを判定する。
 */

import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  type Feature,
  type FeatureGateResult,
  checkFeatureAccess,
  UserPlan,
  USER_PLAN_META,
} from '../services/planService';

export interface PlanGate extends FeatureGateResult {
  userPlan: UserPlan;
  userPlanLabel: string;
}

export function usePlanGate(feature: Feature): PlanGate {
  const { userPlan } = useAuth();

  return useMemo(() => {
    const result = checkFeatureAccess(userPlan, feature);
    return {
      ...result,
      userPlan,
      userPlanLabel: USER_PLAN_META[userPlan].label,
    };
  }, [userPlan, feature]);
}

export function useUserPlan(): UserPlan {
  const { userPlan } = useAuth();
  return userPlan;
}
