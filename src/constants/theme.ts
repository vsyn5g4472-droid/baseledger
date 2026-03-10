export const Colors = {
  // ─── Core Palette ──────────────────────────────────────────────────────────
  primary: '#38A1F3',       // スカイブルー: ボタン・リンク・アイコン
  secondary: '#C41E3A',     // レッド: エラー・いいね済み・情熱
  accent: '#D4AF37',        // ゴールド: ランキング1位・スコア強調 (限定使用)
  // ─── Backgrounds ───────────────────────────────────────────────────────────
  background: '#FFFFFF',    // ホワイト: 全画面背景
  card: '#FFFFFF',          // ホワイト: カード背景
  // ─── Text ──────────────────────────────────────────────────────────────────
  text: '#1A1A1A',          // 濃いグレー: 主テキスト (高視認)
  textSecondary: '#8E8E93', // ミッドグレー: サブテキスト・タイムスタンプ
  // ─── Status ────────────────────────────────────────────────────────────────
  success: '#34C759',       // iOS系グリーン
  error: '#C41E3A',
  // ─── Borders & Surfaces ────────────────────────────────────────────────────
  border: '#E5E5E5',        // ライトグレー: 仕切り・枠線
  primaryLight: '#EBF5FE',  // スカイブルー極薄: バッジ・ハイライト背景
  accentSoft: '#FDF8EC',    // ゴールド極薄: ランク強調背景
  surfaceGray: '#F7F7F7',   // オフホワイト: 入力フィールド背景
  // ─── Basics ────────────────────────────────────────────────────────────────
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.45)',
} as const;

export const Typography = {
  h1: 28,
  h2: 24,
  h3: 20,
  h4: 18,
  body: 16,
  bodySmall: 14,
  caption: 12,
  tiny: 10,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

// Card shadow preset — Instagram-style soft lift
export const CardShadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.09,
  shadowRadius: 6,
  elevation: 2,
} as const;

export const PaperTheme = {
  colors: {
    primary: Colors.primary,
    secondary: Colors.secondary,
    background: Colors.background,
    surface: Colors.card,
    error: Colors.error,
    onPrimary: Colors.white,
    onSecondary: Colors.white,
    onBackground: Colors.text,
    onSurface: Colors.text,
    onError: Colors.white,
    elevation: {
      level0: 'transparent',
      level1: Colors.card,
      level2: Colors.card,
      level3: Colors.card,
      level4: Colors.card,
      level5: Colors.card,
    },
    outline: Colors.border,
    surfaceVariant: Colors.surfaceGray,
    onSurfaceVariant: Colors.textSecondary,
    inverseSurface: Colors.primary,
    inverseOnSurface: Colors.white,
    inversePrimary: Colors.accent,
    shadow: Colors.black,
    scrim: Colors.overlay,
    backdrop: Colors.overlay,
    surfaceDisabled: '#EBEBEB',
    onSurfaceDisabled: '#ABABAB',
    primaryContainer: Colors.primaryLight,
    onPrimaryContainer: Colors.primary,
    secondaryContainer: '#F5D5DA',
    onSecondaryContainer: Colors.secondary,
    tertiaryContainer: Colors.accentSoft,
    onTertiaryContainer: '#8B6914',
    errorContainer: '#F8D7DA',
    onErrorContainer: Colors.error,
    tertiary: Colors.accent,
    onTertiary: Colors.black,
  },
};
