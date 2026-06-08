export type AvatarColorId = 'blue' | 'red' | 'green' | 'purple' | 'orange' | 'pink';

export const DEFAULT_AVATAR_COLOR: AvatarColorId = 'blue';

export const AVATAR_COLOR_OPTIONS: {
  id: AvatarColorId;
  label: string;
  hex: string;
}[] = [
  { id: 'blue',   label: 'ブルー',   hex: '#1A6BB5' },
  { id: 'red',    label: 'レッド',   hex: '#C41E3A' },
  { id: 'green',  label: 'グリーン', hex: '#2D7D52' },
  { id: 'purple', label: 'パープル', hex: '#6A1B9A' },
  { id: 'orange', label: 'オレンジ', hex: '#E65100' },
  { id: 'pink',   label: 'ピンク',   hex: '#E91E63' },
];

export function getAvatarColorHex(colorId?: AvatarColorId | null): string {
  return AVATAR_COLOR_OPTIONS.find((c) => c.id === colorId)?.hex
    ?? AVATAR_COLOR_OPTIONS[0].hex;
}
