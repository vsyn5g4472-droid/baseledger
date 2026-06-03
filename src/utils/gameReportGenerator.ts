import type { GameState } from '../types/game';
import type { GameAnalytics } from './gameStatsCalculator';
import { formatBattingAvg } from './statsCalculator';

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
  const pitchingTotals = (teamName: string, stats: GameAnalytics['pitching']['homePitcher']): string => {
    if (!stats) return '';
    return `
    <h3>${teamName}</h3>
    <table>
      <tbody>
        <tr><th>投球数</th><td>${stats.totalPitches ?? 0}球</td></tr>
        <tr><th>ストライク率</th><td>${pct(stats.strikeRate ?? 0)}</td></tr>
        <tr><th>ボール率</th><td>${pct(stats.ballRate ?? 0)}</td></tr>
      </tbody>
    </table>`;
  };

  // ── 4. 配球分析 ──────────────────────────────────────────────────────────────

  // 9分割ゾーングリッド
  // ゾーン番号配置（打者視点）:
  //  1 | 2 | 3
  //  4 | 5 | 6
  //  7 | 8 | 9
  const zoneGrid = (stats: GameAnalytics['pitching']['homePitcher']): string => {
    if (!stats) return '';
    const safeZoneStats = stats.zoneStats ?? [];
    const zoneMap = new Map(safeZoneStats.map((z) => [z.zone, z]));

    const strikeZones = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const cells = strikeZones.map((z) => {
      const zs = zoneMap.get(z);
      if (!zs || zs.totalPitches === 0) {
        return `<td class="zone-cell zone-empty"><span class="zn">${z}</span><span class="zc">-</span></td>`;
      }
      const sr = Math.round((zs.strikes / zs.totalPitches) * 100);
      const alpha = ((Math.min(sr, 100) / 100) * 0.35 + 0.05).toFixed(2);
      return `<td class="zone-cell" style="background:rgba(14,77,164,${alpha})">
        <span class="zn">${z}</span>
        <span class="zc">${zs.totalPitches}</span>
        <span class="zr">${sr}%</span>
      </td>`;
    });

    return `
    <table class="zone-table">
      <thead>
        <tr><th colspan="3" style="text-align:center;font-size:10px;color:#888;background:#fff;border:none;">
          ← 打者視点（三塁側 ／ 一塁側）→
        </th></tr>
      </thead>
      <tbody>
        <tr>${cells[0]}${cells[1]}${cells[2]}</tr>
        <tr>${cells[3]}${cells[4]}${cells[5]}</tr>
        <tr>${cells[6]}${cells[7]}${cells[8]}</tr>
      </tbody>
    </table>`;
  };

  // 球種割合
  const pitchMixTable = (stats: GameAnalytics['pitching']['homePitcher']): string => {
    if (!stats) return '';
    const safePitchMix = stats.pitchMix ?? [];
    if (safePitchMix.length === 0) return '';
    const rows = safePitchMix
      .map((m) => `<tr><td>${m.pitchType ?? '-'}</td><td>${pct(m.pct ?? 0)}</td><td>${m.avgVelocity != null ? `${m.avgVelocity}km/h` : '-'}</td></tr>`)
      .join('');
    return `
    <table>
      <thead><tr><th>球種</th><th>割合</th><th>平均球速</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  };

  const pitchDistSection = (teamName: string, stats: GameAnalytics['pitching']['homePitcher']): string => {
    if (!stats) return '';
    return `
    <h3>${teamName}</h3>
    ${zoneGrid(stats)}
    ${pitchMixTable(stats)}`;
  };

  // ── 5. 打球分析 ──────────────────────────────────────────────────────────────

  const typeLabel: Record<string, string> = {
    grounder: 'ゴロ',
    liner:    'ライナー',
    fly:      'フライ',
    popup:    'ポップ',
  };
  const typeOrder = ['grounder', 'liner', 'fly', 'popup'];

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
    <h3>${teamName}の打球</h3>
    <table>
      <thead><tr><th>種別</th><th>本数</th><th>平均飛距離</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  };

  // ── HTML ─────────────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>試合レポート - ${game.awayTeam.name} vs ${game.homeTeam.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
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
      background: linear-gradient(135deg, #0E4DA4 0%, #1565C0 100%);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
      color: white;
    }
    .score-team { text-align: center; flex: 1; }
    .score-team .team-label { font-size: 11px; opacity: 0.8; }
    .score-team .team-name { font-size: 16px; font-weight: 800; margin: 4px 0; }
    .score-team .score-num { font-size: 48px; font-weight: 900; line-height: 1; }
    .score-sep { font-size: 32px; font-weight: 300; opacity: 0.6; }
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
    /* Zone grid */
    .zone-table { width: auto; margin: 6px auto 12px; }
    .zone-table td { width: 56px; height: 56px; padding: 4px; border: 2px solid #ccc; }
    .zone-cell { vertical-align: middle; text-align: center; }
    .zone-cell .zn { display: block; font-size: 9px; color: #888; }
    .zone-cell .zc { display: block; font-size: 14px; font-weight: 800; color: #1a1a1a; }
    .zone-cell .zr { display: block; font-size: 10px; color: #0E4DA4; }
    .zone-empty { background: #f9f9f9; }
    .zone-empty .zc { color: #bbb; font-size: 12px; font-weight: 400; }
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
  <div class="winner-badge">🏆 ${winner}${awayScore !== homeScore ? ' の勝利' : ''}</div>

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
  <h2>⚾ 打撃成績</h2>
  ${battingTable(`先攻 ${game.awayTeam.name}`, analytics.batting?.away ?? [])}
  ${battingTable(`後攻 ${game.homeTeam.name}`, analytics.batting?.home ?? [])}

  <!-- 3. 投球成績 -->
  <h2>⚡ 投球成績</h2>
  ${pitchingTotals(`後攻 ${game.homeTeam.name} 投手`, analytics.pitching?.homePitcher ?? null)}
  ${pitchingTotals(`先攻 ${game.awayTeam.name} 投手`, analytics.pitching?.awayPitcher ?? null)}

  <!-- 4. 配球分析 -->
  <h2>📊 配球分析</h2>
  ${pitchDistSection(`後攻 ${game.homeTeam.name} 投手`, analytics.pitching?.homePitcher ?? null)}
  ${pitchDistSection(`先攻 ${game.awayTeam.name} 投手`, analytics.pitching?.awayPitcher ?? null)}

  <!-- 5. 打球分析 -->
  <h2>🏃 打球分析</h2>
  ${battedBallSection(`先攻 ${game.awayTeam.name}`, 'top')}
  ${battedBallSection(`後攻 ${game.homeTeam.name}`, 'bottom')}

  <div class="footer">
    Generated by BaseLedger &nbsp;|&nbsp; ${new Date().toLocaleString('ja-JP')}
  </div>

</body>
</html>`;
}
