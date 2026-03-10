import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@baseledger/velocity_settings';

export interface VelocitySettings {
  enabled: boolean;
  pitchDistanceM: number; // 18.44 = 一般・中学, 16.00 = 学童
}

const DEFAULT: VelocitySettings = { enabled: false, pitchDistanceM: 18.44 };

export function useVelocitySettings() {
  const [settings, setSettings] = useState<VelocitySettings>(DEFAULT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((json) => {
      if (json) {
        try {
          setSettings(JSON.parse(json));
        } catch {}
      }
      setLoaded(true);
    });
  }, []);

  const update = async (next: Partial<VelocitySettings>) => {
    const merged = { ...settings, ...next };
    setSettings(merged);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  };

  return { settings, loaded, update };
}
