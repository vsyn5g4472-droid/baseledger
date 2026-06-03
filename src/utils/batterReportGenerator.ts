import type { BatterProfile } from './analysisEngine';

function pct(v: number): string { return `${Math.round(v * 100)}%`; }
function fmt3(v: number): string { return v.toFixed(3).replace(/^0/, '') || '.000'; }

const ZONE_JP: Record<string, string> = {
  '1': '内高', '2': '高中', '3': '外高',
  '4': '内中', '5': '真中', '6': '外中',
  '7': '内低', '8': '低中', '9': '外低',
};

/** 打者分析 HTML レポートを生成する */
export function generateBatterReportHtml(
  profile: BatterProfile,
  playerName?: string,
  teamName?: string,
): string {
  const name = playerName ?? profile.batterName;
  const estimatedHits = Math.round(profile.avg * profile.totalAtBats);

  // ── ゾーン別成績グリッド ─────────────────────────────────────────────────────
  const zoneMap = new Map(profile.zoneStats.map((z) => [z.zone, z]));
  const strikeZones = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const zoneCells = strikeZones.map((z) => {
    const zs = zoneMap.get(z);
    if (!zs || zs.pitchesFaced === 0) {
      return `<td class="zone-cell zone-empty"><span class="zn">${ZONE_JP[z] ?? z}</span><span class="zc">-</span></td>`;
    }
    const hitRate = Math.round(zs.hitRate * 100);
    const alpha = (Math.min(hitRate, 100) / 100 * 0.35 + 0.05).toFixed(2);
    return `<td class="zone-cell" style="background:rgba(14,77,164,${alpha})">
      <span class="zn">${ZONE_JP[z] ?? z}</span>
      <span class="zc">${pct(zs.hitRate)}</span>
      <span class="zr">${zs.pitchesFaced}球</span>
    </td>`;
  });

  // ── 球種別成績テーブル ────────────────────────────────────────────────────────
  const pitchTypeRows = (profile.pitchTypeStats ?? [])
    .slice(0, 8)
    .map((p) => `
      <tr>
        <td>${p.type}</td>
        <td>${p.count}</td>
        <td>${pct(p.swingMissRate)}</td>
        <td>${pct(p.hitRate)}</td>
        <td>${p.avgVelocity != null ? `${p.avgVelocity}km/h` : '-'}</td>
      </tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>打者分析 - ${name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Hiragino Sans', sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; padding: 24px; }
    .header { text-align: center; margin-bottom: 24px; border-bottom: 3px solid #0E4DA4; padding-bottom: 16px; }
    .header .app-name { font-size: 11px; color: #666; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
    .header h1 { font-size: 22px; font-weight: 900; color: #0E4DA4; margin-bottom: 4px; }
    .header .sub { font-size: 12px; color: #888; }
    .stat-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .stat-card { flex: 1; min-width: 80px; background: #f5f7fa; border-radius: 10px; padding: 12px; text-align: center; }
    .stat-card .sv { font-size: 22px; font-weight: 900; color: #0E4DA4; }
    .stat-card .sl { font-size: 10px; color: #666; margin-top: 2px; }
    h2 { font-size: 15px; font-weight: 800; color: #0E4DA4; border-left: 4px solid #0E4DA4; padding-left: 10px; margin: 20px 0 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th, td { border: 1px solid #e0e0e0; padding: 5px 8px; text-align: center; font-size: 12px; }
    th { background: #f5f7fa; font-weight: 700; color: #555; }
    td:first-child { text-align: left; }
    .zone-table { width: auto; margin: 6px auto 12px; }
    .zone-table td { width: 60px; height: 52px; padding: 3px; border: 2px solid #ccc; }
    .zone-cell { vertical-align: middle; text-align: center; }
    .zone-cell .zn { display: block; font-size: 9px; color: #888; }
    .zone-cell .zc { display: block; font-size: 13px; font-weight: 800; color: #1a1a1a; }
    .zone-cell .zr { display: block; font-size: 9px; color: #555; }
    .zone-empty { background: #f9f9f9; }
    .zone-empty .zc { color: #bbb; font-weight: 400; }
    .hl { color: #0E4DA4; font-weight: 700; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e0e0e0; text-align: center; font-size: 10px; color: #aaa; }
  </style>
</head>
<body>

<div class="header">
  <div class="app-name">BaseLedger — 打者分析レポート</div>
  <h1>${name}</h1>
  <div class="sub">${teamName ? teamName + ' ／ ' : ''}通算 ${profile.totalGames}試合 ${profile.totalAtBats}打数</div>
</div>

<h2>⚾ 打撃成績</h2>
<div class="stat-row">
  <div class="stat-card"><div class="sv">${fmt3(profile.avg)}</div><div class="sl">打率</div></div>
  <div class="stat-card"><div class="sv">${estimatedHits}</div><div class="sl">安打(推定)</div></div>
  <div class="stat-card"><div class="sv">${pct(profile.strikeoutRate)}</div><div class="sl">三振率</div></div>
  <div class="stat-card"><div class="sv">${pct(profile.walkRate)}</div><div class="sl">四球率</div></div>
  ${profile.avgHitDistance != null ? `<div class="stat-card"><div class="sv">${profile.avgHitDistance}m</div><div class="sl">平均飛距離</div></div>` : ''}
</div>

<h2>📊 コース別成績（被打率）</h2>
<p style="font-size:11px;color:#888;margin-bottom:6px;">← 打者視点（三塁側 ／ 一塁側）→　濃い色 = 得意コース</p>
<table class="zone-table">
  <tbody>
    <tr>${zoneCells[0]}${zoneCells[1]}${zoneCells[2]}</tr>
    <tr>${zoneCells[3]}${zoneCells[4]}${zoneCells[5]}</tr>
    <tr>${zoneCells[6]}${zoneCells[7]}${zoneCells[8]}</tr>
  </tbody>
</table>

${pitchTypeRows ? `
<h2>🎯 球種別成績</h2>
<table>
  <thead><tr><th>球種</th><th>球数</th><th>空振率</th><th>被打率</th><th>球速</th></tr></thead>
  <tbody>${pitchTypeRows}</tbody>
</table>` : ''}

<div class="footer">Generated by BaseLedger &nbsp;|&nbsp; ${new Date().toLocaleString('ja-JP')}</div>

</body>
</html>`;
}

/** チャット/DM 送信用のサマリーテキスト */
export function buildBatterSummaryText(
  profile: BatterProfile,
  playerName?: string,
): string {
  const name = playerName ?? profile.batterName;
  const avg = profile.avg.toFixed(3).replace(/^0/, '') || '.000';
  const hits = Math.round(profile.avg * profile.totalAtBats);
  return [
    `📊 【打者分析】${name}`,
    `打率: ${avg}`,
    `${profile.totalAtBats}打数${hits}安打 三振率${Math.round(profile.strikeoutRate * 100)}%`,
    '---',
    'BaseLedgerで詳細を確認',
  ].join('\n');
}
