/**
 * Username suggestion generator for Japanese / ASCII display names.
 *
 * Supports:
 *   - ASCII / romaji names  ("Moegi Ochi"  → ["moegi", "ochi"])
 *   - Hiragana / katakana   ("もえぎ おち" → ["moegi", "ochi"])
 *   - Kanji-only names      → falls back to email prefix
 */

// ── Kana → Romaji table ──────────────────────────────────────────────────────
const KANA_ROMAJI: Record<string, string> = {
  // Vowels
  'あ': 'a',  'い': 'i',  'う': 'u',  'え': 'e',  'お': 'o',
  // K
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
  // S
  'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
  // T
  'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
  'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
  // N
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
  // H
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
  // M
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
  // Y
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  // R
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
  // W
  'わ': 'wa', 'を': 'wo',
  // N (syllabic)
  'ん': 'n',
  // Voiced K → G
  'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
  'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
  // Voiced S → Z
  'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
  'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
  // Voiced T → D
  'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
  // Voiced H → B
  'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
  'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
  // Semi-voiced H → P
  'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
  'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
};

function kanaToRomaji(input: string): string {
  // Katakana (U+30A1–U+30F6) → Hiragana (U+3041–U+3096) via -0x60 offset
  const s = input.replace(/[\u30A1-\u30F6]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60),
  );

  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];

    // っ → double first consonant of the following mora
    if (ch === 'っ') {
      const next2 = (s[i + 1] ?? '') + (s[i + 2] ?? '');
      const next1 = s[i + 1] ?? '';
      const rom = KANA_ROMAJI[next2] ?? KANA_ROMAJI[next1] ?? '';
      if (rom) out += rom[0];
      i++;
      continue;
    }

    // 2-char combos (e.g. きゃ)
    const combo = ch + (s[i + 1] ?? '');
    if (KANA_ROMAJI[combo] !== undefined) {
      out += KANA_ROMAJI[combo];
      i += 2;
      continue;
    }

    // Single kana
    if (KANA_ROMAJI[ch] !== undefined) {
      out += KANA_ROMAJI[ch];
      i++;
      continue;
    }

    // Space / ideographic space → word separator
    if (ch === ' ' || ch === '\u3000' || ch === '　') {
      out += ' ';
      i++;
      continue;
    }

    // Kanji and other non-convertible chars → skip
    i++;
  }

  return out.trim();
}

// ── Name parts extraction ────────────────────────────────────────────────────

function extractParts(displayName: string): string[] {
  const trimmed = displayName.trim();

  // Already ASCII/romaji (letters, digits, common separators only)
  if (/^[a-zA-Z0-9\s\-_.]+$/.test(trimmed)) {
    return trimmed
      .toLowerCase()
      .split(/[\s\-_.]+/)
      .map((p) => p.replace(/[^a-z0-9]/g, ''))
      .filter((p) => p.length >= 1);
  }

  // Try kana conversion (hiragana / katakana)
  const romaji = kanaToRomaji(trimmed);
  if (romaji.length > 0) {
    return romaji
      .split(/\s+/)
      .map((p) => p.replace(/[^a-z0-9]/g, ''))
      .filter((p) => p.length >= 1);
  }

  // Kanji-only → no convertible content
  return [];
}

// ── Candidate generation ─────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const BASEBALL_SUFFIXES = ['base', 'ball', 'hit', 'pitch'] as const;
const BASEBALL_PREFIXES = ['ace', 'slugger'] as const;

function sanitize(id: string): string {
  return id
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
}

/**
 * Generate 4–5 username candidates from a display name.
 * Falls back to the email prefix when the name is kanji-only.
 */
export function generateCandidates(displayName: string, email?: string): string[] {
  let parts = extractParts(displayName);

  // Fallback: split email prefix (e.g. "moegi.ochi" → ["moegi", "ochi"])
  if (parts.length === 0 && email) {
    const prefix = email.split('@')[0].toLowerCase();
    parts = prefix.split(/[^a-z0-9]+/).filter((p) => p.length >= 2);
    if (parts.length === 0 && prefix.length >= 2) parts = [prefix];
  }

  if (parts.length === 0) return [];

  const first = parts[0];                                  // 名 (given name)
  const last  = parts.length > 1 ? parts[parts.length - 1] : ''; // 姓 (family name)

  const raw: string[] = [
    last ? `${first}_${last}`                  : `${first}_${BASEBALL_SUFFIXES[0]}`, // moegi_ochi / moegi_base
    `${first}_${BASEBALL_SUFFIXES[0]}`,                                               // moegi_base
    `${BASEBALL_PREFIXES[0]}_${first}`,                                               // ace_moegi
    `${first}_${CURRENT_YEAR}`,                                                        // moegi_2026
    last ? `${last}_${first}` : `${first}_${BASEBALL_SUFFIXES[2]}`,                  // ochi_moegi / moegi_hit
  ];

  return [...new Set(raw)]
    .map(sanitize)
    .filter((id) => /^[a-z0-9_]{3,20}$/.test(id));
}
