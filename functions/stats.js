// /stats — password-protected (Basic Auth) analytics dashboard.
// Reads clicks + conversions from D1 and renders a single HTML page.

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

const fmtNum = (n) => Number(n || 0).toLocaleString('en-US');
const fmtUSD = (n) => '$' + Number(n || 0).toFixed(2);
const pct = (a, b) =>
  b > 0 ? ((Number(a) / Number(b)) * 100).toFixed(2) + '%' : '—';
const fmtTs = (ms) => {
  const d = new Date(Number(ms));
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
};

export async function onRequest(context) {
  const { request, env } = context;

  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Basic ')) {
    return new Response('auth required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="perklt stats"' },
    });
  }
  const [u, p] = atob(auth.slice(6)).split(':');
  if (u !== env.STATS_USER || p !== env.STATS_PASS) {
    return new Response('forbidden', { status: 403 });
  }

  const db = env.DB;
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const weekAgoMs = now - 7 * 24 * 60 * 60 * 1000;

  const all = (sql, ...binds) =>
    db.prepare(sql).bind(...binds).all().then((r) => r.results || []);

  const [
    totalsClicks, totalsConvs,
    todayClicks, todayConvs,
    weekClicks, weekConvs,
    clicksBySource, convsBySource,
    clicksByCountry,
    topOffers,
    recentClicks, recentConvs,
  ] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS n FROM clicks').first(),
    db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(payout),0) AS payout FROM conversions').first(),
    db.prepare('SELECT COUNT(*) AS n FROM clicks WHERE ts >= ?').bind(todayMs).first(),
    db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(payout),0) AS payout FROM conversions WHERE ts >= ?').bind(todayMs).first(),
    db.prepare('SELECT COUNT(*) AS n FROM clicks WHERE ts >= ?').bind(weekAgoMs).first(),
    db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(payout),0) AS payout FROM conversions WHERE ts >= ?').bind(weekAgoMs).first(),
    all('SELECT source, COUNT(*) AS clicks FROM clicks GROUP BY source'),
    all('SELECT source, COUNT(*) AS convs, COALESCE(SUM(payout),0) AS payout FROM conversions GROUP BY source'),
    all("SELECT country, COUNT(*) AS clicks FROM clicks WHERE country <> '' GROUP BY country ORDER BY clicks DESC LIMIT 10"),
    all("SELECT offer_id, offer, COUNT(*) AS convs, COALESCE(SUM(payout),0) AS payout FROM conversions WHERE offer_id <> '' GROUP BY offer_id ORDER BY payout DESC LIMIT 10"),
    all('SELECT id, ts, country, source, campaign FROM clicks ORDER BY ts DESC LIMIT 20'),
    all('SELECT subid, ts, payout, offer, source, campaign FROM conversions ORDER BY ts DESC LIMIT 20'),
  ]);

  // Merge source tables
  const sourceMap = new Map();
  for (const r of clicksBySource) sourceMap.set(r.source || '(none)', { source: r.source || '(none)', clicks: r.clicks, convs: 0, payout: 0 });
  for (const r of convsBySource) {
    const key = r.source || '(none)';
    const cur = sourceMap.get(key) || { source: key, clicks: 0, convs: 0, payout: 0 };
    cur.convs = r.convs;
    cur.payout = r.payout;
    sourceMap.set(key, cur);
  }
  const sources = [...sourceMap.values()].sort((a, b) => b.clicks - a.clicks);

  const kpi = (label, value, sub = '') => `
    <div class="kpi">
      <div class="kpi-label">${esc(label)}</div>
      <div class="kpi-value">${esc(value)}</div>
      ${sub ? `<div class="kpi-sub">${esc(sub)}</div>` : ''}
    </div>`;

  const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="60">
<meta name="robots" content="noindex, nofollow">
<title>perklt stats</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:ui-monospace,"SF Mono","Cascadia Mono","Roboto Mono",monospace;background:#0a0a0a;color:#e5e5e5;padding:1.5rem;line-height:1.5}
h1{font-size:1.1rem;color:#10b981;font-weight:600;margin-bottom:.25rem;letter-spacing:-.01em}
.sub{color:#737373;font-size:.8rem;margin-bottom:2rem}
h2{font-size:.75rem;color:#737373;text-transform:uppercase;letter-spacing:.12em;margin:2rem 0 .75rem;font-weight:600}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.75rem;margin-bottom:1rem}
.kpi{background:#171717;border:1px solid #262626;border-radius:8px;padding:1rem}
.kpi-label{font-size:.7rem;color:#737373;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.4rem}
.kpi-value{font-size:1.4rem;font-weight:700;color:#fafafa;line-height:1.1}
.kpi-sub{font-size:.75rem;color:#10b981;margin-top:.3rem}
table{width:100%;border-collapse:collapse;background:#171717;border:1px solid #262626;border-radius:8px;overflow:hidden;font-size:.85rem}
th,td{padding:.6rem .8rem;text-align:left;border-bottom:1px solid #262626}
th{background:#0f0f0f;color:#737373;font-weight:600;font-size:.7rem;text-transform:uppercase;letter-spacing:.08em}
tr:last-child td{border-bottom:none}
td.n{text-align:right;font-variant-numeric:tabular-nums}
td.good{color:#10b981}
td.muted{color:#737373}
.empty{color:#525252;font-style:italic;padding:.5rem 0}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
@media(max-width:720px){.grid{grid-template-columns:1fr}}
footer{margin-top:3rem;color:#525252;font-size:.7rem;text-align:center}
</style>
</head>
<body>
<h1>perklt — stats</h1>
<div class="sub">auto-refresh 60s · generated ${esc(fmtTs(now))}</div>

<h2>Totals</h2>
<div class="kpis">
  ${kpi('All-time clicks', fmtNum(totalsClicks?.n))}
  ${kpi('All-time conv', fmtNum(totalsConvs?.n), pct(totalsConvs?.n, totalsClicks?.n) + ' CR')}
  ${kpi('All-time payout', fmtUSD(totalsConvs?.payout))}
</div>

<h2>Today (UTC)</h2>
<div class="kpis">
  ${kpi('Clicks', fmtNum(todayClicks?.n))}
  ${kpi('Conversions', fmtNum(todayConvs?.n), pct(todayConvs?.n, todayClicks?.n) + ' CR')}
  ${kpi('Payout', fmtUSD(todayConvs?.payout))}
</div>

<h2>Last 7 days</h2>
<div class="kpis">
  ${kpi('Clicks', fmtNum(weekClicks?.n))}
  ${kpi('Conversions', fmtNum(weekConvs?.n), pct(weekConvs?.n, weekClicks?.n) + ' CR')}
  ${kpi('Payout', fmtUSD(weekConvs?.payout))}
</div>

<div class="grid">
  <div>
    <h2>By source</h2>
    ${sources.length === 0 ? '<div class="empty">no data yet</div>' : `<table>
      <thead><tr><th>source</th><th class="n">clicks</th><th class="n">conv</th><th class="n">CR</th><th class="n">payout</th></tr></thead>
      <tbody>${sources.map((s) => row([
        esc(s.source),
        `<span class="n">${fmtNum(s.clicks)}</span>`,
        `<span class="n">${fmtNum(s.convs)}</span>`,
        `<span class="n good">${pct(s.convs, s.clicks)}</span>`,
        `<span class="n good">${fmtUSD(s.payout)}</span>`,
      ])).join('')}</tbody>
    </table>`}
  </div>

  <div>
    <h2>By country (top 10)</h2>
    ${clicksByCountry.length === 0 ? '<div class="empty">no data yet</div>' : `<table>
      <thead><tr><th>country</th><th class="n">clicks</th></tr></thead>
      <tbody>${clicksByCountry.map((c) => row([
        esc(c.country),
        `<span class="n">${fmtNum(c.clicks)}</span>`,
      ])).join('')}</tbody>
    </table>`}
  </div>
</div>

<h2>Top offers by payout</h2>
${topOffers.length === 0 ? '<div class="empty">no conversions yet</div>' : `<table>
  <thead><tr><th>offer_id</th><th>offer</th><th class="n">conv</th><th class="n">payout</th></tr></thead>
  <tbody>${topOffers.map((o) => row([
    esc(o.offer_id),
    esc(o.offer),
    `<span class="n">${fmtNum(o.convs)}</span>`,
    `<span class="n good">${fmtUSD(o.payout)}</span>`,
  ])).join('')}</tbody>
</table>`}

<h2>Recent conversions (20)</h2>
${recentConvs.length === 0 ? '<div class="empty">no conversions yet</div>' : `<table>
  <thead><tr><th>when</th><th>subid</th><th class="n">payout</th><th>offer</th><th>source</th><th>campaign</th></tr></thead>
  <tbody>${recentConvs.map((c) => row([
    `<span class="muted">${esc(fmtTs(c.ts))}</span>`,
    `<code>${esc(c.subid)}</code>`,
    `<span class="n good">${fmtUSD(c.payout)}</span>`,
    esc(c.offer),
    esc(c.source),
    esc(c.campaign),
  ])).join('')}</tbody>
</table>`}

<h2>Recent clicks (20)</h2>
${recentClicks.length === 0 ? '<div class="empty">no clicks yet</div>' : `<table>
  <thead><tr><th>when</th><th>click_id</th><th>country</th><th>source</th><th>campaign</th></tr></thead>
  <tbody>${recentClicks.map((c) => row([
    `<span class="muted">${esc(fmtTs(c.ts))}</span>`,
    `<code>${esc(c.id)}</code>`,
    esc(c.country),
    esc(c.source),
    esc(c.campaign),
  ])).join('')}</tbody>
</table>`}

<footer>perklt.com · Cloudflare Pages + D1</footer>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
