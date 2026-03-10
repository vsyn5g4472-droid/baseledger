import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ja } from './ja';
import { en } from './en';

export type Locale = 'ja' | 'en';

/** as const のリテラル型を string に緩和する再帰型 */
type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};

export type TranslationKeys = DeepStringify<typeof ja>;

const translations: Record<Locale, TranslationKeys> = { ja, en };

interface I18nStore {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslationKeys;
}

export const useI18n = create<I18nStore>()(
  persist(
    (set) => ({
      locale: 'ja' as Locale,
      t: translations.ja,
      setLocale: (locale: Locale) => set({ locale, t: translations[locale] }),
    }),
    {
      name: '@baseledger/locale',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the locale string, not the full translation object
      partialize: (state) => ({ locale: state.locale }),
      onRehydrateStorage: () => (state) => {
        // Rehydrate translation object from persisted locale
        if (state) {
          state.t = translations[state.locale];
        }
      },
    }
  )
);
