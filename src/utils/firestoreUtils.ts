/**
 * Firestoreに保存するデータから undefined を再帰的に null へ変換する。
 * Firestoreは undefined フィールドを許容しないため、保存前に必ず適用すること。
 *
 * - undefined → null
 * - null → null (そのまま維持)
 * - 配列 → 各要素に再帰適用
 * - オブジェクト → 各値に再帰適用
 * - プリミティブ (string, number, boolean) → そのまま維持
 */
export function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) {
    return null as unknown as T;
  }

  if (value === null) {
    return null as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        sanitizeForFirestore(v),
      ]),
    ) as unknown as T;
  }

  return value;
}
