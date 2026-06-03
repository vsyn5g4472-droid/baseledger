import type { GameState } from '../types/game';
import type { GameAnalytics } from './gameStatsCalculator';
import type { AIReport } from '../services/aiReportService';
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
  aiReport?: AIReport | null,
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

  // イニング別スコア
  // innings は InningScore[] = { inning, away, home }[] 形式
  // 古いデータや未定義を考慮して ?? [] でガード
  const safeInnings = (game.scoreboard?.innings ?? []) as Array<{ inning: number; away: number; home: number }>;
  const maxInning = safeInnings.length;
  const inningHeaders = Array.from({ length: maxInning }, (_, i) => `<th>${i + 1}</th>`).join('');
  const awayInnings = safeInnings.map((s) => `<td>${s.away ?? '-'}</td>`).join('');
  const homeInnings = safeInnings.map((s) => `<td>${s.home ?? '-'}</td>`).join('');

  // 打撃成績テーブル生成
  const battingTable = (teamName: string, players: GameAnalytics['batting']['away']) => {
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
        <td class="highlight">${(p.atBats ?? 0) > 0 ? formatBattingAvg(p.avg ?? 0) : '-'}</td>
        <td class="highlight">${(p.atBats ?? 0) > 0 ? ((p.ops ?? 0).toFixed(3).replace(/^0/, '')) : '-'}</td>
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

  // 投球成績
  const pitchingSection = (teamName: string, stats: GameAnalytics['pitching']['homePitcher']) => {
    if (!stats) return '';
    const safePitchMix = stats.pitchMix ?? [];
    return `
    <h3>${teamName}</h3>
    <table>
      <tbody>
        <tr><th>投球数</th><td>${stats.totalPitches ?? 0}球</td></tr>
        <tr><th>ストライク率</th><td>${pct(stats.strikeRate ?? 0)}</td></tr>
        <tr><th>ボール率</th><td>${pct(stats.ballRate ?? 0)}</td></tr>
        ${
          safePitchMix.length > 0
            ? `<tr><th>球種構成</th><td>${safePitchMix
                .map((m) => `${m.pitchType ?? '-'} ${pct(m.pct ?? 0)}`)
                .join(' / ')}</td></tr>`
            : ''
        }
      </tbody>
    </table>`;
  };

  // AI分析セクション
  const aiSection = aiReport && !aiReport.isMock
    ? `
    <div class="ai-section">
      <h2>🤖 AI 総合分析</h2>
      <div class="ai-block">
        <h4>総合評価</h4>
        <p>${(aiReport?.overall ?? '').replace(/\n/g, '<br>')}</p>
      </div>
      ${
        (aiReport?.improvements ?? []).length > 0
          ? `<div class="ai-block">
          <h4>改善ポイント</h4>
          ${(aiReport?.improvements ?? []).map((imp) => `<p><strong>${imp.aspect}:</strong> ${imp.detail}</p>`).join('')}
        </div>`
          : ''
      }
      ${
        aiReport.nextAdvice
          ? `<div class="ai-block">
          <h4>次戦へのアドバイス</h4>
          <p>${aiReport.nextAdvice.replace(/\n/g, '<br>')}</p>
        </div>`
          : ''
      }
      ${
        aiReport.highlights
          ? `<div class="ai-block">
          <h4>ハイライト</h4>
          <p>${aiReport.highlights.replace(/\n/g, '<br>')}</p>
        </div>`
          : ''
      }
    </div>`
    : `<div class="ai-section ai-placeholder">
        <p>📊 詳細AI分析はBaseLedgerアプリの「分析」タブでご確認ください。</p>
      </div>`;

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
    .header .app-name {
      font-size: 11px;
      color: #666;
      margin-bottom: 4px;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .header h1 {
      font-size: 22px;
      font-weight: 900;
      color: #0E4DA4;
      margin-bottom: 6px;
    }
    .header .date {
      font-size: 12px;
      color: #666;
    }
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
    .winner-badge {
      text-align: center;
      margin-bottom: 16px;
      font-size: 14px;
      font-weight: 700;
      color: #0E4DA4;
    }
    /* Inning scoreboard */
    .scoreboard { margin-bottom: 20px; overflow-x: auto; }
    .scoreboard table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .scoreboard th, .scoreboard td {
      border: 1px solid #e0e0e0;
      padding: 5px 8px;
      text-align: center;
    }
    .scoreboard th { background: #f5f7fa; font-weight: 700; color: #555; }
    .scoreboard .team-col { text-align: left; font-weight: 700; min-width: 80px; }
    .scoreboard .total-col { font-weight: 800; color: #0E4DA4; }
    /* Section */
    h2 {
      font-size: 16px;
      font-weight: 800;
      color: #0E4DA4;
      border-left: 4px solid #0E4DA4;
      padding-left: 10px;
      margin: 20px 0 12px;
    }
    h3 {
      font-size: 13px;
      font-weight: 700;
      color: #333;
      margin: 12px 0 8px;
    }
    h4 {
      font-size: 13px;
      font-weight: 700;
      color: #0E4DA4;
      margin-bottom: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    th, td {
      border: 1px solid #e0e0e0;
      padding: 5px 8px;
      text-align: center;
      font-size: 12px;
    }
    th { background: #f5f7fa; font-weight: 700; color: #555; }
    td:first-child { text-align: left; }
    .highlight { color: #0E4DA4; font-weight: 700; }
    .ai-section {
      background: linear-gradient(135deg, #EEF4FF 0%, #F5F8FF 100%);
      border: 1px solid #C7D9F8;
      border-radius: 12px;
      padding: 16px;
      margin-top: 20px;
    }
    .ai-section h2 {
      border-left: none;
      padding-left: 0;
      margin-top: 0;
    }
    .ai-block {
      background: white;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .ai-block p { font-size: 12px; line-height: 1.7; color: #333; margin-top: 4px; }
    .ai-placeholder {
      text-align: center;
      padding: 24px;
      color: #666;
    }
    .footer {
      margin-top: 32px;
      padding-top: 12px;
      border-top: 1px solid #e0e0e0;
      text-align: center;
      font-size: 10px;
      color: #aaa;
    }
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

  <!-- イニング別スコア -->
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

  <!-- 打撃成績 -->
  <h2>⚾ 打撃成績</h2>
  ${battingTable(`先攻 ${game.awayTeam.name}`, analytics.batting?.away ?? [])}
  ${battingTable(`後攻 ${game.homeTeam.name}`, analytics.batting?.home ?? [])}

  <!-- 投球成績 -->
  <h2>⚡ 投球成績</h2>
  ${pitchingSection(`後攻 ${game.homeTeam.name} 投手`, analytics.pitching?.homePitcher ?? null)}
  ${pitchingSection(`先攻 ${game.awayTeam.name} 投手`, analytics.pitching?.awayPitcher ?? null)}

  <!-- AI分析 -->
  ${aiSection}

  <div class="footer">
    Generated by BaseLedger &nbsp;|&nbsp; ${new Date().toLocaleString('ja-JP')}
  </div>

</body>
</html>`;
}
