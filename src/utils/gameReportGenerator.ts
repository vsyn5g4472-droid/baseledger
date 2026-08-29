import type { GameState } from '../types/game';
import type { GameAnalytics, PlayerPitchingStats } from './gameStatsCalculator';
import { formatBattingAvg } from './statsCalculator';
import { ja } from '../i18n/ja';
import { Colors } from '../constants/theme';
import {
  SVG_W as SPRAY_W,
  SVG_H as SPRAY_H,
  HP_X,
  HP_Y,
  FIRST,
  SECOND,
  THIRD,
  MOUND,
  LEFT_FOUL,
  RIGHT_FOUL,
  outfieldPath,
  diamondPath,
  fieldToSvg,
  resultColor,
} from './sprayGeometry';

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** 試合分析 HTML レポートを生成する */
export function generateGameReportHtml(
  game: GameState,
  analytics: GameAnalytics,
): string {
  const date = fmtDate(game.createdAt ?? Date.now());
  const awayScore = analytics.finalScore.away;
  const homeScore = analytics.finalScore.home;
  const winner =
    awayScore > homeScore
      ? game.awayTeam.name
      : homeScore > awayScore
      ? game.homeTeam.name
      : '引き分け';

  // ── 1. スコアボード ──────────────────────────────────────────────────────────
  // innings は InningScore[] = { inning, away, home }[] 形式
  const safeInnings = (game.scoreboard?.innings ?? []) as Array<{ inning: number; away: number; home: number }>;
  const maxInning = safeInnings.length;
  const inningHeaders = Array.from({ length: maxInning }, (_, i) => `<th>${i + 1}</th>`).join('');
  const awayInnings = safeInnings.map((s) => `<td>${s.away ?? '-'}</td>`).join('');
  const homeInnings = safeInnings.map((s) => `<td>${s.home ?? '-'}</td>`).join('');

  // ── 2. 打撃成績テーブル ───────────────────────────────────────────────────────
  const battingTable = (teamName: string, players: GameAnalytics['batting']['away']): string => {
    const safePlayers = players ?? [];
    if (safePlayers.length === 0) return '';
    const rows = safePlayers
      .map(
        (p) => `
      <tr>
        <td>${p.playerName ?? '-'}</td>
        <td>${p.atBats ?? 0}</td>
        <td>${p.hits ?? 0}</td>
        <td>${p.doubles ?? 0}</td>
        <td>${p.triples ?? 0}</td>
        <td>${p.homeRuns ?? 0}</td>
        <td>${p.rbi ?? 0}</td>
        <td>${p.strikeouts ?? 0}</td>
        <td>${p.walks ?? 0}</td>
        <td class="hl">${(p.atBats ?? 0) > 0 ? formatBattingAvg(p.avg ?? 0) : '-'}</td>
        <td class="hl">${(p.atBats ?? 0) > 0 ? (p.ops ?? 0).toFixed(3).replace(/^0/, '') : '-'}</td>
      </tr>`,
      )
      .join('');
    return `
    <h3>${teamName}</h3>
    <table>
      <thead>
        <tr>
          <th>選手</th><th>打数</th><th>安打</th><th>2B</th><th>3B</th>
          <th>HR</th><th>打点</th><th>三振</th><th>四球</th><th>打率</th><th>OPS</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  };

  // ── 3. 投球成績（合計）───────────────────────────────────────────────────────
  const pitchingTotals = (stats: PlayerPitchingStats | null): string => {
    if (!stats) return '';
    return `
    <table>
      <tbody>
        <tr><th>投球数</th><td>${stats.totalPitches ?? 0}球</td></tr>
        <tr><th>ストライク率</th><td>${pct(stats.strikeRate ?? 0)}</td></tr>
        <tr><th>ボール率</th><td>${pct(stats.ballRate ?? 0)}</td></tr>
      </tbody>
    </table>`;
  };

  // ── 4. 配球分析 ──────────────────────────────────────────────────────────────

  const pitchTypeLabel = (pitchType: string): string =>
    (ja.pitchTypes as Record<string, string>)[pitchType] ?? pitchType;

  // アプリ内 PitchHeatmap と同じ寸法・座標系で、ゾーン濃淡・球数・全投球点を重ねる。
  const pitchChart = (stats: PlayerPitchingStats | null): string => {
    if (!stats) return '';
    const safeZoneStats = stats.zoneStats ?? [];
    const zoneCounts = new Map(safeZoneStats.map((z) => [z.zone, z.totalPitches]));
    const maxCount = Math.max(...safeZoneStats.map((z) => z.totalPitches), 1);

    const canvasW = 216;
    const canvasH = 284;
    const strikeLeft = 52;
    const strikeTop = 44;
    const strikeW = 112;
    const strikeH = 196;
    const strikeRight = strikeLeft + strikeW;
    const strikeBottom = strikeTop + strikeH;
    const cellW = strikeW / 3;
    const cellH = strikeH / 3;

    const heatColor = (count: number): string => {
      if (count === 0) return 'transparent';
      const t = count / maxCount;
      if (t < 0.15) return 'rgba(56,161,243,0.10)';
      if (t < 0.30) return 'rgba(56,161,243,0.25)';
      if (t < 0.50) return 'rgba(56,161,243,0.45)';
      if (t < 0.70) return 'rgba(56,161,243,0.65)';
      if (t < 0.85) return 'rgba(56,161,243,0.82)';
      return 'rgba(56,161,243,0.95)';
    };

    const zoneBounds = (zone: string): { x: number; y: number; w: number; h: number } | null => {
      const n = Number(zone);
      if (Number.isInteger(n) && n >= 1 && n <= 9) {
        const col = (n - 1) % 3;
        const row = Math.floor((n - 1) / 3);
        return { x: strikeLeft + col * cellW, y: strikeTop + row * cellH, w: cellW, h: cellH };
      }
      if (zone === 'BH') return { x: strikeLeft, y: 0, w: strikeW, h: strikeTop };
      if (zone === 'BL') return { x: strikeLeft, y: strikeBottom, w: strikeW, h: canvasH - strikeBottom };
      if (zone === 'BI') return { x: 0, y: strikeTop, w: strikeLeft, h: strikeH };
      if (zone === 'BO') return { x: strikeRight, y: strikeTop, w: canvasW - strikeRight, h: strikeH };
      return null;
    };

    const pitchColor = (result: string): string => {
      if (result === 'strike_called') return '#38A1F3';
      if (result === 'strike_swinging') return '#1A6BBF';
      if (result === 'foul' || result === 'foul_tip') return '#D4AF37';
      if (result === 'in_play') return '#34C759';
      if (result === 'hit_by_pitch') return '#C41E3A';
      return '#8E8E93';
    };

    const allZones = ['1','2','3','4','5','6','7','8','9','BH','BL','BI','BO'];
    const heatRects = allZones.map((zone) => {
      const count = zoneCounts.get(zone) ?? 0;
      const bounds = zoneBounds(zone);
      if (!bounds || count === 0) return '';
      return `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.w}" height="${bounds.h}" fill="${heatColor(count)}" />`;
    }).join('');

    const strikeZoneLabels = ['1','2','3','4','5','6','7','8','9'].map((zone) => {
      const count = zoneCounts.get(zone) ?? 0;
      if (count === 0) return '';
      const n = Number(zone);
      const col = (n - 1) % 3;
      const row = Math.floor((n - 1) / 3);
      const x = strikeLeft + col * cellW + cellW / 2;
      const y = strikeTop + row * cellH + cellH / 2 + 5;
      const fill = count / maxCount > 0.55 ? '#fff' : '#1a1a1a';
      return `<text x="${x}" y="${y}" text-anchor="middle" font-size="13" font-weight="700" fill="${fill}">${count}</text>`;
    }).join('');

    const ballZoneLabels = ['BH','BL','BI','BO'].map((zone) => {
      const count = zoneCounts.get(zone) ?? 0;
      const bounds = zoneBounds(zone);
      if (!bounds || count === 0) return '';
      return `<text x="${bounds.x + bounds.w / 2}" y="${bounds.y + bounds.h / 2 + 4}" text-anchor="middle" font-size="11" fill="#666">${count}</text>`;
    }).join('');

    const pitcherPitches = (game.pitchLogs ?? []).filter((p) => p.pitcherId === stats.playerId);
    const pitchDots = pitcherPitches
      .filter((p) => p.pitchX != null && p.pitchY != null)
      .map((p) => {
        const x = Math.max(0, Math.min(1, p.pitchX!)) * canvasW;
        const y = Math.max(0, Math.min(1, p.pitchY!)) * canvasH;
        return `<circle cx="${x}" cy="${y}" r="4.5" fill="${pitchColor(p.result)}" fill-opacity="0.85" stroke="#fff" stroke-width="0.8" />`;
      })
      .join('');

    const plottedCount = pitcherPitches.filter((p) => p.pitchX != null && p.pitchY != null).length;

    return `
    <div class="pitch-chart-wrap">
      <svg class="pitch-chart" viewBox="0 0 ${canvasW} ${canvasH}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#f5f6f8" />
        ${heatRects}
        <rect x="${strikeLeft}" y="${strikeTop}" width="${strikeW}" height="${strikeH}" fill="none" stroke="#0E4DA4" stroke-width="2" />
        <line x1="${strikeLeft + cellW}" y1="${strikeTop}" x2="${strikeLeft + cellW}" y2="${strikeBottom}" stroke="#0E4DA4" stroke-width="0.5" stroke-opacity="0.5" />
        <line x1="${strikeLeft + cellW * 2}" y1="${strikeTop}" x2="${strikeLeft + cellW * 2}" y2="${strikeBottom}" stroke="#0E4DA4" stroke-width="0.5" stroke-opacity="0.5" />
        <line x1="${strikeLeft}" y1="${strikeTop + cellH}" x2="${strikeRight}" y2="${strikeTop + cellH}" stroke="#0E4DA4" stroke-width="0.5" stroke-opacity="0.5" />
        <line x1="${strikeLeft}" y1="${strikeTop + cellH * 2}" x2="${strikeRight}" y2="${strikeTop + cellH * 2}" stroke="#0E4DA4" stroke-width="0.5" stroke-opacity="0.5" />
        ${strikeZoneLabels}${ballZoneLabels}${pitchDots}
        <text x="${strikeLeft + strikeW / 2}" y="${strikeTop - 8}" text-anchor="middle" font-size="9" fill="#666">高め</text>
        <text x="${strikeLeft + strikeW / 2}" y="${strikeBottom + 16}" text-anchor="middle" font-size="9" fill="#666">低め</text>
        <text x="${strikeLeft - 16}" y="${strikeTop + strikeH / 2}" text-anchor="middle" font-size="9" fill="#666" transform="rotate(-90 ${strikeLeft - 16} ${strikeTop + strikeH / 2})">内</text>
        <text x="${strikeRight + 16}" y="${strikeTop + strikeH / 2}" text-anchor="middle" font-size="9" fill="#666" transform="rotate(90 ${strikeRight + 16} ${strikeTop + strikeH / 2})">外</text>
      </svg>
      <div class="pitch-legend">
        <span><svg width="8" height="8" style="vertical-align:middle;margin-right:3px"><circle cx="4" cy="4" r="4" fill="#38A1F3"/></svg>見逃しS</span>
        <span><svg width="8" height="8" style="vertical-align:middle;margin-right:3px"><circle cx="4" cy="4" r="4" fill="#1A6BBF"/></svg>空振りS</span>
        <span><svg width="8" height="8" style="vertical-align:middle;margin-right:3px"><circle cx="4" cy="4" r="4" fill="#8E8E93"/></svg>ボール</span>
        <span><svg width="8" height="8" style="vertical-align:middle;margin-right:3px"><circle cx="4" cy="4" r="4" fill="#D4AF37"/></svg>ファウル</span>
        <span><svg width="8" height="8" style="vertical-align:middle;margin-right:3px"><circle cx="4" cy="4" r="4" fill="#34C759"/></svg>インプレー</span>
        <span><svg width="8" height="8" style="vertical-align:middle;margin-right:3px"><circle cx="4" cy="4" r="4" fill="#C41E3A"/></svg>死球</span>
      </div>
      <div class="pitch-chart-note">背景の青が濃いほど、そのコースへの投球数が多い</div>
      <div class="pitch-chart-note">投球位置 ${plottedCount}/${pitcherPitches.length}球（座標記録済み／総投球数）</div>
    </div>`;
  };

  // 球種割合
  const pitchMixTable = (stats: PlayerPitchingStats | null): string => {
    if (!stats) return '';
    const safePitchMix = stats.pitchMix ?? [];
    if (safePitchMix.length === 0) return '';
    const rows = safePitchMix
      .map((m) => `<tr><td>${pitchTypeLabel(m.pitchType ?? '-')}</td><td>${pct(m.pct ?? 0)}</td><td>${m.avgVelocity != null ? `${m.avgVelocity}km/h` : '-'}</td></tr>`)
      .join('');
    return `
    <table>
      <thead><tr><th>球種</th><th>割合</th><th>平均球速</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  };

  const pitchDistSection = (teamName: string, stats: PlayerPitchingStats | null): string => {
    if (!stats) return '';
    return `
    <div class="pitcher-block">
      <h3>${teamName}</h3>
      ${pitchingTotals(stats)}
      ${pitchChart(stats)}
      ${pitchMixTable(stats)}
    </div>`;
  };

  // ── 5. 打球分析 ──────────────────────────────────────────────────────────────

  const typeLabel: Record<string, string> = {
    grounder: 'ゴロ',
    liner:    'ライナー',
    fly:      'フライ',
    popup:    'ポップ',
  };
  const typeOrder = ['grounder', 'liner', 'fly', 'popup'];

  // SprayChart.tsx の SVG 構造を HTML 内 SVG として再現する
  const sprayChart = (logs: GameState['atBatLogs']): string => {
    const dots = (logs ?? [])
      .map((log) => {
        const bb = log.battedBall!;
        const pos = fieldToSvg(bb.fieldX, bb.fieldY);
        return `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="5.5" fill="${resultColor(log.result)}" fill-opacity="0.85" stroke="white" stroke-width="1" />`;
      })
      .join('');

    return `
    <div class="spray-chart-wrap">
      <svg width="${SPRAY_W}" height="${SPRAY_H}" viewBox="0 0 ${SPRAY_W} ${SPRAY_H}" xmlns="http://www.w3.org/2000/svg">
        <path d="${outfieldPath}" fill="${Colors.primaryLight}" stroke="${Colors.primary}" stroke-width="1.5" />
        <path d="${diamondPath}" fill="#E8F5E9" stroke="${Colors.primary}" stroke-width="1" />
        <line x1="${HP_X}" y1="${HP_Y}" x2="${LEFT_FOUL.x}" y2="${LEFT_FOUL.y}" stroke="${Colors.primary}" stroke-width="1.5" />
        <line x1="${HP_X}" y1="${HP_Y}" x2="${RIGHT_FOUL.x}" y2="${RIGHT_FOUL.y}" stroke="${Colors.primary}" stroke-width="1.5" />
        <circle cx="${MOUND.x}" cy="${MOUND.y}" r="5" fill="#F5E6C8" stroke="${Colors.primary}" stroke-width="1" />
        <circle cx="${HP_X}" cy="${HP_Y}" r="5" fill="${Colors.primary}" />
        <circle cx="${FIRST.x}" cy="${FIRST.y}" r="4" fill="white" stroke="${Colors.primary}" stroke-width="1.5" />
        <circle cx="${SECOND.x}" cy="${SECOND.y}" r="4" fill="white" stroke="${Colors.primary}" stroke-width="1.5" />
        <circle cx="${THIRD.x}" cy="${THIRD.y}" r="4" fill="white" stroke="${Colors.primary}" stroke-width="1.5" />
        <text x="${FIRST.x + 8}" y="${FIRST.y + 4}" font-size="8" fill="${Colors.textSecondary}">1B</text>
        <text x="${SECOND.x - 4}" y="${SECOND.y - 7}" font-size="8" fill="${Colors.textSecondary}">2B</text>
        <text x="${THIRD.x - 16}" y="${THIRD.y + 4}" font-size="8" fill="${Colors.textSecondary}">3B</text>
        ${dots}
      </svg>
      <div class="pitch-legend">
        <span><svg width="8" height="8" style="vertical-align:middle;margin-right:3px"><circle cx="4" cy="4" r="4" fill="${resultColor('single')}"/></svg>安打</span>
        <span><svg width="8" height="8" style="vertical-align:middle;margin-right:3px"><circle cx="4" cy="4" r="4" fill="${resultColor('error')}"/></svg>エラー</span>
        <span><svg width="8" height="8" style="vertical-align:middle;margin-right:3px"><circle cx="4" cy="4" r="4" fill="${resultColor(null)}"/></svg>その他</span>
      </div>
      <div class="pitch-chart-note">打球位置の記録をオフにした打球は、ホームベース付近に表示されます</div>
    </div>`;
  };

  const battedBallSection = (teamName: string, half: 'top' | 'bottom'): string => {
    const logs = (game.atBatLogs ?? []).filter(
      (l) => l.inning?.half === half && l.battedBall,
    );
    if (logs.length === 0) return '';

    const counts: Record<string, number> = {};
    const dists:  Record<string, number[]> = {};

    for (const log of logs) {
      const t = log.battedBall!.type as string;
      counts[t] = (counts[t] ?? 0) + 1;
      const d = log.battedBall!.estimatedDistance;
      if (d > 0) {
        if (!dists[t]) dists[t] = [];
        dists[t].push(d);
      }
    }

    const rows = typeOrder
      .filter((t) => (counts[t] ?? 0) > 0)
      .map((t) => {
        const d = dists[t] ?? [];
        const avg = d.length > 0
          ? Math.round(d.reduce((a, b) => a + b, 0) / d.length)
          : null;
        return `<tr>
          <td>${typeLabel[t] ?? t}</td>
          <td>${counts[t] ?? 0}</td>
          <td>${avg !== null ? `${avg}m` : '-'}</td>
        </tr>`;
      })
      .join('');

    if (!rows) return '';

    return `
    <div class="team-block">
      <h3>${teamName}の打球</h3>
      ${sprayChart(logs)}
      <table>
        <thead><tr><th>種別</th><th>本数</th><th>平均飛距離</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  };

  // ── HTML ─────────────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>試合レポート - ${game.awayTeam.name} vs ${game.homeTeam.name}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: -apple-system, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      background: #fff;
      padding: 24px;
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
      border-bottom: 3px solid #0E4DA4;
      padding-bottom: 16px;
    }
    .header .app-name { font-size: 11px; color: #666; margin-bottom: 4px; letter-spacing: 1px; text-transform: uppercase; }
    .header h1 { font-size: 22px; font-weight: 900; color: #0E4DA4; margin-bottom: 6px; }
    .header .date { font-size: 12px; color: #666; }
    .score-box {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 24px;
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .score-team { text-align: center; flex: 1; }
    .score-team .team-label { font-size: 11px; opacity: 0.8; }
    .score-team .team-name { font-size: 16px; font-weight: 800; margin: 4px 0; color: #1a1a1a; }
    .score-team .score-num { font-size: 48px; font-weight: 900; line-height: 1; color: #0E4DA4; }
    .score-sep { font-size: 32px; font-weight: 300; color: #666; }
    .winner-badge { text-align: center; margin-bottom: 16px; font-size: 14px; font-weight: 700; color: #0E4DA4; }
    /* Scoreboard */
    .scoreboard { margin-bottom: 20px; overflow-x: auto; }
    .scoreboard table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .scoreboard th, .scoreboard td { border: 1px solid #e0e0e0; padding: 5px 8px; text-align: center; }
    .scoreboard th { background: #f5f7fa; font-weight: 700; color: #555; }
    .scoreboard .team-col { text-align: left; font-weight: 700; min-width: 80px; }
    .scoreboard .total-col { font-weight: 800; color: #0E4DA4; }
    /* Headings */
    h2 { font-size: 16px; font-weight: 800; color: #0E4DA4; border-left: 4px solid #0E4DA4; padding-left: 10px; margin: 20px 0 12px; }
    h3 { font-size: 13px; font-weight: 700; color: #333; margin: 12px 0 8px; }
    /* Tables */
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th, td { border: 1px solid #e0e0e0; padding: 5px 8px; text-align: center; font-size: 12px; }
    th { background: #f5f7fa; font-weight: 700; color: #555; }
    td:first-child { text-align: left; }
    .hl { color: #0E4DA4; font-weight: 700; }
    /* Pitch location chart */
    .pitch-chart-wrap { text-align: center; margin: 6px auto 12px; page-break-inside: avoid; }
    .pitch-chart { width: 216px; height: 284px; display: block; margin: 0 auto 6px; }
    .pitch-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 10px; font-size: 9px; color: #555; }
    .pitch-legend span { white-space: nowrap; }
    .pitch-chart-note { margin-top: 5px; font-size: 9px; color: #777; }
    .pitcher-block { page-break-inside: avoid; }
    /* Spray chart */
    .spray-chart-wrap { text-align: center; margin: 6px auto 12px; }
    .team-block { page-break-inside: avoid; }
    /* Footer */
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e0e0e0; text-align: center; font-size: 10px; color: #aaa; }
  </style>
</head>
<body>

  <div class="header">
    <div class="app-name">BaseLedger — 試合記録・分析システム</div>
    <h1>${game.awayTeam.name} vs ${game.homeTeam.name}</h1>
    <div class="date">${date}</div>
  </div>

  <div class="score-box">
    <div class="score-team">
      <div class="team-label">先攻</div>
      <div class="team-name">${game.awayTeam.name}</div>
      <div class="score-num">${awayScore}</div>
    </div>
    <div class="score-sep">-</div>
    <div class="score-team">
      <div class="team-label">後攻</div>
      <div class="team-name">${game.homeTeam.name}</div>
      <div class="score-num">${homeScore}</div>
    </div>
  </div>
  <div class="winner-badge">${winner}${awayScore !== homeScore ? ' の勝利' : ''}</div>

  <!-- 1. スコアボード -->
  <div class="scoreboard">
    <table>
      <thead>
        <tr>
          <th class="team-col">チーム</th>
          ${inningHeaders}
          <th class="total-col">計</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="team-col">${game.awayTeam.name}</td>
          ${awayInnings}
          <td class="total-col">${awayScore}</td>
        </tr>
        <tr>
          <td class="team-col">${game.homeTeam.name}</td>
          ${homeInnings}
          <td class="total-col">${homeScore}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- 2. 打撃成績 -->
  <h2>打撃成績</h2>
  ${battingTable(`先攻 ${game.awayTeam.name}`, analytics.batting?.away ?? [])}
  ${battingTable(`後攻 ${game.homeTeam.name}`, analytics.batting?.home ?? [])}

  <!-- 3. 投球・配球分析 -->
  <h2>投球・配球分析</h2>
  ${(analytics.pitching?.homePitchers ?? []).map((p) => pitchDistSection(`後攻 ${game.homeTeam.name} ${p.playerName}`, p)).join('')}
  ${(analytics.pitching?.awayPitchers ?? []).map((p) => pitchDistSection(`先攻 ${game.awayTeam.name} ${p.playerName}`, p)).join('')}

  <!-- 4. 打球分析 -->
  <h2>打球分析</h2>
  ${battedBallSection(`先攻 ${game.awayTeam.name}`, 'top')}
  ${battedBallSection(`後攻 ${game.homeTeam.name}`, 'bottom')}

  <div class="footer">
    Generated by BaseLedger &nbsp;|&nbsp; ${new Date().toLocaleString('ja-JP')}
  </div>

</body>
</html>`;
}
