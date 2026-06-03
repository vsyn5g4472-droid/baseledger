import type { BatteryProfile } from './analysisEngine';

function pct(v: number): string { return `${Math.round(v * 100)}%`; }
function fmtV(v: number | null): string { return v != null ? `${v}km/h` : '-'; }

const ZONE_JP: Record<string, string> = {
  '1': '内高', '2': '高中', '3': '外高',
  '4': '内中', '5': '真中', '6': '外中',
  '7': '内低', '8': '低中', '9': '外低',
  'BH': '高ボ', 'BL': '低ボ', 'BI': '内ボ', 'BO': '外ボ',
};

/** 捕手分析（バッテリー）HTML レポートを生成する */
export function generateBatteryReportHtml(profile: BatteryProfile): string {
  const strikeZones = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  // ── 2ストライク時ゾーングリッド ───────────────────────────────────────────────
  const z2s = profile.zone2Strike;
  const z2sTotal = Object.values(z2s).reduce((a, b) => a + b, 0) || 1;
  const zoneCells = strikeZones.map((z) => {
    const count = z2s[z] ?? 0;
    const rate = count / z2sTotal;
    const alpha = (Math.min(rate, 1) * 0.5 + 0.05).toFixed(2);
    if (count === 0) {
      return `<td class="zone-cell zone-empty"><span class="zn">${ZONE_JP[z] ?? z}</span><span class="zc">-</span></td>`;
    }
    return `<td class="zone-cell" style="background:rgba(14,77,164,${alpha})">
      <span class="zn">${ZONE_JP[z] ?? z}</span>
      <span class="zc">${count}</span>
      <span class="zr">${pct(rate)}</span>
    </td>`;
  });

  // ── 球種割合（2ストライク時）────────────────────────────────────────────────
  const pitchMixRows = (profile.pitchType2Strike ?? [])
    .slice(0, 6)
    .map((p) => `<tr>
      <td>${p.type}</td>
      <td>${p.count}</td>
      <td class="hl">${pct(p.pct)}</td>
      <td>${fmtV(p.avgVelocity)}</td>
    </tr>`)
    .join('');

  // ── 決め球ランキング ──────────────────────────────────────────────────────────
  const finishRows = (profile.finishingPitches ?? [])
    .slice(0, 5)
    .map((f, i) => `<tr>
      <td>${i + 1}</td>
      <td>${f.pitchType}</td>
      <td>${ZONE_JP[f.zone] ?? f.zone}</td>
      <td>${f.count}球</td>
      <td class="hl">${pct(f.pct)}</td>
    </tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>捕手分析 - ${profile.pitcherName} × ${profile.catcherName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Hiragino Sans', sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; padding: 24px; }
    .header { text-align: center; margin-bottom: 24px; border-bottom: 3px solid #0E4DA4; padding-bottom: 16px; }
    .header .app-name { font-size: 11px; color: #666; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
    .header h1 { font-size: 20px; font-weight: 900; color: #0E4DA4; margin-bottom: 4px; }
    .header .sub { font-size: 12px; color: #888; }
    .stat-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .stat-card { flex: 1; min-width: 80px; background: #f5f7fa; border-radius: 10px; padding: 12px; text-align: center; }
    .stat-card .sv { font-size: 20px; font-weight: 900; color: #0E4DA4; }
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
    .zone-cell .zr { display: block; font-size: 9px; color: #0E4DA4; }
    .zone-empty { background: #f9f9f9; }
    .zone-empty .zc { color: #bbb; font-weight: 400; }
    .hl { color: #0E4DA4; font-weight: 700; }
    .summary { background: #f5f7fa; border-radius: 10px; padding: 14px; font-size: 12px; line-height: 1.7; color: #333; margin-bottom: 16px; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e0e0e0; text-align: center; font-size: 10px; color: #aaa; }
  </style>
</head>
<body>

<div class="header">
  <div class="app-name">BaseLedger — 捕手分析レポート</div>
  <h1>⚾ ${profile.pitcherName} × ${profile.catcherName}</h1>
  <div class="sub">通算 ${profile.totalGames}試合 ${profile.totalPitches}球</div>
</div>

<h2>📈 バッテリー成績</h2>
<div class="stat-row">
  <div class="stat-card"><div class="sv">${pct(profile.strikeRate)}</div><div class="sl">ストライク率</div></div>
  <div class="stat-card"><div class="sv">${fmtV(profile.avgVelocity)}</div><div class="sl">平均球速</div></div>
  <div class="stat-card"><div class="sv">${fmtV(profile.maxVelocity)}</div><div class="sl">最速</div></div>
  <div class="stat-card"><div class="sv">${profile.totalPitches}</div><div class="sl">総投球数</div></div>
</div>

<h2>📊 2ストライク時の配球（ゾーン分布）</h2>
<p style="font-size:11px;color:#888;margin-bottom:6px;">← 打者視点（三塁側 ／ 一塁側）→　数字=投球数 色=割合</p>
<table class="zone-table">
  <tbody>
    <tr>${zoneCells[0]}${zoneCells[1]}${zoneCells[2]}</tr>
    <tr>${zoneCells[3]}${zoneCells[4]}${zoneCells[5]}</tr>
    <tr>${zoneCells[6]}${zoneCells[7]}${zoneCells[8]}</tr>
  </tbody>
</table>

${pitchMixRows ? `
<h2>🎯 2ストライク時の球種割合</h2>
<table>
  <thead><tr><th>球種</th><th>球数</th><th>割合</th><th>平均球速</th></tr></thead>
  <tbody>${pitchMixRows}</tbody>
</table>` : ''}

${finishRows ? `
<h2>🏆 決め球ランキング</h2>
<table>
  <thead><tr><th>順位</th><th>球種</th><th>コース</th><th>球数</th><th>割合</th></tr></thead>
  <tbody>${finishRows}</tbody>
</table>` : ''}

${profile.summary ? `
<h2>💬 配球傾向サマリー</h2>
<div class="summary">${profile.summary.replace(/\n/g, '<br>')}</div>` : ''}

<div class="footer">Generated by BaseLedger &nbsp;|&nbsp; ${new Date().toLocaleString('ja-JP')}</div>

</body>
</html>`;
}

/** チャット/DM 送信用のサマリーテキスト */
export function buildBatterySummaryText(profile: BatteryProfile): string {
  return [
    `⚾ 【捕手分析】${profile.pitcherName} × ${profile.catcherName}`,
    `ストライク率: ${Math.round(profile.strikeRate * 100)}% / 平均球速: ${profile.avgVelocity != null ? `${profile.avgVelocity}km/h` : '-'}`,
    `通算${profile.totalGames}試合 ${profile.totalPitches}球`,
    '---',
    'BaseLedgerで詳細を確認',
  ].join('\n');
}
