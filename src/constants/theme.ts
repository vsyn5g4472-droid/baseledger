export const Colors = {
  // ─── ブランド色 (Brand) ─────────────────────────────────────────────────────
  // アプリのアイデンティティを示す色。ロゴ・ヘッダー・強調に限定使用
  primary: '#1A6BB5',       // ブランドブルー: アプリ固有の主張色
  primaryLight: '#E8F2FB',  // ブランドブルー極薄: バッジ背景・ハイライト面

  // ─── 操作色 (Action) ───────────────────────────────────────────────────────
  // タップ可能・インタラクティブな要素にのみ使用。ブランド色と混在させない
  action: '#1A7FD4',        // アクションブルー: ボタン・リンク・CTA
  actionLight: '#EBF5FE',   // アクションブルー極薄: タップ領域の背景

  // ─── 状態色 (Status) ───────────────────────────────────────────────────────
  // 各色は単一の意味のみ持つ。複数の状態に同じ色を使わない
  statusDone: '#2D7D52',    // 緑: 試合終了・完了済み
  statusDoneBg: '#E8F5EE',  // 緑極薄: 完了バッジの背景
  statusLive: '#C0392B',    // 赤: 試合中・進行中
  statusLiveBg: '#FDECEA',  // 赤極薄: 進行中バッジの背景

  // ─── 注意色 (Caution) ──────────────────────────────────────────────────────
  // 警告・ランキング1〜3位など限定的な強調にのみ使用
  caution: '#B8860B',       // アンバー: ランキング上位・注意喚起
  cautionBg: '#FDF8E8',     // アンバー極薄: ランキングバッジ背景

  // ─── 互換維持 (既存コードとの後方互換) ─────────────────────────────────────
  secondary: '#C41E3A',     // いいね済み・情熱
  accent: '#D4AF37',        // ゴールド (ランク強調・限定使用)
  accentSoft: '#FDF8EC',
  success: '#2D7D52',
  error: '#C0392B',

  // ─── テキスト (Text) ───────────────────────────────────────────────────────
  text: '#111827',          // 主テキスト: 高コントラスト
  textSecondary: '#6B7280', // サブテキスト: 日付・補足情報
  textDisabled: '#9CA3AF',  // 無効状態テキスト

  // ─── 面 (Surface) ──────────────────────────────────────────────────────────
  background: '#F3F4F6',    // 画面背景: 微妙なオフホワイトで奥行き感
  card: '#FFFFFF',          // カード面: 白
  surfaceGray: '#F9FAFB',   // 入力フィールド・セカンダリ面

  // ─── 枠線 (Border) ─────────────────────────────────────────────────────────
  border: '#E5E7EB',        // 区切り線・枠線

  // ─── 基本 ──────────────────────────────────────────────────────────────────
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
