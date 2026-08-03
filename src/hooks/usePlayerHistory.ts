import { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import { buildBatteryProfile, buildBatterProfile } from '../utils/analysisEngine';
import type { BatteryProfile, BatterProfile } from '../utils/analysisEngine';
import type { GameState } from '../types/game';

export interface PlayerHistoryResult {
  pitcherProfile: BatteryProfile | null;
  batterProfile: BatterProfile | null;
  notes: string[];
  loading: boolean;
}

/**
 * 試合中リアルタイム参照用フック。
 * buildBatteryProfile は pitcherId のみでフィルタするため
 * catcherId は捕手表示名の解決にのみ使われる。
 *
 * 【意図的】試合中表示は通算名寄せ前。
 * 名寄せメモ (playerMergeService の PlayerMergeMap) は敢えて渡していない。
 * 試合中のホットパスに Firestore 読み込みを増やさないため。
 * 分析画面 (app/analysis/*) は名寄せ後の数字を出すので、両者は一致しないことがある。
 */
export function usePlayerHistory(
  pitcherId: string | null,
  catcherId: string | null,
  batterId: string | null,
): PlayerHistoryResult {
  const [games, setGames] = useState<GameState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.games.getAll().then((all) => {
      setGames(all);
      setLoading(false);
    });
  }, []);

  const pitcherProfile = useMemo<BatteryProfile | null>(() => {
    if (!pitcherId || !catcherId || games.length === 0) return null;
    try {
      const p = buildBatteryProfile(games, pitcherId, catcherId);
      return p.totalPitches > 0 ? p : null;
    } catch { return null; }
  }, [games, pitcherId, catcherId]);

  const batterProfile = useMemo<BatterProfile | null>(() => {
    if (!batterId || games.length === 0) return null;
    try {
      const p = buildBatterProfile(games, batterId);
      return p.totalAtBats > 0 ? p : null;
    } catch { return null; }
  }, [games, batterId]);

  const notes = useMemo<string[]>(() => {
    if (games.length === 0) return [];
    return games
      .flatMap((g) => g.atBatLogs)
      .filter((l) => {
        if (batterId)  return l.batterId  === batterId  && !!l.note;
        if (pitcherId) return l.pitcherId === pitcherId && !!l.note;
        return false;
      })
      .map((l) => l.note!)
      .slice(-10);
  }, [games, batterId, pitcherId]);

  return { pitcherProfile, batterProfile, notes, loading };
}
