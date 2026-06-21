import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameState } from '../types/game';

const GAME_PREFIX = '@ballpark/game/';
const GAME_LIST_KEY = '@ballpark/gameIds';

/**
 * BallPark オフラインDB (AsyncStorage ベース)
 *
 * React Native では IndexedDB が使えないため、
 * AsyncStorage を使用してゲームデータを永続化する。
 */
export const db = {
  games: {
    /** ゲームを保存 */
    async put(game: GameState): Promise<void> {
      await AsyncStorage.setItem(GAME_PREFIX + game.id, JSON.stringify(game));
      // IDリストにも追加
      const ids = await this.getAllIds();
      if (!ids.includes(game.id)) {
        ids.push(game.id);
        await AsyncStorage.setItem(GAME_LIST_KEY, JSON.stringify(ids));
      }
    },

    /** ゲームを取得 */
    async get(id: string): Promise<GameState | undefined> {
      const json = await AsyncStorage.getItem(GAME_PREFIX + id);
      return json ? JSON.parse(json) : undefined;
    },

    /** 全ゲームIDを取得 */
    async getAllIds(): Promise<string[]> {
      const json = await AsyncStorage.getItem(GAME_LIST_KEY);
      return json ? JSON.parse(json) : [];
    },

    /** 全ゲームを取得 */
    async getAll(): Promise<GameState[]> {
      const ids = await this.getAllIds();
      const games: GameState[] = [];
      for (const id of ids) {
        const game = await this.get(id);
        if (game) games.push(game);
      }
      return games.sort((a, b) => b.createdAt - a.createdAt);
    },

    /** ゲームを削除 */
    async remove(id: string): Promise<void> {
      await AsyncStorage.removeItem(GAME_PREFIX + id);
      const ids = await this.getAllIds();
      await AsyncStorage.setItem(
        GAME_LIST_KEY,
        JSON.stringify(ids.filter((i) => i !== id)),
      );
    },
  },
};
